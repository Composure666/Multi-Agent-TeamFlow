# Multi-Agent TeamFlow

<p align="center">
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white">
  <img alt="React" src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=0B1F2A">
  <img alt="Electron" src="https://img.shields.io/badge/Electron-33-47848F?logo=electron&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white">
  <img alt="SQLite" src="https://img.shields.io/badge/SQLite-local--first-044A64?logo=sqlite&logoColor=white">
  <img alt="pnpm" src="https://img.shields.io/badge/pnpm-workspace-F69220?logo=pnpm&logoColor=white">
  <img alt="License" src="https://img.shields.io/badge/License-AGPL--3.0--only-blue">
</p>

<p align="center">
  <a href="./README.md">English</a> · <b>简体中文</b>
</p>

## 一句话定位

> **本地优先的多 Agent 协作工作空间 —— 你给出一句话目标，它交回一件可交付的产物。**

你不必为每个任务单开一个提示词窗口。这里有一个「调度 Agent」负责把目标拆成子任务、派发给不同专长的 Agent，再把它们的交付物收拢成一等公民对象 —— 可预览、可留存、可复用。所有东西（会话、Agent、产物、审批记录、工作区文件、SQLite 数据库）都在你自己的机器上：**无需注册账号，也不经过任何云端中转**。

> **当前版本：v0.2.0-rc.1** —— 版本号与变更明细见 [`VERSION`](./VERSION) 与 [`CHANGELOG.md`](./CHANGELOG.md)。

---

## 核心特性

- **Orchestrator 驱动派单。** 内置 `Orchestrator` 读懂目标后，先判断这件事是否真的需要多个角色，再用 `plan_tasks` 拆分与派发；简单问题直接回答，提示词里明确要求**不要过度派单**。
- **群聊式多 Agent 会话。** 一个会话可放任意多个 Agent：`@` 精确点名，或交给 Orchestrator 自动路由。
- **产物是一等公民。** `web_app` · `document` · `image` · `ppt` · `diagram` · `code_file` · `diff` · `project` 都能就地预览与导出，并记录生成它的 prompt、模型与参数，结果可复现。
- **产物依赖链。** 典型链路 `PRD → 设计规范 → web_app → 评审`；下游 Agent 直接读上游产物，而不是从自然语言里重新猜上下文。
- **内置 5 个 Agent，也可无限自建。** Orchestrator · PM 小灰 · UI 设计师 · 前端工程师 · Reviewer（均走 `claude-code`），另有构建器可自定义适配器、模型、工具与提示词。
- **真实终端 + 审批。** `bash` 是 `node-pty` 真实终端，外面套命令黑名单、出网守卫与**执行前审批**；在你批准之前，什么都不会真的执行。
- **可插拔适配器。** `claude-code` · `codex` · `custom-agent`（任何 OpenAI 兼容端点）· `image-gen` · `mock`。
- **三种客户端，同一份数据。** Web（Next.js App Router）、桌面端（Electron 33 薄壳）、移动伴随端（Capacitor，经设备 token 鉴权）。

---

## 图文预览

### 界面截图

<p align="center">
  <img src="docs/images/teamflow-preview.png" alt="Multi-Agent TeamFlow 工作台界面截图：左侧为工作区导航与对话历史，右侧为新建任务入口与多 Agent 协作会话区" width="100%" />
</p>

> 图片加载失败？该截图是仓库内的静态资源，可直接打开 [`docs/images/teamflow-preview.png`](./docs/images/teamflow-preview.png) 查看；也可以下载桌面端体验真实界面。

### 架构与流程

<p align="center">
  <img src="docs/images/architecture.svg" alt="Multi-Agent TeamFlow 架构流程图：你的目标交给 Orchestrator 判断与派单，再分发给 PM 小灰、UI 设计师、前端工程师与 Reviewer 四个专长 Agent，各自产出带类型的产物后统一收进产物库，可预览、可导出、可发布为可分享 URL" width="100%" />
</p>

> 图片加载失败？架构图是仓库内的 SVG 静态资源，可直接打开 [`docs/images/architecture.svg`](./docs/images/architecture.svg) 查看。主干是：**目标 → Orchestrator 派单 → 专长 Agent 产出带类型产物 → 收进产物库**；全程在本机完成，文件操作受路径守卫约束，高风险命令需你批准。

---

## 快速开始

