# 模块页布局审计 Top 5（module-audit-top5）— 实施记录

- 日期：2026-11-18
- 范围：审计报告 `~/workspace/frontend-polish-evidence/module-audit-2026-11-18.md` 的 Top 5（D1、H1、A1+A2+A3、F1+F2+F3、E1+E2）。Top 5 之外（B/C/D2–D7/E3–E4/F4/G/H2/I/J）不在本轮。
- 方案：`openspec/changes/module-audit-top5/proposal.md`；任务：同目录 `tasks.md`。
- 状态：**全部 5 项完成并通过集中验证**（W6，2026-11-18 晚）。未 commit、未 push、未部署（HEAD 仍为 9618684，全部改动在工作树）。
> 注（2026-11-19，batch5-cleanup W2）：本文提及的 `sidebar.tsx`、`agent-library.tsx`、`team-library.tsx`、`new-conversation-dialog.tsx`、`global-search-trigger.tsx`、`dir-picker-dialog.tsx` 已于 2026-11-18 batch4 §2 删除；现入口：侧栏→`app-workbench.tsx` 内联 `wb-sidebar`、Agent 库→`agent-workspace.tsx`、会话创建→新建任务视图。历史叙述保留原样。
- 证据：`~/workspace/frontend-polish-evidence/module-audit-top5/`（W1–W5 截图 `w1-*`～`w5-*`；W6 截图 `w6-*` 44 张 PNG + 测量 `w6b-results.json`、`w6c-results.json`；拍摄脚本 `shot-w4.mjs`、`shot-w5.mjs`、`shot-w6.mjs`、`shot-w6b.mjs`、`probe-w6*.mjs`）。

## 分工

| Worker | 负责 | 文件 |
|---|---|---|
| W1 | D1 详情 Dialog + H1 深色标题 | `src/components/agent-workspace.tsx`、`src/components/agent-run-debug-board.tsx`、新建 `src/lib/use-media-query.ts`（+ 测试） |
| W2 | PageHeader/PageShell 规范 + 能力中心/自动化 A 迁移 + E1+E2 对话框三档 | `src/components/workbench-primitives.tsx`、`src/components/capability-center-workspace.tsx`、`src/components/automation-workspace.tsx` |
| W3 | F1+F2+F3 悬停行操作 + 信息中心 gutter | `src/components/agent-library.tsx`、`src/components/artifact-library.tsx`、`src/components/information-center-workspace.tsx` |
| W4 | 数据概览 + 经验资产 A 迁移 | `src/components/analytics-workspace.tsx`、`src/components/experience-library.tsx` |
| W5 | Agent 库 + 调试板页头迁移 | `src/components/agent-workspace.tsx`、`src/components/agent-run-debug-board.tsx`（W1 完成后串行） |
| W6 | 集中验证 + 经验资产 max-w-none 小修正 + 记录 | 本文件；只改 `experience-library.tsx` 一处 className（见下） |

## 各 Top 5 改法

### D1 — 详情侧栏 <1280px 消失（W1）— 完成

- 两个 Agent 详情组件（`agent-workspace.tsx`）根 `aside` 重构为接受 `className` 透传（默认保持 `hidden … xl:block`）；<xl 时选中的详情在 shadcn `Dialog`（`DIALOG_SIZE_CLASS.md`）中打开，≥xl 行为不变。
- 调试板检查器（`agent-run-debug-board.tsx`）：<xl 时点节点打开 Dialog 呈现 `DetailsPanel`；≥xl 行为不变。
- 视口判断：新建 `src/lib/use-media-query.ts`（最小实现 + 单元测试 `use-media-query.test.ts`），`useIsBelowXl()`；不用 CSS 媒体查询开关 Dialog 挂载。
- 注意：精选卡片要点卡片内的「详情」按钮才打开详情（点卡片名字本身不触发，`ResourcePresetCard` 的 `onSelect` 只挂在按钮上）；「我的 Agent」列表由 `projectMyAgents` 派生，preset 转化来的 Agent 需 `localStorage['agenthub.featuredMyAgentIds']` 含其 id 才会出现在列表里（W6 验证时用 initScript 注入才复现）。

### H1 — Agent 详情深色标题不可读（W1）— 完成

- `agent-workspace.tsx` 两处详情 h2 补 `dark:text-slate-50`，两处描述补 `dark:text-slate-400`；全仓 grep `text-slate-950` / `text-slate-900` 同类漏网一并补。

### A1+A2+A3 — 页头与 gutter 不统一（W2/W4/W5）— 完成

