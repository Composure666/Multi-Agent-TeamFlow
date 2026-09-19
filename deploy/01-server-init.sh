#!/usr/bin/env bash
#
# AgentHub 服务器初始化 —— 腾讯云轻量应用服务器 2 核 2G
# 目标系统：Ubuntu 22.04 LTS / 24.04 LTS
#
# 幂等：重复执行安全，已完成的步骤会跳过。
#
# 做四件事：
#   1) 建 4GB swap —— 2G 物理内存跑 `next build` 必需，否则必 OOM
#   2) 装 Node.js 22 + pnpm 10 + 原生模块编译工具链
#   3) 建 agenthub 系统用户 + 目录结构
#   4) 装 Nginx（反代 + 鉴权入口）
#
# 用法（在服务器上，root 权限）：
#   sudo bash 01-server-init.sh
#
set -euo pipefail

APP_USER="agenthub"
APP_ROOT="/opt/agenthub"
SRC_DIR="${APP_ROOT}/src"
DATA_DIR="${APP_ROOT}/data"
LOG_DIR="/var/log/agenthub"
ENV_DIR="/etc/agenthub"

NODE_VERSION="${NODE_VERSION:-22.22.2}"
# 必须与开发机一致：pnpm-workspace.yaml 用的是 pnpm 10.9+ 才有的 allowBuilds 字段，
# 低版本会直接忽略它，导致 better-sqlite3 / node-pty 的安装脚本不执行、原生模块编不出来。
PNPM_VERSION="${PNPM_VERSION:-11}"
SWAP_SIZE="${SWAP_SIZE:-4G}"
SWAP_FILE="/swapfile"

NODE_MIRROR="https://npmmirror.com/mirrors/node"
NPM_REGISTRY="https://registry.npmmirror.com"

CYAN='\033[1;36m'; YELLOW='\033[1;33m'; RED='\033[1;31m'; GREEN='\033[1;32m'; NC='\033[0m'
log()  { printf "\n${CYAN}==> %s${NC}\n" "$*"; }
ok()   { printf "${GREEN}    ✓ %s${NC}\n" "$*"; }
warn() { printf "\n${YELLOW}!! %s${NC}\n" "$*"; }
die()  { printf "\n${RED}xx %s${NC}\n" "$*" >&2; exit 1; }

# ---------------------------------------------------------------- 前置检查
[[ "${EUID}" -eq 0 ]] || die "请用 root 运行：sudo bash $0"

if [[ -r /etc/os-release ]]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  case "${ID:-}" in
    ubuntu|debian) ok "系统：${PRETTY_NAME:-unknown}" ;;
    *) warn "非 Ubuntu/Debian（${PRETTY_NAME:-unknown}），apt 步骤可能失败，请自行调整" ;;
  esac
else
  warn "无法识别系统版本，继续尝试"
fi

CPU_CORES="$(nproc 2>/dev/null || echo 2)"
MEM_MB="$(awk '/MemTotal/{printf "%d", $2/1024}' /proc/meminfo 2>/dev/null || echo 0)"
log "机器规格：${CPU_CORES} 核 / ${MEM_MB} MB 内存"
if [[ "${MEM_MB}" -lt 3500 ]]; then
  warn "物理内存 ${MEM_MB}MB < 3.5GB。本脚本会建 ${SWAP_SIZE} swap 兜底，构建会变慢但能过。"
fi

# ---------------------------------------------------------------- 1. swap
log "[1/5] 配置 swap"
if swapon --show=NAME --noheadings 2>/dev/null | grep -q "^${SWAP_FILE}$"; then
  ok "${SWAP_FILE} 已激活，跳过"
else
  if [[ -f "${SWAP_FILE}" ]]; then
    warn "${SWAP_FILE} 已存在但未激活，重新启用"
  else
    # fallocate 在部分文件系统（如老 ext4 / overlayfs）不支持，回退 dd
    if ! fallocate -l "${SWAP_SIZE}" "${SWAP_FILE}" 2>/dev/null; then
      warn "fallocate 不可用，改用 dd（较慢）"
      dd if=/dev/zero of="${SWAP_FILE}" bs=1M count=4096 status=progress
    fi
  fi
  chmod 600 "${SWAP_FILE}"
  mkswap "${SWAP_FILE}" >/dev/null
  swapon "${SWAP_FILE}"
  grep -q "^${SWAP_FILE}[[:space:]]" /etc/fstab 2>/dev/null \
    || echo "${SWAP_FILE} none swap sw 0 0" >> /etc/fstab
  ok "已创建并激活 ${SWAP_SIZE} swap，已写入 /etc/fstab"
