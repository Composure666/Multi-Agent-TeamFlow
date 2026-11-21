# 大检查 C 批（数据 P1 口径）+ D 批（一致性）+ E 批（失败反馈与删除校验）+ F 批（P2 扫尾）— 提案

- 日期：2026-11-20
- 背景：审计报告（`~/workspace/frontend-polish-evidence/big-frontend-audit-2026-11-20/REPORT.md`，新发现 67 条）把修复划为 A–F 六批。A+B 已修完并验收通过（`openspec/changes/audit-batch-a-b/`，探针 26/26，全量 vitest 911/4）。用户 2026-11-20 21:50 说“继续”，并指示 A8 的小偏差“顺手修了”。
- 已先行完成（不在本轮实施范围内，只复核）：**A8 偏差**——`recordMcpServerHealth` 已按提案字面只写三列（`lastCheckedAt/lastCheckStatus/lastToolCount`），`McpServerHealthInput.message` 已删，`mcp-connection-test.ts` 3 处调用点不再传 `message`，回归测试扩展断言健康检查后 `lastCheckMessage` 保持 `null`；核查确认无界面代码读取 `lastCheckMessage`（测试结果由 `testMcpServerConnection` 直接返回给调用方），删写不会冻结任何提示。tsc 0、eslint 0、`mcp-server-service.test.ts` 6/6 通过。`lastCheckMessage` 列与读取映射保留（无 migration）。
- 范围：审计报告 §8 的 C、D、E、F 四批，共 38 项（C 7 项、D 8 项、E 6 项、F 17 项）。§7 的 7 项不修（U-P2-1、U-P2-3 合并、U-P2-4、L-P2-7、D-P2-3、L-P2-2/L-P2-3），U-P2-3 的经验侧栏改名建议也不在本轮（§8 的 F 清单未列它）。

## C 批：数据 P1（口径类）

### D-P1-5 “今日”口径有时区 Bug：服务端按 UTC 午夜切分，00:00–08:00（CST）的数据被划到昨天

`src/app/api/usage/summary/route.ts:12-18, 76-77, 92-93`；`src/server/automation-service.ts:123, 156, 205`；`src/lib/api.ts:1710-1716` vs `:680`。`route.ts` 的 `startOfDay` 用服务端本地时区（容器为 UTC），`todayStart` = UTC 00:00 = 北京时间 08:00。修法：**`fetchUsageSummary` 与自动化 dashboard 也传 `tzOffsetMinutes`**（与 `fetchRunAnalytics` 的做法一致，`api.ts:680`），**服务端复用 `analytics-service.ts` 的 `resolveTzShift`/`startOfDay` 逻辑**，把“今日/本周/趋势分桶”统一按用户时区切分。补回归测试：一次发生在 CST 02:00（UTC 前一日 18:00）的运行必须计入“今日”，而不是昨天。

### D-P1-4 数据概览：Token 用量卡的火花线画的是运行次数

`src/components/analytics-workspace.tsx:369-372`（Token 卡）对比 `:359-362`（运行数卡）：两张卡的 `sparkline` 都是 `trend.map(p => p.value)`（`p.value` 为当日运行次数）。修法：**优先由后端按天聚合 Token**（runs 已有按天分桶，核查 token 字段是否可用；可用则在 `trend` 桶里补 `tokens` 并让 Token 卡画它）；**若无可用数据源，删掉 Token 卡的火花线，不许用运行次数冒充**。自动化卡 `:379-382` 同理：任务数本身是静态计数，**删掉它的火花线**（不要改画成功次数、不要改名）。

### D-P1-7 自动化：“今日较昨日”拿未过完的今天跟完整昨天比，且环比窗口不等长

`src/components/automation-workspace.tsx:1935-1938, 2231`；`src/server/automation-service.ts:156-167, 202-228`。修法：今日 delta 改为**“截至此时 vs 昨日同时段”**（同一时刻点比较）；环比窗口改用**等长日历区间**（7 个日历日 vs 前 7 个日历日），`trendTotal` 与上一周期窗口等长。补回归测试：同一时刻点的今日/昨日比较；两窗口等长。

### D-P1-6 数据概览：“全部”页签计数与副标题自相矛盾（截断时）

`src/components/analytics-workspace.tsx:502-503, 555`。`runs` 最多 2000 条，总量 5000 时副标题写 5000、页签写 2000。修法：**页签“全部”用 `totalRuns`**。

