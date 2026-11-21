# 进展 — 大检查 C 批 + D 批 + E 批 + F 批

- 日期：2026-11-20（用户 21:50 批准“继续”后实施）
- 实施方式：协调员 + 9 个并行子代理（每文件单代理串行），协调员收尾补 4 项（F3/F12/F14-app-workbench/D3）+ C2 自动化任务卡火花线 + D1 产物库图标 + 全部生产验证
- 状态：**37 项全部已修**（含 1 项复核无改动：A8 偏差，见末节）。未 commit、未 push、未部署。
- 计数说明：提案文首写“共 38 项（C 7、D 8、E 6、F 17）”，但提案正文 `###` 小节实为 37 个（E 批 5 节：U-P1-7/U-P1-8/§6/U-P1-9/U-P1-10），tasks.md 任务行同样为 37 行；“E 6 项”为提案笔误，本轮按 37 项实施、全部完成。
- 最终门禁：`tsc --noEmit` **0 错误**；`eslint`（改动文件）**0 错误**（仅 1 处 pre-existing warning：`app-workbench.tsx` 的 `<img>`，HEAD 已有）；全量 vitest **975 通过 / 4 跳过**（基线 911/4，新增 64，0 回归）；生产构建 BUILD_ID `ujNejwof5_8ZJEEIL5ycU`（2026-11-20 15:08，electron-node 构建）；验证服务器已停，better-sqlite3 已切回 node ABI。
- 证据目录：`~/workspace/frontend-polish-evidence/audit-batch-c-f/`（探针脚本 `final-verify*.mjs`、`baseline.mjs`、结果 JSON、截图 `after-*.png` / `before-*.png`、种子脚本 `final-seed.mjs`/`fix-seed.cjs`/`add-automations.cjs`、协调员日志 `coordinator-log.md`）

## C 批：数据 P1

### C1 D-P1-5 “今日”时区口径（W2 服务端 + 协调员生产验证）
- 改法：`usage/summary` 路由解析 `tzOffsetMinutes`；`automation-service.getAutomationDashboard(range)` 接受可选 `tzOffsetMinutes`；全部按天/按周/趋势分桶复用 `analytics-service.ts` 的 `resolveTzShift`/`startOfDay`（未另写切分）；`lib/api.ts` 的 `fetchUsageSummary` 与 `fetchAutomationDashboard` 始终传 `tzOffsetMinutes`（调用方不用改）；`automations/route.ts` 透传 tz（+4 行）。
- **行为变化（需用户知悉）**：`UsageSummary.week` 从滚动 7×24h 改为“今天 + 前 6 个日历日”（滚动窗口在时区下无意义；改动 1 行，可回退）。新增服务端字段 `AutomationStats.yesterdaySameTimeRunCount`（昨日 00:00 至此时刻，用户时区）。
- 回归测试：`route.test.ts` 3/3（CST 02:00 的运行计入“今日”）；`automation-service.test.ts` 15/15；`analytics-service.test.ts` 11 通过/2 跳过（跳过为 pre-existing）。
- 生产验证（API + 浏览器，CST 时区）：`GET /api/usage/summary?tzOffsetMinutes=-480` → `today.runs=5`（含种子 CST 02:00 运行；UTC 口径下为 4）、`week.runs=13`、`selected.runs=13`；数据概览页“今日=5”（探针 `final-verify2.mjs`，`C1 今日运行数=5` 通过）。

### C2 D-P1-4 火花线画错数据（W6 Token 卡 + 协调员补自动化任务卡）
- 改法：核查后端 trend 桶无按天 Token 数据（`RunAnalyticsTrendPoint` 只有 label/date/value/completed）→ **删掉 Token 卡的 `sparkline` prop**；自动化任务数卡同理删火花线。自动化工作台内唯一的火花线在「今日运行」卡，画每日运行次数、语义合法，**未删**。
- **出入（提案行号有误）**：提案/tasks 写“自动化任务数卡在 `automation-workspace.tsx:379-382`”，实查该卡在 **`analytics-workspace.tsx:377-385`**（`label="自动化任务"`，`sparkline={trend.map(p => p.completed)}`）。W8 按任务描述核查后未敢动错文件，协调员补删该行，并把 `analytics-workspace.test.ts` 的火花线计数断言由 3 改为 2，新增“自动化任务卡无火花线”锁（含 `sparkColorForTone('emerald')` 不再出现）。
- 验证：探针按卡逐一数 `svg[width=80]`——Token 0、自动化任务 0、Agent 运行数 1、任务成功率 1（`final-verify2.mjs`，C2 三项通过）。

