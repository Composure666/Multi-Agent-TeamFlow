#!/usr/bin/env bash
#
# Multi-Agent TeamFlow 构建脚本 —— 在服务器上、以 agenthub 用户运行
#
# ┌──────────────────────────────────────────────────────────────────────┐
# │ 为什么不能在本地构建、再把产物传到服务器？                            │
# │                                                                      │
# │ 本项目 better-sqlite3 与 node-pty 是原生模块（.node 二进制），        │
# │ 与「操作系统 + Node ABI」强绑定：                                    │
# │   · Windows 编出来的 .node → Linux 上直接 invalid ELF header         │
# │   · 本地 `pnpm build` 走 run-electron-node.mjs，产出的是             │
# │     Electron 私有 ABI(130) 的 binding → 系统 Node 也加载不了         │
# │ 所以必须在目标机（Linux + 系统 Node）上构建一次。                    │
# └──────────────────────────────────────────────────────────────────────┘
#
# 幂等：重复执行会增量拉代码 + 重新构建 + 重新组装。
#
# 用法：
#   sudo -iu agenthub
#   bash /opt/agenthub/src/deploy/02-deploy.sh
#
# 可覆盖：
#   REPO_URL=... BRANCH=... NODE_OPTIONS=... bash 02-deploy.sh
#   SKIP_GIT=1 bash 02-deploy.sh     # 用已上传的源码，不做任何 git 操作
#
set -euo pipefail

APP_USER="agenthub"
APP_ROOT="/opt/agenthub"
SRC_DIR="${APP_ROOT}/src"
DATA_DIR="${APP_ROOT}/data"
REPO_URL="${REPO_URL:-https://gitee.com/Composure666/Multi-Agent-TeamFlow.git}"
BRANCH="${BRANCH:-master}"

CYAN='\033[1;36m'; YELLOW='\033[1;33m'; RED='\033[1;31m'; GREEN='\033[1;32m'; NC='\033[0m'
log()  { printf "\n${CYAN}==> %s${NC}\n" "$*"; }
ok()   { printf "${GREEN}    ✓ %s${NC}\n" "$*"; }
warn() { printf "\n${YELLOW}!! %s${NC}\n" "$*"; }
die()  { printf "\n${RED}xx %s${NC}\n" "$*" >&2; exit 1; }

# ---------------------------------------------------------------- 身份检查
[[ "$(id -un)" == "${APP_USER}" ]] \
  || die "请以 ${APP_USER} 用户运行：sudo -iu ${APP_USER} && bash ${SRC_DIR}/deploy/02-deploy.sh"

for bin in git node pnpm; do
  command -v "${bin}" >/dev/null || die "找不到 ${bin}。请先跑 deploy/01-server-init.sh"
done
ok "以 $(id -un) 运行 / Node $(node -v) / pnpm $(pnpm -v)"

# ---------------------------------------------------------------- 构建环境变量
# 跳过 Electron / Playwright 二进制下载：服务器不跑桌面端和 e2e，能省 ~400MB 下载和 1GB 磁盘
export ELECTRON_SKIP_BINARY_DOWNLOAD=1
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
# 不向 Vercel 发遥测，省一次外部请求
export NEXT_TELEMETRY_DISABLED=1
export CI=1
# 国内镜像加速。
# ❗ 必须用 `--registry` 命令行参数（见下面 pnpm install），不能只靠环境变量：
#    2026-10-14 在阿里云新机上实测，pnpm 11.9.0 **不再读取 `npm_config_registry`**
#    —— 即使显式 `export npm_config_registry=https://registry.npmmirror.com`，
#    `pnpm config get registry` 仍返回 https://registry.npmjs.org/。
#    后果：安装退回官方源，实测 45 KiB/s（npmmirror 18 MB/s），装依赖慢到不可用。
NPM_REGISTRY="${NPM_REGISTRY:-https://registry.npmmirror.com}"
# 同时保留环境变量写法，供 npm / corepack 等其它工具使用。
export npm_config_registry="${NPM_REGISTRY}"
# 2G 物理内存 + 4G swap，给 V8 堆一个明确上界，避免无限膨胀把机器拖死
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=1536}"

