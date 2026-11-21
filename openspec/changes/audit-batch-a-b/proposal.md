# 大检查 A 批（数据 P0）+ B 批（移动端 P0 与布局 P1）— 提案

- 日期：2026-11-20
- 背景：用户 2026-11-20 20:23 要求前端大检查；审计报告（`~/workspace/frontend-polish-evidence/big-frontend-audit-2026-11-20/REPORT.md`，新发现 67 条）把修复划为 A–F 六批。用户 20:48 确认“A 批 + B 批一起修”。B1 + K1–K4 已在上一轮修完（`openspec/changes/sidebar-brand-capability-timestamps/`），不在本轮。
- 范围：审计报告 §8 的 A 批与 B 批，共 24 项（A 批 9 项、B 批 15 项）。D-P2-11（`createdAt` 取文件 mtime）上轮已随 K1 修掉，本轮只复核，不重复立项。

## A 批：数据正确性 P0（均为单点改动）

### D-P0-1 数据概览环比 >100% 显示值被除以 100

`src/components/analytics-workspace.tsx:219-222, 623`。`runsTrend` 单位已是 %（如 +200），`:623` 的 `trend > 100 ? Math.round(trend/10)/10%` 分支又除了一次。修法：**删掉 `:623` 的 `>100` 分支**，统一渲染 `${trend}%`。补回归测试：`trend=200` → 显示 `+200%`。

### D-P0-2 能力中心“能力调用量”是 Token 数 ÷100，且永不为 0

`src/components/capability-center-workspace.tsx:262-266, 322-327`。仓库内无调用次数数据源。修法：卡片改名 **“Token 用量”**，`value = formatK(weekTokens)`；`trend: 0`（无上一周期数据，KpiCard 会渲染为“—”）；`trendLabel = \`今日 ${formatK(todayTokens)}\``；`caption = \`今日 ${formatK(todayTokens)} · 本周 ${formatK(weekTokens)} Token\``（删掉混单位的“累计 N 次”）。`callVolume`、`Math.max(1, …)`、`|| weekRuns` 一并删掉。

### D-P0-3 能力中心“已绑定 Agent”环比可达 +400%

同文件 `:272-275, 310`。基线是现编的。修法：`trend: 0`（渲染为“—”）；`trendLabel`、caption 保持原样（已是真实数字）。

### D-P0-4 能力中心 MCP 趋势把“少 N 个”显示为“-N%”

同文件 `:299`。修法：`trend: 0`；`trendLabel`（`${enabledServers} 个启用`）保持原样。caption 里“`${weekRuns} 次调用`”是 D-P1-2（C 批）的内容，**本轮不动 caption**。

### D-P0-5 信息中心 28/29 天前的通知显示“0 个月前”

`src/components/information-center-workspace.tsx:682-696`。`days=28` → `weeks=4`（不满足 `<4`）→ `months=floor(28/30)=0`。修法：`weeks < 4` 改为 **`weeks < 5`**（28 天 → “4 周前”，35 天 → “1 个月前”）。补回归测试：`days=28/29` 不出“0 个月前”。

### D-P1-1 能力中心 Skills 趋势徽章是“启用占比”，不是趋势

同文件 `:288-290`。`trend` 恒等于启用率且永远配上升箭头。修法：`trend: 0`；启用率保留在已有的 `trendLabel`/`caption`（`${enabled}/${total} 启用`）里。

### D-P1-3 数据概览 Token 环比 `prev=0` 时显示假的 +0%

`src/components/analytics-workspace.tsx:219-222`。`runsTrend` 在 `prevTotal<=0` 时为 `null`（卡片正确隐藏箭头）；`tokensTrend` 却返回 `0`。修法：与 `runsTrend` 一致，**`prevSelectedTokens<=0` 时返回 `null`**。数据概览 KpiCard 已支持 `trend: number | null`（null 时只渲染 caption），无需改组件。补回归测试：`prev=0` → `null`。

### D-P2-12 能力中心 MCP 的“最近更新”会被连接测试刷新

`src/server/mcp-server-service.ts:131-147` `recordMcpServerHealth` 写 `updatedAt: checkedAt`。已核查：`src/db/schema.ts:688-691` 的 `mcp_servers` 表已有 `lastCheckedAt` / `lastCheckStatus` / `lastToolCount` 三列，**无需 migration**。修法：健康检查只写这三列，不动 `updatedAt`。补回归测试：一次 `recordMcpServerHealth` 后 `updatedAt` 不变。

## B 批：移动端 P0 布局与出路 + 布局 P1

### L-P0-1 数据概览趋势图在 390 下横向溢出约 122px

`src/components/analytics-workspace.tsx:687`。SVG 写死 `min-w-[440px]`，卡片内宽仅 318px。修法：**去掉 `min-w-[440px]`**（`viewBox 560×200` 本已可等比缩放）。

### L-P0-2 数据概览任务表分页被塞进横向滚动容器

同文件 `:815, 876-922`。分页条在 `overflow-x-auto` 容器内、无 `flex-wrap`。修法：**分页移出滚动容器独立成行并加 `flex-wrap`**；窄屏只留上一页/当前/下一页。

### L-P0-3 数据概览 KPI 卡在 390 下数值与迷你图互顶

同文件 `:354, 596-640`。390 下单卡内宽 133px，数值 `text-[28px]` + 80px 迷你图（`shrink-0`）约 162px > 133px。修法：迷你图在 `<sm` 隐藏（`hidden sm:block`）；数值加 `truncate`。

### L-P0-4 对话顶栏 390 下标题只剩约 130px