### C3 D-P1-7 今日 delta 同时段比较（W2 服务端 + W8 UI）
- 改法：服务端 `getAutomationDashboard` 增加 `yesterdaySameTimeRunCount`（等长日历窗口：`prevStart = rangeStart - days·DAY_MS`）；UI 删 `todayTrendRuns/yesterdayTrendRuns`，改为 `todayRunCount - yesterdaySameTimeRunCount`，抽出可测纯函数 `computeTodayRunDelta`；`showTodayDelta` 守卫改为 `today>0 || yesterdaySameTime>0`；deltaLabel「较昨日」→「较昨日同时段」。环比 `runCountDelta`、hint「近 7 天合计」及「周期运行次数」文案按提案口径未动。
- 回归测试：`automation-service.test.ts` 15/15（等长窗口 + 同时段比较）；`automation-workspace.test.ts` 7 个新增（今天 3 vs 昨日同时段 8 → -5；+4、双 0 不显示、仅昨日有数）。
- 生产验证（CST）：`GET /api/automations?days=7&tzOffsetMinutes=-480` → `todayRunCount=2, yesterdaySameTimeRunCount=5`；自动化页今日运行卡显示 `2 -3 … 较昨日同时段`（`final-verify2.mjs`，C3 通过）。注：UTC 时区下同一页面显示 -1（2-3），属时区口径差异、非 Bug；探针必须用 `timezoneId: 'Asia/Shanghai'`。

### C4 D-P1-6 “全部”页签计数（W6）
- 改法：“全部”页签用 `totalRuns`。
- 验证：数据概览页点“全部”显示 13 条（种子 7 天内共 13 次运行）；副标题“范围内共 13 条（含子任务）”一致（探针 F6/C4 通过）。测试在 `analytics-workspace.test.ts`（相关 10/10）。

### C5 D-P1-2 MCP caption（W7）
- 改法：删 MCP caption 的“· N 次调用”整段，并删因此无用的 `weekRuns` 变量。
- 验证：能力中心页全文无“次调用”（探针通过）；相关测试 12/12。

### C6 D-P1-8 / D3 信息中心加载更多（W4）
- 改法：cursor 分页已在服务端存在（`listNotifications({cursor, limit})` + 路由 zod + api 透传），前端接 `loadMore()` + `appendNotificationPage()`（去重追加）；`ListEndMarker` 在 `hasMore` 时显示「加载更多」按钮，仅耗尽时显示“没有更多通知”；pill 计数改服务端聚合（新增 `getNotificationCategoryCounts()`，groupBy category + 复用 `getUnreadNotificationCount`；`listNotifications` 返回 `categoryCounts`；前端 `countForFilterWithCounts()`，加载前本地兜底；本地已读/删除本地递减，失败时重载校准）。
- 回归测试：`notification-service` 4/4（含 85 条分页 + 聚合用例）；`information-center-workspace` 7/7（含 4 个新增纯函数测试）。
- 生产验证（种子 88 行，1 条软删除 → 有效 87）：初始加载 80 条 → 点 1 次「加载更多」→ 85 条验证通知全出，尾标“没有更多通知”；pill「全部 87 / 未读 87 / 异常 21 / 任务 24 / 系统 21 / 配置 21」与服务端聚合一致（探针 `final-verify2.mjs`，C6 两项通过；`final-verify4.mjs` 补测“加载全部后点全部已读 → disabled + title”通过）。
- **已知局限（pre-existing 契约，未改）**：cursor 是裸 `createdAt` 毫秒值，同一毫秒内两条通知跨页时可能漏一条。

### C7 D-P1-9 首页数字（最后做，协调员）
- 改法：`home-data.ts:221` 的 `868` → **`975`**（最终全量 vitest 实测通过数）。
- 验证：最后一次全量 vitest **975 通过 / 4 跳过**（两次连续运行一致：14:57 与 14:58 各一次）；`/home` 数字证明区滚动后显示“975 测试通过”（探针 `final-verify5/6.mjs` 通过）。
- **漂移风险（提案已要求记录）**：该数字随测试数漂移，下次增删测试时需同步改；未做构建时自动生成（手写）。

## D 批：一致性整改

### D1 U-P1-3 PageHeader 三形态（W5 产物库迁移 + W6/W8/W3a 图标 + 协调员补产物库图标）
- 改法：产物库迁到 `PageHeader`/`PageShell`（PageShell 不滚动，外层 div 保留滚动容器 + ref，照抄 agent-workspace 模式；页头成独立卡片；详情面板移入内容列 flex；预览模式保留 padding）。图标统一全部传：数据概览 `BarChart3`（W6）、自动化 `Zap`（W8，本文件已有图标）、Agent 库 `Bot`（W3a，已引入）、能力中心 `Boxes`（HEAD 已有）、**产物库 `Layers`（协调员补——W5 迁移时漏传 icon，无工人接手；`Layers` 本文件已引入）**，并补源码锁测试。
- 验证：产物库页头标题与数据概览同为共享尺寸（`text-2xl` @ 17px 根字号 = 25.5px，探针 `final-verify3.mjs` 量得两页均为 25.5px）；产物库页头图标 chip 可见（`after-artifacts-1366.png`，Layers 图标在标题左侧）；迁移前后截图对比：`before-artifacts-*.png`（基线，错误态——种子产物 JSON 缺陷所致，见“种子缺陷”）vs `after-artifacts-1366.png`（正常卡片墙 + 最近创建条带 + 3 张卡片）；390 搜索框全宽、横向溢出 0px（探针通过）。