# ---------------------------------------------------------------- 1. 准备源码
# SKIP_GIT=1：完全不碰 git，直接用已经上传到 SRC_DIR 的源码。
# 适用于两种现实情况（见 deploy/RUNBOOK.md）：
#   a) 仓库是私有的，服务器上没有 Gitee 凭证，git clone 会卡在要用户名密码
#   b) deploy/ 这个目录本身还没提交进仓库，clone 下来就没有这些脚本
SKIP_GIT="${SKIP_GIT:-0}"
log "[1/4] 准备源码（${BRANCH}）"
if [[ "${SKIP_GIT}" == "1" ]]; then
  [[ -f "${SRC_DIR}/package.json" ]] \
    || die "SKIP_GIT=1 但 ${SRC_DIR}/package.json 不存在。请先把源码包解压到 ${SRC_DIR}"
  if [[ -d "${SRC_DIR}/.git" ]]; then
    ok "SKIP_GIT=1，沿用已上传源码：$(git -C "${SRC_DIR}" log --oneline -1 2>/dev/null || echo '无 git 元数据')"
  else
    ok "SKIP_GIT=1，沿用已上传源码（无 git 元数据，属正常）"
  fi
elif [[ -d "${SRC_DIR}/.git" ]]; then
  git -C "${SRC_DIR}" fetch --depth=1 origin "${BRANCH}"
  # -f 强制覆盖本地改动：服务器上的源码目录只当构建场所，不该有人手改它
  git -C "${SRC_DIR}" checkout -q -f -B "${BRANCH}" "origin/${BRANCH}"
  # 刻意不做 git clean：deploy/ 等目录可能还没提交进仓库，clean 会把它们连同构建脚本一起删掉
  ok "$(git -C "${SRC_DIR}" log --oneline -1)"
else
  if [[ -d "${SRC_DIR}" ]] && [[ -n "$(ls -A "${SRC_DIR}" 2>/dev/null)" ]]; then
    die "${SRC_DIR} 已存在且非空，但没有 .git，无法 clone。二选一：
        · 用已上传的源码  →  SKIP_GIT=1 bash $0
        · 从仓库重新拉取  →  先 rm -rf ${SRC_DIR} 再重跑本脚本"
  fi
  mkdir -p "$(dirname "${SRC_DIR}")"
  git clone --depth=1 --branch "${BRANCH}" "${REPO_URL}" "${SRC_DIR}"
  ok "已克隆 $(git -C "${SRC_DIR}" log --oneline -1)"
fi

# ---------------------------------------------------------------- 2. 装依赖
log "[2/4] 安装依赖（跳过 electron / playwright 二进制；排除 apps/mobile）"
cd "${SRC_DIR}"

# apps/mobile 是 Capacitor 移动端：服务器既不装它的依赖，也不构建它。
# 但「只排除安装」是不够的 —— 目录留在原地时，Next 的类型检查会扫到
# apps/mobile/capacitor.config.ts，因找不到 @capacitor/cli 而中断整个构建
# （报错形如：Type error: Cannot find module '@capacitor/cli'）。
# 根因是根 tsconfig.json 的 include 为 "**/*.ts"，覆盖了 apps/**。
# 所以这里把它整体移出源码树。可逆：需要时 mv 回来即可。
MOBILE_DIR="${SRC_DIR}/apps/mobile"
EXCLUDED_DIR="${APP_ROOT}/_excluded"
if [[ -d "${MOBILE_DIR}" ]]; then
  mkdir -p "${EXCLUDED_DIR}"
  # 不直接 rm：上一轮的副本改名留档，避免误删
  if [[ -d "${EXCLUDED_DIR}/apps-mobile" ]]; then
    mv "${EXCLUDED_DIR}/apps-mobile" "${EXCLUDED_DIR}/apps-mobile.old.$(date +%s)"
  fi
  mv "${MOBILE_DIR}" "${EXCLUDED_DIR}/apps-mobile"
  ok "已把 apps/mobile 移出构建范围（→ ${EXCLUDED_DIR}/apps-mobile）"
fi

# apps/mobile 是 Capacitor 移动端，服务器不需要；排除它能省时间与磁盘。
# 若 filter 语法在该 pnpm 版本下不生效则自动回退全量。
# 注意不要把 pnpm 的输出接到 tail —— 安装失败时那段日志正是唯一线索。
if pnpm install --no-frozen-lockfile --registry "${NPM_REGISTRY}" --filter "!./apps/mobile"; then
  ok "依赖安装完成（已排除 apps/mobile）"