`src/components/chat-panel.tsx:153-185`、`src/components/chat-toolbar.tsx:38-130`。修法：标题加 `title={conv.title}`；副标题在 390 下隐藏。

### U-P0-1 移动端（<lg）点“工作区”文件夹图标无任何可见反应

`src/components/conversation-workspace.tsx:96-103`、`chat-toolbar.tsx:38-40`、`chat-panel.tsx:161-164`。面板是 `hidden lg:block`，点按只改 store。修法：**`<lg` 时隐藏该图标**（`hidden lg:flex` 之类）。移动端抽屉版文件浏览器是后续功能，不在本批。

### U-P0-2 运行展板全屏时移动顶栏消失，退出只剩一个小图标

`src/components/app-workbench.tsx:178`、`agent-run-debug-board.tsx:552-556, 934-938`。`analyticsFocusMode` 使 `MobileWorkbenchTopBar` 整个不渲染。修法：全屏时仍保留一个**最小退出条**（固定定位，带文字的“退出全屏”按钮，常驻左上角或顶部）。`analyticsFocusMode` 这个名字误导，但本轮不改名。

### L-P1-1 移动顶栏品牌 + 当前视图名被截断，视图名先丢

`src/components/app-workbench.tsx:456-477`。390 下整段 `truncate` 文本只有 190px，品牌名约 140px + 视图名约 75px。修法：**品牌名在 `<sm` 隐藏**，只留视图名。

### L-P1-2 PageHeader 在 390 下标题与描述双重截断，actions 换行占 2–3 行

`src/components/workbench-primitives.tsx:84-106`。修法：描述在移动端放开到 `line-clamp-2`；actions 容器加 `flex-wrap`。

### L-P1-3 能力中心 KPI 卡固定高 140px，长数值会溢出

`src/components/capability-center-workspace.tsx:630, 1066-1110`。**上轮已部分修**：火花线已删、数值已加 `truncate`。本轮只复核：6–7 位数在 390 下是否仍溢出；若仍溢出则去掉固定高或数值降档到 `text-[28px]`。无问题则不改代码，只在 PROGRESS 里记一笔。

### L-P1-4 能力中心分页在 390 下临界挤压

同文件 `:797-852`。分页条无 `flex-wrap`，约 322px > 310px 内宽。修法：**分页加 `flex-wrap`**。

### L-P1-5 自动化卡片/列表行“运行 / 更多”按钮只在 hover 显示，触屏点不到

`src/components/automation-workspace.tsx:722, 800`。修法：操作组加 **`max-md:opacity-100`** 与 `group-focus-within:opacity-100`。

### L-P1-6 自动化创建/详情对话框在 390 下 `grid-cols-2` 每列仅约 145px

同文件 `:999, 1531`。修法：对话框内容在 `<sm` 改 `px-4`；两列网格改 `grid-cols-1 sm:grid-cols-2`。

### L-P1-7 产物库紧凑行在 390 下 Agent 名只剩约 50px

`src/components/artifact-workspace.tsx:746-780`。修法：底部行在窄屏**隐藏日期**，保留 Agent 名与版本号。

### L-P1-8 设置-供应商配置对话框页脚 4 个按钮在 390 下约超 36px

`src/components/settings/provider-config-dialog.tsx:179, 280-304`、`ui/dialog.tsx:105`。修法：页脚加 `flex-wrap`；390 仿真复核是否仍被 `tailwind-merge` 的 `flex-col-reverse` 兜底、确认单行/换行后的实际表现。

### L-P1-9 经验资产统计行在 390 下第 5 张卡独占一行留空

`src/components/experience-library.tsx:229`。修法：窄屏第 5 张卡 **`col-span-2`**。

## 验证

- `tsc --noEmit` 0 错误（直接跑 `./node_modules/.bin/tsc --noEmit`；`pnpm typecheck` 在本机 VM 会先跑 `pnpm install` 预检并失败，见上轮 PROGRESS 环境备注）；`eslint`（改动文件）0 错误。
- 回归测试：D-P0-1（`trend=200` → `+200%`）、D-P0-5（`days=28/29`）、D-P1-3（`prev=0` → `null`）、D-P2-12（健康检查不动 `updatedAt`）。相关测试 + 全量 vitest。
- 生产模式验证（`next build` + `next start`，数据用副本，不动本地库；构建前先 `node scripts/ensure-electron-sqlite.mjs`，切记查 `.next/BUILD_ID` 不要只看退出码）：390×844 + 1366 双视口 Playwright 探针 + 截图，逐项核对——数据概览趋势图/KPI/分页无溢出、能力中心 KPI 徽章正确、对话标题完整、移动端每个图标点下去都有可见反应、每个全屏都有可见出口、自动化对话框/供应商页脚 390 下无溢出、经验统计无空行。
- 证据进 `~/workspace/frontend-polish-evidence/audit-batch-a-b/`（探针脚本、结果 JSON、截图）。

## 不做

- 不 commit、不 push、不部署。
- C–F 批不在本轮（D-P1-5 时区 bug、D-P1-4 Token 火花线需后端聚合、D-P1-7 今日 vs 昨日、D-P1-8 80 条截断、D-P1-9 首页 868、D-P1-2 MCP 借用全站运行数、一致性整改、失败反馈、P2 扫尾）。
- 不改 `analyticsFocusMode` 的名字；不做移动端文件浏览器抽屉；不改 D-P0-4 的 caption（D-P1-2 属 C 批）。
- 不碰上轮已修的 B1 + K1–K4，除非复核发现回归。