### D-P1-2 能力中心：MCP 卡“本周 N 次调用”调用的不是 MCP

`src/components/capability-center-workspace.tsx:299-304`（`caption: … · ${weekRuns} 次调用`，`weekRuns = usage?.week.runs` 为全站运行数）。修法：**删掉 caption 里的“· N 次调用”整段**（其余 caption 内容不动）。仓库内无 MCP 调用计数，不许现编；有埋点后再展示。

### D-P1-8 信息中心：只拉 80 条，却写“没有更多通知 / 今日通知已全部处理 ✓”

`src/components/information-center-workspace.tsx:144`（`fetchNotifications({limit: 80})`）、`:631-637` `ListEndMarker`。该页无分页，超过 80 条时列表被静默截断。修法：**接 cursor 分页的“加载更多”**（与 D 批 U-P1-5 合并实施，只做一次）；各分类 pill 计数改为**服务端聚合**（不再取自这 80 条）；标题栏“未读 N 条”已是全库计数，保持。补回归测试：超过 80 条时能继续加载，尾标不再谎称没有更多。

### D-P1-9 首页“数字证明”868 测试通过已过时

`src/components/home/home-data.ts:218-226`。仓库内全量 vitest 已是 911 通过（A+B 验收后实测）。修法：**改为实施结束时全量 vitest 的实测通过数**——这项必须最后做（C–F 会新增测试，数字随之变），以最终一次全量运行的结果为准。构建时自动生成的方案若能低成本实现可优先，否则手写并在 PROGRESS 里记下“随测试数漂移，需下次改测试时同步”的风险。不许再写未经核实的数字。

## D 批：一致性整改

### U-P1-3 PageHeader 三形态：产物库完全不用，图标/操作时有时无

`artifact-workspace.tsx:45, 434-440` 自写 `<h1>` + 自写搜索/操作行；`agent-workspace.tsx:467-470`、`analytics-workspace.tsx:294-296`、`automation-workspace.tsx:2192-2194`、`capability-center-workspace.tsx:621-625`、`information-center-workspace.tsx:290-294`、`experience-library.tsx:212-216`、`agent-run-debug-board.tsx:831-834`。修法：**产物库迁到 `PageHeader`/`PageShell`**（页头字号、卡片、间距与共享组件一致）；**`icon` 统一为全部传**（缺失的三页：Agent 库、数据概览、自动化，按各自已有视觉元素补图标；已有的四页保持）。迁移前后 390 + 1366 截图对比，产物库外观不得变差。

### U-P1-4 KPI 卡三套各自实现，数值字号与“趋势”语义都不一致

`analytics-workspace.tsx:595-640`（值 `text-[28px]`、sparkline、环比箭头）；`capability-center-workspace.tsx:261-340, 630-632`（另一套 `KpiCard`）；`automation-workspace.tsx:522-600, 2217-2218`（`DashboardTile`，值 `text-xl`、右上角操作按钮、底部 hint）。修法：**抽一个共享 `KpiCard`**（放 `workbench-primitives.tsx` 或新共享文件，props 覆盖值字号档、trend、sparkline（可选）、hint、actions），**三页全部迁移到它**；迁移前后截图对比，外观保持一致（能力中心趋势语义 A 批已修为 `trend: 0`，不动）。这是本轮最大的重构，单拎出来先做、单独验证，勿与其他项混在一个改动里。

### U-P1-5 分页 / 排序 / 加载方式每页一种，共 5 种

能力中心（分页 + 条数下拉 + 排序下拉）；数据概览（分页固定 10 条、无条数选择、无排序）；自动化（无分页、全量渲染 + 排序下拉 + 视图切换）；Agent 库与产物库（无限滚动、每批 12、无排序、无分页）；信息中心（无分页，`limit: 80` 硬上限）。修法：**信息中心按 D-P1-8 做“加载更多”（两项合并，只做一次）**；其余页**在列表头注明总数与加载方式**（如“共 N 条，每页 10 条”/“滚动加载，每批 12 条”），不强行统一交互。

### U-P1-6 空状态四种方言