- 页头规范（定死）：标题 `font-heading text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100`；图标块可选 40px（`size-10`）；描述 `mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400`；操作区右上 `flex flex-wrap items-center gap-2`。
- `PageHeader`（`workbench-primitives.tsx`）扩展：`icon` 改为可选；新增可选 `breadcrumb?` / `meta?`；标题改为 `font-heading text-2xl`；仍包在 `PageCard` 里。
- `PageShell` gutter 规则写进组件注释：外层 `p-4 lg:p-6`，内容默认 `max-w-5xl`；数据型页面（数据概览、能力中心、信息中心、自动化）显式 `contentClassName="w-full max-w-none"`。
- 迁移：能力中心（保留图标块，`max-w-none`）、自动化（`max-w-none`）、数据概览（无图标，`max-w-none`）、经验资产（保留图标块 + 右侧 slogan，默认 `max-w-5xl`）、信息中心（去掉 `p-2 lg:p-2.5` 改写，`max-w-none` 保留）、Agent 库（h1 `text-[22px]` → `PageHeader`，描述补 `dark:text-slate-400`）、运行调试板（`PageHeader` 的 breadcrumb + meta 变体，`max-w-none`）。

### F1+F2+F3 — 悬停才可见的行操作（W3）— 完成

- 三处同一做法：补 `focus-within` 兜底（`group-focus-within:opacity-100` / `group-focus-within/row:inline`），粗指针设备下常显（`[@media(hover:none)]:opacity-100` / `[@media(hover:none)]:inline`）。不收进「···」菜单、不改按钮本身与操作行为。
- F1 `agent-library.tsx:142`、F2 `artifact-library.tsx:260`、F3 `information-center-workspace.tsx:567-596`。
- 信息中心外壳去掉 `PageShell` 的 `p-2 lg:p-2.5` 改写（回到默认 gutter）。

### E1+E2 — 对话框尺寸绕开三档常量（W2）— 完成

- 能力中心 4 个对话框改走 `DIALOG_SIZE_CLASS`：MCP 新增/编辑 → md 档（512px 放到 672px）、删除确认/连接测试 → sm 档、通用详情（ShowAllDialog）→ md 档；文件对 `DIALOG_SIZE_CLASS` 从零引用到全部引用。
- 自动化两个大弹窗 → lg 档（896px）；去掉详情弹窗的 2px accent 边框（全站其它对话框均无，详情弹窗是孤例）；其余尺寸/高度（`max-h`）保持。

## W6 小修正（协调人决定）

- `src/components/experience-library.tsx:191`：`PageShell` 的 `contentClassName` 由 `"flex-1 min-h-0"` 改为 `"w-full max-w-none flex-1 min-h-0"`。原因：W4 按方案用了默认 `max-w-5xl`，但右侧栏 `w-64` + 5 列统计卡导致第 5 张卡「累计使用」在 1440×900 下换行（迁移前无 max-w，不换行）；数据密集页 + 固定侧栏，与数据概览同理。只改这一处 className，不动其它。
- 改后复核（`w6-experience-maxwnone-1440.png`）：5 张卡同一行（y=172，h=108，宽各 151px），网格 5 列，「累计使用」标签单行（高 21px ≈ 行高 21.25px，未折行），`PageShell` 内容区 `max-width: none`。卡片不再换行，修正有效。
- 小观察（非回归）：第 5 张卡的值「0 次」在卡内仍拆成两行（「0」/「次」），是窄卡内大字号值的既有排版，随数值变化；标签本身不折行。

## W6 集中验证结果（2026-11-18 晚）

- `npx tsc --noEmit`：**0 错误**。
- eslint（Top 5 改动文件 12 个：`agent-workspace`、`agent-run-debug-board`、`use-media-query[.test]`、`workbench-primitives`、`capability-center-workspace`、`automation-workspace`、`agent-library`、`artifact-library`、`information-center-workspace`、`analytics-workspace`、`experience-library`）：**0 错误**。
- 全量 `npx vitest run`：**882 通过 / 4 跳过**（104 个测试文件；基线 876 通过 / 4 跳过，+6 为新增 `use-media-query` 测试）。
- 干净生产构建：先确认无其它 next 构建在跑（串行，`.next` 共用撞车已避开），`rm -rf .next && node node_modules/next/dist/bin/next build`，**exit 0**，BUILD_ID `3zEsCSB4UDSgVxrlXxaBG`。
- 验证服务：`next start -p 3137`（私有端口，验证后已停掉）。验证种子（本地开发库，验证后已全部清理，计数归零）：1 条 run（`run_w6_verify`，触发消息「W6 验证用的触发消息」+ 输出消息各 1 条，挂在 `conv_EBWFkvX8yScz`）、1 个 MCP Server（`w6_verify`，`echo`）、1 件产物（`art_w6_verify`）、1 条通知（`notif_w6verify`）。清理后 `agent_runs / messages / artifacts / mcp_servers / 可见 notifications` 均为 0。
- 对话框宽度口径：项目根字号为 106.25%（`globals.css:916`，即 17px），Tailwind 的 rem 档位按 17px 渲染——sm 28rem=476px、md 42rem=714px、lg 56rem=952px，与 `DIALOG_SIZE_CLASS` 定义一致，不是超宽。