else
  warn "带 filter 的安装失败，回退为全量安装"
  pnpm install --no-frozen-lockfile --registry "${NPM_REGISTRY}"
  ok "依赖安装完成（全量）"
fi

# 校验原生模块在「系统 Node」下可用（better-sqlite3 在这里会被按需重编到当前 ABI）
log "  校验 better-sqlite3 与当前 Node 的 ABI"
pnpm sqlite:ensure:node
node -e "const D=require('better-sqlite3');const d=new D(':memory:');d.prepare('select 1').get();d.close();console.log('    better-sqlite3 OK')"
node -e "require('node-pty');console.log('    node-pty OK')"

# ---------------------------------------------------------------- 3. 构建
log "[3/4] 构建 Next.js"
warn "2 核 2G 机器上这一步通常 10-30 分钟，会大量用 swap，属正常现象。"
warn "想实时看内存：另开一个 SSH 窗口敲  watch -n2 free -h"
BUILD_START=$(date +%s)

# 注意：这里【不能】用 `pnpm build` —— 那条走 run-electron-node.mjs，
# 而服务器上 Electron 二进制已被跳过下载，必然失败。直接用系统 Node 跑 next build。
node node_modules/next/dist/bin/next build

BUILD_SECS=$(( $(date +%s) - BUILD_START ))
ok "构建完成，耗时 $((BUILD_SECS / 60)) 分 $((BUILD_SECS % 60)) 秒"

# ---------------------------------------------------------------- 4. 组装 standalone
log "[4/4] 组装 standalone 运行目录"
STANDALONE="${SRC_DIR}/.next/standalone"
[[ -f "${STANDALONE}/server.js" ]] \
  || die "未生成 ${STANDALONE}/server.js —— 构建产物不完整，请检查上面的构建日志"

# (a) Next 官方要求：static 与 public 不进 tracing，必须手工拷进 standalone
rm -rf "${STANDALONE}/.next/static"
mkdir -p "${STANDALONE}/.next"
cp -r "${SRC_DIR}/.next/static" "${STANDALONE}/.next/static"
ok "已拷 .next/static"

if [[ -d "${SRC_DIR}/public" ]]; then
  rm -rf "${STANDALONE}/public"
  cp -r "${SRC_DIR}/public" "${STANDALONE}/public"
  ok "已拷 public/"
fi

# (b) skills/ 必须拷：src/server/skill-service.ts 用 process.cwd()/skills 找技能，
#     而 standalone 的 server.js 第一行 process.chdir(__dirname) 会把 cwd 定到
#     ${STANDALONE}，所以技能目录得落在它下面。
if [[ -d "${SRC_DIR}/skills" ]]; then
  rm -rf "${STANDALONE}/skills"
  cp -r "${SRC_DIR}/skills" "${STANDALONE}/skills"
  ok "已拷 skills/（skill-service 依赖 cwd/skills）"
fi

# (c) 运行时数据落盘位置。db/client.ts 等模块把数据目录钉在 process.cwd()/.agenthub-data，
#     故这里做软链，让数据真正落在 ${DATA_DIR}（持久、好备份、重部署不丢）。
DATA_LINK="${STANDALONE}/.agenthub-data"
mkdir -p "${DATA_DIR}"
if [[ -e "${DATA_LINK}" && ! -L "${DATA_LINK}" ]]; then
  # 是真实目录（老部署残留），先迁移再让位，绝不直接删
  warn "${DATA_LINK} 是真实目录，正在把数据迁移到 ${DATA_DIR}"
  cp -an "${DATA_LINK}/." "${DATA_DIR}/" 2>/dev/null || true
  mv "${DATA_LINK}" "${DATA_LINK}.bak.$(date +%s)"
fi
rm -f "${DATA_LINK}"
ln -s "${DATA_DIR}" "${DATA_LINK}"
ok "运行时数据 → ${DATA_DIR}（软链 ${DATA_LINK}）"

# (d) 校准权限，确保服务账号可读写数据目录
chmod -R u+rwX "${DATA_DIR}" 2>/dev/null || true

