# 手机工作台清理 + 用户指南移入设置 — PROGRESS

方案：`openspec/changes/mobile-workbench-cleanup/PROPOSAL.md`（用户 2026-11-19 16:51 确认）。
实施窗口：GitHub 快照推完后开工（2026-11-19 晚）。只提交、不推送、不部署。

## 提交（4 个，本地 master，相对 bc095da）

| # | SHA | 内容 |
|---|---|---|
| P0 | `221a66d` | `fix(workbench): restore conversation exit on mobile` — B0 对话页出口 |
| B 批 | `9218ae5` | `feat(workbench): mobile cleanup` — B1–B7 |
| 指南 | `75d100b` | `feat(settings): move user guide into Settings as 10th tab` |
| Key | `5fb2598` | `refactor(settings): merge duplicate provider Key note into keys tab`（可单独 revert） |

每批提交前：`tsc 0`、eslint 0 errors（仅 1 处既有 `<img>` warning）、vitest **896 passed / 4 skipped**（与基线一致，无回归）。

## P0 — B0 对话页出口（221a66d）

改动（4 文件）：
- `chat-toolbar.tsx`：用量徽章 / Workspace Memory / 运行展板移出移动端工具栏，`hidden sm:flex`；「更多」改 Radix→Base UI Popover（挂 body，根治 header `overflow-hidden` 裁菜单的同 header bug）；移动端工具栏只剩 3 键组 + 大纲 + 更多（约 180px）。
- `chat-panel.tsx`：汉堡移出 `flex-1` 左容器、成 `shrink-0` header 直属子项；`ParticipantStack` 移动端隐藏（`hidden sm:flex`），标题保宽。
- `usage-badge.tsx` / `workspace-memory-button.tsx`：加可选 `triggerClassName` / `triggerLabel`（更多菜单里的行形态；用量行文案「用量 12.3k」）。

验证（`mwbc-p0-verify.mjs`，本地生产构建 BUILD_ID `5g6Bnzpy0qiYG7gocLTce`，隔离库 `/tmp/mwbc-data`，种子会话 runCount=1、徽章出现）：
- A1 390×844：汉堡可见（x=26.5, w=29.8）可点、点开抽屉且含种子会话；标题可见（73.6px，「MWBC…」）；抽屉导航可退出到新任务页；「更多」菜单不被裁（右缘 364 ≤ 390，底 251 ≤ 844），四行都在；「用量」行点开明细（「本会话 token 累计」「1 次响应」）。
- 1366 回归：聊天汉堡隐藏、徽章回工具栏、标题可见。
- 几何注记：header 本身左右各 inset 约 13.8px（工作台内容区既有 padding），故汉堡 x=26.5 而非 12.75；标题被工具栏压到约 74px 仍可见。A1 只要求「标题可见」，通过。
- A5 首启指南：独立新鲜库专项检查（`mwbc-guide-check.mjs`）——自动弹 ✓、「稍后再说」关闭 ✓、刷新后不再弹 ✓。

## B 批 — B1–B7（9218ae5）

改动（3 文件，全部移动端收紧、`md:`/`sm:` 还原桌面）：
- B1 `MobileWorkbenchTopBar`：单行标题（品牌名 · 当前页）、去副标题、菜单键 size-10→size-9、品牌方块 34→28px、py-2.5→py-1 → **47.8px ≤ 48**。
- B2 `NewTaskView`：容器 px-8→px-4、pt-6→pt-4；H1 32→28px；副文案 mt-3→mt-2；composer mt-7→mt-5；textarea min-h 150→120；H2 mt-9→mt-6；团队圆圈 38→32px。
- B3 抽屉导航图标 21.25→17px（导航项 + 新建任务 Plus）。
- B4 `PageHeader`：图标盒 42.5→32px、标题 25.5→20px、描述 `line-clamp-1`、卡片 p-3（移动端）；标题块 `basis-[180px]` + 外层 `flex-wrap`——actions 小时同行紧凑，超宽时换到第二行，标题不被压成「A…」（Agent 库实测触发换行，标题完整可读）。
- B5 抽屉：导航移到会话列表上方（退出路径先见）；列表仍在同一滚动区内，下滑即见。
- B6 `message-input.tsx`：移动端 placeholder 缩短（`useMediaQuery('(max-width: 639px)')`，桌面保留完整提示）；输入区外 padding 收紧、行 gap 收紧 → 88px。
- B7：无代码改动——DetailsPanel 6 Tab 栏已有 `overflow-x-auto` + `shrink-0 whitespace-nowrap`（早先已修），本轮只验证。