fi

# swappiness=10：平时尽量不用 swap，只在构建真顶不住时才用
sysctl -w vm.swappiness=10 >/dev/null
grep -q '^vm.swappiness' /etc/sysctl.conf 2>/dev/null \
  || echo 'vm.swappiness=10' >> /etc/sysctl.conf
ok "vm.swappiness=10（不常驻 swap，避免运行期拖慢）"

free -h | sed 's/^/    /'

# ---------------------------------------------------------------- 2. 系统依赖
log "[2/5] 安装系统依赖"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq --no-install-recommends \
  git curl ca-certificates xz-utils tar \
  build-essential python3 make g++ pkg-config \
  nginx apache2-utils ufw >/dev/null
ok "已装：git / curl / build-essential / python3 / nginx / apache2-utils(htpasswd)"

# 子 agent 的验收脚本常要读图 / 算像素统计（PIL、numpy）。装进系统 dist-packages，
# 保证 root 与 agenthub 两个身份的 python3 都能 import。
# 不预装的后果（2026-09-17 线上事故）：worker 现场 `pip install pillow numpy`，
# 在 2C2G + 30s 默认超时下超时，被记成失败命令证据把任务钉死 4 次。
PIP_INDEX="${PIP_INDEX:-http://mirrors.tencentyun.com/pypi/simple}"
if pip3 install --quiet --no-cache-dir -i "${PIP_INDEX}" \
     --trusted-host mirrors.tencentyun.com pillow numpy >/dev/null 2>&1; then
  ok "Python 工具链：Pillow $(python3 -c 'import PIL;print(PIL.__version__)' 2>/dev/null || echo '?') / numpy $(python3 -c 'import numpy;print(numpy.__version__)' 2>/dev/null || echo '?')"
else
  warn "pillow / numpy 预装失败。不影响启动，但图像类任务的验收脚本会缺依赖，worker 自己 pip 装容易超时。"
fi

# ---------------------------------------------------------------- 2.5 网络出口兜底
# Agent 的 bash 工具以 agenthub 身份跑真实 shell，能触达云 metadata
# （2026-09-17 实测 metadata.tencentyun.com → 200）。代码层已由 network-guard.ts 拦截，
# 这里再加网络层兜底：即使上层被绕过，metadata 也不可达。用 systemd unit 保证重启后仍生效。
# 注意：**不要封回环** —— nginx 与平台服务自身都靠 127.0.0.1:3000 通信。
log "[2.5/5] 配置 metadata 出站拦截"

cat >/etc/systemd/system/agenthub-netguard.service <<'NETGUARD'
[Unit]
Description=Block agent egress to cloud metadata endpoints
Documentation=specs/11-platform.md (bash 网络出口)
Before=agenthub.service
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/bin/bash -c 'iptables -C OUTPUT -d 169.254.0.0/16 -j REJECT 2>/dev/null || iptables -I OUTPUT 1 -d 169.254.0.0/16 -j REJECT'
ExecStart=/bin/bash -c 'iptables -C OUTPUT -d 100.100.100.200/32 -j REJECT 2>/dev/null || iptables -I OUTPUT 1 -d 100.100.100.200/32 -j REJECT'

[Install]
WantedBy=multi-user.target
NETGUARD

systemctl daemon-reload
if systemctl enable --now agenthub-netguard.service >/dev/null 2>&1; then
  ok "metadata 出站已拦截（169.254.0.0/16、100.100.100.200）"
else
  warn "agenthub-netguard.service 启用失败；代码层守卫仍然有效，但网络层兜底缺失。"
fi

# ---------------------------------------------------------------- 3. Node + pnpm
log "[3/5] 安装 Node.js ${NODE_VERSION} + pnpm ${PNPM_VERSION}"

if command -v node >/dev/null 2>&1 \
   && [[ "$(node -v 2>/dev/null | sed 's/^v//' | cut -d. -f1)" == "22" ]]; then
  ok "已装 Node $(node -v)，跳过"
else
  ARCH="$(uname -m)"
  case "${ARCH}" in
    x86_64) NODE_ARCH="x64" ;;
    aarch64|arm64) NODE_ARCH="arm64" ;;
    *) die "不支持的 CPU 架构：${ARCH}" ;;
  esac
  TARBALL="node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz"
  log "  下载 ${TARBALL}（走 npmmirror 国内镜像）"
  curl -fsSL "${NODE_MIRROR}/v${NODE_VERSION}/${TARBALL}" -o "/tmp/${TARBALL}"
  tar -xJf "/tmp/${TARBALL}" -C /usr/local --strip-components=1 --no-same-owner
  rm -f "/tmp/${TARBALL}"
  ok "Node 装到 /usr/local：$(node -v)"