### D1 — 完成

| 场景 | 结果 |
|---|---|
| 精选 Agent 详情 1024×768 | Dialog 打开，标题「代码探索助手 - 详情」，框 714×707，视口内，0 溢出 |
| 精选 Agent 详情 768×1024 | Dialog 打开，框 714×900，视口内，0 溢出 |
| 精选 Agent 详情 390×844 | Dialog 打开，框 356×776，视口内，0 溢出 |
| 我的 Agent 详情 1024×768 | Dialog 打开，框 714×707，视口内，0 溢出（需 localStorage 含该 preset id，见上） |
| 调试板点节点 1024×768 | 图 4 节点，Dialog 打开（标题「代码探索助手」），框 714×707，0 溢出 |
| 调试板点节点 768×1024 | 图 4 节点，Dialog 打开，框 714×940，0 溢出 |
| 调试板点节点 390×844 | 图 4 节点，Dialog 打开，框 356×776，0 溢出（移动端用会话下拉框选会话，见遗留） |
| ≥xl 对照 1366 / 1920 | 无 Dialog（符合设计），内联侧栏 340px 宽完整显示（1366：x=1001,h=700；1920：x=1294,h=1012），视口内 |

### H1 — 完成

- 深色 1024 下详情标题色 `rgb(236, 228, 208)`，弹窗底 `rgb(32, 29, 23)`，**对比度 13.26:1**（与 W1 实测一致；原约 1.2:1）。

### A1 — 完成

- 六页页头浅/深截图各一（1440×900）：`w6-a-{agents,runboard,analytics,experience,capability,automation}-{light,dark}.png`，目视页头规格一致（`font-heading text-2xl` + 可选图标块 + 描述行）。
- W2 遗留①核对：信息中心页头图标块实测 **43×43px**——`size-10` 在根字号 17px 下的渲染值（2.5rem×17=42.5），六页一致，视觉正常，**无问题**。

### F1+F2+F3 — 完成（F1 只能隔离验证，见遗留）

| 项 | 验证方式 | 结果 |
|---|---|---|
| F1 Agent 编辑/删除 | 隔离 harness（精确复制 `agent-library.tsx:119-142` 行内 class + 真实构建 CSS） | 触屏 `hover:none` 下 opacity **1**（常显）；键盘 focus 前 0、focus 后 **1** |
| F2 产物删除 | 实机：对话视图 → 第 6 个会话 → 工具栏「本会话产物库」弹窗 | 触屏下删除按钮 opacity **1**（常显） |
| F3 信息中心标已读/··· | 实机：种 1 条未读通知后进信息中心，触屏模拟 | 「标为已读」可见（`display` 非 none）、「···」opacity **1** |

### E1+E2 — 完成

| 对话框 | 档位 | 实测框（1440×900） | 视口内 / 溢出 |
|---|---|---|---|
| 能力中心 MCP 新增 | md | 714×451 | 是 / 0 |
| 能力中心 MCP 编辑 | md | 714×451 | 是 / 0 |
| 能力中心删除确认 | sm | 476×220 | 是 / 0 |
| 能力中心连接测试 | sm | 476×198，标题「MCP 连接失败」（`echo` 不是 MCP Server，失败态符合预期） | 是 / 0 |
| 能力中心通用详情（最近更新） | md | 714×682 | 是 / 0 |
| 自动化任务详情 | lg | 952×757，无 accent 边框 | 是 / 0 |
| 自动化新建/编辑 | lg | 952×866 | 是 / 0 |

### 对话框溢出抽查（第三轮成果不回归）— 通过

- 1366×768 与 1920×1080：自动化详情/新建、能力中心新增 8 项全部 `scrollW==clientW`、`scrollH==clientH`、视口内、0 溢出；Agent 详情在 ≥xl 本无 Dialog（走内联侧栏，见 D1 对照，1366/1920 侧栏均完整显示）。

## 截图清单（W6，`~/workspace/frontend-polish-evidence/module-audit-top5/`，44 张）

