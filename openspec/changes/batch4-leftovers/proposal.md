# 第四组：零散遗留收尾（batch4-leftovers）— OpenSpec 提案

- 日期：2026-11-18
- 背景：模块页审计 Top 5 → 第一批（响应式与可达性）→ 第二批（一致性）之后剩下的零散遗留，加上第三批验证遗留与第二批探针新发现。这是三批里的最后一批，用户已批准“三批按顺序都做”。
- 前置状态：白色主题 + 第一批 + 第二批三轮改动均未提交，HEAD 为 `c383a4a`，工作树 31 个改动文件；本轮只动本轮范围内的文件，不动前三轮已落地的改动，不 commit、不 push、不部署。
- 证据源：审计报告 `~/workspace/frontend-polish-evidence/module-audit-2026-11-18.md`；`openspec/changes/batch1-responsive/PROGRESS.md`；`openspec/changes/batch2-consistency/PROGRESS.md`；`openspec/changes/batch3-leftovers/PROGRESS.md`。
> 注（2026-11-19，batch5-cleanup W2）：本文提及的 6 个已删文件（`sidebar.tsx`、`agent-library.tsx`、`team-library.tsx`、`new-conversation-dialog.tsx`、`global-search-trigger.tsx`、`dir-picker-dialog.tsx`）即本批 §2 删除的文件；现入口见 `OVERVIEW.md`。历史叙述保留原样。

## 1. 经验资产页头吸顶是否恢复

- 现状：Top 5 把经验资产迁入 `PageShell` 后页头不再吸顶（改前自写外壳时页头吸顶）。第二批 B3 又把统计条改成默认收起的摘要行，首行 y 从 445 降到 328（1366），390 下从 773 降到 495。
- 任务：核实现状（页头、统计摘要行、搜索栏、Scope Tab 各自是否吸顶、滚动时表现），决定恢复吸顶还是保持现状，给出理由；若恢复，只吸顶页头一行（或页头+搜索栏，取其一并说明），复核 390/1366 下表现（吸顶后列表首行不被遮、横向无溢出）。
- 验收：决策写进 PROGRESS.md；若恢复，390/1366 滚动实测通过；若不恢复，理由成立（例如吸顶会吃掉本就紧张的纵向空间、或 PageShell 的滚动容器不支持）。

## 2. F1 死代码（AgentLibrary / sidebar.tsx）清理与否

- 现状（审计 + 第二批 B2/C2 复核）：`sidebar.tsx` 全仓无任何 import；`AgentLibrary` 唯一挂载点是 `sidebar.tsx:390` 的 `Sidebar`；`TeamLibrary` 唯一挂载点是 `AgentLibrary`；`NewConversationDialog` 同属死代码链（对话框溢出修复遗留⑤）。线上 Agent 库视图是 `agent-workspace.tsx` 自写列表，团队库与 Agent/团队行均不可达。
- 任务：全仓核实引用（`import`、动态 `import()`、字符串引用、测试文件、stories、 re-export），列出死代码链上的全部文件；若确认无任何引用且删除安全，删掉链上文件并修掉随之失效的 import/导出/测试；若有任何风险（例如某处动态引用、测试依赖、类型被别处 import），只报告不删，给出判断依据。
- 验收：核实方法与结论写进 PROGRESS.md；若删，`tsc` + `eslint` + 全量测试通过，且删除后回归截图（Agent 库主区、团队相关入口、设置等）无变化；若不删，理由逐条成立。

## 3. ArtifactWorkspace hover-only 按钮

- 现状：审计 F1/F2/F3 已由 Top 5 修掉（`focus-within` + 粗指针常显），`ArtifactWorkspace` 的同类 hover-only 按钮漏网（Top 5 遗留）。
- 任务：逐处核实 `artifact-workspace.tsx` 内的 hover-only 操作按钮（`opacity-0 … group-hover:opacity-100` 之类），按 Top 5 的同款修法（`focus-within` 显示 + 粗指针下常显，或收进“···”菜单，取其一并说明）。
- 验收：改后按钮在键盘 Tab 聚焦时可见、触屏（hover: none）下可见；1366/390 截图复核。

## 4. 390 下 DetailsPanel Tab 折行

- 现状：调试板检查器 `DetailsPanel` 的 6 个 Tab 在 390 下各标签折成两行，能点但拥挤（第一批遗留②）。
- 任务：改成可横滑（`overflow-x-auto` + `whitespace-nowrap`）或收紧字号/间距，实测 390 下 Tab 行不折行、横向可达、文档无横向溢出；1366 下表现不变。
- 验收：390 下 Tab 单行、全部可点；1366 回归通过。

## 5. 经验资产第 5 统计卡「0 次」换行 + B3 展开态标签换行