```bash
# 1. 克隆
git clone https://github.com/Composure666/Multi-Agent-TeamFlow.git multi-agent-teamflow
cd multi-agent-teamflow

# 2. 安装依赖（packageManager 已固定 pnpm@11.9.0，Corepack 自动取到正确版本）
pnpm install

# 3. 生成本机环境变量文件，至少填入一个 provider 的 API key（该文件绝不提交）
cp .env.example .env.local

# 4. 启动
pnpm dev
```

打开 <http://localhost:3000>。首次启动会自动在 `.agenthub-data/` 下创建 SQLite 数据库并 seed 5 个内置 Agent，无需手动执行迁移。

桌面端与移动伴随端：

```bash
pnpm electron:dev     # 桌面端开发（Next dev server + Electron 窗口）
pnpm electron:build   # 打包安装包 → release/
pnpm mobile:sync      # 构建 Web 资源并拷贝进原生工程
pnpm mobile:open:ios  # 或 mobile:open:android
```

> 想先看界面再决定？项目主页（`/home`）本身就是对外访客面，本地启动后访问 `http://localhost:3000/home` 即可看到截图、架构图与完整介绍。

---

## 常见问题（FAQ）

**Q：需要注册账号吗？数据会上传到云端吗？**
A：都不需要。它是本地优先（local-first）的单租户应用，没有「账户」这个概念；会话、产物、审批记录与 SQLite 数据库全部落在本机，不经过任何云端中转。

**Q：必须自己准备模型 API Key 吗？支持哪些 provider？**
A：是的，模型 Key 由你自带（填在 `.env.local` 或界面「设置 → 供应商」里，API 返回时脱敏）。支持 DeepSeek、Anthropic Claude、OpenAI 及任何 OpenAI 兼容端点、火山方舟等；provider 报错时会沿配置好的优先级降级尝试，而不是在第一个错误上失败。

**Q：和普通「一个 Chat 窗口」有什么区别？**
A：普通窗口里你要自己拆任务、自己传话。这里由 `Orchestrator` 判断是否真的需要多角色、写清责任 Agent 与预期产物并派单；下游 Agent 直接读上游产物，不必从对话里重猜上下文。

**Q：Orchestrator 会把简单问题也拆成一大堆任务吗？**
A：不会。它的提示词里明确要求先判断「这件事是否真的需要多个角色」，不需要时直接回答 —— 刻意避免过度派单。

**Q：Agent 真的能执行命令、写文件吗？安全吗？**
A：能，`bash` 是 `node-pty` 真实终端。但有四道约束：命令黑名单、出网守卫（拦截云元数据端点、内网网段与平台自身回环端口）、工作区路径守卫（解析符号链接后拒绝越界路径）、以及**高风险操作执行前的审批提示** —— 你不批准，什么都不会真的执行。

**Q：产物是什么？能导出或分享吗？**
A：产物不是聊天里的一段文字，而是产物库里带类型、可预览、可导出的记录（web_app / document / image / ppt / diagram / code_file / diff / project），并记录生成它的 prompt、模型与参数。单个产物或整个工作区都可以发布为可分享的 URL。

**Q：桌面端、Web、移动端的数据是同一份吗？**
A：桌面端与 Web 是同一个应用、只换外壳，数据落点由「谁跑 Node 进程」决定，库是同一个单文件 SQLite。移动端是 Capacitor 伴随应用，通过局域网或 Tailscale 连接，由设备 token 鉴权。

**Q：许可协议是什么？商用有什么义务？**
A：AGPL-3.0-only。若你通过网络向他人提供本软件的服务，依据 AGPL-3.0 第 13 条需提供对应源码；本项目同时是上游 `lizyoko9/bitdance-agenthub` 的衍生作品，出处与改动清单见 [`NOTICE.md`](./NOTICE.md)。

---

## 深入了解

### 技术栈

| 层次 | 选型 |
|---|---|
| 框架 | Next.js 16（App Router） |
| UI | React 19、Tailwind CSS v4、shadcn/ui |
| 状态 | Zustand + Immer |
| 数据库 | SQLite via Drizzle ORM + better-sqlite3 |
| 实时推送 | Server-Sent Events（SSE） |
| 桌面端 | Electron 33 |
| 移动端 | Capacitor |
| 语言 | TypeScript（strict） |
| 仓库形态 | pnpm workspaces |

### 环境要求

- **Node.js 20+**（测试套件实测跑在 Node 24 上）
- **pnpm** —— `packageManager` 字段已固定为 `pnpm@11.9.0`，Corepack 会自动取到正确版本
- **Git**
- 桌面端开发与打包需要 macOS 或 Windows
- 仅当你要开发 iOS 伴随端时才需要 Xcode + CocoaPods

### 环境变量