### D2 U-P1-4 共享 KpiCard（W1，单拎先做、单独验证）
- 改法：共享 `KpiCard` + `KpiTrend`/`KpiCardProps` 进 `workbench-primitives.tsx`（约 +250 行；内含 `KpiTrendBadge`/`KpiDelta`/`KpiSparkline`），迁移数据概览（4 卡）、能力中心（渲染点）、自动化（4 个 DashboardTile）。Props 覆盖值字号档（'28'/'xl'）、tone、chip、trend 三种语义（row/badge/delta）、可选 sparkline `{data, color}`、visual、caption、hint、action、className 等。能力中心趋势语义不动（`trend: 0`）。
- 出入：为像素级迁移多加了提案外的 props；sparkline 是 `{data, color}` 而非 `number[]`（tone→color 无干净映射）。Pre-existing 问题未动：两张同 tone 卡的 SVG gradient id 碰撞。
- 验证：相关测试 14/14；tsc 0；eslint 0。中点生产验证：能力中心 1366 前后视觉一致；自动化 1366 截图与基线字节一致（sha256 `f98c6bcb…`）；数据概览 1366 字节一致（sha256 `62441d3b…`）。终验截图：`after-analytics/capability/automation-{1366,390}.png`。

### D3 U-P1-5 列表头注明总数与加载方式（W4 信息中心部分 + 协调员补其余页）
- 改法：信息中心见 C6。其余页：数据概览已有“共 N 条，第 x/y 页”+“范围内共 N 条（含子任务）”；自动化经 F17 有“共 N 条，第 x/y 页”+ 运行历史“显示 X 条 / 共 N 条”；能力中心底部分页栏已有“共 N 个能力”+“N 条/页”选择器（总数与方式同栏可见，未另加）；**协调员补两处**：Agent 库精选区副标题加“· 共 {filteredPresets.length} 个，滚动加载，每批 {FEATURED_AGENT_PAGE_SIZE} 条”；产物库 tabs 下加“共 {filteredGroups.length} 组 · 滚动加载，每批 {ARTIFACT_GROUP_PAGE_SIZE} 条”。
- 验证：探针——Agent 库“共 33 个，滚动加载，每批 12 条”（`final-verify6.mjs` 通过）；产物库“共 3 组 · 滚动加载，每批 12 条”（`final-verify7.mjs` 通过）。源码锁：`workbench-failure-feedback.test.ts`（Agent）+ `artifact-workspace.test.ts`（产物库）。

### D4 U-P1-6 空态并入 EmptyState（W4/W6/W7/W8 + 协调员补 compact 变体）
- 改法：删数据概览自写 `PanelEmpty`（4 处 → `EmptyState`，W6）；删自动化自写 `MiniEmpty`（3 处 → `EmptyState`，W8）；删能力中心自写 `EmptyHint`（6 处 → `EmptyState`，W7）；信息中心加载卡 → `<WorkspaceStateView state="loading">`（W4）。
- **协调员补**：W6 指出 `EmptyState` 无尺寸变体（标准版是 py-10 的 PageCard，卡中卡），协调员给 `EmptyState` 加 **`compact` prop**（无卡片壳、py-8、size-8/size-4 图标），并把数据概览 4 处改成 `<EmptyState compact …>`；W7/W8 按补充说明同样用 compact 版。相关测试断言同步更新。
- 验证：各页相关测试通过（数据概览 10/10、能力中心 12/12、自动化 12/12、信息中心 7/7）。

### D5 U-P1-1 「查看全部」文案统一（W3b/W4/W7/W8 + 协调员源码核对经验栏）
- 改法：弹窗仍用「查看全部」（能力中心三处开 ShowAllDialog 模态，不动）；自动化页内跳转 →「查看全部记录」（最近运行记录卡头，`setActiveTab('recent')`）/「查看全部任务」（即将执行卡头，`setActiveTab('enabled')`），详情内展开/收起 →「展开运行历史」/「收起」（W8）；信息中心空搜索态 →「清除搜索与筛选」（W4）；经验栏两处「查看更多 (N)」→「展开全部 (N)」（W3b，审计原文误写为「查看全部」，实际是「查看更多」）。
- 验证：探针——自动化页同时含「查看全部记录/查看全部任务」；信息中心空搜索（填入不存在的关键词）出现「清除搜索与筛选」；经验栏 `experience-sidebar.tsx:93,135` 源码确认为「展开全部 (N)」/「收起」（种子无经验数据，浏览器探针无法触发，源码核对 + W3b 改动记录为准）。

