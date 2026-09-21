#!/usr/bin/env bash
#
# Multi-Agent TeamFlow 服务安装 —— 在服务器上、以 root 运行
#
# 做四件事：
#   1) 装 systemd unit 并设为开机自启
#   2) 准备 /etc/agenthub/agenthub.env（密钥文件）
#   3) 装 Nginx 反代 + 生成 Basic 鉴权密码
#   4) 启动服务并做健康检查
#
# 前置：先跑过 deploy/02-deploy.sh（保证 .next/standalone/server.js 存在）
#
# 用法：
#   sudo bash /opt/agenthub/src/deploy/03-install-service.sh
#
# 可选环境变量：
#   AGENTHUB_USER=admin             Basic 鉴权用户名（默认 admin）
#   AGENTHUB_PASSWORD=xxx           指定密码。**不推荐**：`VAR=值 命令` 这种写法会进 shell 历史，
#                                   等于把密码留在磁盘上。默认行为已是随机生成 + 只打印一次 ——
#                                   留空最安全；之后要改密码用：sudo htpasswd -B /etc/nginx/.htpasswd 用户名
#   AGENTHUB_PORT=3000              服务端口（默认 3000）
#
set -euo pipefail

APP_USER="agenthub"
APP_ROOT="/opt/agenthub"
SRC_DIR="${APP_ROOT}/src"
DATA_DIR="${APP_ROOT}/data"
LOG_DIR="/var/log/agenthub"
ENV_FILE="/etc/agenthub/agenthub.env"
SERVICE_NAME="agenthub"
PORT="${AGENTHUB_PORT:-3000}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CYAN='\033[1;36m'; YELLOW='\033[1;33m'; RED='\033[1;31m'; GREEN='\033[1;32m'; NC='\033[0m'
log()  { printf "\n${CYAN}==> %s${NC}\n" "$*"; }
ok()   { printf "${GREEN}    ✓ %s${NC}\n" "$*"; }
warn() { printf "\n${YELLOW}!! %s${NC}\n" "$*"; }
die()  { printf "\n${RED}xx %s${NC}\n" "$*" >&2; exit 1; }

# ---------------------------------------------------------------- 前置检查
[[ "${EUID}" -eq 0 ]] || die "请用 root 运行：sudo bash $0"

STANDALONE="${SRC_DIR}/.next/standalone"
[[ -f "${STANDALONE}/server.js" ]] \
  || die "找不到 ${STANDALONE}/server.js。请先以 agenthub 用户跑 deploy/02-deploy.sh"
[[ -f "${SCRIPT_DIR}/agenthub.service" ]] \
  || die "找不到 ${SCRIPT_DIR}/agenthub.service"
ok "构建产物就位：${STANDALONE}/server.js"

# 若 02 里没建过软链（例如手工拷的产物），这里补上，否则数据会写进 standalone 内部
mkdir -p "${DATA_DIR}"
if [[ ! -L "${STANDALONE}/.agenthub-data" ]]; then
  # 注意别写成 `[[ -e x ]] && warn`：条件为假时整行返回非零，set -e 会直接把脚本干掉
  if [[ -e "${STANDALONE}/.agenthub-data" ]]; then
    warn "${STANDALONE}/.agenthub-data 不是软链，建议重跑 02-deploy.sh 迁移数据"
  fi
  ln -sfn "${DATA_DIR}" "${STANDALONE}/.agenthub-data" 2>/dev/null || true
fi
chown -R "${APP_USER}:${APP_USER}" "${DATA_DIR}" "${LOG_DIR}" 2>/dev/null || true
ok "数据目录 ${DATA_DIR} 归属 ${APP_USER}"

# ---------------------------------------------------------------- 1. systemd
log "[1/4] 安装 systemd 服务"
install -m 644 "${SCRIPT_DIR}/agenthub.service" "/etc/systemd/system/${SERVICE_NAME}.service"
systemctl daemon-reload
systemctl enable "${SERVICE_NAME}" >/dev/null 2>&1
ok "已安装 /etc/systemd/system/${SERVICE_NAME}.service 并设为开机自启"

# ---------------------------------------------------------------- 2. 环境变量
log "[2/4] 准备密钥文件 ${ENV_FILE}"
mkdir -p "$(dirname "${ENV_FILE}")"
if [[ ! -f "${ENV_FILE}" ]]; then
  if [[ -f "${SRC_DIR}/.env.example" ]]; then
    cp "${SRC_DIR}/.env.example" "${ENV_FILE}"
    ok "已从 .env.example 生成模板"
  else
    cat > "${ENV_FILE}" <<'EOF'
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
DEEPSEEK_API_KEY=
ARK_API_KEY=
EOF
    ok "已生成空白模板"
  fi
