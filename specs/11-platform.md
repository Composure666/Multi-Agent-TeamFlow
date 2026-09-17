# Spec 11 — 平台抽象（Platform）

> AgentHub 在本地运行，宿主可能是 macOS / Linux / Windows。本 spec 定义跨平台差异的处理契约：shell 选择、命令黑名单、路径校验、子进程清理。

源文件：`src/server/platform.ts`（platform 检测与常量），`src/server/security.ts`（双平台黑名单），`src/server/tools/bash.ts`（shell 执行）。

---

## Platform 枚举

```typescript
export type Platform = 'posix' | 'windows'

export function currentPlatform(): Platform {
  return process.platform === 'win32' ? 'windows' : 'posix'
}
```

**为什么不区分 darwin / linux**：bash 工具行为、黑名单语法、路径风格在 macOS 与 Linux 之间一致；区分到 POSIX vs Windows 两类即可。后续若出现 darwin 专属需求（如 Keychain 路径）再细化。

---

## Shell 选择

| Platform | 命令 | 参数 | 说明 |
|---|---|---|---|
| `posix` | 用户 login shell（`zsh` / `bash`）优先，回退 `sh` | `['-l', '-i', '-c', command]` 或 `['-c', command]` | macOS / Linux 默认优先继承用户 shell 初始化出的 PATH |
| `windows` | `powershell.exe` | `['-NoProfile', '-NonInteractive', '-Command', '<chcp> ; <command>']` | 用系统自带 PS 5.1（不依赖 pwsh 7） |

**POSIX 细节**：
- 优先从 `process.env.SHELL` 解析用户 shell；缺失时回退 `os.userInfo().shell`
- 仅当解析到的绝对路径存在且 shell basename 是 `zsh` 或 `bash` 时，使用 `-l -i -c <command>`。这样桌面版从 Finder / Dock 启动时，也能加载用户 `.zprofile` / `.zshrc` / `.bash_profile` / `.bashrc` 中配置的 Node、pnpm、Homebrew、nvm 等 PATH
- 其它 shell 或无法解析用户 shell 时回退 `sh -c <command>`，保持 POSIX 命令语法稳定
- AgentHub 自管 `bash` 通过 `node-pty` 启动上述 shell，不使用 `shell: true`

**Windows 细节**：
- AgentHub 自管 `bash` 通过 `node-pty` / ConPTY 启动 PowerShell，避免把命令直接交给 `shell: true`
- 命令前 prepend `$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(); ` 强制 stdout / stderr 为 UTF-8（Windows 默认 codepage 936 / cp1252 会导致中文乱码 / LLM 上下文污染）。**不**用 `chcp 65001`——chcp 在 PowerShell 初始化输出流之后才生效，命令本身的错误信息仍是 GBK
- 用系统自带 PS 5.1（不依赖 pwsh 7）

**Why PowerShell 不用 `cmd.exe`**：cmd 语法贫瘠（无管道、变量插值能力差），LLM 生成质量低；PowerShell 5.1 在所有 Win10+ 系统预装，无需用户额外配置。

**禁止**：
- 不要在 PowerShell 命令里嵌套 `bash -c`（即便检测到 Git Bash 存在）；Phase 1 保持单 shell 策略
- 不要给底层执行层传 `shell: true`（会让黑名单更难匹配，且引入 shell 注入风险）

---

## 命令黑名单（双平台）

`src/server/security.ts` 导出 `getBannedPatterns(platform): RegExp[]`：

### POSIX 黑名单

```typescript
const POSIX_BANNED: RegExp[] = [
  /\brm\s+-rf\s+\//,             // rm -rf /
  /\bsudo\b/,                     // 提权
  /\bchmod\s+\d{3,4}\s+\//,      // chmod 777 /
  /:\(\)\{\s*:\|:&\s*\}/,        // fork bomb
  /curl\s+[^|]*\|\s*(bash|sh)/,  // curl | sh
  /wget\s+[^|]*\|\s*(bash|sh)/,  // wget | sh
  /\beval\b/,
  /\bexec\b\s+/,
]
```