### D6 U-P1-2 绑定关系卡补 onViewAll（W7）
- 改法：`BindingRelationsCard onViewAll={() => setShowAllSection('bindings')}`。附带必需改动：`ShowAllSection` 类型扩展为 `'recent' | 'hot' | 'bindings'`；新增 bindings 的 `ShowAllDialog` 分支（标题“绑定关系”，行与卡片一致，`jumpToAgent` 导航）；`bindingRelations.slice(0, 4)` 移到卡片调用点，弹窗拿全量。
- 验证：探针点绑定关系卡「查看全部」→ 弹窗标题“绑定关系”，底部“共 9 条”（`final-verify2.mjs`，D6/D8 通过）。

### D7 U-P2-8 排序控件统一（W8）
- 改法：自动化排序下拉加 `DropdownMenuLabel`「排序方式」+ `DropdownMenuSeparator`，选中态由仅变色改为能力中心同款高亮（`bg-[var(--agenthub-accent-soft)]`）；趋势图旁原生 `<select>` 改同一套 DropdownMenu（Label「趋势时间范围」，触发器保留 h-7 与 `aria-label`，`changeTrendRange` 调用不变）。
- 验证：探针——点“即将执行优先”（默认 sortKey='next'）→ 下拉含「排序方式」+ 4 个选项；点趋势触发器 → 下拉含「趋势时间范围」（`final-verify3.mjs` 通过）。注：v2 探针曾因默认排序文案写错（误以为“最近运行优先”）而误报，已纠正。

### D8 U-P2-2 弹窗截断 50 条 + “共 N 条”（W7）
- 改法：三处弹窗统一 `.slice(0, 50)`（最近更新已有、热门补 slice、绑定关系补 slice）+ 各自底部“共 N 条”（`capability-center-workspace.tsx:936,979,1027`）。
- 验证：绑定关系弹窗“共 9 条”（探针通过；9 条未达截断阈值，50 上限由源码 `slice(0, 50)` 三处 + 源码锁覆盖，未用 50+ 种子实测）。

## E 批：失败反馈与删除校验

### E1 U-P1-7 失败反馈（W3a）
- 改法：`agent-workspace.tsx` 3 个函数失败时写 `setAgentFeedback`，并给 `startConversation`/`startTeamConversationById` 补 `startingConversationId` 守卫（照抄 `startingPresetId` 单槽模式，key 为 `agent:<id>`/`team:<id>`）；反馈横幅移到 PageHeader 下方（两视图可见）；`startTeamConversationById` 原静默 `if (!data.team) return` 改为写反馈。**纠正审计**：`startPresetConversation` 实际并无失败反馈（catch 只有 `console.error`），已同样补上。`app-workbench.tsx`：召唤失败经 `summonError` + `TeamSummonDialog` 的 error prop 用 `InlineError` 展示（弹窗不关）；`uniqueAgentIds.length === 0` 的静默 return 改为写错误；`ConversationListPanel` 增 `listError`，置顶/归档/重命名/删除 4 个操作失败各写可见文案，删除失败同时在确认弹窗内显示。`settings-dialog.tsx`：`saveError` + `InlineError`（带重试，在页脚上方）；`DialogFooter` 改纵向（tailwind-merge 覆盖）。
- 验证：新增 `workbench-failure-feedback.test.ts` 10 个源码锁；相关测试 23/23；tsc 0；eslint 0（1 处 pre-existing warning：`app-workbench` 的 `<img>`）。探针：对话空态两按钮可见（E5 处一并验证）；删除失败弹窗不关见 E2。

### E2 U-P1-8 删除校验 res.ok（W3b）
- 改法：抽出可测的 `deleteTeamRequest`/`deleteProviderRequest`，检查 `res.ok`，失败 → `setError` 且弹窗不关（供应商侧补 `deleting`/`deleteError` + `InlineError`）。
- 回归测试：新增 14 个（team-detail-dialog 4、provider-config-dialog 4、debug-board 6），14/14；debug-board 既有测试 54/54。注：E2 测试覆盖 fetch 层（无 jsdom，弹窗不关未做组件级测试）。

### E3 两处裸 confirm() 改 Dialog（W3b）
- 改法：两处裸 `confirm()` 改为复用 agent-workspace 模式的确认 Dialog（`DIALOG_SIZE_CLASS.sm`，红色删除按钮）。
- 验证：**全仓 grep `confirm(` = 0 命中**（协调员复核，2026-11-20 终验时）。

### E4 U-P1-9 产物库空态按钮（W5）
- 改法：空态「新建任务」onClick 改为 store 的 `setWorkbenchView('new-task')`（与父级 `setView` 同函数；`onOpenConversations` 未动，仍被三处“打开会话”使用）。
- 验证：源码确认 `artifact-workspace.tsx:595` 为 `action={{ label: '新建任务', onClick: () => setWorkbenchView('new-task') }}`。注：种子有 3 个产物，浏览器探针无法触发空态，未做浏览器验证。