所有配置都放在 `.env.local`（绝不提交）。从 [`.env.example`](./.env.example) 复制。

**Provider API key** —— 至少填一个：

| 变量 | 说明 |
|---|---|
| `DEEPSEEK_API_KEY` | 默认配置下的主 provider |
| `ANTHROPIC_API_KEY` | Claude 系列模型 |
| `OPENAI_API_KEY` | OpenAI 及 OpenAI 兼容端点 |
| `ARK_API_KEY` | 火山方舟（使用豆包多模态模型时必需） |
| `ANTHROPIC_BASE_URL` | 可选；覆盖 Anthropic 端点（例如指向网关） |

**可选：**

| 变量 | 说明 |
|---|---|
| `OSS_BUCKET` / `OSS_ENDPOINT` / `OSS_ACCESS_KEY_ID` / `OSS_ACCESS_KEY_SECRET` | 阿里云 OSS，用于图片产物的持久化存储。**四个必须同时设置**，否则图片回落到本地存储（容器重建后就丢了）。 |
| `PROMPT_OPTIMIZE_MODEL` | `deepseek-v4-flash` 或 `deepseek-v4-pro` |
| `PROMPT_OPTIMIZE_{ANTHROPIC,OPENAI,ARK}_MODEL` | 按 provider 覆盖 |
| `GITHUB_TOKEN` / `GH_TOKEN` | 提高 GitHub 工具搜索的速率上限 |
| `NEXT_TELEMETRY_DISABLED` | CI 中设为 `1` |
| `AGENTHUB_DATA_DIR` | 数据库与工作区的存放位置。容器化部署必须设置 —— 默认值是当前工作目录。 |
| `AGENTHUB_MOBILE_TOKEN` | 移动伴随端的设备 token |

**运行时自动管理 —— 不要手工设置：** `PORT`、`AGENTHUB_DEV`、`AGENTHUB_COMPANION_MODE`、`AGENTHUB_MOBILE_ALLOWED_ORIGINS`、`AGENTHUB_INTERNAL_BASE_URL`、`AGENTHUB_ALLOWED_TOOLS`、`ELECTRON_RUN_AS_NODE`、`CODEX_API_KEY`、`MCP_SERVICE_TEST_TOKEN`。

> 大部分设置也可以在界面里改（**设置 → 供应商**）。provider key 存在本地数据库里，API 返回时会**脱敏**，且只有在你真的改动了该字段时才会被写回。

**已废弃：** `ORCHESTRATOR_PROVIDER` / `ORCHESTRATOR_MODEL_ID` 已不再被任何代码读取。Orchestrator 的模型取自它自己的 Agent 记录。

### 必须排除在 Git 之外的文件

- `.env.local` 及其他 `.env*` 文件（`.gitignore` 已覆盖）
- `*.pem`、`*.key`、`id_rsa*`、`.netrc`、各类凭据 JSON
- `.agenthub-data/` —— SQLite 数据库与本地工作区
- `release/`、`dist-electron/`、`.next/`

### 共享配置（这些**应该**纳入 Git）

`package.json` · `next.config.ts` · `drizzle.config.ts` · `eslint.config.mjs` · `vitest.config.ts` · `playwright.config.ts` · `src/db/schema.ts` · `src/db/builtin-agents.ts` · `.env.example`

`src/db/builtin-agents.ts` 是默认 Agent 的唯一真源：名称、描述、system prompt、工具、能力都从这里 seed，开发期的 `pnpm db:seed` 和打包后应用的首次启动引导都会消费它。

### Agent 可用工具

`bash` · `fs_list` · `fs_read` · `fs_write` · `read_artifact` · `write_artifact` · `read_attachment` · `plan_tasks` · `ask_user` · `web_fetch` · `deploy_artifact` · `deploy_workspace` · `failing_result`

新增适配器有文档化流程 —— 见 [`skills/add-adapter.md`](./skills/add-adapter.md)。

### 常用命令

```bash
# 开发
pnpm dev                  # Next.js 开发服务
pnpm electron:dev         # 桌面端开发（同时会起 Next dev server）
pnpm mobile:dev           # 移动伴随端开发

# 质量
pnpm lint                 # ESLint
pnpm typecheck            # tsc --noEmit
pnpm test                 # vitest
pnpm test:watch           # vitest watch 模式
pnpm e2e                  # Playwright
pnpm e2e:ui               # Playwright UI 模式

# 构建与打包
pnpm build                # 生产构建
pnpm start                # 运行生产构建
pnpm electron:build       # 打包桌面安装包 → release/
pnpm mobile:build         # 构建移动端 Web 资源

# 数据库
pnpm db:generate          # 生成 Drizzle 迁移
pnpm db:push              # 把 schema 推到 SQLite
pnpm db:seed              # seed 内置 Agent
pnpm db:studio            # Drizzle Studio
```