fi

npm config set registry "${NPM_REGISTRY}" >/dev/null 2>&1 || true
if command -v pnpm >/dev/null 2>&1; then
  ok "已装 pnpm $(pnpm -v)，跳过"
else
  npm install -g "pnpm@${PNPM_VERSION}" >/dev/null
  ok "pnpm $(pnpm -v)"
fi

# node-pty / better-sqlite3 是原生模块，确认工具链可用
command -v g++  >/dev/null || die "缺 g++，无法编译原生模块"
command -v make >/dev/null || die "缺 make，无法编译原生模块"
ok "原生模块编译工具链就绪（g++ / make / python3）"

# ---------------------------------------------------------------- 4. 用户与目录
log "[4/5] 创建用户与目录"
if id -u "${APP_USER}" >/dev/null 2>&1; then
  ok "用户 ${APP_USER} 已存在"
else
  useradd --system --create-home --shell /bin/bash "${APP_USER}"
  ok "已创建系统用户 ${APP_USER}"
fi

mkdir -p "${APP_ROOT}" "${DATA_DIR}" "${LOG_DIR}" "${ENV_DIR}"
chown -R "${APP_USER}:${APP_USER}" "${APP_ROOT}" "${LOG_DIR}"
chmod 750 "${APP_ROOT}" "${DATA_DIR}" "${LOG_DIR}"
chmod 750 "${ENV_DIR}"
touch "${LOG_DIR}/out.log" "${LOG_DIR}/err.log"
chown "${APP_USER}:${APP_USER}" "${LOG_DIR}/out.log" "${LOG_DIR}/err.log"
ok "目录：${SRC_DIR}（源码/构建）/ ${DATA_DIR}（运行时数据）/ ${LOG_DIR}（日志）"

# ---------------------------------------------------------------- 5. 防火墙
log "[5/5] 防火墙"
ufw allow OpenSSH >/dev/null 2>&1 || true
ufw allow 80/tcp  >/dev/null 2>&1 || true
ufw allow 443/tcp >/dev/null 2>&1 || true
if ufw status 2>/dev/null | grep -q "Status: active"; then
  ok "ufw 规则已添加（SSH / 80 / 443）"
else
  warn "ufw 未启用。本脚本不自动 enable，避免误断 SSH。"
  warn "确认上面 SSH 规则无误后，手动执行：sudo ufw enable"
fi

# ---------------------------------------------------------------- 收尾
cat <<EOF

${GREEN}============================ 初始化完成 ============================${NC}

已就绪：
  Node        $(node -v)
  pnpm        $(pnpm -v)
  swap        $(swapon --show=SIZE --noheadings 2>/dev/null | head -1 | tr -d ' ' || echo '已配置')
  内存        $(free -h | awk '/^Mem:/{print $2" 物理"} /^Swap:/{print $2" swap"}')

${YELLOW}接下来还有 4 步手工操作：${NC}

  ${RED}注意：源码不能靠 git clone${NC} —— 仓库是私有的，且 deploy/ 尚未提交进仓库。
  正确做法是本地打包上传（见本地 deploy/00-pack-upload.ps1），这里假设包已解压好。

  1) 解压源码（若还没做）：
       mkdir -p ${SRC_DIR}
       tar -xzf /root/agenthub-src.tar.gz -C ${SRC_DIR}

  2) 填 API Key（否则 Agent 跑不起来）：
       cp ${SRC_DIR}/.env.example ${ENV_DIR}/agenthub.env
       nano ${ENV_DIR}/agenthub.env        # 至少填 ANTHROPIC_API_KEY
       chmod 600 ${ENV_DIR}/agenthub.env

  3) 构建（必须换 ${APP_USER} 用户跑，20-40 分钟，会大量用 swap）：
       sudo -iu ${APP_USER}
       cd ${SRC_DIR} && SKIP_GIT=1 bash deploy/02-deploy.sh
       exit

  4) 装服务并启动（换回 root）：
       bash ${SRC_DIR}/deploy/03-install-service.sh

  完整说明见 ${SRC_DIR}/deploy/RUNBOOK.md

${YELLOW}腾讯云控制台别忘了：${NC}
  轻量应用服务器 → 防火墙 → 放行 80 / 443（云上安全组是独立一层，服务器内 ufw 管不到）

EOF
