# 桌面安装包更新执行记录（v0.2.0-rc.2，本机 VM 构建）

> 方案：`openspec/changes/installer-update/PLAN.md`；证据：`~/workspace/frontend-polish-evidence/installer-update/`。
> 用户决策（2026-11-19 ~13:54）：升到 rc.2，本机 VM 构建。

## 步骤 1 — 定版 rc.2 + 提交（DONE）

- 6 处版本号 `0.2.0-rc.1` → `0.2.0-rc.2`：`package.json#version`、`VERSION`、`src/components/home/home-data.ts` 的 `APP_VERSION`、README.md（:28、:41 版本部分）、README.zh-CN.md（:28、:41 版本部分）、CHANGELOG.md（新增 `## [0.2.0-rc.2] - 2026-11-19` 一节；rc.1 旧节未动）。
- 冒烟：`npx tsc --noEmit` 0 错误。
- 提交：`bc095da` `chore(release): bump version to 0.2.0-rc.2`（6 文件，+21/−7），只提交未 push。
- 其余 `0.2.0-rc.1` 残留均为历史文本（CHANGELOG rc.1 节、NOTICE.md、SECURITY.md、issue 模板占位、installer-update PLAN 本身），不改。

## Gitee 推送（DONE，与步骤 1 同批）

- 用户 ~13:55 重新提供了 PAT（续期后），transient 使用：`git credential approve` 写入 `/tmp/gitee-cred.txt`（URL 格式）→ push → 立即删除并 ls 核实已删。令牌值未写入任何文件/日志/汇报。
- 结果：`89a0ee7..bc095da master -> master`，`git ls-remote gitee HEAD` = bc095da。
- 失败插曲（已解决）：第一次直接手写 key-value 格式的凭据文件，`git credential-store get` 读不到（该文件格式是 URL-per-line，手写 key-value 无效），push 报 `could not read Username`；改用 `git credential approve` 写入后一次成功。

## 步骤 2 — 本机构建（BLOCKED：主 makensis 无法在本机完成）

- 构建链与 `pnpm electron:build` 等价，但绕过 pnpm（见下）。
- 旧包备份（DONE，先于任何覆盖）：OSS 旧 exe 已下载到 `backup/Multi-Agent-TeamFlow-Setup-v0.2.0-rc.1.exe`，570,549,147 字节，SHA-256 `4bef19742e631983859e42fd0295b00113b497a6d48c37dcec1eab696d31df77`（与旧版一致）。GitHub 旧附件未另下——本次新建 release 而非 `--clobber` 覆盖，旧 release 附件原地保留即备份。
- **状态（2026-11-19 ~08:25 UTC）**：手动链步骤 1–4 全部通过；步骤 5 `electron-builder --win nsis` 在最后的 makensis 编译两次失败（见下「主 makensis 失败诊断」）。**7z 载荷已生成并验证完好**：`release/multi-agent-teamflow-0.2.0-rc.2-x64.nsis.7z`，602,368,964 字节，SHA-256 `d3f31ba78b2c946b079c4311bc04b94b72909d190251b4a7269e10b65b5c94cb`，`7zz t` 校验 "Everything is Ok"（23,239 文件，2,651,659,187 字节未压缩）。`release/win-unpacked/`（2.4 GB）与 BUILD_UNINSTALLER 安装器（419,984 字节）亦已生成。**没有可发布的 `Multi-Agent-TeamFlow-Setup.exe` 成品。**
- 构建耗时：单次 `electron-builder --win nsis` 约 9 分钟到 makensis 失败点；不含前期 Next 构建。

### 构建障碍与绕法（均已定位，非代码问题）

