# 参与贡献

感谢你愿意花时间在这个项目上。这里写的是**能让你少踩坑**的那部分，不是客套话。

> English version at the bottom.

## 先读三件事

1. **这是个本地优先、单租户的应用。** 数据落在使用者自己机器上的一个 SQLite 文件里，没有账号体系。任何「多人共用一个实例」「给访客开网页账号」类的改动都与这个前提冲突，提之前请先开 issue 讨论。
2. **许可与出处。** 本项目是 [bitdance-agenthub](https://github.com/lizyoko9/bitdance-agenthub)（AGPL-3.0）的修改版本，许可与出处声明写在 `LICENSE` 与 `NOTICE.md`，**不要删除或改动**，我们只在 `NOTICE.md` 里主张自己新增部分（Multi-Agent TeamFlow 相关改动）的版权。
3. **改之前先开个 issue。** 尤其是涉及派单逻辑、数据模型、门禁的改动 —— 这些地方改起来牵一发动全身。

## 环境

| 项 | 要求 | 说明 |
| --- | --- | --- |
| Node | **24** | ❗ 不是建议，是必须。`better-sqlite3` 是原生模块，Node 22 下 ABI 不匹配，症状是 `ERR_DLOPEN_FAILED` / `NODE_MODULE_VERSION 137 vs 127`，看着像代码错其实只是 ABI。 |
| 包管理器 | pnpm（`package.json` 的 `packageManager` 已锁） | pnpm 10+ 默认拦掉原生模块的 postinstall，`pnpm-workspace.yaml` 的 `allowBuilds` 已放行 `better-sqlite3` / `electron` / `node-pty` 等，别删。 |
| 平台 | Windows / macOS / Linux 均可 | Electron 桌面端目前只出 Windows 安装包。 |

```bash
pnpm install
pnpm dev          # 网页端开发服务器
pnpm electron:dev # 桌面端开发（Next + Electron 主进程 tsc + 窗口，一起起）
```

## 提交前必跑

```bash
pnpm typecheck                                  # Next 侧类型
pnpm exec tsc -p electron/tsconfig.json --noEmit  # Electron 主进程类型（改了 electron/ 才需要）
pnpm lint
pnpm test
pnpm build                                      # 改动涉及页面/路由时必跑
```

❗ `electron/` 被根 `tsconfig.json` **排除在外**，所以 `pnpm typecheck` 全绿也保证不了桌面端能编出来。改了 `electron/` 下任何文件，请单独跑上面第二行。

## 容易踩的坑（按被踩次数排序）

- **改 UI 必须同时看亮色和深色主题**，包括 hover / 选中态。只加 `hover:bg-slate-100` 不加 `dark:` 变体，深色模式下就会变成「白底白字」。
- **公开页不能指向受保护路径。** `/home` 是免鉴权的访客面，而 `/`、`/api/*` 在 Basic 认证之后。访客面上任何指向后者的链接或预取请求都会让浏览器弹出**原生登录框** —— 那是模态窗口，会把整页鼠标/键盘/滚轮事件全部吞掉，表现为「页面什么都点不动」，而控制台零报错。
- **新增 `app_settings` 字段要一次改齐 6 处**：`schema.ts`、`bootstrap.ts`（DDL **和** `safeAlter`）、`api/settings/route.ts` 的 zod（会静默丢掉未声明的键）、`settings-service.ts`（`EMPTY` / `AppSettingsPatch` / `onConflictDoUpdate.set`）、`normalize()` 的类型分支（数字和布尔必须显式放行）、`SECRET_SETTING_KEYS`。漏任何一处都**不报错、只是不生效**。
- **从配置推导出来的对外地址必须在运行时求值。** 页面若被构建期预渲染成静态 HTML，那个值会被固化成「构建身份」看到的结果（通常是空）。
- **改完样式别只信 dev server。** 本机 dev 的 Turbopack 有 CSS 缓存问题，改 `globals.css` 后可能持续供出旧 chunk；要验样式就用 `pnpm build` + `pnpm start`。
- **判「是不是我改坏的」用干净树对照**：`git stash push -u` 后跑同一条用例，结果一样就不是你的锅。整套单测并发跑时 `disk I/O error` / 5000ms 超时多为 SQLite WAL 争用抖动，单独重跑能过就不算回归。

## 提交与分支

- 一个主题一个 commit，中文 message 即可，写清「为什么」而不是「改了什么」。
- 默认分支 `master`。从 `master` 切分支 → 提 PR。
- ❗ **绝对不要提交**：`.env*`、任何 API Key / OSS 密钥、`*.db` 数据库文件、`.agenthub-data/`、`release/` 下的安装包。历史上有过凭据明文进仓库的事故，清理代价很大。

## English

Thanks for your interest. The short version:

- **Node 24 is mandatory** — `better-sqlite3` is a native module and will fail with `ERR_DLOPEN_FAILED` on Node 22.
- Use **pnpm** (pinned via `packageManager`).
- Before opening a PR: `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build` if you touched pages/routes. If you changed anything under `electron/`, also run `pnpm exec tsc -p electron/tsconfig.json --noEmit` — that directory is excluded from the root tsconfig.
- This project is a **local-first, single-tenant** app. There is no account system and no multi-user sharing by design.
- It is a modified version of [bitdance-agenthub](https://github.com/lizyoko9/bitdance-agenthub) (AGPL-3.0). Do not remove `LICENSE` or `NOTICE.md`.
- Never commit secrets, `.env*` files, databases, or installer binaries.

Questions? Open an issue.