共享 `EmptyState`（`workbench-primitives.tsx:128-160`）；`analytics-workspace.tsx:574` 自写 `PanelEmpty`；`automation-workspace.tsx:841` 自写 `MiniEmpty`；`capability-center-workspace.tsx:1592` 自写 `EmptyHint`（仅一行文字，无图标、无操作按钮）。修法：**三处自写空态并入 `EmptyState`（小尺寸变体）**；信息中心加载态手写加载卡（`information-center-workspace.tsx:380-387`）改用现成的 **`WorkspaceStateView`**（`workbench-primitives.tsx:184-218`）。

### U-P1-1 同一标签「查看全部」在 4 处是 4 种行为

`capability-center-workspace.tsx:1408, 1475, 1547`（开 `ShowAllDialog` 模态）；`automation-workspace.tsx:1199, 2429, 2522`（页内跳转 / 展开收起）；`information-center-workspace.tsx:656-662`（清空搜索与筛选）；`experience/experience-sidebar.tsx:102-108`（同页展开）。修法：统一文案语义——**弹窗用「查看全部」，页内跳转用「查看全部任务/记录」，清空筛选直接写「清除搜索与筛选」**（产物库空态就是后者，`artifact-workspace.tsx:601`）。

### U-P1-2 「绑定关系」卡是唯一没有「查看全部」的右侧卡

`src/components/capability-center-workspace.tsx:858-864`；`:1389-1410`。`BindingRelationsCard` 的 props 已定义 `onViewAll` 且有条件渲染，属未接线的死代码路径。修法：**补 `onViewAll={() => setShowAllSection('bindings')}`**。

### U-P2-8 排序控件两种形态

`capability-center-workspace.tsx:727-750`（排序下拉带 `DropdownMenuLabel`「排序方式」+ 选中态高亮）；`automation-workspace.tsx:2272-2290`（排序下拉无 Label，选中态仅变色无背景）；另自动化趋势图旁一个原生 `<select>`（`:2455-2468`）。修法：**统一用能力中心那套带 Label 的下拉**（自动化两处都改）。

### U-P2-2 「查看全部」弹窗：热门能力无上限、无搜索，recent 却只取 50 条

`src/components/capability-center-workspace.tsx:907-943`（最近更新 `rows.slice(0, 50)`）、`:947-984`（热门能力无 slice）；`ShowAllDialog`（`:1898-1924`）。修法：**两者统一截断为 50 条 + “共 N 条”**（不加搜索）。

## E 批：失败反馈与删除校验

### U-P1-7 多处失败只有 `console.error`，用户看不到任何反馈

`agent-workspace.tsx:306-316`（`startConversation`）、`:317-332`（`startTeamConversation`）、`:334-344`（`startTeamConversationById`）；`app-workbench.tsx:134-155`（`handleSummonTeam`）；`app-workbench.tsx:1731, 1740, 1752, 1764`（`ConversationListPanel` 的置顶/归档/重命名/删除）；`settings-dialog.tsx:296-356`（`handleSave`）。修法：**统一走各页已有的反馈通道**（`agentFeedback` / `InlineError` / `notifyAutomation`，按各页现状就近选用，不新发明通道）；`startConversation` / `startTeamConversationById` 补上进行中守卫（照抄同文件 `startPresetConversation`（`:289-303`）的 `startingPresetId` 防重模式）。`console.error` 可保留作日志，但用户侧必须有可见反馈。

### U-P1-8 删除操作不校验服务端返回，失败也当成功关弹窗

`team-detail-dialog.tsx:116-124`；`src/components/settings/provider-config-dialog.tsx:151-158`。`await fetch(..., { method: 'DELETE' })` 后不检查 `res.ok`，直接 `onDeleted?.()` / `onOpenChange(false)`。修法：**检查 `res.ok`，失败时 `setError` 并保持弹窗打开**（团队详情已有 `setError` 通道；供应商侧同理补）。补回归测试：DELETE 返回 4xx/5xx 时弹窗不关闭且显示错误（按现有测试风格，能测到哪层测哪层）。

### §6 两处裸 `confirm()` 改 Dialog（顺带，与 U-P1-8 同文件）

`team-detail-dialog.tsx:116`、`settings/provider-config-dialog.tsx:151`。修法：两处裸 `confirm()` 改为项目内已有的确认对话框模式（先找现成模式复用，没有则用 `ui/dialog` 做一个最小确认框）；删除确认仍走 U-P1-8 的 `res.ok` 校验。改完后全仓 grep 确认无裸 `confirm()` 残留。