### Windows 黑名单

```typescript
const WINDOWS_BANNED: RegExp[] = [
  // 删根 / 删盘
  /\b(del|erase)\s+\/[fsq\s\/]*[a-z]:\\?/i,         // del /F /Q C:\
  /\brd\s+\/[sq\s\/]*[a-z]:\\?/i,                   // rd /S /Q C:\
  /\bRemove-Item\b[^|;]*-Recurse[^|;]*-Force/i,     // Remove-Item -Recurse -Force
  /\bRemove-Item\b[^|;]*-Force[^|;]*-Recurse/i,     // 参数顺序反过来
  /\bri\b[^|;]*-Recurse[^|;]*-Force/i,              // ri = Remove-Item alias
  // rm / rmdir 在 PowerShell 也是 Remove-Item alias，单独拦（注意：POSIX 黑名单的 `rm -rf /` 走的是 POSIX 分支）
  /\brm\b[^|;]*-Recurse[^|;]*-Force/i,
  /\brm\b[^|;]*-Force[^|;]*-Recurse/i,
  /\brmdir\b[^|;]*-Recurse[^|;]*-Force/i,
  /\brmdir\b[^|;]*-Force[^|;]*-Recurse/i,
  // 格式化 / 关机
  /\bformat\s+[a-z]:/i,
  /\bshutdown\b/i,
  /\brestart-computer\b/i,
  /\bstop-computer\b/i,
  // 注册表破坏
  /\breg\s+delete\b/i,
  /\bRemove-ItemProperty\b/i,
  // 进程暴力清理
  /\btaskkill\b[^|;]*\/im\s*\*/i,                   // taskkill /IM *
  /\bStop-Process\b[^|;]*-Force[^|;]*\*/i,
  // 远程下载 + 执行
  /Invoke-Expression\s*\(\s*(Invoke-WebRequest|iwr|curl|wget)/i,
  /\biex\b\s*\(\s*(iwr|curl|wget|Invoke-WebRequest)/i,
  // 策略放宽
  /Set-ExecutionPolicy\s+(Unrestricted|Bypass)/i,
  // 磁盘破坏
  /\bbcdedit\b/i,
  /\bdiskpart\b/i,
  // 凭据 / 安全模块
  /\bcipher\s+\/w/i,                                // cipher /w 擦除空闲空间
]
```

### 公共黑名单

`POSIX_BANNED` 与 `WINDOWS_BANNED` 之外，所有平台共享：

```typescript
const SHARED_BANNED: RegExp[] = [
  // 暂无；保留扩展点（未来可能加 SSRF 命令、加密货币挖矿特征等）
]
```

`getBannedPatterns(platform)` 返回 `[...SHARED_BANNED, ...(platform === 'windows' ? WINDOWS_BANNED : POSIX_BANNED)]`。

**为什么不做语义判断**：黑名单只拦最显著的破坏命令，LLM 真要绕过总能绕（如 base64 编码）；真正的兜底是沙箱（workspace.rootPath / boundPath）与人工审批（fsWriteApprovalMode）。

---

## 工具描述按平台变体

`src/server/tools/bash.ts` 的 `description` 字段从静态字符串改为基于 `currentPlatform()` 生成：

- **POSIX**：`"Run a shell command inside workspace. POSIX uses the user login shell for zsh/bash ($SHELL -l -i -c) when available, otherwise sh -c. Use POSIX syntax: ls, grep, cat, git, npm. Output is streamed through TerminalSession events, 30s timeout. Blocked: rm -rf /, sudo, fork bombs, curl | sh."`
- **Windows**：`"Run a PowerShell 5.1 command inside workspace. Use PowerShell syntax: Get-ChildItem, Select-String, Get-Content, git, npm. Output is UTF-8 and streamed through TerminalSession events, 30s timeout. Blocked: Remove-Item -Recurse -Force, format, shutdown, iex(iwr ...), reg delete."`