### E5 U-P1-10 对话空态按钮（W3b）
- 改法：聊天空态加「打开会话列表」（`setMobileSidebarOpen(true)`）+「新建任务」两个按钮。
- 验证：探针——工作台对话页空态下两按钮均出现（`final-verify.mjs`，E5 通过）。

## F 批：P2 扫尾

### F1 L-P2-1 队名截断（W3a）
- 改法：团队名 span 加 `max-w-[72px] truncate`（`app-workbench.tsx:1695`）。
- 验证：源码锁在 `workbench-failure-feedback.test.ts`（`max-w-[72px] truncate whitespace-nowrap`）；相关测试 23/23。

### F2 L-P2-4 演示顶栏窄屏只留图标（W3b）
- 改法：演示顶栏按钮文案包 `hidden sm:inline`。
- 验证：390 下演示顶栏按钮均无可见文案，label span 的 `display` 为 `none`（探针 `final-verify2.mjs`，F2 通过；顶栏外“在线演示 · 只读”徽章仍可见，属页面徽章、非顶栏按钮，不在 F2 范围）。截图 `after-demo-390.png`。

### F3 L-P2-5 设置长 URL 加 title（协调员补做——无工人认领）
- 改法：`settings-dialog.tsx` 移动端连接信息区两处截断长值加 title：hints 列表 `<p title={hint.url}>`；设备 token 行 `<p title={mobileDeviceToken}>`（该行不在 `hints.map` 作用域内，提案字面 `title={hint.url}` 无变量可用，取自身值；偏差已记入测试注释）。
- 验证：探针——设置对话框 →「移动端」tab，`p[title]` 含 `http://localhost:3101`（`final-verify8.mjs`，F3 通过）。源码锁在 `workbench-failure-feedback.test.ts`（F3 用例）。

### F4 L-P2-6 通知目标标签上限（W4）
- 改法：目标 label `max-w-[220px]` → `max-w-[160px]`。
- 验证：源码改动 + 信息中心相关测试 7/7。390 下信息中心横向溢出 0px（探针通过）。

### F5 D-P2-1 平均耗时服务端聚合（W2 服务端 + W6 导出）
- 改法：`avgDurationMs` 改 SQL 聚合 `avg(finishedAt-startedAt)`（仅已结束运行）；`truncated`/`total` 原已返回；导出时 `...(analytics?.truncated === true ? { truncated: true } : {})`（W6）+ 依赖数组修正。
- 回归测试：新增平均耗时测试 1/1（2100 条样本：样本均值 1000 vs 聚合均值 5714，可区分口径）。
- 边缘说明：聚合排除“已结束但 `finishedAt` 为 null”的脏行，成功率分母可能含这类行（至多差 1 行；正常行恒有 `finishedAt`）。

### F6 D-P2-2 总数标注“含子任务”（W6）
- 改法：副标题改为“范围内共 {totalRuns} 条（含子任务）”。
- 验证：探针截图可见“范围内共 13 条（含子任务）”（通过）。

### F7 D-P2-4 去掉 LIVE 徽章（W6）
- 改法：LIVE 徽章 + 脉冲绿点删除；时间线运行态的 `animate-pulse` 圆点未动（那是运行态本义）。
- 验证：数据概览页全文无 “LIVE”（探针通过）。

### F8 D-P2-5 同步时间 ≥24h（W8）
- 改法：`formatSyncTime`（已导出供测试）`hours>=24` 时由 `HH:mm 同步` 改为 `MM-DD HH:mm 同步`（手动 `padStart` 拼，不依赖 locale 的日期分隔符）；24h 内各分支不动。
- 回归测试：`automation-workspace.test.ts` 覆盖 ≥24h 分支（`11-19 14:32 同步`）及 24h 内/未同步分支。注：种子无 MCP 服务器，浏览器探针无法触发该分支，未做浏览器验证。

### F9 D-P2-6 成功率环比单位（W8）
- 改法：唯一渲染处 `↑ 2.5%` → `↑ 2.5 个百分点`，`↓` 同理；数值算法（`successRateDelta`）未动。delta 为 0 时显示“持平”（既有分支）。
- 验证（CST）：服务端 `previousSuccessRate=75`、当前 100 → 自动化页显示“↑ 25 个百分点”（`final-verify2.mjs`，F9 通过）。注：UTC 时区下前后窗口成功率均为 100%，delta 为 0 显示“持平”，属时区口径差异。

### F10 D-P2-7 无步骤进度 0%（W3b）
- 改法：导出 `currentTaskProgress(task)`——无步骤且未完成 = 0（原为 20），已完成 = 100，删 `Math.max(8,…)` 保底。
- 回归测试：debug-board 新增 6 个用例（在 W3b 的 14 个新增内），相关 54/54 通过。

