# Multi-Agent TeamFlow 安装与启动指南

本文档说明如何从源码安装并启动 Multi-Agent TeamFlow。适用于本地 Web 开发模式和 Electron 桌面端开发、调试与打包。

## 1. 项目概述

Multi-Agent TeamFlow 是一个 local-first 的多 Agent 协作工作空间。它把会话、Agent、产物、审批和工作目录放在同一个界面里，方便你直接在本机完成真实工作，而不是在多个工具之间来回切换。

## 2. 环境要求

请先准备以下环境：

- Node.js 20 或更高版本
- pnpm
- Git

可选环境：

- macOS 或 Windows：用于 Electron 桌面端开发和打包
- Xcode 与 CocoaPods：仅在开发 iOS 移动伴随端时需要

检查版本：

```bash
node -v
pnpm -v
git --version
```

## 3. 获取项目代码

```bash
git clone https://gitee.com/Composure666/agent-hub.git
cd agent-hub
```

如果已经有本地项目目录，直接进入项目根目录即可。

## 4. 安装依赖

```bash
pnpm install
```

本项目使用 `pnpm-lock.yaml` 锁定依赖版本，请不要混用 npm 或 yarn 安装依赖。

## 5. 配置说明

### 5.1 复制环境变量模板

```bash
cp .env.example .env.local
```

Windows PowerShell 可以使用：

```powershell
Copy-Item .env.example .env.local
```

### 5.2 常用配置项

`.env.example` 里提供的是团队可共享的配置样板。常见项包括：

```bash
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
DEEPSEEK_API_KEY=
ARK_API_KEY=
```

### 5.3 公共配置与本地私密配置

应纳入 Git 的公共配置：

- `package.json`
- `next.config.ts`
- `drizzle.config.ts`
- `eslint.config.mjs`
- `vitest.config.ts`
- `playwright.config.ts`
- `src/db/builtin-agents.ts`
- `src/db/schema.ts`
- `.env.example`

不应提交的本地私密配置：

- `.env.local`
- `.agenthub-data/` 下的数据库和工作区数据
- 包含 API key、token、个人凭证的本地设置

典型私密值包括：

- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `DEEPSEEK_API_KEY`
- `ARK_API_KEY`
- `ANTHROPIC_BASE_URL`
- `AGENTHUB_MOBILE_TOKEN`

### 5.4 配置优先级

Agent 相关 API key 的读取优先级如下：

1. `agents.apiKey`
2. `app_settings.<provider>_api_key`
3. `process.env.<PROVIDER>_API_KEY`

这意味着如果某个 Agent 单独配置了 key，会优先使用该 key。

## 6. 启动 Web 开发服务

```bash
pnpm dev
```

启动后访问：

```text
http://localhost:3000
```

首次启动时，应用会自动创建本地 SQLite 数据库，并初始化内置 Agent。

## 7. 启动 Electron 桌面端开发模式

```bash
pnpm electron:dev
```

该命令会同时启动 Next.js、Electron 主进程 TypeScript 编译和 Electron 窗口。

## 8. 打包桌面应用

默认打包命令：

```bash
pnpm electron:build
```

打包产物输出到：

```text
release/
```

当前桌面端打包目标：

- macOS：`dmg`，`arm64`
- Windows：`nsis`，`x64`

如果遇到 `better-sqlite3` 原生模块 ABI 问题，可以尝试：

```bash
pnpm rebuild better-sqlite3
pnpm electron:rebuild
```

然后重新执行失败的命令。

## 9. 常用命令

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

## 10. 目录说明

- `src/app/`：Next.js 路由和 API 路由
- `src/components/`：UI 组件和工作台页面
- `src/server/`：应用服务、适配器和工具执行逻辑
- `src/db/`：SQLite schema、seed 数据和启动初始化
- `src/shared/`：共享类型和常量
- `apps/mobile/`：Capacitor 移动伴随端
- `electron/`：Electron 主进程和启动代码
- `specs/`、`openspec/`：项目规格与能力契约

## 11. 贡献方式

1. 新建分支后再改动。
2. 尽量让每个变更只做一件事。
3. 行为变化时同步更新文档或 spec。
4. 提交前运行 `pnpm typecheck` 和 `pnpm lint`。
5. 不要提交 `.env.local`、API key 或本地数据库文件。

## 12. 更多文档

- `README.md`：英文项目说明
- `README.zh-CN.md`：中文项目说明
- `OVERVIEW.md`：代码地图与当前实现状态
- `CLAUDE.md`：项目规则与协作约定
- `docs/AI-COLLABORATION.md`：协作记录与方法
- `specs/`：详细技术规格