- 页头：`w6-a-{agents,runboard,analytics,experience,capability,automation}-{light,dark}.png`（12 张）+ `w6-info-{light,dark}.png`（2 张）。
- D1：`w6-d1-agent-{1024,768,390}-light.png`、`w6-d1-agent-1024-dark.png`、`w6-d1-mine-1024-light.png`、`w6-d1-debug-{1024,768,390}-light.png`、`w6-d1-agent-sidebar-{1366,1920}.png`（10 张）。
- F：`w6-f1-{touch,keyboard}.png`、`w6-f2-touch.png`、`w6-f3-touch.png`（4 张）。
- E：`w6-e1-{create,edit,delete,test,detail}.png`、`w6-e2-{detail,create}.png`（7 张）。
- 经验资产修正：`w6-experience-maxwnone-1440.png`（1 张）。
- 溢出抽查：`w6-ov-{agent,automation-detail,automation-create,capability-create}-{1366,1920}.png`（8 张）。
- 测量：`w6b-results.json`、`w6c-results.json`；拍摄脚本：`shot-w6.mjs`、`shot-w6b.mjs`、`probe-w6.mjs`、`probe-w6-mine.mjs`、`probe-w6b.mjs`、`probe-w6c.mjs`、`probe-w6f2.mjs`、`probe-w6f2b.mjs`。

## 遗留问题

### 本轮各 worker 汇报的遗留（W6 已复核的打 ✓）

- **F1 是死代码**（W1/W3 遗留，W6 复核 ✓）：`AgentLibrary` 只在 `sidebar.tsx:390` 被渲染，而 `sidebar.tsx` 的 `Sidebar` 全仓无任何 import（死代码，审计已知遗留⑤亦有记录）。因此 F1 的修复（`focus-within` + `hover:none` 常显）在真实 UI 里没有可达路径，W6 只能用隔离 harness 验证 class 生效；代码本身正确，但用户在产品里点不到这处入口。如后续清理死代码，F1 随之消失；如恢复侧栏，修复已就位。
- **ArtifactWorkspace 仍有 hover-only 未动**（W3 遗留）：不在 Top 5 内，本轮未动。
- **经验资产页头不再吸顶**（W4 遗留）：迁 `PageShell` 后页头随内容滚动；是否恢复吸顶等用户定。
- **调试板头部按钮 1024 下重叠**（W5 遗留）：8 个按钮不换行在窄屏下挤压；D3（不换行）、D4（分享死按钮）、D5（Cost - 占位）均不在 Top 5 内，本轮未动。
- **390 下 DetailsPanel Tab 折行**（W6 复核 ✓）：`w6-d1-debug-390-light.png` 可见 6 个 Tab 在 390 下各标签折成两行（「概览」上下排列），能点但拥挤；D1 只要求详情能打开，Tab 折行属既有样式问题，未修。
- **会话图边缘情况**（W1 遗留）：调试板会话图在空 run / 无节点等边缘态的表现本轮未系统覆盖（W6 只验证了有 run + 4 节点的正向路径）。
- **W2 遗留①**（信息中心页头图标 40px 块状）：W6 复核为正常（见 A1 一节），关闭。

### W6 验证中新发现（非阻塞）

- 调试板 390 下选会话不能点左侧栏行（栏在画布外）：须用移动端会话下拉框（`<select>`）选会话，W6 首次跑脚本时因此超时，改走下拉框后通过。属既有移动端替代方案（审计 D1 已记录），非新 bug。
- 对话视图默认是 new-task（`app-store.ts:267` `workbenchView: 'new-task'`），F2 验证须先导航到「对话」再切会话；W6 首次跑脚本时因此没找到会话行，属验证方法问题，非产品问题。
- 信息中心在库里无可见通知时为空态：W6 首次测 F3 时库里只有 W3 留下的已软删除通知（`notif_w3verify`，`deleted_at` 已置，API 正确返回空），行操作无从测量；种 1 条未读通知后通过。W3 的软删除行仍在库里，未动。
- 验证中途一次运行时重启：第一次 `shot-w6b.mjs` 全跑在收尾阶段被重启打断（只剩溢出抽查后半段），服务随重启停掉；W6 重启服务后完整重跑通过，`w6b-results.json` 为重跑结果。另：早期一轮 `pkill` 误杀了自己的 shell（pattern 自匹配），后改按 PID 停服务，无影响。

## 文件改动（`git diff --stat`，HEAD 9618684）

- Top 5 相关 10 个已追踪文件：`agent-workspace.tsx`（282）、`agent-run-debug-board.tsx`（341）、`analytics-workspace.tsx`（594）、`automation-workspace.tsx`（309）、`capability-center-workspace.tsx`（206）、`experience-library.tsx`（382）、`information-center-workspace.tsx`（95）、`artifact-library.tsx`（51）、`agent-library.tsx`（17）、`workbench-primitives.tsx`（49）；另新增未追踪 `src/lib/use-media-query.ts` + `src/lib/use-media-query.test.ts`。10 文件合计 **1297 插入 / 1029 删除**。
- 注意：上述数字是相对 HEAD 的整棵未提交工作树（含主题轮与前端 polish 前几轮对同一文件的改动），不是 Top 5 一轮的净增量；W6 本轮只改了 `experience-library.tsx` 1 行。
- 全工作树：92 个文件，4992 插入 / 3298 删除（同前几轮口径）。