### F11 D-P2-8 相对时间补“前”（W3b）
- 改法：`relativeTime` 加“前”（“3 分钟前”等）；无 Run 显示「暂无运行」（删 `conversation.updatedAt` 兜底）。
- 验证：探针——产物库页“1 小时前、2 小时前”；运行展板页“20 小时前、2 小时前”；信息中心“13 分钟前、1 小时前、昨天”（`final-verify2.mjs`，F11 两项通过）。

### F12 D-P2-9 Agent 详情时间列（协调员补做——无工人认领）
- 改法：`agent-workspace.tsx` 4 处占位 HistoryRow 的时间列由状态词改为“—”：`time="刚刚"`（精选 Agent 可直接开始）、`time="预设"`（preset 行）、`time="可用"`（新建单聊入口）、`time="已接入"`（产物库联动）。行保留。
- 验证：探针——点第一张精选卡片「详情」开详情面板，HistoryRow 时间列读得 `["—","—"]`，无状态词（`final-verify9.mjs`，F12 通过；截图 `after-agent-detail-1366.png`）。源码锁在 `workbench-failure-feedback.test.ts`（F12 用例）。

### F13 D-P2-10 产物库“最近创建”（W5）
- 改法：唯一可见的「最近访问」（`:660`）→「最近创建」+ 2 处注释修正；内部命名未动。
- 验证：探针——3 个产物时最近创建条带出现，列出“种子产物 / 种子产物二 / 种子产物三”，全文无“最近访问”（`final-verify2.mjs`，F13 通过）。注：条带仅在 `recentGroups.length >= 3` 时渲染（`:521`），1 个产物时不显示，属既有条件、非 Bug；为验证本项种子补到 3 个产物。

### F14 U-P2-5 图标按钮补 aria-label（W3b/W5 + 协调员补 app-workbench 四处）
- 改法：聊天 TabButton 关闭、workspace-memory-button 的 Pin/编辑/删除（W3b）；产物库网格/列表切换（W5）；**协调员补 app-workbench 四处图标按钮**（提案所列范围）：移动顶栏「打开菜单」、侧栏「设置」「收起侧边栏」「展开侧边栏」——`title` 保留，补同文案 `aria-label`。有可见文字的按钮（“设置”文字按钮、“产出：…”、“参考图”、“更多”、“写入审批”等）不需 aria-label，未动；「新建团队」圆形加号按钮不在提案所列范围内，未动（其可见文案在按钮外的 span 内，已在 PROGRESS 末节记为观察项）。
- 验证：探针——对话页 1 个带“关闭”aria-label 的按钮；产物库 1 个视图切换按钮带 aria-label；`button[aria-label="打开菜单"/"设置"/"收起侧边栏"]` 存在且 title 一致；收起侧栏后「展开侧边栏」出现且 aria-label 正确（`final-verify6/7.mjs` 通过）。源码锁在 `workbench-failure-feedback.test.ts`（F14 用例）。

### F15 U-P2-6 对话框关闭文案（W3b）
- 改法：`dialog.tsx` 两处 `Close` →「关闭」（`:75` sr-only 与 `:113` DialogFooter 按钮）。
- 验证：源码确认两处均为「关闭」；设置对话框探针曾因入口选择器未找到而未覆盖浏览器（入口为侧栏齿轮按钮，v1 探针选择器写错；F15 本身为两行文案改动，源码 + 相关测试为准）。

### F16 U-P2-7 禁用按钮补 title（W4/W7/W3b + 协调员探针纠正）
- 改法：信息中心「全部已读」加条件 title（`title={unreadCount === 0 ? "暂无未读通知" : undefined}`，W4）；能力中心绑定行按钮条件 title（W7；该分支几乎不可达，`bindingRelations` 已过滤 `agents.length > 0`，属防御性 title）；运行展板复制 Run ID 的 title 改为条件式（W3b）。
- 验证：探针——87 条未读时按钮启用且无 title（符合“仅禁用时解释原因”的语义）；先「加载更多」到没有更多、再点「全部已读」后按钮 disabled 且 `title="暂无未读通知"`（`final-verify4.mjs`，F16 通过）。注：`markAllRead` 只标记已加载的可见通知，未加载的 7 条需先加载更多才会一并标为已读——属实现语义，已在探针中按此顺序验证。

