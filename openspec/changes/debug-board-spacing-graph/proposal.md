# 运行展板间距收紧 + 任务图 P1 修复

## 背景

2026-11-19 的运行展板任务图分析（`openspec/changes/debug-board-task-graph-analysis/analysis.md`，实测报告）发现两类问题：

1. **页头区太空（用户点名）**：标题卡 + 阶段条 + 工具栏吃掉 1366×768 视口约 321px（42%），任务图画布只剩 411px；两处空白带本身只有 21px，但与卡片 padding 连在一起，看着像两条通栏灰带。
2. **任务图本身（P1）**：图纵向空白 51%，fitView 缩到 0.125、字只有 1.5px；8 处边穿过非端点卡片；工具链边在扁平网格里蛇形交叉、工具无分组。

用户已定顺序：**先做 P0 间距收紧，再做 P1 三项（D1/D2/D3）**。

## 范围

- 只改运行展板相关代码：`src/components/agent-run-debug-board.tsx`、`src/components/workbench-primitives.tsx`（PageHeader/ PageCard，仅本页生效的扩展）、`src/lib/agent-run-debug-board.ts` + 其测试。
- 不动 PageShell 共享规范（`gap-4 lg:gap-5`、`p-4 lg:p-6`）；不加新依赖（dagre 之类一律不加）；不 commit、不 push、不部署。

## P0：间距收紧（只做“页内可动”组）

按分析报告 §0.4 的精确改法，共 6 项，1366 下预期省约 59px（画布 411→约 470px，+14%），1920 下省约 38px：

1. 标题卡 padding：`agent-run-debug-board.tsx:832` 的 PageHeader → PageCard，`p-4 sm:p-5`（21.25px）→ `p-3 sm:px-4 sm:py-3`（上下 12.75px）。注意：`PageHeader` 目前不接受 `className`（它直接渲染无参 `<PageCard>`），需给 `PageHeader` 加一个可选的 `className`（或 `compact`）透传到 `PageCard`，只本页用；不改其他调用处。
2. 阶段条卡：`agent-run-debug-board.tsx:950`，`h-12`（51px）→ `h-10`（42.5px），按钮 `h-8` 不变；顺手删掉已失效的死 class `py-0`（≥640px 时 `sm:p-5` 胜出）。
3. 主区画布 wrapper：`agent-run-debug-board.tsx:1015`，`p-2` → `p-1.5`。
4. 工具栏：`agent-run-debug-board.tsx:1218` 附近 CanvasToolbar 根，`min-h-11` → `min-h-10`，`py-1` 保留。
5. 标题 meta 行与面包屑间距：`workbench-primitives.tsx:99-107` 的 `mb-1`/`mt-1`（4.25px）各 → `mb-0.5`/`mt-0.5`（2.1px），**仅本页**——同样走 `PageHeader` 的新增 prop，不要改共享默认值。
6. 标题 meta 行 model id 截断：`agent-run-debug-board.tsx:849`，给 model span 加 `max-w-[220px] truncate`（面包屑标题已有同款 `max-w-[260px] truncate`；或复用节点卡片已有的 `compactModelName`）。

## P1-D1：图太稀疏，按实高收紧行高与间隙

改 `src/lib/agent-run-debug-board.ts` 的常量 + `estimateNodeHeight` 语义（实测折叠态卡高：agent 185.7、tool 138、message 160–182、run 130.5、summary 130.5）：

- worker 行高 380 → 约 250；工具行高 260 → 约 190；toolGridTopGap 200 → 约 120；summaryGap 220 → 约 120；Run→Orchestrator 210 → 约 170。
- `estimateNodeHeight` 从“保守上界”改为贴近实测折叠高（agent 320 → 约 200，tool 220 → 约 150；message/run/summary 按实测微调）；`toolGridOriginY`、`summaryPositionY`、`agentRunGraphExtent` 随之收紧。
- 注意：`src/lib/agent-run-debug-board.test.ts:1170-1293` 锁了 200/220/240 等数值，改后须同步更新测试（有意的、与代码一致的更新）。
- 已知取舍：收紧后展开态 Agent 卡（4 步约 340px）更容易压住下一行——这是 P2 的 D4（展开步骤封顶），本轮不修，但要在 PROGRESS.md 里写明。
- 预期：同规模图总高约 2840 → 约 1900px，fitView @1366 约 0.125 → 约 0.19。

## P1-D2：跨层边穿卡

- 删掉 Orchestrator→汇总直连边（汇总已由 worker 与尾工具收口，该边语义冗余）。
- worker→汇总改为只连**无工具**的 worker；尾工具→汇总保留。
- 改 `buildAgentRunDebuggerGraph` 末尾（`agent-run-debug-board.ts:569-576`）。
- 预期：汇总入边 7 → 约 3，穿层边基本消失。复测须用**逐像素路径求交**（分析报告的包围盒计数只是上界）。

## P1-D3/D5：工具链交叉、无分组

- 工具网格按 agent 分块排布（每 agent 一块，块内小网格，块间留空 + 组标签），链只在块内走。
- 改 `buildAgentRunToolDebuggerGraph`（`agent-run-debug-board.ts:582-700`）。
- 预期：链不再跨行跳跃，归属一目了然。组标签是画布内的展示元素（节点或分组背景），不要引入新依赖。

## 验证

- `npx tsc --noEmit` 0 错误；eslint（改动文件）0 错误；全量 vitest 保持 894/4。
- 干净生产构建 exit 0；Playwright 在 1366×768 / 1920×1080 / 390×844 下复测（复用分析轮的 `debug-graph-measure.mjs` 与造数思路，16 节点 21 边同一规模）：画布高度增量（P0 目标 1366 +59px）、fitView 缩放（D1 目标 @1366 约 0.19）、边与非端点卡片相交数（D2 目标约 0，逐像素）、工具链跨行跳跃数（D3 目标 0）、0 横向溢出；390 下阶段条与画布位置如实记录（D8 不在本轮，不用修，但别让它更差）。
- 隔离库验证，真实 `.agenthub-data` 不碰；验证服务用完停掉、隔离目录删掉。