验证（`mwbc-b-verify.mjs`，BUILD_ID `_x2qareVKKjxwc61OpRa1`）：
- A2 新任务页：顶栏 47.8px；H1 28px、1 行；团队行底 **766.9 ≤ 844**（原 871.3，收回约 104px）；无横向溢出。
- A3 工作区页：能力中心卡底 **149.6 ≤ 150**（inline 路径，标题完整）；Agent 库 / 数据概览因 actions 宽换行，卡较高（131.6 / 171.9），但标题完整可读、首屏见正文第一卡（首卡顶 213.4 / 约 250 < 844）。**A3 的 ≤150 数字只在 actions 小的页严格达标**——换行保可读是刻意取舍，见下。
- B5：抽屉 scrollTop=0 新开时导航顶 228.2、首项可见；导航在列表上方（列表首项顶 875.7，刚过折叠线，需轻滑一下——导航优先的取舍）。
- B6：placeholder「输入消息，Enter 发送」（一行）；输入区 88px；A1 回归汉堡仍可见可点。
- B7：点图节点开检查器 Dialog（<xl 时内联侧栏 `hidden xl:block`，须点节点开 Dialog 才能验到），6 Tab（概览/终端/日志/工具/变量/产物）同一行，栏高 43.5px、右缘 373 ≤ 390。
- 1366 回归：新任务 H1 44px、容器 px-8/pt-6；Agent 库标题 25.5px；对话页汉堡隐藏、徽章回工具栏、桌面 placeholder 完整。

## 指南迁移（75d100b）

改动（4 文件）：
- `user-guide-dialog.tsx`：导出 `StartSection` / `ModuleSection`，新增导出 `UserGuideContent`（11 节单列通读：开始之前 + 10 模块，每节自带标题与跳转按钮）；弹窗保留首启自动弹与左导航，复用同一批组件；过时注释更新（侧栏入口→设置指南页）；`open-user-guide` 命令订阅保留作兼容入口。
- `settings-dialog.tsx`：`SETTINGS_SECTIONS` 末尾加第 10 项 `{ value: 'guide', label: '使用指南', icon: BookOpen }`（BookOpen 原已 import）；指南状态懒取（只在切到指南 Tab 时调 `fetchSetupStatus`）；`onGoSettings` 映射 `api-keys`→`keys`、`oss`→`oss`（其余按既有映射兜底），`onGoView` 关设置 + `setWorkbenchView`。
- `app-workbench.tsx`：删两侧栏指南按钮（抽屉 + 桌面）；删无用 `CircleHelp` / `emitUiCommand` import。
- `sidebar-layout.test.ts`：第 ⑤ 条改锁新入口（侧栏无指南按钮/无 `emitUiCommand('open-user-guide')`；设置有 guide Tab 且渲染 `<UserGuideContent>`）。

