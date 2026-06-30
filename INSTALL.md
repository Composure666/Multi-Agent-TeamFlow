# AgentHub 安装与启动指南

本文档说明如何从源码安装并启动 AgentHub。适用于本地 Web 开发模式和 Electron 桌面端开发/打包。

## 1. 环境要求

请先安装：

- Node.js 20 或更高版本
- pnpm
- Git

可选环境：

- macOS 或 Windows：用于运行和打包 Electron 桌面端
- Xcode 与 CocoaPods：仅在开发 iOS 移动伴随端时需要

检查版本：

```bash
node -v
pnpm -v
git --version
```

## 2. 获取项目代码

```bash
git clone https://gitee.com/Composure666/agent-hub.git
cd agent-hub
```

如果已经有本地项目目录，直接进入项目根目录即可。

## 3. 安装依赖

```bash
pnpm install
```

本项目使用 `pnpm-lock.yaml` 锁定依赖版本，请不要混用 npm 或 yarn 安装依赖。

## 4. 配置环境变量

复制环境变量模板：

```bash
cp .env.example .env.local
```

Windows PowerShell 可以使用：

```powershell
Copy-Item .env.example .env.local
```

常用配置项：

```bash
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
DEEPSEEK_API_KEY=
ARK_API_KEY=
```

说明：

- 不配置 API key 也可以先启动应用。
- API key 可以在 `.env.local` 中配置，也可以在应用设置面板中配置。
- Agent 级别的 API key 优先级最高。
- Claude Code 适配器也可以复用本机已有的 Claude Code 登录。

## 5. 启动 Web 开发服务

```bash
pnpm dev
```

启动后访问：

```text
http://localhost:3000
```

首次启动时，应用会自动创建本地 SQLite 数据库，并初始化内置 Agent。

本地数据默认位于：

```text
.agenthub-data/agenthub.db
.agenthub-data/workspaces/
```

## 6. 启动 Electron 桌面端开发模式

```bash
pnpm electron:dev
```

该命令会同时启动 Next.js、Electron 主进程 TypeScript 编译和 Electron 窗口。

## 7. 打包桌面应用

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

## 8. 常用命令

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

## 9. 常见问题

### pnpm install 失败

确认 Node.js 版本不低于 20，并使用 pnpm 安装依赖：

```bash
node -v
pnpm -v
pnpm install
```

### 启动后没有可用模型

检查 API key 是否已配置。你可以选择：

- 在 `.env.local` 中配置 provider API key
- 在应用设置面板中配置全局 API key
- 在 Agent 编辑页面中配置 Agent 专属 API key

### Claude Code 适配器不可用

确认本机 Claude Code 已登录，或配置了可用的 Anthropic API key。

### Electron 启动或打包时报 SQLite 原生模块错误

执行：

```bash
pnpm rebuild better-sqlite3
pnpm electron:rebuild
```

然后重新启动或打包。

### 端口 3000 被占用

停止占用 3000 端口的进程后重新运行：

```bash
pnpm dev
```

## 10. 更多文档

- `README.md`：英文项目说明
- `README.zh-CN.md`：中文项目说明
- `CLAUDE.md`：AI 协作与项目规则
- `OVERVIEW.md`：代码地图与当前实现状态
- `specs/`：详细规格文档
