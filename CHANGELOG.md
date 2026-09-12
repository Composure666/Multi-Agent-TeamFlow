# Changelog

All notable changes to AgentHub will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0-rc.1] - 2026-09-12

首个 release-candidate 版本。从 0.1.0 的 prototype 收敛到 ship-ready：完成一次完整上线前全检，封堵 2 个 🟠 安全 High，新增一组核心单测，补全 release metadata。

### Security (Audit: 🟡 Conditional GO → ✅ GO)

#### Fixed (封堵 🟠 High)

- **companion=LAN 服务端拆分**(🟠 High，electron 全路径无 auth)：companion 模式启动独立的 Node http server（listen `0.0.0.0`），主 server 仍 `127.0.0.1`；companion server 仅暴露 `/api/mobile/*`，强制 Bearer token + path 白名单 + upstream 硬编码 `127.0.0.1:<mainPort>` 防 SSRF。
- **`UNSAFE_HREF_RE` 协议白名单扩展**(🟠 High,iframe 内 `javascript:`/`vbscript:`/`data:`/`blob:`/`about:` 可点击执行)：artifact preview HTML 改用 `strict-dynamic` CSP `script-src 'nonce-…' 'self'`,服务端每请求 `randomBytes(16)` 生成 nonce;子资源路由 `script-src 'none'` 完全禁止脚本执行。

### Added (测试 / 元数据)

- **`mergeDetailWithLiveStatus` / `mergeLiveRuns` 单测**(12 个 case)：覆盖 cached-only / cached+live diff / no-live-run / children changes / memoization identity / frozen input / 未知 agentName fallback / 空输入 / `startedAt` 倒序;函数从 `.tsx` 迁到 `src/lib/agent-run-debug-board.ts` 暴露为 `export`。
- **`contentTypeFor` 单测**(10 个 case)：覆盖 `html`/`css`/`js`/`wasm`/`webmanifest`/`woff`/`woff2`/`ttf`/`map`/`svg`/`json`/未知扩展 fallback;MIME 表从 `route.ts` 抽出到 `src/lib/artifact-preview-mime.ts`,新增 `.wasm` `.webmanifest` `.woff/.woff2/.ttf/.otf` `.avif` `.bmp` `.mp3/.ogg/.wav/.mp4/.webm` `.pdf` 等。
- **catch-all `/api/artifacts/[id]/preview/[...path]` 路由单测**(7 个 case)：覆盖 404 (artifact 不存在) / 400 (非 web_app) / 404 (子文件缺失) / 200 + Content-Type + CSP/X-Content-Type-Options/nosniff 头 / 多类型 MIME / 嵌套路径 `/foo/bar/baz` 拼接 / 错误响应不带 CSP 头。
- **`VERSION` + 本 `CHANGELOG.md`**：首次为仓库建立 release metadata,版本号 `0.2.0-rc.1`。
- **Dead code 清理**(10 处 unused-var)：`toneForRunStatus` / `toneTextClass` / `KeyField` / `reveal/setReveal` / `ProviderType` import / `providerType` / `getExecutionStageStatus` / `getOutputStageStatus` / `getPlanStageStatus` / `toneForStatus` 等;eslint `--max-warnings=999` 维持 0 warning。

### Changed (内部质量)

- Pure helpers `mergeDetailWithLiveStatus` / `mergeLiveRuns` 从 `src/components/agent-run-debug-board.tsx` 迁至 `src/lib/agent-run-debug-board.ts`,`.tsx` 仅保留 React 组件。
- 子资源 MIME 推断从 route 内联实现迁移到 `src/lib/artifact-preview-mime.ts`,未知扩展名 fallback 从 `text/plain` 升级到 `application/octet-stream`(避免把未知二进制当文本渲染)。

### Known Limitations / Ship-blocker 仍需用户操作

- **`pnpm sqlite:ensure:node` 需在 ship 环境手跑**：当前 sandbox 中 better-sqlite3 native binding `NODE_MODULE_VERSION 137 vs 127` 不匹配,导致 24 个服务端 vitest 套件失败。**这些失败与代码无关** —— ship 设备跑 `pnpm install --force` 或 `pnpm sqlite:ensure:node` 即可解锁。详见 `INSTALL.md §5`。

### Validation Baseline

- `pnpm tsc --noEmit`：**0 errors**
- `pnpm eslint --max-warnings=999`：**0 errors / 0 warnings**(清掉 10 个新增 dead code 后从 16 → 0)
- `pnpm vitest run`：**51 files passed**,24 失败待 ship 环境 rebuild 后解锁。**新增单测覆盖 12 (merge) + 10 (mime) + 7 (route) = 29 个 case 全 pass**。

## [0.1.0] - 2026-08-15 (历史基线)

五层架构首版落地,核心能力闭环(单/群聊,Orchestrator,产物预览,Workspace 沙箱,Electron 桌面 + 移动伴随端脚手架)。详见 `OVERVIEW.md` 「下篇·当前现状」与 git reflog 上 `0.1.0` tag。