1. **pnpm 依赖检查 EPERM**：`npx -y pnpm@11.9.0 electron:build` 在起步即失败——pnpm 11.9.0 的 `runDepsStatusCheck` 会先跑 `pnpm install`，其 chown 临时 lock 文件在 `/home/hatch` 的 overlayfs（`metacopy=on`）上报 EPERM。`npm_config_verify_deps_before_run=false` 无效（该设置在 pnpm 11.9.0 不存在，`config get` 返回 undefined）；`--verify-deps-before-run=false` 亦报 `Unknown option`。
2. **Electron 二进制缺失**：`node_modules/electron/` 只有 4.0K，无 `dist/`（postinstall 下载从未跑过）。已修复：`node node_modules/electron/install.js`（走 egress 代理）下载成功，`dist/` 就位。
3. **electron-builder 要 spawn `pnpm`**：node module collector 跑 `pnpm list --prod …`，但本机 PATH 无 pnpm（ENOENT）。已修复：`npm install -g --prefix=/home/hatch/.local pnpm@11.9.0`（持久路径），`pnpm list --prod --json` 实测可用（不触发依赖检查）。
4. **绕过方案**：不再走 `pnpm electron:build`，改跑与之等价的手动链（与 package.json 脚本一一对应）：
   - `node scripts/ensure-electron-sqlite.mjs`（ABI 130 检查/重建，走 prebuild-install/node-gyp，不调 pnpm）
   - `node scripts/run-electron-node.mjs node_modules/next/dist/bin/next build`
   - `node scripts/electron-prebuild.mjs`
   - `./node_modules/.bin/tsc -p electron/tsconfig.json`
   - `PATH=/home/hatch/.local/bin:$PATH ./node_modules/.bin/electron-builder`
   - 步骤 1–4 已通过（日志见 `build.log`）；步骤 5 在 NSIS 阶段两次失败（07:50、08:12 UTC），见下 §5。

### wine 问题（已查清：32 位 Windows 代码无法在本机运行；已绕过）

- **PLAN §6 "交叉编译 Windows NSIS 不需要 wine（签名已禁用）" 是错的。** electron-builder 26.15.2 的 NSIS 目标在 makensis 编出安装器后，会**在 Wine 下运行安装器**（`WineVmManager.exec`）让它写出 uninstaller exe，再嵌回成品安装器。签名禁用与否不影响这一步。安装器是 32 位 PE（`PE32 … Nullsoft Installer`），所以 wine 步骤需要 32 位 Windows 执行（WoW64）。
- **electron-builder 自带 wine 不可用**：`wine-11.0-linux-x86_64.tar.xz`（32,009,780 字节，SHA-256 `d8cf9544…` 已验）是极简版——全包仅 36 个 .dll，无 `lib/wine/x86_64-windows/`、无 kernel32.dll PE、无 `libwine.so.1`；跑起来报 `failed to load …/lib/wine/x86_64-unix/ntdll.dll error c0000135` / `run_wineboot failed`（exit 53）。勿再用。
- **Kron4ek Wine 11.22（第三方 vanilla 构建）——64 位可用，32 位不行**：`wine-11.22-amd64.tar.xz`（100,591,320 字节，SHA-256 `cdaaa76c…` 已验）与 WoW64 版 `wine-11.22-amd64-wow64.tar.xz`（98,200,812 字节，SHA-256 `e2967393…` 已验）均已下载验证。64 位执行正常（`xvfb-run -a wine cmd /c "echo hello-64bit"` → `hello-64bit`，exit 0；无显示时 Wine 报 `nodrv_CreateWindow`，Xvfb 已装在 `/usr/bin/xvfb-run`）。但 **32 位 WoW64 安装死循环**：`rundll32.exe setupapi,InstallHinfSection Wow64Install` 99.6% CPU 空转 5 分钟以上，syswow64 0 个 DLL 落地，0 字节写入；`ptrace(PTRACE_SEIZE)` 被禁（Operation not permitted）无法 inspected。根本原因：**系统无 32 位运行时**——`/lib/ld-linux.so.2` 不存在，/lib32 与 /usr/lib32 为空，32 位 `lib/wine/i386-unix/wine` ELF 报 ENOENT。结论：沙箱拦住了 32 位执行路径，本机跑不了 32 位 Windows 代码。（Kron4ek 包解压须加 `--no-same-owner`，否则 tar 试图 chown 到 uid 1001 在 overlayfs 上失败。）
- **绕法（已生效）：UninstallerReader + 假 wine。** electron-builder 自带的 `UninstallerReader`（app-builder-lib `out/targets/nsis/nsisUtil.js`，纯 JS，macOS Catalina 的首选路径）直接解析 BUILD_UNINSTALLER 安装器的 PE/NSIS 结构抽出 uninstaller 字节（与 wine 跑出来的结果相同，因字节只来自 makensis 输出）。2026-11-19 ~07:35 UTC 从 419,984 字节的 BUILD_UNINSTALLER 安装器成功抽出 `Multi-Agent-TeamFlow-Setup__uninstaller.exe`，**284,523 字节，SHA-256 `d80b0305c94c2632f0f8b8f47ca31147e992ae28dcc45b97cc2c657f2a174b56`**，有效 PE32 NSIS 安装器；备份在证据目录 `uninstaller-rc2-extracted.exe`。**文件名陷阱（已踩中）**：正确路径是 `Multi-Agent-TeamFlow-Setup.__uninstaller.exe`——**带一个点**，因为 `path.basename(installerPath, "exe")` 只剥掉 "exe" 留下 "Setup."；第一次抽出用了无点名，主 makensis 随即失败。两名字现都在 `release/`，SHA-256 相同。`/home/hatch/.local/bin/wine` 现为**假 wine 脚本**（`--version` 印 `wine-11.22`，其余直接 exit 0），使 electron-builder 的 wine 步骤瞬间通过（日志：`file signing skipped … file=release/Multi-Agent-TeamFlow-Setup.__uninstaller.exe`）；**构建成功后必须恢复为真 Kron4ek wine 软链**（`/home/hatch/.local/wine-11.22-amd64-wow64/bin/wine`）。

