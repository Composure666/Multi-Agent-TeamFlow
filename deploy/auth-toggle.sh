#!/usr/bin/env bash
#
# Multi-Agent TeamFlow 访问鉴权开关 —— 答辩 / 参赛演示期间临时使用
#
# 用法：
#   sudo bash auth-toggle.sh status                    查看当前状态
#   sudo bash auth-toggle.sh adduser 用户名             给评委开独立账号（密码在提示后输入，最安全，推荐）
#   sudo bash auth-toggle.sh deluser 用户名             答辩后删掉
#   sudo bash auth-toggle.sh off [时长]                临时关闭鉴权（默认 2h，到点自动恢复）
#   sudo bash auth-toggle.sh on                        立即恢复鉴权
#
# ⚠️ adduser **不接受把密码写在命令行**：命令行会进 shell 历史、也会出现在进程列表里，
#    等于明文。密码一律在提示后输入（不回显、不进 argv）。
#
# ⚠️  off 期间任何能访问到这个 IP 的人，都能在服务器上执行命令（应用自带终端功能）。
#     所以 off 一律带自动恢复定时器 —— 就算你忘了开回来，它也会自己恢复。
#
set -euo pipefail

CONF="/etc/nginx/conf.d/agenthub.conf"
HTPASSWD="/etc/nginx/.htpasswd"
MARK="#AUTHOFF#"
STATE_FILE="/var/lib/agenthub-auth-off"
SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"

RED=$'\033[31m'; GRN=$'\033[32m'; YEL=$'\033[33m'; DIM=$'\033[2m'; NC=$'\033[0m'

die() { echo "${RED}[x] $*${NC}" >&2; exit 1; }
ok()  { echo "${GRN}[ok]${NC} $*"; }
warn(){ echo "${YEL}[!]${NC} $*"; }

[[ ${EUID:-$(id -u)} -eq 0 ]] || die "请用 sudo 运行：sudo bash auth-toggle.sh $*"
[[ -f "$CONF" ]] || die "找不到 $CONF（Multi-Agent TeamFlow 的 nginx 站点配置）"

reload_nginx() {
  if ! nginx -t >/dev/null 2>&1; then
    echo "${RED}nginx 配置校验失败，未做任何改动：${NC}"
    nginx -t || true
    exit 1
  fi
  systemctl reload nginx
}

# 关掉鉴权：把 server 块顶层那两行加上标记注释掉
# （只匹配 server 块顶层那两行：按 auth_basic 指令行匹配、不写死 realm，
#   不会误伤 /_next/static/ 里的 auth_basic off;）
auth_off_edit() {
  # 匹配任意 realm（不写死品牌名），品牌再改也不会让 off 静默失效
  sed -i -E "s|^([[:space:]]*)(auth_basic[[:space:]]+\"[^\"]*\");|\1${MARK} \2;|" "$CONF"
  sed -i -E "s|^([[:space:]]*)auth_basic_user_file([[:space:]]+)/etc/nginx/.htpasswd;|\1${MARK} auth_basic_user_file\2/etc/nginx/.htpasswd;|" "$CONF"
}

# 恢复鉴权：把标记去掉
auth_on_edit() {
  sed -i -E "s|^([[:space:]]*)${MARK} |\1|" "$CONF"
}

is_off() { grep -q "${MARK}" "$CONF"; }

# ── status ────────────────────────────────────────────────────────────
cmd_status() {
  echo "配置文件 : $CONF"
  echo "账号文件 : $HTPASSWD"
  echo
  if is_off; then
    echo "鉴权状态 : ${RED}已关闭 —— 任何人都能访问${NC}"
    if [[ -f "$STATE_FILE" ]]; then
      local until_ts now left
      until_ts="$(cat "$STATE_FILE" 2>/dev/null || echo 0)"
      now="$(date +%s)"
      if [[ "$until_ts" -gt "$now" ]]; then
        left=$(( until_ts - now ))
        echo "自动恢复 : ${YEL}还剩 $(( left / 60 )) 分 $(( left % 60 )) 秒${NC}（$(date -d "@${until_ts}" '+%H:%M:%S')）"
      else
        warn "定时器已过期但鉴权仍是关的 —— 手动执行：sudo bash auth-toggle.sh on"
      fi
    else
      warn "没有自动恢复定时器（是手动 off 的？）—— 别忘了 sudo bash auth-toggle.sh on"
    fi
  else
    echo "鉴权状态 : ${GRN}已开启（正常）${NC}"
  fi
  echo
  if [[ -f "$HTPASSWD" ]]; then
    echo "可用账号 : $(cut -d: -f1 "$HTPASSWD" | tr '\n' ' ')"
  else
    warn "找不到 $HTPASSWD"
  fi
  echo
  echo "${DIM}-- nginx 里的实际生效行 --${NC}"
  grep -nE "auth_basic" "$CONF" | sed 's/^/  /'
}