### F17 U-P2-9 自动化任务列表分页（W8）
- 改法：复用数据概览 TaskTable 的分页 UI 模式（非能力中心 0 起页码 + 条数下拉）：`TASK_PAGE_SIZE = 10`；`taskPage` state；`taskTotalPages/taskCurrentPage/pagedTasks`；网格/列表两处渲染改 `pagedTasks.map`；分页条（仅 `totalPages>1` 时显示）：“共 N 条，第 x/y 页”+ 上一页/下一页 + 页码按钮；`buildPageNumbers`（首页 + 当前附近 + 末页，省略号）为 analytics 同款实现的本地复制（该 helper 在 analytics 未导出且不许动那个文件，故复制而非 import）。回第一页的 effect 照抄能力中心写法，依赖不含 `displayTasks`（`nowMs` 每 60 秒刷新会换 identity，用它作依赖会每分钟把用户弹回第 1 页）。
- 验证：探针——13 个任务下“共 13 条，第 1/2 页 → 下一页 → 第 2/2 页”（`final-verify.mjs`，F17 通过）。

## 验证总账

- **tsc**：`./node_modules/.bin/tsc --noEmit` 0 错误（最终全量前最后一次：2026-11-20 14:58，C7 改动后）。
- **eslint**：改动文件 0 错误；唯一 warning 为 pre-existing（`app-workbench.tsx` 的 `<img>`，HEAD 已有）。
- **vitest 全量**：**975 通过 / 4 跳过**（113 个文件，基线 911/4 → 新增 64，0 回归）。新增构成（按实测全量计数，非各工人自报相加）：第一波后 948（+37）；第二波后 968（W6 +7、W7 +6、W8 +7，计 +20）；协调员补 C2 锁 + D1 产物库图标锁后 970（+2）；补 F3/F12/F14/D3 五锁后 975（+5）。另有一次全量曾因 better-sqlite3 处于 Electron ABI 而误报 23 失败/87 跳过——切回 node ABI 后复跑即恢复，属环境误报、非代码回归（教训已记入协调员日志）。
- **生产验证**：最终构建 BUILD_ID `ujNejwof5_8ZJEEIL5ycU`（2026-11-20 15:08，electron-node 构建；`pnpm build` 当天曾因 pnpm 自身 deps 检查异常快速退出且未更新 BUILD_ID，改走 `node scripts/run-electron-node.mjs … next build` 直接构建，BUILD_ID 为准）。`next start -p 3101`，`AGENTHUB_DATA_DIR=/tmp/cf-final-data`（`~/workspace/ab-verify-data` 的副本，验证中被探针改动过——已读标记、新增行——后按同一脚本重建过一次；本地库未动）。Playwright 探针（localhost，`timezoneId: 'Asia/Shanghai'`）：
  - `final-verify.mjs`（v1，UTC 时区）：32 项检查，16 通过 / 16 失败——失败全部定位为探针问题或种子问题（浏览器时区应为 CST、标签文案写错、h1 假设错误、种子通知 `source='verify'` 不在 `SOURCE_ICON` 映射内致信息中心整页 React #130 崩溃，见下），无一为代码回归；16 项通过中 E5/F6/F7/C4/C5/F17/D1 加载/F14/D5 均有效。
  - `final-verify2.mjs`（v2，CST 时区 + 修正探针 + 修正种子）：23 项检查，20 通过 / 3 失败——3 项失败经核查均为探针期望写错（D7 默认排序是“即将执行优先”非“最近运行优先”；D1 标题应为 25.5px 而非 24px；F16 title 只在 disabled 时出现），源码复核后逐项纠正。
  - `final-verify3.mjs`：3 项补测，D7/D1 通过；F16 因 `markAllRead` 只标已加载通知而未达 disabled。
  - `final-verify4.mjs`：F16 按“先加载全部再点全部已读”顺序重测，通过。
  - `final-verify5.mjs`：新构建下 C7=970、F13、产物库图标通过。
  - `final-verify6.mjs`：C7=975、F14 三处、D3-agent、D3-artifact 通过；F12 因探针点错“新建”按钮而中断。
  - `final-verify7.mjs`：F14 展开、D3-artifact 通过；F12 因卡片无 onClick（`onSelect` 在卡内「详情」按钮上）仍未打开详情。
  - `final-verify8.mjs`：F3 通过（移动端 tab 内 `p[title]="http://localhost:3101"`）；F12 因 `find` 命中外层 section 而未找到 article。
  - `final-verify9.mjs`：F12 点卡内「详情」按钮，详情时间列读得 `["—","—"]`，通过。
  - 截图：`after-{home,analytics,capability,automation,artifacts,info-center,agent,agent-detail,demo}-{1366,390}.png`（390 另有 `after-{analytics,capability,automation,artifacts,info-center}-390.png`；390 三页横向溢出均为 0px）。
- **A8 偏差复核**（提案文首要求只复核）：基线与终验两次确认——`recordMcpServerHealth` 只写 3 列，仓内无 `lastCheckMessage` 写点（仅 schema 列定义、初始化 null、读取映射、API 类型字段）；`mcp-server-service.test.ts` 6/6 通过。本轮无改动。

## 与提案的出入（汇总）