### 主 makensis 失败诊断（BLOCKER，已隔离复现，根因定位）

- **现象**：两次 `electron-builder --win nsis`（~07:50、~08:12 UTC）在主 makensis 编译处失败，错误 `makensis process failed ERR_ELECTRON_BUILDER_CANNOT_EXECUTE`，exit code **-1**，紧接在 `Processing script file: "<stdin>" (UTF8)` 之后。BUILD_UNINSTALLER 的小编译（419,984 字节）每次都成功。第二次失败时 dotted uninstaller 文件已就位，故缺文件不是（唯一）原因。
- **隔离复现（makensis 直跑，非 electron-builder）**：`~/.cache/electron-builder/nsis-3.0.4.1/nsis-3.0.4.1-1mx3n/linux/makensis`（NSIS 3.0.4.1，64 位 ELF）+ `NSISDIR=…/nsis-3.0.4.1-1mx3n`：
  - 小文件（.nsi 本身）：exit 0，正常出包。
  - 单 `File` 嵌 100 MB / 300 MB / 400 MB / **500,000,000 字节**：全部 exit 0。
  - 单 `File` 嵌 **512 MiB（536,870,912）**、512 MiB+1、**575 MB（完整 7z）**：全部 **exit 135 = SIGBUS**，在 "Processing script file" 后死亡。
  - 压缩方式无关：默认 zlib、`/SOLID lzma`、`SetCompress off`（纯存储）三者对 575 MB 文件**全部 SIGBUS**；纯存储时 <1 秒即死。
  - **阈值在 500,000,000 与 536,870,912 字节之间**，约 512 MB。