- 现状：窄卡内大字号值「0 次」断成两行（第一批遗留③）；第二批 B3 遗留：展开态第 2/4/5 张卡标签「已启用」「冷资产」「累计使用」折行，「25 次」断成两行。同类问题（统计卡内容宽度不足）。
- 任务：收紧卡片（字号/间距/内边距）或改文案（例如值与单位不拆行、用 `whitespace-nowrap`），实测 1366/390 下展开态 5 张卡的值与标签均不换行；1366 下主列 5px 溢出（第一批遗留①，统计卡趋势 svg 右沿超 5px，`scrollW 788 vs clientW 783`）一并看——若同根因（卡片内容超宽）就一起修，若无关则单独说明。
- 验收：5 张卡的值与标签在 1366/390 下均单行；文档无横向溢出。

## 6. 调试板空运行 / 无节点边界情况

- 现状：第一批只验证了有 run + 有节点的正向路径；空运行（无 Run）与无节点（空画板）边界态未补（第一批遗留④）。
- 任务：核实现状（空运行、空画板、无节点时各区域显示什么），补齐空态/错误态（复用 `EmptyState` 或现有空画板写法，不新造样式）；实测空运行与无节点两种边界。
- 验收：两种边界下页面有明确空态、无白屏、无报错、无横向溢出；有 run + 有节点回归通过。

## 7. 第三批验证遗留（小项）

逐项处理，能顺手修的修，修不了的列入遗留说清楚：

- 7a. 1200 字顶格团队行余量仅 12.4px（1366×768 下底边 755.6px）：评估再压间距或降上限的可行性，修或留遗留并说明。
- 7b. 团队 chip「需求到原型团队」折行（composer 固定 660px 下长队名折行）：收紧 chip（字号/内边距/`whitespace-nowrap` + 溢出处理）或接受现状并说明。
- 7c. debug-board in-graph rowGap：`src/lib/agent-run-debug-board.ts` 里的 `rowGap 340`、`runRowOffsetY 260` 等决定节点纵向间距与 fitView 缩小后的大面积留白；评估调整值，实测节点间距与 fitView 表现；`fitView` minZoom 0.1 一屏看全是既有行为，不动。
- 7d. PageShell 注释缺 Agent-library 一行：`workbench-primitives.tsx` 的 PageShell 注释补上 Agent 库（`max-w-none` 例）。
- 7e. README alt 文案不准：`README.md:64` / `README.zh-CN.md:64` 的 alt 对新图不准确，改准（只改文案，不动图）。
- 7f. 无 JS 时 `:root` 仍为 ink 浅色：评估把 `:root` 兜底换成当前默认主题（白·石墨）浅色 token 的可行性；有 JS 时防闪脚本首屏已写主题，不受影响；若换，核实有 JS 的首屏与无 JS 的首屏；若不换，说明理由。
- 7g. 500 字态 +10px 基线溢出：核实是否为既有基线、有无回归；能顺手修则修。
- 7h. inspector 工具条 1366 下内部滚动（488px，工具条内部可滚动、卡内不溢出、`spillVsCard=0`）：核实是否可接受；若能收紧则收紧，若是既有行为则留遗留并说明。

## 8. 第二批探针新发现（评估，不硬修）

- 8a. 390 下抽屉菜单导航后遮罩不自动关闭：核实（移动端抽屉里点导航项后遮罩仍在，须手动点遮罩关闭）；判断是不是本轮范围，能修则修（导航后关抽屉），不能修就写进遗留并说明原因。
- 8b. 390 下会话列表无入口：核实（会话列表在隐藏左栏里；第二批 W6 注：390 下会话按钮存在但不可见）；判断是不是本轮范围，能修则修，不能修就写进遗留并说明原因。

## 不在范围

- 白色主题 / 第一批 / 第二批已落地的改动（只读不碰）。
- 团队详情对话框溢出风险（用户未定夺，见 MEMORY 遗留）。
- 第二批遗留③的 G 范围外深色 `text-white` on accent（非切换控件，另立项）。
- 搜索结果行 JSON 原文渲染（第二批遗留⑥，既有问题，另立项）。
- POST /api/automations 建任务顺带建同名会话（第一批遗留⑥，是否合乎预期待确认）。

## 验证计划

- 每项 worker 自验：`npx tsc --noEmit`、eslint（改动文件）、相关 vitest、Playwright 实测截图。
- W6 集中验证：最终树状态下重跑 tsc / eslint（改动文件）/ 全量 `npx vitest run` / 干净生产构建（`rm -rf .next` 后串行构建，单次）/ Playwright 截图复核（重点：390 折行/换行、空态、死代码删除后的回归）。
- 证据：`~/workspace/frontend-polish-evidence/batch4-leftovers/`（`w1-*`～`w6-*`）。
- 记录：`openspec/changes/batch4-leftovers/PROGRESS.md` + `openspec/changes/frontend-polish/PROGRESS.md` 末尾加指向。