1. C2 行号错误：自动化任务数卡实际在 `analytics-workspace.tsx:377-385`，不在 `automation-workspace.tsx:379-382`；已在 analytics 文件内删除（见 C2）。
2. `week` 口径变化：滚动 7×24h → 今天 + 前 6 个日历日（见 C1）；新增字段 `yesterdaySameTimeRunCount`（见 C1/C3）。
3. F3：设备 token 行的 title 取自身值 `title={mobileDeviceToken}`（提案字面 `title={hint.url}` 在该行无变量可用）；hints 行按提案用 `title={hint.url}`。
4. F14：仅补提案所列范围（app-workbench 移动顶栏 + 侧栏三处）；「新建团队」圆形加号按钮（title 有、aria-label 无，可见文案在按钮外）不在所列范围，未动。
5. D1 标题字号：共享 PageHeader 为 `text-xl sm:text-2xl`，17px 根字号下 1366 视口实测 25.5px（中点记录的“24px”为 16px 根字号下的值，在本项目不适用）。
6. 探针时区：浏览器必须显式 `timezoneId: 'Asia/Shanghai'`，否则客户端 `getTimezoneOffset()` 为 0，C1/C3/F9 会按 UTC 口径显示（今日 4、delta -1、成功率“持平”），与服务端 CST 逻辑不符。

## 种子缺陷与探针事故（已处理）

- **产物种子 JSON 缺陷（pre-existing）**：`art_seed_01` 的 content 是字面文本“种子产物内容”，drizzle json 列读取时 `JSON.parse` 抛错，产物库页在基线与中点两次验证中均为错误态。终验种子将其改为合法 JSON 文档 `{"format":"markdown","content":"# 种子产物\n\n种子产物内容。"}`，页面恢复正常；另补 2 个产物使 RecentStrip（≥3 组才渲染）可验证。
- **探针种子通知 source 非法（探针事故）**：首版终验种子 85 条通知用了 `source='verify'`，不在 `SOURCE_ICON`（`ui/automation/conversation/agent_run/system`）映射内，行渲染 `<SourceIcon/>` 得到 undefined → React #130，信息中心整页崩溃。改为合法的 `'system'` 后恢复。此为种子数据问题，非代码回归；但暴露了一个 pre-existing 的健壮性缺口——未知 source 会让整页崩溃而非单行降级——**未修**（超出 C–F 范围，记在此处供日后决策）。
- **通知总数 87 vs 88**：88 行中有 1 条为软删除（`notif_w3verify`，`deleted_at` 已置，W3 验证用临时通知），列表与聚合正确排除，87 为正确值。
- **`pnpm build` 当天一次快速退出未更新 BUILD_ID**：改走 electron-node 直接构建并以 BUILD_ID 为准（见“验证总账”）。
- **一次全量 vitest 在 Electron ABI 下误报 23 失败**：切回 node ABI 后复跑恢复，属环境误报（见“验证总账”）。

## 主代理复核补记（2026-11-20 23:13–23:17）

- 全量 vitest 独立复跑初次结果为 **974 通过 / 1 失败 / 4 跳过**，与协调员报告的 975/4 不符。失败项为 C3 的 D-P1-7 回归测试（`automation-service.test.ts:507`，`expected +0 to be 1`）：测试用 `yesterdayStart + elapsed + 1h` 构造“昨日同时段之后”的运行，23:00 后该时间点溢出到今天（23:13 时为今日 00:13），导致昨日桶计数为 0。**测试本身的时间依赖 bug，生产代码无问题**（同时段口径判断正确）。
- 修复：种子时间改为截止点到午夜的中点（`yesterdayStart + elapsed + (DAY_MS - elapsed) / 2`），恒在昨天内且在同时段之后。修复后单文件 15/15、全量 **975 通过 / 4 跳过**，与 C7 首页数字 975 一致。tsc 0 亦独立复核通过。
- 探针结果文件说明：`after-final-results*.json` 是 v1–v9 的累计探针记录（v1 为 UTC 时区误报 16 失败，v2 起纠正为 CST），非单次全量结果；最终状态以本节复核（tsc 0、vitest 975/4、C7=975、截图）为准。

## 未解决 / 需用户拍板

1. C1 的 `week` 口径变化（滚动 → 日历日）与新增字段 `yesterdaySameTimeRunCount`：已实现并验证，未经用户确认。
2. W4 的 cursor 同毫秒边界问题（pre-existing 契约，见 C6）。
3. 信息中心未知 `source` 致整页崩溃的健壮性缺口（见上节）：是否单独立项修，待定。
4. F14「新建团队」圆形加号按钮无 aria-label（可见文案在按钮外）：提案未列，未动；是否补，待定。
5. C7 数字随测试数漂移（见 C7）。
6. 全部改动未提交、未推送、未部署（含 A+B、B10、A8 与本轮 C–F），待用户定提交/推送/部署节奏。