- **strace 证据**（makensis strace 关键行已分析并记录于此，原始日志在清理测试文件时随 /tmp 一并删除；证据目录内 `wineboot-diag.strace` 是 wine 的诊断日志，与此无关）：makensis 以 32 MB 窗口 chunked-mmap 处理文件（`mmap(NULL, 33554436, PROT_READ|PROT_WRITE, MAP_SHARED, fd_out, 0x1e000000)` 与 `mmap(NULL, 33554432, PROT_READ, MAP_SHARED, fd_in, 0x1e000000)` 交替，偏移 0x1a000000 → 0x1c000000 → 0x1e000000），在文件偏移 ~0x1e000000（503,316,480）处写输出映射时触发 `SIGBUS {si_signo=SIGBUS, si_code=BUS_ADRERR, si_addr=0x7078267ce000}`（在输出映射内、距映射首 31,195,136 字节，对应输出文件偏移约 534.5 MB）。
- **已排除的原因**：
  - /tmp 空间：初测输出写 /tmp 时 tmpfs 仅剩 202 MB（wine tarball 占了 311 MB），曾怀疑；已清空 /tmp（现 510 MB 可用）并改写 /home/hatch，**仍 SIGBUS**。
  - 载荷损坏：`7zz t` 校验 7z 完好（见上）。
  - 宿主内存不足：重试时 `free` 显示 available 2,047 MB（7z 读写共需约 1.15 GB 页缓存），**仍 SIGBUS**；且本机进程常驻仅 ~370 MB（hatch daemon 353 MB）；`drop_caches` 被禁（/proc/sys 只读），但重试时内存已充裕。
  - 输出文件系统：/home/hatch（/dev/mapper/rv，143 GB 可用）与 `/`（overlay，7.3 GB 可用）**都 SIGBUS**，与文件系统无关。
  - 压缩器：三种压缩设置全灭（见上）。
- **结论**：本机 Linux 版 makensis（NSIS 3.0.4.1，electron-builder 配套）**无法处理单个 >~512 MB 的 File**；真实 NSIS 脚本正是用单条 `File /oname=$PLUGINSDIR\app-64.7z "${APP_64}"`（`templates/nsis/include/extractAppPackage.nsh:73`）嵌 575 MB 的 7z 载荷，故主编译在本机**确定性失败**，与 electron-builder 本身无关。rc.1 的 570 MB 安装器（载荷亦 >512 MB）当年是在 Windows 上建成，非本机。
- **出路（需用户定）**：
  1. **在用户 Windows PC 上构建**（最稳妥；rc.1 即此路线，PC 上有仓库副本 `C:\Users\he\Documents\multi-agent-teamflow`，跑 `pnpm electron:build` 即可；本机已做好的版本提交 bc095da 已推到 Gitee，PC 拉取后即可构建）。
  2. 把 7z 载荷压到 500 MB 以下（需从 2.4 GB 解包内容里砍 ~300 MB+ 未压缩体积，改动产品内容，需用户确认；不推荐仓促做）。
  3. 换更新版 NSIS（如自行编译 NSIS 3.10/3.11 替换缓存里的 makensis）——是否修复此问题未验证，属较深的折腾，不建议。
  4. 放弃 NSIS 改发 zip/portable——与 /home 按钮约定的 `Multi-Agent-TeamFlow-Setup.exe` 不符，不建议。
- **待恢复/清理**：假 wine 脚本（`/home/hatch/.local/bin/wine`）构建后恢复真 wine 软链；`~/.wine` 前缀（327 MB，wine 测试残留）、Kron4ek wine 解包目录（`~/.local/wine-11.22-amd64*`）、electron-builder 自带 wine 目录（`~/.cache/electron-builder/wine-11.0-linux-x86_64/`）在安装包工作彻底关闭前保留，之后可删；证据目录内 makensis 阈值测试日志 `log-{100m,300m,400m,500m,512mib,512mib1,lzma,store,store2}.txt` 与 `t-store.nsi` 已保留，测试用的大文件已删。

## 步骤 3 — 上传 OSS（待构建完成）

- 方式 A（服务器端上传）：scp 新 exe 到服务器 `/tmp/` → 在服务器上用 `/etc/agenthub/agenthub.env` 里的 OSS key 跑 `oss-upload.cjs`（证据目录内，`ali-oss` client，对象键 `downloads/Multi-Agent-TeamFlow-Setup.exe`，`public-read`），密钥只在服务器进程环境现取现用，绝不回传本机、不落盘、不打印。
- 验：`curl -I` OSS 直链 200，Content-Length = 新包大小。

