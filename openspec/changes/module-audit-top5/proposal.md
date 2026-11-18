# 模块页布局审计 Top 5（module-audit-top5）

## Why

2026-11-18 下午用户要求“再看看各个功能模块页布局和结构有什么可以优化的”。只读审计（报告 `~/workspace/frontend-polish-evidence/module-audit-2026-11-18.md`，334 行，每条有 `file:line` 证据）发现 A–J 共 10 组问题；用户随即拍板：**先做 Top 5**。

Top 5 之外的发现（B1–B4、C1–C4、D2–D7、E3–E4、F4、G1、H2、I1–I2、J1）**不在本轮**，以后另开 change。

## 已确认的决策（2026-11-18，用户已定）

1. 只做 Top 5：D1、H1、A1+A2+A3、F1+F2+F3、E1+E2。
2. 不改页面内容与功能，只改布局与结构。
3. 复用已有规范与模式，不新造轮子：3 档卡片（`agenthub-card-container` / `card` / `interactive`）、3 档对话框（`DIALOG_SIZE_CLASS`：sm `sm:max-w-md` / md `sm:max-w-2xl` / lg `sm:max-w-4xl`，`src/components/dialog-sizes.ts`）、`PageHeader` / `PageShell` / `EmptyState`（`src/components/workbench-primitives.tsx`）、主题 token（theme-switcher 轮已落地）。
4. 用户已确认方向，不用等第二轮批准再动手。

## What Changes

### 1. D1 — 详情侧栏 <1280px 消失（高 / M）

现状：Agent 详情面板（`agent-workspace.tsx:915/922/1165/1172`，两个详情组件根节点都是 `hidden w-[340px] … xl:block`）与调试板检查器（`agent-run-debug-board.tsx:1111`，`hidden … xl:block`，全站唯一的 `DetailsPanel` 渲染点）在 <1280px 时 `display: none`；点 Agent / 点节点时状态照常置位，页面上什么都不发生。

改法：
- <xl 时详情改为 shadcn `Dialog` 打开（复用站内已有的 Dialog 模式，不新造抽屉范式），尺寸走 `DIALOG_SIZE_CLASS.md`。
- 两个 Agent 详情组件根 `aside` 硬编码了 `hidden … xl:block`，需重构为接受 `className` 透传（默认保持 xl 行为），Dialog 内渲染时不带 hidden 类。
- 调试板检查器同理：<xl 时点节点打开 Dialog 呈现 `DetailsPanel`；调试板左栏 <md 已有下拉框替代，右检查器补上这个替代入口。
- 视口判断：复用站内已有的 media-query hook（如无则在 `src/lib/use-media-query.ts` 新加一个最小实现 + 单元测试）；不要用 CSS 媒体查询去开关 Dialog 挂载。
- 不改详情内容、不改 ≥xl 时的侧栏行为。

### 2. H1 — Agent 详情深色标题不可读（高 / S）

现状：`agent-workspace.tsx:931`、`:1181` 两处 h2 写死 `text-slate-950` 无 `dark:` 变体，描述 `:934`、`:1184`（`text-slate-500`）同样；深色下近黑字配深底，对比度约 1.2:1。

改法：两处标题补 `dark:text-slate-50`（与同文件 `:564`、`:853`、`:1058`、`:1123` 的做法一致），两处描述补 `dark:text-slate-400`；顺带全仓 grep 一遍 `text-slate-950` / `text-slate-900`，同类漏网一并补。

### 3. A1+A2+A3 — 页头与 gutter 不统一（中 / M）

现状：六种页头规格并存（见审计 A1）；`PageShell` 只有能力中心与信息中心在用（A2）；外层 gutter 六页各不相同（16/24/32、16/24、12/16、8/10、24、16/20，A3）。

页头规范（本轮定死，各 worker 照此执行，不各自发挥）：
- 标题：`font-heading text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100`。
- 图标块（可选）：40px（`size-10`）圆角方块，`border` + `bg-[var(--agenthub-surface-muted)]`，图标 `size-5 text-[var(--agenthub-accent)]`。
- 描述：`mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400`。
- 操作区：右上，`flex flex-wrap items-center gap-2`。
- `PageHeader`（`workbench-primitives.tsx:52`）扩展：`icon` 改为可选；新增可选 `breadcrumb?: ReactNode`（标题行上方）与 `meta?: ReactNode`（标题行下方，调试板元信息行用）；标题字号从 `text-xl` 改为 `text-2xl font-heading`；其余结构不动（仍包在 `PageCard` 里）。
- `PageShell` gutter 规则（写进组件注释）：外层 `p-4 lg:p-6`，内容 `max-w-5xl`；数据型页面（数据概览、能力中心、信息中心、自动化）显式 `max-w-none`，其余走默认 `max-w-5xl`。