**注**：CustomAgentAdapter 与 ClaudeCodeAdapter 不共用同一工具实例；ClaudeCodeAdapter 走 SDK 原生 Bash 工具，描述由 SDK 控制，但 `canUseTool` 钩子里的黑名单走同一份 `getBannedPatterns`。

---

## 进程清理

**AgentHub 自管 bash**：`terminal-session-service` 负责 PTY 生命周期。超时或 run abort 时调用 PTY kill，并把 `terminal_sessions.status` 更新为 `failed` 或 `aborted`，随后发布 `terminal.exited`。

**SDK 命令钩子**：Claude/Codex SDK 内部命令执行路径暂不纳入 TerminalSession v1；若 SDK 暴露 pre-execution permission callback，仍复用同一份黑名单和审批规则。

`taskkill /F /T /PID` 强制递归杀进程树；不存在的 PID 静默忽略。

---

## SDK 子进程的 HOME 兼容

Claude Code SDK 内部用 `~` 展开（通过 `os.homedir()`）找配置。Node 在 Windows 上 `os.homedir()` 已正确返回 `C:\Users\xxx`，但若 SDK 子进程检查 `process.env.HOME`（POSIX 风俗），Windows 默认无此变量。

`buildSdkEnv` 兜底：

```typescript
function buildSdkEnv(...) {
  const base = { ...process.env }
  if (process.platform === 'win32' && !base.HOME) {
    base.HOME = base.USERPROFILE
  }
  // ...其余 API key 注入逻辑
}
```

---

## 沙箱路径校验（isPathSafe）

`src/server/workspace-utils.ts` 的 `isPathSafe(absPath)` 拒绝几类敏感目录。Windows 与 POSIX 走分支。

### 路径比较

**Windows 上路径比较必须大小写不敏感**。`C:\Users\Foo` 与 `c:\users\foo` 在 NTFS / ReFS 上是同一路径。封装为 helper：

```typescript
// 子路径包含判断；Windows 大小写不敏感，POSIX 大小写敏感
export function isPathWithin(child: string, parent: string): boolean {
  const norm = (p: string) =>
    process.platform === 'win32'
      ? path.resolve(p).toLowerCase()
      : path.resolve(p)
  const c = norm(child)
  const p = norm(parent)
  return c === p || c.startsWith(p + path.sep)
}
```

`resolveSafePath` 与 `attachment-service` 的 traversal 检查统一走此 helper。

### 系统根（systemRoots）

| 平台 | 路径 | 说明 |
|---|---|---|
| POSIX | `/etc`, `/System`, `/usr`, `/bin`, `/sbin`, `/var`, `/private`, `/Library/Keychains` | macOS / Linux 系统 |
| Windows | 每个可用盘符的 `\Windows`、`\Program Files`、`\Program Files (x86)`、`\$Recycle.Bin`、`\System Volume Information`、`\Recovery`；以及 `\ProgramData`（只在系统盘） | 多盘符均拦 |