### U-P1-9 产物库空态按钮文案与行为不符

`artifact-workspace.tsx:592-597`；`app-workbench.tsx:186`。无产物时按钮写“新建任务”，点击却只是 `setView('conversations')`（对话列表页）。修法：**onClick 改为新建任务**（`setView('new-task')`），文案不动。

### U-P1-10 对话页无会话空态没有可点入口

`chat-panel.tsx:111-129`。空态只有文字，无任何 `<Button>`。修法：空态加两个按钮——**「打开会话列表」（开抽屉/聚焦列表）与「新建任务」**。

## F 批：P2 扫尾

### L-P2-1 新建任务“最近团队”长队名会漫出 72px 格子撞邻项

`src/components/app-workbench.tsx:1654-1680`。队名 `whitespace-nowrap text-[11px]` 无 `truncate`。修法：队名加 **`max-w-[72px] truncate`**。

### L-P2-4 演示页顶栏在 390 下按钮换行

`src/app/demo/demo-showcase.tsx:83-110`。`跳过播放/重新播放 + 返回主页`因 `ml-auto` 换到第二行。修法：**窄屏按钮只留图标**（文字在 `sm+` 显示）。

### L-P2-5 设置里长 URL/端点被截断且无 `title` 兜底

`src/components/settings-dialog.tsx:852, 875, 907`。修法：三处都加 **`title={hint.url}`**（保留 `truncate`）。

### L-P2-6 信息中心通知目标标签在 390 下只剩 220px 上限且与操作按钮挤占

`src/components/information-center-workspace.tsx:544`。修法：目标标签上限改 **`max-w-[160px]`**。

### D-P2-1 数据概览：平均耗时是“最近 2000 条”的样本均值，成功率却是全量

`src/server/analytics-service.ts:340-350`；导出 `analytics-workspace.tsx:261-286`。修法：**平均耗时改服务端聚合**（`avg(finishedAt-startedAt)`，与成功率同口径）；**导出 JSON 时写入 `truncated: true`**（当 `runs` 被截断时）。补回归测试：平均耗时口径与成功率一致。

### D-P2-2 数据概览：子任务 Run 被计入总数、趋势与分布，且 KPI 不区分

`src/server/analytics-service.ts:217-300`；`analytics-workspace.tsx:833`。修法：**总数旁标注“含子任务”**（不做父/子切换）。

### D-P2-4 数据概览：“LIVE”徽章是假的——无轮询

`src/components/analytics-workspace.tsx:448-449`、`:986-993`。列表取自上次 `load()` 的快照，全文件无 `setInterval`。修法：**去掉 LIVE 徽章与脉冲绿点**（列表保留，标题仍为“最近运行动态”；不加轮询）。

### D-P2-5 自动化：同步时间超过 24 小时后只剩时钟，无日期

`src/components/automation-workspace.tsx:379-388` `formatSyncTime`。修法：`hours>=24` 时返回 **`MM-DD HH:mm 同步`**。

### D-P2-6 自动化：成功率环比的单位是“百分点”，却显示为“%”

`src/components/automation-workspace.tsx:1946, 2483-2484`。修法：显示为 **`↑ 2.5 个百分点`**（文案改，数值算法不动）。

### D-P2-7 运行展板：无步骤时进度条凭空显示 20%，且最小 8%

`src/components/agent-run-debug-board.tsx:1898, 1917`。修法：**无步骤且未完成时进度为 0%**，去掉 `Math.max(8, …)` 保底；已完成仍为 100%。补回归测试：无步骤的运行中任务进度为 0。

### D-P2-8 运行展板：相对时间缺“前”字，且无 Run 时用会话更新时间冒充

`src/components/agent-run-debug-board.tsx:3584-3595` `relativeTime`，`:3318, 3339`。修法：返回文案补**“前”**（“3 分钟前”/“2 小时前”/“5 天前”）；**无 Run 时显示“暂无运行”**，不再用 `conversation.updatedAt` 冒充。

### D-P2-9 Agent 库详情：写死的“刚刚”，时间列填状态词

`src/components/agent-workspace.tsx:1085, 1088-1090, 1352-1356`。修法：无真实会话/产物时**显示“—”**（行保留，时间列不再写状态词）。

### D-P2-10 产物库：“最近访问”实际是“最近创建”