else
  ok "已存在，保持不动"
fi
chown root:root "${ENV_FILE}"
chmod 600 "${ENV_FILE}"

# 至少有一个非空的 API Key 才可能跑通
if grep -qE '^[A-Z_]*API_KEY=.+' "${ENV_FILE}"; then
  ok "检测到已配置的 API Key"
  FILLED_ZERO=0
else
  FILLED_ZERO=1
  warn "所有 API Key 都是空的 —— 服务能起来，但 Agent 一执行就会报认证失败。"
  warn "现在填：sudo nano ${ENV_FILE}"
fi

# ---------------------------------------------------------------- 3. Nginx
log "[3/4] 配置 Nginx"
if ! command -v nginx >/dev/null; then
  warn "未安装 nginx，跳过。装完再跑一次本脚本，或手工装：sudo apt install -y nginx"
else
  install -m 644 "${SCRIPT_DIR}/nginx-agenthub.conf" /etc/nginx/conf.d/agenthub.conf
  ok "已安装 /etc/nginx/conf.d/agenthub.conf"

  # 默认站点会抢占 80 端口，必须真正禁用。
  # ⚠️ 注意：nginx 的 include 是 sites-enabled/*（通配目录下所有文件），
  #    所以「就地改名」是没用的 —— 改名后的文件照样被加载，而它带
  #    `listen 80 default_server`，会把所有请求（含反代与 Basic 鉴权）全部抢走，
  #    表现为访问公网 IP 只看到 "Welcome to nginx!"。
  #    正确做法是把它移出 sites-enabled 目录，或直接删掉那条符号链接。
  NGINX_DEFAULT="/etc/nginx/sites-enabled/default"
  if [[ -L "${NGINX_DEFAULT}" ]]; then
    # 符号链接：删链接即可，真实文件仍完整保留在 sites-available/
    rm -f "${NGINX_DEFAULT}"
    warn "已禁用默认站点（删除符号链接 ${NGINX_DEFAULT}；原文件仍在 /etc/nginx/sites-available/default）"
  elif [[ -e "${NGINX_DEFAULT}" ]]; then
    mv "${NGINX_DEFAULT}" "/etc/nginx/sites-available/default.disabled-by-agenthub"
    warn "已禁用默认站点（移到 /etc/nginx/sites-available/default.disabled-by-agenthub）"
  fi

  # 清理历史遗留：早期版本只做了「就地改名」，而改名在 sites-enabled/ 下依然生效
  for stale in /etc/nginx/sites-enabled/*disabled-by-agenthub; do
    [[ -e "${stale}" ]] || continue
    rm -f "${stale}"
    warn "已清理残留的禁用站点 ${stale}（它仍在监听 80 default_server，会抢走所有请求）"
  done

  # Basic 鉴权密码
  if [[ ! -f /etc/nginx/.htpasswd ]]; then
    BASIC_USER="${AGENTHUB_USER:-admin}"
    if [[ -n "${AGENTHUB_PASSWORD:-}" ]]; then
      BASIC_PASS="${AGENTHUB_PASSWORD}"
      GENERATED=0
    else
      # 9 字节随机 → base64 约 12 字符 → 去掉 URL 不安全字符。
      # 刻意不再接 `| head -c N`：head 提前退出会让 tr 收到 SIGPIPE，
      # 在 set -o pipefail 下整个命令替换返回非零，set -e 会直接中断脚本。
      BASIC_PASS="$(head -c 9 /dev/urandom | base64 | tr -d '/+=')"
      GENERATED=1
    fi
    # -i 从 stdin 读密码（用 here-string 传值，不进 argv）；-B 用 bcrypt，别用默认的弱 MD5。
    # 密码只经管道流入 htpasswd，不会出现在 `ps` 或 shell 历史里。
    htpasswd -ic -B /etc/nginx/.htpasswd "${BASIC_USER}" <<<"${BASIC_PASS}" >/dev/null
    chmod 640 /etc/nginx/.htpasswd
    chown root:www-data /etc/nginx/.htpasswd 2>/dev/null || true
    if [[ "${GENERATED}" == "1" ]]; then
      NEW_CREDS="${BASIC_USER} / ${BASIC_PASS}"
    else
      NEW_CREDS="${BASIC_USER} / (你指定的密码)"
    fi
    ok "已生成 Basic 鉴权账号"
  else
    NEW_CREDS=""
    ok "已存在 /etc/nginx/.htpasswd，保持不动（改密码：sudo htpasswd /etc/nginx/.htpasswd 用户名）"
  fi

  NGINX_TEST="$(nginx -t 2>&1 || true)"
  if printf '%s' "${NGINX_TEST}" | grep -q "successful"; then
    systemctl reload nginx 2>/dev/null || systemctl restart nginx
    ok "nginx 配置校验通过并已 reload"
  else
    printf '%s\n' "${NGINX_TEST}" | sed 's/^/    /'
    die "nginx 配置校验失败，见上面的报错"
  fi
fi

# ---------------------------------------------------------------- 4. 启动
log "[4/4] 启动服务"
systemctl restart "${SERVICE_NAME}"
sleep 4

if systemctl is-active --quiet "${SERVICE_NAME}"; then
  ok "服务运行中"
else
  warn "服务没起来，最近日志："
  tail -30 "${LOG_DIR}/err.log" 2>/dev/null | sed 's/^/    /' || true
  journalctl -u "${SERVICE_NAME}" -n 30 --no-pager 2>/dev/null | sed 's/^/    /' || true
  die "启动失败，先解决上面的报错，再 systemctl restart ${SERVICE_NAME}"
fi

# 健康检查：standalone 的 / 应该返回 200 或 307（重定向到某个页面）
log "健康检查"
HTTP_CODE=""
for i in 1 2 3 4 5 6; do
  HTTP_CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:${PORT}/" 2>/dev/null || echo 000)"
  case "${HTTP_CODE}" in
    200|307|308) break ;;
    *) sleep 2 ;;
  esac
done
if [[ "${HTTP_CODE}" =~ ^(200|307|308)$ ]]; then
  ok "http://127.0.0.1:${PORT}/ → ${HTTP_CODE}"
else
  warn "http://127.0.0.1:${PORT}/ → ${HTTP_CODE}（还没就绪，看日志：tail -f ${LOG_DIR}/err.log）"
fi

# ---------------------------------------------------------------- 公网地址
PUBLIC_IP=""
# 腾讯云内网元数据接口，能直接拿到公网 IP
PUBLIC_IP="$(curl -fsS --max-time 3 http://metadata.tencentyun.com/latest/meta-data/public-ipv4 2>/dev/null || true)"
if [[ -z "${PUBLIC_IP}" ]]; then
  PUBLIC_IP="$(curl -fsS --max-time 5 https://ifconfig.me 2>/dev/null || true)"
fi
[[ -n "${PUBLIC_IP}" ]] || PUBLIC_IP="<你的公网IP>"

cat <<EOF

${GREEN}============================ 部署完成 ============================${NC}

  服务状态    systemctl status ${SERVICE_NAME}
  实时日志    tail -f ${LOG_DIR}/out.log
  错误日志    tail -f ${LOG_DIR}/err.log
  密钥文件    ${ENV_FILE}

  本机访问    http://127.0.0.1:${PORT}/
  公网访问    http://${PUBLIC_IP}/            ← 浏览器会弹 Basic 鉴权框

EOF

if [[ -n "${NEW_CREDS:-}" ]]; then
cat <<EOF
${YELLOW}┌──────────────────────────────────────────────────────────┐
│  你的访问账号（只显示这一次，请立刻记下来）              │
│                                                          │
│     用户名 / 密码：  ${NEW_CREDS}
│                                                          │
│  改密码：sudo htpasswd /etc/nginx/.htpasswd admin        │
└──────────────────────────────────────────────────────────┘${NC}

EOF
fi

if [[ "${FILLED_ZERO}" == "1" ]]; then
cat <<EOF
${RED}⚠️  还没填 API Key，Agent 无法工作：${NC}
     sudo nano ${ENV_FILE}
     sudo systemctl restart ${SERVICE_NAME}

EOF
fi

cat <<EOF
${YELLOW}腾讯云控制台最后一件事：${NC}
   轻量应用服务器 → 防火墙 → 添加规则 → 放行 TCP 80（要 HTTPS 再放行 443）
   云上安全组和服务器内 ufw 是两套独立规则，只配一个不通。

${YELLOW}常用运维命令：${NC}
   更新代码并重新部署（耗时主要在构建，10-30 分钟）
     sudo -iu ${APP_USER}
     bash ${SRC_DIR}/deploy/02-deploy.sh
     exit
     sudo systemctl restart ${SERVICE_NAME}

   备份数据（SQLite + 图片 + 工作区文件）
     sudo systemctl stop ${SERVICE_NAME}
     sudo tar czf ~/agenthub-data-\$(date +%F).tar.gz -C ${DATA_DIR} .
     sudo systemctl start ${SERVICE_NAME}

   看当前磁盘/内存
     df -h /   &&   free -h

EOF