**UNC 设备路径**（`\\?\`、`\\.\`）一律拒绝（绕过 Windows 路径规范化容易越狱）。

**普通 UNC 网络路径**（`\\server\share\...`）暂拒——文件系统语义不可靠（offline、ACL）。后续有需求再开放。

Drives 列表通过 `statSync('A:\\')` … `statSync('Z:\\')` 探测可用盘符（同 `/api/fs/listdir` 的 drives sentinel），模块级缓存避免重复 IO。

**缓存生命周期**：进程级缓存，**只在 Next server 重启时刷新**。dev 期间用户热插 U 盘 / 网络盘映射，新盘符不会出现在 `getSystemRoots()`，对应的 `\Windows`、`\Program Files` 等系统根拦截不到该盘符。这是有意接受的 trade-off —— 频繁 `statSync` 26 个盘符在每次 `isPathSafe` 调用里都跑代价更大。受影响的是「软安全」：用户能直接编辑 DB 绕过 isPathSafe，所以 stale 盘符的拦截缺失不算严重风险。

### 敏感子路径（sensitiveSegments）

相对 `homedir()` 的路径片段，命中即拒。

| 平台 | 片段 |
|---|---|
| 跨平台 | `.ssh`, `.aws`, `.gcloud`, `.kube`, `.gnupg`, `.docker`, `.azure` |
| POSIX | `.config/gh`, `Library/Keychains`, `Library/Application Support/Code/User` |
| Windows | `AppData\Roaming\Microsoft\Credentials`, `AppData\Local\Microsoft\Credentials`, `AppData\Roaming\Microsoft\Protect`, `AppData\Roaming\gh`, `AppData\Roaming\Claude` |

注：`AppData` 本身不一律拒，只挡明确凭证子目录；用户可能合法工作在 `AppData\Local\Programs\...` 下。

---

## boundPath 输入校验（conversation-service）

用户在「新建对话」绑定本地目录时，`conversation-service` 的 `createConversation` 校验：

- 必须 `path.isAbsolute(input)` 为 true
- **Windows 上额外**：原始输入字符串必须匹配 `^[A-Za-z]:[\\/]` 或 `^\\\\` 开头。否则 `/foo`、`/tmp` 这类 POSIX 风格输入会被 Node `path.resolve` 当作「当前盘符根 + 路径」（如 `C:\foo`），与用户意图不符
- 路径存在、是目录、可读写
- 通过 `isPathSafe`

---

## DirPicker 隐藏目录过滤

`/api/fs/listdir` 列出的子目录：

- 跨平台：以 `.` 开头的目录（dotfile / dotdir）过滤
- Windows 额外过滤已知隐藏 / 系统目录名（大小写不敏感）：`AppData`、`$Recycle.Bin`、`System Volume Information`、`Recovery`、`PerfLogs`、`Config.Msi`、`MSOCache`、`OneDriveTemp`、`ProgramData`

**Why 不读 Windows hidden attribute**：Node `fs.statSync` 不暴露此 attribute；引入第三方包（如 `winattr`）违反 CLAUDE.md §4.3「不为将来可能用到加抽象」，且这些已知名能覆盖 95% 噪音目录。

---

## UI placeholder 平台感知

`new-conversation-dialog.tsx` 的 boundPath 输入框 placeholder 按服务器平台显示：

- POSIX: `/Users/me/projects/foo`
- Windows: `D:\projects\foo`

服务器平台通过 `GET /api/platform` 一次性获取（返回 `{ platform: 'posix' | 'windows' }`），前端 useEffect 缓存。

**Why 不用 `navigator.userAgent`**：用户可能从 Mac 浏览器访问 Windows 上跑的 AgentHub，浏览器侧推断会与实际 host 不一致；服务器才是 bash 工具实际跑的地方。

---

## 网络请求安全（web_fetch）

`src/server/tools/web-fetch.ts` 提供 AgentHub-managed `web_fetch`，用于读取公开 HTTPS 文本页面。该工具不是通用 HTTP client，不能访问本机服务、内网服务、metadata endpoint 或需要认证的页面。

### URL / 主机校验

- 只允许 `https:`，拒绝 `http:`、`file:`、`data:`、`ftp:` 等协议。
- 拒绝 URL username/password。
- 拒绝 `localhost`、`*.localhost`、`metadata.google.internal`、常见 cloud metadata host alias。
- 拒绝 IP literal：IPv4 loopback/private/link-local/unspecified/multicast、IPv6 loopback/unspecified/unique-local/link-local/multicast，以及 metadata IP。
- 普通域名 fetch 前必须 `dns.lookup(hostname, { all: true })`，所有 A/AAAA 结果都必须通过同一 IP 安全校验。
- redirect 必须手动处理，每一跳重新校验 URL、hostname、DNS 与 IP；最多 3 跳。

### 响应限制

- 只支持 GET，不支持自定义 headers、cookies、POST、auth 或二进制下载。
- 只接受文本类 content-type：`text/*`、`application/json`、`application/xml`、`application/xhtml+xml`、`application/javascript`、`application/x-yaml` 等。
- 响应体最多读取 1,000,000 bytes；返回文本按 `maxChars`（默认 12,000，上限 20,000）截断。
- HTML 只做基础清洗：提取 title、移除 script/style/noscript、去标签、decode 常见 entity、压缩空白；不执行 JS，不下载子资源，不保留 cookie。
- 工具必须尊重 `ctx.abortSignal`，并设置内部 timeout（默认 10s，上限 30s）。

### 已知边界

DNS rebinding 无法在当前 `fetch` 抽象下完全消除；AgentHub 通过 IP literal 检查、DNS 预解析、redirect 重校验和禁止非公开地址降低 SSRF 风险。外部 MCP server 自带的 fetch/search 工具不继承这些策略，只受外部 MCP 显式 opt-in 与 trust 模型约束。

---

## bash 网络出口

上面 `web_fetch` 的全部防护**只对 `web_fetch` 这一个工具生效**。`bash` 能发起真实网络请求，
若不额外约束，`curl http://127.0.0.1:<PORT>/api/...` 可直接读到平台自身 API 的数据
（回环端口无鉴权），云 metadata 同样可达 —— 等于绕开整套 SSRF 防护。

`src/server/network-guard.ts` 提供出口守卫；`tools/bash.ts` 与 claude-code adapter 的
`canUseTool` Bash 分支都必须在执行命令前调用 `findBlockedNetworkTarget()`，命中即拒。

### 拦截规则

- **一律拒绝**：云 metadata（IP 与厂商域名别名）、link-local、私有网段（10/8、172.16/12、192.168/16）、
  CGNAT（100.64/10）、组播、未指定地址；非 http(s) 协议（`file://` 读本地文件等）；
  「强行改写目标」类选项（`--resolve`、`--connect-to`、`--unix-socket`）。
- **回环只拒平台自身端口**：`resolvePlatformPorts()` 从 `PORT` / `AGENTHUB_INTERNAL_BASE_URL` 解析，
  默认含 3000。其余回环端口放行 —— 保留「在沙箱里起本地 dev server 再 curl 自测」的开发流程。
- **域名做 DNS 预解析**：任一解析结果落入上述被禁类别即拒；解析失败或超时按放行处理
  （此时真实请求同样会失败，不阻塞正常工作）。结果带 60s 缓存。
- **触发条件**：命令里出现带协议的 URL，或出现网络类命令 token（`curl`/`wget`/`nc`/`python -c`…）。
  普通文本里的 URL 不误伤。

### 已知边界（bash 网络出口）

本守卫只覆盖**网络**这一条路径。Agent 的 bash 以服务账号身份执行，因此仍可读该账号有权访问的
本地文件（包括平台数据目录下的 SQLite 库）。要彻底消除需要让 Agent 的 shell 以独立受限账号运行
（仅 workspace 读写权限），属独立的架构改动，不在本守卫范围内。

---

## Workspace 清理重试

`conversation-service.ts` 的 `rmSync(workspace.rootPath, { recursive: true, force: true })` 在 Windows 经常抛 `EBUSY` / `EPERM` / `ENOTEMPTY`：

- 文件被进程占用（dev server / git）
- Antivirus 实时扫描时 hold handle
- `.git/index.lock` 类残留锁文件

实现：用 `fs/promises.rm` + 指数退避重试，100ms / 300ms / 900ms，3 次后仍失败才放弃（仅 `console.warn`，不上报 DB —— workspace 目录残留不影响逻辑正确性，下次清理或手动删即可）。

```typescript
async function rmDirWithRetry(target: string): Promise<void> {
  const RETRYABLE = new Set(['EBUSY', 'EPERM', 'ENOTEMPTY'])
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await fsp.rm(target, { recursive: true, force: true })
      return
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? ''
      if (!RETRYABLE.has(code) || attempt === 3) throw err
      await new Promise((r) => setTimeout(r, 100 * Math.pow(3, attempt - 1)))
    }
  }
}
```

---

## 递归扫描的 symlink/junction 防护

`fs-service.ts` 的 `scanWorkspaceUsage` 用栈递归遍历 workspace 算大小 / 文件数（fs_write 配额）。

- POSIX 上 `ln -s` symlink 可能引入循环
- Windows 上 `mklink /J` junction 与 `mklink /D` 目录 symlink 都是 reparse point，同样会循环

实现：访问每个目录前 `realpathSync(dir)`，记录到 `Set<string>`，重复 realpath 直接跳过。

**Why 不在 fs_read/fs_write 工具层做**：那两个是单文件操作，没有递归；`scanWorkspaceUsage` 是唯一的递归路径。

---

## 故意不做的事

| 项目 | 不做的理由 |
|---|---|
| **iconv-lite 编码 fallback** | PowerShell `[Console]::OutputEncoding = UTF8` 已覆盖实测场景；引入新依赖按 CLAUDE.md §6.2 要先讨论。等到真有 native exe 输出无视 PS encoding 的命令再加 |
| **Long path（>260）`\\?\` 前缀注入** | Win10 1607+ 默认支持长路径（需要 group policy + manifest），Node 24 内部已处理；实测踩坑再加 |
| **`SIGTERM → SIGKILL` 升级（POSIX）** | 现状 30s 超时直接 SIGTERM，未升级 SIGKILL。Phase 1 验证下来没有「kill 不掉」的命令；遇到再补 |

---

## 验证清单（Phase 1 + Phase 2 + Phase 3 合并前）

**Phase 1**：
- [ ] macOS：现有 bash 工具调用行为不变（回归 `ls`、`git status`、`npm test`）
- [ ] Windows：新建 sandbox 会话，bash 工具能跑 `Get-ChildItem`、`git --version`、`echo 中文`（输出非乱码）
- [ ] Windows：bash 工具拒绝 `Remove-Item -Recurse -Force C:\`、`format C:`、`iex (iwr ...)`
- [ ] Windows：bash 工具 30s 超时后用 `taskkill /F /T` 清进程树，无孤儿 `node.exe`
- [ ] Windows：Claude Code agent 启动正常（SDK 找到 `~/.claude` 即 `%USERPROFILE%\.claude`）

**Phase 2**：
- [ ] Windows：DirPicker 看不到 `AppData`、`$Recycle.Bin`、`System Volume Information` 等隐藏目录
- [ ] Windows：尝试绑定 `D:\Windows` 被拒（系统根）
- [ ] Windows：尝试绑定 `C:\Users\me\.ssh` 被拒（敏感子路径）
- [ ] Windows：绑定 `D:\projects\xxx` 成功，bash 工具能在该目录运行
- [ ] Windows：输入框 placeholder 显示 `D:\projects\foo` 而非 `/Users/me/projects/foo`
- [ ] Windows：路径大小写不敏感（`C:\Users\Foo` 与 `c:\users\foo` 互通）
- [ ] Windows：boundPath 输入 `/tmp` 被拒（POSIX 风格在 Windows 上无意义）

**Phase 3**：
- [ ] Windows：删除一个文件被 dev server 占用的会话，workspace 删除会重试 3 次后才放弃
- [ ] Windows：在 workspace 内 `mklink /J loop .` 创建 junction 循环，`scanWorkspaceUsage` 不死循环
- [ ] POSIX：在 workspace 内 `ln -s . loop` 创建 symlink 循环，`scanWorkspaceUsage` 不死循环

---

## 与其他 spec 的关系

- Spec 07（工具系统）：bash 工具的 `description` 与黑名单引用本 spec
- CLAUDE.md §5.2：黑名单原文从单平台改为双平台，详见本 spec 「命令黑名单」节
- Spec 05（adapter）：Claude Code adapter 的 `canUseTool` 黑名单走 `getBannedPatterns(currentPlatform())`