# ── off [时长] ────────────────────────────────────────────────────────
cmd_off() {
  local dur="${1:-2h}"
  local secs
  case "$dur" in
    *h) secs=$(( ${dur%h} * 3600 )) ;;
    *m) secs=$(( ${dur%m} * 60 )) ;;
    *s) secs=$(( ${dur%s} )) ;;
    *)  secs=7200 ;;
  esac
  [[ "$secs" -ge 60 && "$secs" -le 86400 ]] || die "时长需在 1 分钟 ~ 24 小时之间（例：2h / 30m）"

  if ! is_off; then
    cp -a "$CONF" "${CONF}.before-authoff"
    auth_off_edit
    reload_nginx
  fi

  local until_ts=$(( $(date +%s) + secs ))
  echo "$until_ts" > "$STATE_FILE"
  chmod 600 "$STATE_FILE"

  # 起一个脱离终端的定时器，到点自动恢复
  setsid nohup bash -c "sleep ${secs}; bash '${SCRIPT}' on" >/dev/null 2>&1 </dev/null &
  disown 2>/dev/null || true

  echo
  warn "鉴权已关闭 ${YEL}${dur}${NC}，之后自动恢复。"
  echo "  现在任何人打开 http://<SERVER_IP>/ 都能直接用，不需要密码。"
  echo "  想提前恢复：sudo bash auth-toggle.sh on"
}

# ── on ────────────────────────────────────────────────────────────────
cmd_on() {
  rm -f "$STATE_FILE"
  if is_off; then
    auth_on_edit
    reload_nginx
    ok "鉴权已恢复 —— 现在访问需要用户名密码了"
  else
    ok "鉴权本来就是开着的，无需改动"
  fi
  grep -nE "auth_basic" "$CONF" | sed 's/^/  /'
}

# ── adduser / deluser ─────────────────────────────────────────────────
cmd_adduser() {
  local u="${1:-}" p="" p2=""
  [[ -n "$u" ]] || die "用法：sudo bash auth-toggle.sh adduser 用户名（密码在提示后输入）"
  [[ -z "${2:-}" ]] || die "不要再把密码写在命令行上（会进 shell 历史与进程列表）。只给用户名：sudo bash auth-toggle.sh adduser $u"
  command -v htpasswd >/dev/null 2>&1 || die "缺 htpasswd，先装：apt-get install -y apache2-utils"
  read -rsp "为 ${u} 设置密码："  p;  echo
  read -rsp "再输一次确认："       p2; echo
  [[ -n "$p" ]] || die "密码不能为空，未做任何改动"
  [[ "$p" == "$p2" ]] || die "两次输入不一致，未做任何改动"
  # -i 从 stdin 读密码、-B 用 bcrypt：密码不进 argv、不落 shell 历史
  htpasswd -i -B "$HTPASSWD" "$u" <<<"$p" >/dev/null
  unset p p2
  chmod 640 "$HTPASSWD"; chown root:www-data "$HTPASSWD" 2>/dev/null || true
  reload_nginx
  ok "已设置账号 ${GRN}${u}${NC}（当前账号：$(cut -d: -f1 "$HTPASSWD" | tr '\n' ' '))"
  echo "  答辩时给评委这个账号即可，不影响你的 admin 密码。"
}

cmd_deluser() {
  local u="${1:-}"
  [[ -n "$u" ]] || die "用法：sudo bash auth-toggle.sh deluser 用户名"
  htpasswd -D "$HTPASSWD" "$u" >/dev/null
  reload_nginx
  ok "已删除账号 ${u}（剩余：$(cut -d: -f1 "$HTPASSWD" | tr '\n' ' '))"
}

# ── 入口 ──────────────────────────────────────────────────────────────
case "${1:-status}" in
  status)  cmd_status ;;
  off)     cmd_off "${2:-2h}" ;;
  on)      cmd_on ;;
  adduser) shift; cmd_adduser "${1:-}" "${2:-}" ;;
  deluser) shift; cmd_deluser "${1:-}" ;;
  -h|--help|help)
    sed -n '3,16p' "$SCRIPT" | sed 's/^# \?//'
    ;;
  *) die "未知命令：$1（可用：status / off [时长] / on / adduser / deluser）" ;;
esac
