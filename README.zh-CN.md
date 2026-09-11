# AgentHub

<p align="center">
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white">
  <img alt="React" src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=0B1F2A">
  <img alt="Electron" src="https://img.shields.io/badge/Electron-33-47848F?logo=electron&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white">
  <img alt="SQLite" src="https://img.shields.io/badge/SQLite-local--first-044A64?logo=sqlite&logoColor=white">
  <img alt="pnpm" src="https://img.shields.io/badge/pnpm-workspace-F69220?logo=pnpm&logoColor=white">
</p>

<p align="center">
  <a href="./README.md">English</a> · <b>简体中文</b>
</p>

AgentHub 是一个本地优先的多 Agent 协作工作空间，把 AI 协作做成类似 IM 群聊的体验。

它把会话、Agent、产物、审批和工作目录放在同一个界面里。你可以让不同 Agent 分工处理任务，也可以在同一个工作空间里查看文件改动、命令输出和产物预览。

<p align="center">
  <img src="docs/images/agenthub-preview.png" alt="AgentHub 多 Agent 协作与产物预览" width="100%" />
</p>

## 核心功能

- 单 Agent 与群聊式多 Agent 会话
- Orchestrator 自动拆解任务、派发子任务并聚合结果
- 多 Provider LLM 接入：内置 Anthropic / OpenAI / DeepSeek / 火山方舟，也支持自定义 OpenAI 兼容端点；按能力分配模型，失败自动故障转移
- 结构化消息渲染：文本、思考、工具调用、附件、产物引用分别展示
- 产物预览：文档、图片、网页、幻灯片、diff、代码文件
- Workspace 沙箱与本地目录绑定
- 文件写入和高风险命令审批
- Electron 桌面端
- Capacitor 移动伴随端脚手架

## 技术栈

- Next.js 16 App Router
- React 19
- TypeScript strict 模式
- Tailwind CSS v4 + shadcn/ui
- Zustand + Immer
- SQLite + Drizzle + better-sqlite3
- SSE 实时事件流
- Electron 33
- Capacitor
- pnpm workspaces

## 环境要求

- Node.js 20+
- pnpm
- Git
- 如需桌面端开发或打包，需要 macOS 或 Windows
- 如需开发 iOS 伴随端，需要 Xcode 和 CocoaPods

## 快速开始

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

打开：

```text
http://localhost:3000
```

首次启动时，应用会自动创建 SQLite 数据库，并初始化内置 Agent。

## 配置说明

### 应纳入 Git 的公共配置

这些文件定义团队共享的项目行为，应保留在版本管理中：

- `package.json`
- `next.config.ts`
- `drizzle.config.ts`
- `eslint.config.mjs`
- `vitest.config.ts`
- `playwright.config.ts`
- `src/db/builtin-agents.ts`
- `src/db/schema.ts`
- `.env.example`

Agent 库的默认配置在 `src/db/builtin-agents.ts`。内置 Agent 的名称、描述、system prompt、工具、Skills、MCP 绑定都从这里 seed。

### 不应提交的本地私密配置

这些内容只属于本机环境，不要提交：

- `.env.local`
- `.agenthub-data/` 下的 SQLite 数据库和 workspace 文件
- 含 API key、token、个人凭证的应用设置
- 本地构建产物和测试输出

常见私密值：

- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `DEEPSEEK_API_KEY`
- `ARK_API_KEY`
- `ANTHROPIC_BASE_URL`
- `AGENTHUB_MOBILE_TOKEN`

如果要新增团队共享配置，请先确认它不含密钥，再写入 `.env.example` 或项目配置文件。

## API key 优先级

Agent 运行时按以下顺序读取 key：

1. `agents.apiKey`
2. `app_settings.<provider>_api_key`
3. `process.env.<PROVIDER>_API_KEY`

Agent 专属 key 优先级最高。缺失 key 时，不会阻止应用启动；只有真正调用对应 provider 时才会报错。

## LLM Provider 管理

AgentHub 在现有 `app_settings` Key 之上引入 Provider 层，统一管理模型接入。

- **供应商接入**：内置 Anthropic、OpenAI、DeepSeek、火山方舟（Ark），也可接入任意 OpenAI 兼容端点。每个供应商保存 Base URL、可用模型和连接状态，并支持一键测试连通性。
- **模型分配**：决定「哪个能力用哪个供应商的哪个模型」，分三层——全局默认、系统能力（提示词增强 / 任务规划 / 上下文摘要 / 系统对话）、Agent 专属。每个能力可维护一条按优先级排序的供应商列表。
- **故障转移**：当供应商返回可重试错误（额度不足 / 鉴权失败 / 限流 / 5xx / 超时）时，按优先级自动切换到下一个供应商。重试次数、冷却时间、触发条件均可配置，每次切换都会记录事件。
- **应用内管理**：在「设置 → Provider / 模型分配 / 故障转移」中配置。

旧版 `app_settings` 中的 provider Key 会在首次启动时自动迁移到 `llm_providers` 表（幂等，已存在的供应商不覆盖）。

相关 API：`/api/providers`、`/api/model-assignments`、`/api/provider-priority`、`/api/failover-config`、`/api/failover-events`。

## 运行方式

### Web 开发模式

```bash
pnpm dev
```

### Electron 桌面端开发模式

```bash
pnpm electron:dev
```

### 生产构建与启动

```bash
pnpm build
pnpm start
```

### 桌面端打包

```bash
pnpm electron:build
```

打包产物输出到 `release/`。

## 常用命令

```bash
pnpm dev                 # 启动 Web 开发服务
pnpm build               # 构建生产版本
pnpm start               # 启动生产服务
pnpm typecheck           # TypeScript 类型检查
pnpm lint                # ESLint 检查
pnpm test                # 运行单元测试
pnpm e2e                 # 运行 Playwright E2E 测试
pnpm db:push             # 应用 Drizzle schema
pnpm db:seed             # 重新初始化内置 Agent
pnpm electron:dev        # Electron 开发模式
pnpm electron:build      # Electron 打包
pnpm mobile:dev          # 移动伴随端开发服务
pnpm mobile:build        # 构建移动伴随端
```

## 目录结构

- `src/app/`：Next.js 页面和 API 路由
- `src/components/`：UI 组件和工作台页面
- `src/server/`：应用服务、Agent 适配器、工具执行逻辑
- `src/db/`：SQLite schema、seed 数据和启动初始化
- `src/shared/`：跨层共享类型和常量
- `apps/mobile/`：移动伴随端
- `electron/`：Electron 主进程和启动代码
- `specs/`、`openspec/`：项目规格与能力契约

## 贡献方式

1. 新建分支再改动。
2. 每次改动尽量只解决一个问题。
3. 行为、实体字段或事件协议变化时，同步更新对应文档或 spec。
4. 提交前运行 `pnpm typecheck` 和 `pnpm lint`。
5. 不要提交 `.env.local`、API key、token、本地数据库或 workspace 数据。

## 更多文档

- `INSTALL.md`：安装与启动指南
- `OVERVIEW.md`：项目全貌和代码地图
- `CLAUDE.md`：项目规则与 AI 协作约定
- `docs/AI-COLLABORATION.md`：协作记录与方法
- `specs/`：编号版详细规格