> **关于跑测试：** 请使用 ABI 与已安装的 `better-sqlite3` 二进制匹配的 Node 版本。如果遇到 `NODE_MODULE_VERSION` 不匹配的报错，执行 `pnpm sqlite:ensure:node`（`pnpm test` 本身已经会做这件事）或 `pnpm electron:rebuild`。

### 目录结构

```
src/
  app/            Next.js 路由与 API 端点
  components/     UI 组件与工作台页面
  server/         服务层、适配器、工具、沙箱与网络守卫
    adapters/     claude-code · codex · custom-agent · image-gen · mock
    tools/        bash、fs_*、artifact、plan_tasks、web_fetch、deploy_*
  db/             SQLite schema、引导/迁移、内置 Agent seed
  lib/            客户端辅助函数与 API 绑定
  shared/         客户端与服务端共享的类型与常量
  stores/         Zustand store
  types/          环境类型声明

electron/         Electron 主进程、preload、伴随端代理
apps/mobile/      Capacitor 伴随应用（iOS / Android）
skills/           Skill 能力包 + 写作指南（新增工具、适配器等）
specs/            带编号的技术规格
openspec/         能力契约与变更提案
docs/             部署与环境变量文档
deploy/           自托管脚本、nginx 配置、运维手册
e2e/              Playwright 端到端测试
public/           静态资源
```

### 参与贡献

> 完整规范见 [`CONTRIBUTING.md`](./CONTRIBUTING.md)（含环境硬约束与「必踩坑」清单）；安全相关问题见 [`SECURITY.md`](./SECURITY.md)。

1. 先开分支再改动，每个分支只聚焦一件事。
2. 行为变化时同步更新对应 spec 或文档。
3. 开 PR 前跑 `pnpm typecheck`、`pnpm lint`、`pnpm test`。
4. **绝不提交 `.env.local`、API key 或数据库文件。** 新增非密钥类配置时，请同时写进 `.env.example` 和本文档。
5. 不要在测试、注释或文档里硬编码真实的资源标识（bucket 名、主机名、IP）—— 请使用 `test-bucket`、`oss-cn-hangzhou.aliyuncs.com` 这类一眼可辨的占位符。

### 文档索引

| 文件 | 内容 |
|---|---|
| [`INSTALL.md`](./INSTALL.md) | 分步安装指南 |
| [`OVERVIEW.md`](./OVERVIEW.md) | 代码地图与实现状态 |
| [`CLAUDE.md`](./CLAUDE.md) | AI 协作场景下的项目约定 |
| [`docs/deployment-env.md`](./docs/deployment-env.md) | 环境变量参考 |
| [`deploy/RUNBOOK.md`](./deploy/RUNBOOK.md) | 自托管运维手册 |
| [`specs/`](./specs/) | 带编号的技术规格 |
| [`openspec/`](./openspec/) | 能力契约 |
| [`CHANGELOG.md`](./CHANGELOG.md) | 版本变更记录 |
| [`NOTICE.md`](./NOTICE.md) | 许可与出处声明 |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | 贡献指南（环境约束与已知坑） |
| [`SECURITY.md`](./SECURITY.md) | 安全策略与自托管风险提示 |

---

## 开源协议与出处

Copyright (C) 2026 Multi-Agent TeamFlow contributors.

本程序是自由软件：你可以依据自由软件基金会发布的 **GNU Affero General Public License v3.0**（`AGPL-3.0-only`）条款重新分发和/或修改它。许可证全文见 [`LICENSE`](./LICENSE)。

本项目是开源项目 [`lizyoko9/bitdance-agenthub`](https://github.com/lizyoko9/bitdance-agenthub)（同样以 AGPL-3.0 授权）的**衍生作品（修改版本）**。依据 AGPL-3.0 第 5 条，组合作品必须整体继续保持 AGPL-3.0 授权 —— 不能改用更宽松的条款或闭源再授权。

上游版权声明、修改声明与逐项改动清单记录在 [`NOTICE.md`](./NOTICE.md)。

**AGPL-3.0 第 13 条：** 若你通过网络与本软件交互，你有权获得它的对应源码（Corresponding Source）。获取方式见 [`NOTICE.md`](./NOTICE.md)。

本程序的发布是希望它能有用，但**不提供任何担保**；甚至不提供适销性或特定用途适用性的默示担保。