`src/components/artifact-workspace.tsx:420, 659, 681`；`src/components/artifact-workspace-view.ts:74-76`。修法：**标题改为“最近创建”**（不接入访问记录）。

### U-P2-5 图标按钮普遍只有 `title`、无 `aria-label`

`app-workbench.tsx:456-464, 893-917`；`artifact-workspace.tsx:470-480`；`workspace-memory-button.tsx:234-240`；`chat-panel.tsx:TabButton` 关闭按钮。修法：所列图标按钮**统一补 `aria-label`**（`title` 保留作悬停提示）。

### U-P2-6 对话框关闭按钮文案是英文

`src/components/ui/dialog.tsx:75`（`sr-only` 写死 `Close`）、`:111-113`（`DialogFooter showCloseButton` 渲染字面 `Close` 按钮）。修法：**改为「关闭」**。

### U-P2-7 禁用态无解释

`information-center-workspace.tsx:296`（「全部已读」`disabled={unreadCount===0}`）；`capability-center-workspace.tsx:1420-1425`（绑定行按钮 `disabled={!firstAgentId}`）；`agent-run-debug-board.tsx:932`（「复制 Run ID」`disabled={!selectedRun}`）。修法：三处补 **`title` 说明禁用原因**。

### U-P2-9 自动化任务列表无分页、一次性全量渲染

`automation-workspace.tsx:2019-2033`（`sortedTasks` 全量）、`:2355`（网格渲染，无 slice/分页状态）。修法：**加分页（10 条/页），复用能力中心/数据概览已有的分页 UI 模式**（不做无限滚动）。

## 验证

- `tsc --noEmit` 0 错误（直接跑 `./node_modules/.bin/tsc --noEmit`；`pnpm typecheck` 在本机 VM 会先跑 `pnpm install` 预检并失败）；`eslint`（改动文件）0 错误。
- 回归测试：D-P1-5（CST 02:00 的运行计入“今日”）、D-P1-7（同时段比较、等长窗口）、D-P1-6（页签“全部”= `totalRuns`）、D-P1-8/U-P1-5（超过 80 条能继续加载）、D-P2-1（平均耗时服务端聚合口径）、D-P2-7（无步骤进度 0%）、U-P1-8（DELETE 失败弹窗不关）。相关测试 + 全量 vitest（基线 911 通过 / 4 跳过，只接受新增，不接受回归）。
- 生产模式验证（`next build` + `next start`，数据用副本，不动本地库；构建前先 `node scripts/ensure-electron-sqlite.mjs`，查 `.next/BUILD_ID` 不要只看退出码）：390×844 + 1366 双视口 Playwright 探针 + 截图，逐项核对——时区（种子一条 CST 凌晨运行）、Token 火花线（有真实按天数据则画线，否则无火花线）、自动化今日 delta、信息中心加载更多、产物库 PageHeader 迁移前后、共享 KpiCard 三页外观、空态/查看全部文案、删除失败反馈、对话空态按钮、演示顶栏、设置 title、P2 各项。U-P1-4（共享 KpiCard）与 U-P1-3（产物库迁移）是重构项，须做迁移前后截图对比。
- D-P1-9（首页 868）**最后做**：以最终一次全量 vitest 的实测通过数为准。
- 证据进 `~/workspace/frontend-polish-evidence/audit-batch-c-f/`（探针脚本、结果 JSON、截图）。

## 不做

- 不 commit、不 push、不部署。
- §7 的 7 项不修：U-P2-1（抽屉会话列表首屏外，有意取舍）、U-P2-3（三处指南不合并；经验侧栏改名也不在本轮）、U-P2-4（设置三入口有意设计）、L-P2-7（首页数字当前未溢出）、D-P2-3（环形图 0.1% 取整，sub-pixel 级）、L-P2-2/L-P2-3（运行展板窄列截断，有 `truncate` + `title` 兜底）。
- 不碰 A+B 已修的部分，除非复核发现回归（A8 偏差已由主代理先行修掉，见文首；C–F 实施只复核，不重复改）。
- 不改 `analyticsFocusMode` 的名字；不做移动端文件浏览器抽屉。
- B10 追加修的教训：隐式 `auto` 网格列会按内容最大宽度撑开——改网格时先量 `grid-template-columns` 的实测值，不要只信类名推断。