## 步骤 4 — 修本站 `/downloads/` 404 兜底（可选，待定）

- scp 新 exe 到服务器 `/opt/agenthub/src/public/downloads/` 并同步进 standalone；验 `curl -I http://121.40.240.236/downloads/Multi-Agent-TeamFlow-Setup.exe` → 200。

## 步骤 5 — GitHub Release v0.2.0-rc.2（待构建完成）

- 新建 release `v0.2.0-rc.2`（新 tag，不动旧 release），上传新 exe 附件，正文格式照旧版（大小 + SHA-256 + OSS 镜像链接）。走已接通的 GitHub 连接器。

## 步骤 6 — Gitee Release v0.2.0-rc.2（待构建完成 + 令牌）

- 新建 release `v0.2.0-rc.2`，只改正文（大小 + SHA-256），不传 exe。用同一枚用户 PAT transient 调用 API；若令牌失效，停下汇报。

## 步骤 7 — README 大小/SHA-256 + 收尾验证（待构建完成）

- 两份 README 第 41 行附近的大小/SHA-256 行改成新包的值，另行提交。
- 最终验证：OSS 直链 200 且长度 = 新包；`/home` 按钮仍可用；GitHub release 附件大小/SHA 与本地一致；Gitee release 正文（若已做）；本站 `/downloads/`（若做了步骤 4）。

## 步骤 2 改道 — GitHub Actions Windows runner 构建（2026-11-21）

- 用户 2026-11-21 11:11 选定：不自己跑终端命令，改走 GitHub Actions 编。浏览器跑不了构建命令（只能开网页、点按钮），PC 构建仍是备选。
- 新增 `.github/workflows/build-installer.yml`（手动触发 workflow_dispatch，不在 push/PR 上自动跑）：windows-latest，Node 24 + pnpm 11.9.0（与现有 ci.yml 同款配置），构建链与 `pnpm electron:build` 一致（build 失败重试一次，CI 同款 SQLite 抖动处理）→ prebuild → tsc → electron-builder；产物 `release/Multi-Agent-TeamFlow-Setup.exe` 以 artifact `Multi-Agent-TeamFlow-Setup-rc2` 保留 7 天。
- 构建脚本本身已是 Windows 就绪：`run-electron-node.mjs` 跨平台（Electron 内嵌 Node），`electron-prebuild.mjs` 含 win32 分支（SYMLINKD、win32-x64-msvc 后缀）；electron-builder 配置为 win nsis x64、未签名。
- 流程：提交 workflow 文件 → 推 Gitee + GitHub → 手动触发 run → 下载 artifact → 回到步骤 3（OSS 上传）继续。

## 步骤 2 结果 — Actions 构建成功，exe 已验证（2026-11-21）

- 首次 run 44860591163 失败（11:31，10分51秒）：electron-builder 在 CI 下隐式触发发布，缺 GH_TOKEN，exe 与 blockmap 已生成后才失败。修法：workflow 加 `--publish never`（发布走 OSS/手动 release），本地提交 72f394c；GitHub 上经云端浏览器同改提交 ebb9175（逐字节一致）。
- 第二次 run 44862316675 成功（11:51，11分23秒，全绿）。Artifact `Multi-Agent-TeamFlow-Setup-rc2`（581,221,920 字节，保留至约 2026-11-28）。
- exe 已验证：583,502,874 字节，SHA-256 `de3f9ae737f8d4c01e00c1871d39ef37d898cf38f725262c4fca8726d5588d2c`，与 CI 日志第 7 步打印值一致；本地副本 `~/workspace/installer-rc2/Multi-Agent-TeamFlow-Setup.exe`。
- GitHub release v0.2.0-rc.2 由用户本人在其 Chrome 发布（12:41，Latest，exe 附件已核对）；云端浏览器打不开文件选择框、且 exe 路径是本机虚拟机路径，无法代传附件——以后 release 附件须由用户在自己电脑上操作。
- OSS 上传进行中（子代理，scp + 服务器端 oss-upload.cjs）；Gitee release 与 README 待做。