验证（`mwbc-c-verify.mjs`，BUILD_ID `XXOAA8CNrIybLK8qcdfwN`）：
- A4：设置 10 个分区 + 指南 Tab（当时另有 Key 说明固定项，共 11 枚芯片——Key 合并后回落到 10，见下）；指南 Tab 内 11 节全在（开始之前/对话与派活/信息中心/Agent 库/能力中心/产物库/经验资产/自动化/运行展板/数据概览/设置面板），状态卡与两种跳转按钮都在；「去配置 AI 模型」→ 供应商 Tab；「打开「对话与派活」」→ 关设置 + 切对话视图；两侧栏（390 抽屉 + 1366 桌面）均无「使用指南」。
- A5：新构建上重跑 `mwbc-guide-check.mjs`——自动弹 ✓、关闭 ✓、刷新不再弹 ✓。

## Key 说明合并（5fb2598，单独 commit）

改动（1 文件 `settings-dialog.tsx`）：删固定导航项「Key 说明」（Tooltip 块）；Tooltip 原文原样落成供应商 Tab 顶部 muted 提示行；删无用 `Info` / `Tooltip*` import。

验证（`mwbc-d-verify.mjs`，BUILD_ID `xJiNRt3ssrK1feLcOmTtb`）：导航 10 枚芯片（外观/供应商/对象存储/模型与分配/故障转移/移动端/发布/官网/通知/使用指南），无「Key 说明」项；供应商 Tab 顶部提示行两句原文都在。至此 A4 的「10 个 Tab」完全达标。

## 证据（`~/workspace/frontend-polish-evidence/mobile-workbench-cleanup/`）

- 探针与种子：`mwbc-p0-verify.mjs`、`mwbc-b-verify.mjs`、`mwbc-c-verify.mjs`、`mwbc-d-verify.mjs`、`mwbc-guide-check.mjs`、`mwbc-rects.mjs`、`mwbc-a3-spot.mjs`、`mwbc-seed.mjs`（种子会话 runCount=1 + 真实 run 记录 + debug 快照，供 B7）。
- 结果 JSON：`p0-results.json`、`p1-results.json`、`p2-results.json`、`p3-results.json`、`guide-check.json`。
- 截图：`p0-*.png`（P0/A1）、`p1-*.png`（B 批/A2/A3/B5/B6/B7/1366）、`p2-*.png`（指南/A4/1366）、`p3-keys-tab-390.png`（Key 合并）。
- 构建/服务日志：`p0-build.log`、`b-build.log`、`c-build.log`、`d-build.log`、`p0-server.log`、`b-server.log`、`c-server.log`、`d-server.log`。

## 刻意取舍与遗留

- A3 ≤150 只在 actions 小的页严格达标：Agent 库（3 枚宽 pills）、数据概览（4 个控件两行）换行后卡较高，但标题完整可读、首屏仍见正文。inline 死守数字会把标题压成「A…」（实测过，已改回换行方案）。
- B5 导航优先的代价：对话页抽屉里会话列表首项约在 876px，需轻滑一下才见；退出路径无需滚动即见。
- B7 的 DetailsPanel 在 <xl 时是点图节点开 Dialog（内联侧栏 `hidden xl:block`），探针已按此路径验证。
- 种子快照的 usage 须含 `cacheCreationTokens`（否则展板显示 NaN Tokens）——种子已修正，非产品 bug。
- 未动：两处 bare `confirm()`（team-detail-dialog.tsx:116、provider-config-dialog.tsx:151），等用户发话；安装包 rc.2 构建仍 BLOCKED（makensis 512MB），等用户定 PC 构建；未推送（Gitee 需用户令牌，GitHub 快照另走流程）；未部署（需用户明确批准）。
- 环境注记：`pnpm` 脚本会先跑 install 检查并在 `node_modules/.pnpm/lock.yaml.*` 上 EPERM——本轮改走 `node_modules/.bin/{tsc,eslint,vitest}` 直调 + `ensure-*-sqlite.mjs` 手动切 ABI，全部通过。

## 状态

全部完成，已提交 4 个 commit，未推送，未部署。工作树干净（仅 `openspec/changes/installer-update/` 与 `openspec/changes/mobile-workbench-cleanup/` 两个未跟踪的 openspec 目录）。
