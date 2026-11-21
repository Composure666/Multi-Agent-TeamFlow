# 任务清单 — 大检查 A 批 + B 批

## A 批：数据正确性 P0

- [x] A1 D-P0-1 `analytics-workspace.tsx:623`：删 `trend > 100` 分支；回归测试 `trend=200` → `+200%`
- [x] A2 D-P0-2 `capability-center-workspace.tsx`：调用量卡改名“Token 用量”，`value = formatK(weekTokens)`，`trend: 0`，caption 只写 Token（今日/本周），删 `callVolume`/`Math.max(1,…)`/`|| weekRuns`
- [x] A3 D-P0-3 同文件：已绑定 Agent `trend: 0`（trendLabel/caption 不动）
- [x] A4 D-P0-4 同文件：MCP `trend: 0`（trendLabel 不动；caption 不动，D-P1-2 属 C 批）
- [x] A5 D-P0-5 `information-center-workspace.tsx:682-696`：`weeks < 4` → `weeks < 5`；回归测试 `days=28/29`
- [x] A6 D-P1-1 同文件：Skills `trend: 0`（启用率留在 trendLabel/caption）
- [x] A7 D-P1-3 `analytics-workspace.tsx:219-222`：`tokensTrend` 在 `prev<=0` 时返回 `null`；回归测试 `prev=0` → `null`
- [x] A8 D-P2-12 `mcp-server-service.ts:131-147`：`recordMcpServerHealth` 只写 `lastCheckedAt/lastCheckStatus/lastToolCount`，不动 `updatedAt`（列已存在，无需 migration）；回归测试
- [x] A9 D-P2-11 复核：上轮已修（`createdAt`/`updatedAt` 取 mtime），确认无回归，不重复改

## B 批：移动端 P0 布局与出路 + 布局 P1

- [x] B1 L-P0-1 `analytics-workspace.tsx:687`：去掉趋势图 `min-w-[440px]`
- [x] B2 L-P0-2 同文件 `:815, 876-922`：分页移出 `overflow-x-auto` 容器独立成行 + `flex-wrap`；窄屏只留上一页/当前/下一页
- [x] B3 L-P0-3 同文件 `:354, 596-640`：KPI 迷你图 `<sm` 隐藏；数值加 `truncate`
- [x] B4 L-P0-4 `chat-panel.tsx:153-185`、`chat-toolbar.tsx:38-130`：标题加 `title`；副标题 390 下隐藏
- [x] B5 U-P0-1 `conversation-workspace.tsx:96-103`、`chat-toolbar.tsx:38-40`：文件夹图标 `<lg` 隐藏
- [x] B6 U-P0-2 `app-workbench.tsx:178`、`agent-run-debug-board.tsx:552-556, 934-938`：全屏时保留最小退出条（带文字的“退出全屏”按钮）
- [x] B7 L-P1-1 `app-workbench.tsx:456-477`：移动顶栏品牌名 `<sm` 隐藏，只留视图名
- [x] B8 L-P1-2 `workbench-primitives.tsx:84-106`：PageHeader 描述移动端 `line-clamp-2`；actions 容器 `flex-wrap`
- [x] B9 L-P1-3 `capability-center-workspace.tsx`：复核（火花线已删、数值已 truncate）；6–7 位数仍溢出才改，否则只记 PROGRESS
- [x] B10 L-P1-4 同文件 `:797-852`：分页加 `flex-wrap`；追加：头部/筛选行加 `flex-wrap` + section 加 `grid-cols-1`（真根因为隐式 auto 轨道被撑到 424px，见 PROGRESS.md），390 分页右缘 440.3 → 372px，探针 26/26 通过 —— 代码已做并生效，但 390 验收未通过（分页右缘 440.3px，卡片被头部/筛选行撑到 424px）；彻底修需另给头部/筛选操作行加 `flex-wrap`，等用户拍板，见 PROGRESS.md §B10
- [x] B11 L-P1-5 `automation-workspace.tsx:722, 800`：操作组加 `max-md:opacity-100` + `group-focus-within:opacity-100`
- [x] B12 L-P1-6 同文件 `:999, 1531`：对话框内容 `<sm` 改 `px-4`；两列网格改 `grid-cols-1 sm:grid-cols-2`
- [x] B13 L-P1-7 `artifact-workspace.tsx:746-780`：底部行窄屏隐藏日期，保留 Agent 名与版本号
- [x] B14 L-P1-8 `settings/provider-config-dialog.tsx:179, 280-304`：页脚加 `flex-wrap`；390 仿真复核实际表现
- [x] B15 L-P1-9 `experience-library.tsx:229`：第 5 张 StatCard 窄屏 `col-span-2`

## 验证

- [x] V1 `./node_modules/.bin/tsc --noEmit` 0 错误；`eslint`（改动文件）0 错误
- [x] V2 回归测试（A1/A5/A7/A8）+ 全量 vitest
- [x] V3 生产模式验证：`ensure-electron` → `next build`（查 BUILD_ID）→ `next start`（数据副本）→ Playwright 390 + 1366 探针 + 截图，逐项核对；证据进 `~/workspace/frontend-polish-evidence/audit-batch-a-b/` —— 已跑完，25/26 通过，唯一失败 B10
- [x] V4 写 PROGRESS.md；tasks 全打勾