迁移（不要改页面内容与功能）：
- 能力中心、自动化：页头迁到新 `PageHeader`（能力中心保留图标块；自动化页头仍在卡片内，迁为 PageHeader 变体）；外壳迁到 `PageShell`（能力中心去掉 `p-3 lg:p-4` 改写，自动化 `p-4 xl:p-6` 改写；两页均 `max-w-none`）。
- 数据概览、经验资产：页头迁到新 `PageHeader`（数据概览无图标；经验资产保留图标块，右侧 slogan 保留现状不处理——B3 不在本轮）；外壳迁到 `PageShell`（数据概览 `max-w-none`；经验资产走默认 `max-w-5xl`，内层横栏的 `px-6` 随外壳收敛到 `px-4 lg:px-6`）。
- 信息中心：已用 `PageHeader` + `PageShell`，只去掉 `p-2 lg:p-2.5` 改写（回到默认 gutter），`max-w-none` 保留。
- Agent 库、运行调试板：页头迁移放在第二波（W1 正在改这两个文件，串行做，避免冲突）；Agent 库 h1 `text-[22px]`（无 `font-heading`）→ `PageHeader`（图标可选，缺省不用），描述补 `dark:text-slate-400`（审计 A4 一并做）；调试板页头 → `PageHeader` 的 breadcrumb + meta 变体（面包屑与元信息行保留）。

### 4. F1+F2+F3 — 悬停才可见的行操作（中 / S）

现状：Agent 库行内编辑/删除（`agent-library.tsx:150`，`opacity-0 group-hover:opacity-100`，无 focus 兜底）、产物库删除（`artifact-library.tsx:260-264`，同款）、信息中心“标已读”（`information-center-workspace.tsx:567-577`，`hidden … group-hover/row:inline`）与“···”菜单（`:587-596`，`opacity-0 group-hover/row:opacity-100`），触屏与键盘均不可达。

改法（三处同一做法，不各自发挥）：
- 补 `focus-within` 兜底（`group-focus-within:opacity-100` / `group-focus-within/row:inline`），键盘 Tab 到行内按钮时可见。
- 粗指针设备下常显：`[@media(hover:none)]:opacity-100`（F1/F2 的按钮区与 F3 的“···”触发器）/ `[@media(hover:none)]:inline`（F3 “标已读”）。不收进“···”菜单、不改按钮本身。
- 不改操作行为（点击、确认弹窗均不动）。

### 5. E1+E2 — 对话框尺寸绕开三档常量（中 / S）

现状：能力中心 4 个对话框手写尺寸（`capability-center-workspace.tsx:1722` `sm:max-w-lg`——三档里没有 lg 这个值；`:1828`、`:1862` `sm:max-w-md`；`:1919` `sm:max-w-2xl`），文件对 `DIALOG_SIZE_CLASS` 零引用；自动化 2 个大弹窗手写 880/720px（`automation-workspace.tsx:960`、`:1475`），且描边不一致（其一 2px accent 边框，另一无）。

改法：
- 能力中心：MCP 新增/编辑 → md 档（512px 放到 672px，收进体系）；删除确认、连接测试 → sm 档；通用详情 → md 档。全部引用 `DIALOG_SIZE_CLASS`，不再写字面量 `max-w-*`。
- 自动化：两个大弹窗 → lg 档（896px，接近原 880px）；描边统一：去掉详情弹窗的 2px accent 边框（全站其它对话框均无 accent 边框，详情弹窗是孤例）；其余尺寸/高度（`max-h`）保持。
- 不改弹窗内容与功能。

## Non-goals

- Top 5 之外的审计发现（B/C/D2–D7/E3–E4/F4/G/H2/I/J）不在本轮。
- 不改页面内容、功能逻辑、API、数据流。
- 不动主题 token、不动配色。
- 不新引依赖、不新造交互范式。

## Verification

- `npx tsc --noEmit` 0 错误；eslint（全部改动文件）0 错误；全量 `npx vitest run`（基线 876 通过 / 4 跳过，含新增测试）。
- 干净生产构建 exit 0。
- Playwright 截图：D1 在 1024/768/390 下详情可打开；H1 深色标题可读；A1 迁移后的各页页头；F1–F3 触屏（hover:none 模拟）下行操作常显；E1–E2 对话框尺寸。证据 `~/workspace/frontend-polish-evidence/module-audit-top5/`。
- 记录：`openspec/changes/module-audit-top5/PROGRESS.md`；`openspec/changes/frontend-polish/PROGRESS.md` 末尾加指向。