# (e) 补齐 pnpm 结构下 tracing 漏掉的包文件。
#     Turbopack 的 output file tracing 在 pnpm 的
#       node_modules/.pnpm/<pkg>@<ver>_<peers>/node_modules/<pkg>/
#     结构里会只复制「它认为被引用到」的文件，导致某些包残缺。
#     实测症状：debug 包的 src/index.js 没被带进 standalone，
#     于是 ali-oss 加载时报
#       Cannot find module '.../ali-oss@.../node_modules/debug/src/index.js'
#     并在 err.log 留下 unhandledRejection（OSS 图片存储随之失效）。
#     兜底做法：以源码树为准，把 standalone 里「同名包」缺的文件补上。
#     -n 保证只新增、绝不覆盖（standalone 里的软链指向 peers 变体，
#     名称与源码树不同，覆盖会断链）。
SA_PNPM="${STANDALONE}/node_modules/.pnpm"
SRC_PNPM="${SRC_DIR}/node_modules/.pnpm"
if [[ -d "${SA_PNPM}" && -d "${SRC_PNPM}" ]]; then
  PATCHED=0
  for d in "${SA_PNPM}"/*/; do
    name="$(basename "${d}")"
    if [[ -d "${SRC_PNPM}/${name}" ]]; then
      cp -a -n "${SRC_PNPM}/${name}/." "${d}" 2>/dev/null || true
      PATCHED=$((PATCHED + 1))
    fi
  done
  ok "已补齐 ${PATCHED} 个包在 standalone 中缺失的文件（pnpm tracing 兜底）"

  # (f) 补齐「整包缺失」的传递依赖。
  #     上一步只能补「standalone 里已存在、但文件不全」的包；实测 Turbopack 还会
  #     整包漏掉更深的传递依赖（例：urllib → default-user-agent → os-name → osx-release，
  #     最后一环整个包都没进 standalone，报 Cannot find module 'osx-release'）。
  #     逐个追是无底洞，这里改用符号链接把缺失的包指向源码树 —— 源码树的
  #     node_modules 是同一次 pnpm install 的完整产物（版本完全一致），
  #     而 .pnpm 内部一律是相对符号链接，链过去之后依赖图自然闭合。
  #     代价：standalone 不再能脱离源码树单独搬运 —— 但本方案本来就是
  #     「在目标机上构建」，源码树始终在，因此无影响。
  SA_NM="${STANDALONE}/node_modules"
  SRC_NM="${SRC_DIR}/node_modules"
  LINKED=0
  shopt -s nullglob
  for d in "${SRC_PNPM}"/*/; do
    name="$(basename "${d}")"
    if [[ ! -e "${SA_PNPM}/${name}" && ! -L "${SA_PNPM}/${name}" ]]; then
      ln -s "${d%/}" "${SA_PNPM}/" 2>/dev/null && LINKED=$((LINKED + 1))
    fi
  done
  # 顶层直接依赖同理（standalone 顶层只有被 tracing 判定「用到」的那几个）
  for p in "${SRC_NM}"/*; do
    name="$(basename "${p}")"
    [[ "${name}" == ".pnpm" ]] && continue
    if [[ ! -e "${SA_NM}/${name}" && ! -L "${SA_NM}/${name}" ]]; then
      ln -s "${p}" "${SA_NM}/" 2>/dev/null && LINKED=$((LINKED + 1))
    fi
  done
  shopt -u nullglob
  ok "已为 ${LINKED} 个缺失包建立指向源码树的符号链接（依赖图闭合）"
else
  warn "跳过 pnpm 补齐（找不到 ${SA_PNPM} 或 ${SRC_PNPM}）"
fi

# ---------------------------------------------------------------- 汇总
STANDALONE_MB=$(du -sm "${STANDALONE}" 2>/dev/null | cut -f1 || echo '?')
DATA_MB=$(du -sm "${DATA_DIR}" 2>/dev/null | cut -f1 || echo '?')
DISK_AVAIL=$(df -h "${APP_ROOT}" | awk 'NR==2{print $4}')

cat <<EOF

${GREEN}============================ 构建完成 ============================${NC}

  commit        $(git -C "${SRC_DIR}" log --oneline -1 2>/dev/null || echo "（源码为上传包，无 git 元数据）")
  运行入口      ${STANDALONE}/server.js
  standalone    ${STANDALONE_MB} MB
  运行时数据    ${DATA_MB} MB
  剩余磁盘      ${DISK_AVAIL}
  构建耗时      $((BUILD_SECS / 60)) 分 $((BUILD_SECS % 60)) 秒

${YELLOW}下一步（换回 root 或 sudo 身份跑，装服务并启动）：${NC}

    sudo bash ${SRC_DIR}/deploy/03-install-service.sh

EOF
