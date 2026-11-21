# PROGRESS — 大检查 A 批 + B 批修复

- 状态：**实施完成，验证 25/26 通过；1 项残留（B10）待用户拍板**，未提交、未推送、未部署
- 批准：用户 2026-11-20 20:48 批准“A 批 + B 批一起修”
- 范围：A1–A9、B1–B15、V1–V4（提案 `proposal.md` 为实施契约；C–F 批未动）
- 工作树：本地 HEAD 5fb2598，未提交改动含上轮 B1+K1-K4（7 文件 + `specs/18-skills.md`）与本轮 17 文件；本轮未动上轮已修部分（A9 复核除外）

## 验证总览（2026-11-20）

| 检查 | 结果 |
|---|---|
| `tsc --noEmit` | 0 错误（2026-11-20 晚复核） |
| `eslint`（16 个改动/新增文件） | 0 错误；2 个既有警告（`app-workbench.tsx:864` logo `<img>`、`provider-config-dialog.tsx:98` 未使用的 `handleTest`） |
| 全量 vitest | 106 文件，**911 通过 / 4 跳过**（基线 904 + 7 新增，0 回归） |
| 生产构建 | BUILD_ID `fz58EaM8r4CbG9PTemM7qFri`（2026-11-20 12:59 UTC）；构建后查 BUILD_ID 确认，非只看退出码 |
| 生产探针 | Playwright，1366 + 390×844 双视口，**25/26 通过**；唯一失败 B10（见下） |
| 收尾 | 验证服务器（3101）已停；better-sqlite3 已切回 node ABI（137，可正常跑测试）；验证数据为副本，未动本地库 |

探针：`~/workspace/frontend-polish-evidence/audit-batch-a-b/verify.mjs`，结果 `verify-results.json`，截图同目录 `v-*.png`。

种子数据（验证用副本 `~/workspace/ab-verify-data`，由本地 `.agenthub-data` 复制后种入）：14 条 run（4 条今天 + 8 条昨天 + 2 条 10 天前，各 1500 token → 今日 6.0k / 本周 18.0k / 环比 +500%）、28/29 天前通知各 1 条、产物 1 个。注：验证中途运行环境重启清空了 `/tmp`，原 `/tmp/ab-verify-data` 与验证服务器一并丢失；副本已在 `~/workspace/ab-verify-data` 重建并完整重跑探针，数据口径与原来一致。

## A 批：数据正确性

### A1 D-P0-1 — 已修 ✅
- 改法：`analytics-workspace.tsx` 删 `trend > 100` 除以 100 的分支；抽出导出的纯函数 `formatTrendPercent`（趋势单位已是 %，直接渲染 `+200%`）与 `computeTokensTrend`。
- 验证：探针 `A1-runs-trend-500` 通过，徽章出现两个 `+500%`（运行数环比与 Token 环比各一）；`v-analytics-1366.png`。
- 回归测试：`src/components/analytics-workspace.test.ts`（新增，3 测试）含 `trend=200 → +200%`。

### A2 D-P0-2 — 已修 ✅
- 改法：`capability-center-workspace.tsx:303` 调用量卡改名“Token 用量”，`value = formatK(weekTokens)`，`trend: 0`，caption 只写 Token（`今日 6.0k · 本周 18.0k Token`）；删 `callVolume`、`allRuns`、`Math.max(1, …)`。
- 验证：探针 `A2-token-usage-card` 通过（页面含“Token 用量”、无“能力调用量”）；`v-capability-1366.png`。

### A3 D-P0-3 — 已修 ✅
- 改法：同文件，已绑定 Agent 卡 `trend: 0`（trendLabel/caption 不动）。
- 验证：探针 `A3-A4-A6-trends-dash` 通过，四张卡趋势位均为 `—`。

### A4 D-P0-4 — 已修 ✅
- 改法：同文件，MCP 卡 `trend: 0`（trendLabel/caption 不动；D-P1-2 属 C 批，未动）。
- 验证：同 A3。

### A5 D-P0-5 — 已修 ✅
- 改法：`information-center-workspace.tsx:693`，`formatRelativeTime` 中 `weeks < 4` → `weeks < 5`（28/29 天显示“4 周前”，不再出“0 个月前”）；函数已导出以便测试。
- 验证：探针 `A5-28d-shows-4-weeks` 通过——精确匹配时间 span 得到 `["4 周前", "4 周前"]`，无“0 个月前”。注：探针初版全文匹配曾误报 FAIL，原因是种子通知自身的标题/正文含有“28 天前”“0 个月前”字样；已改为只量时间 span，属探针 bug，非代码问题。`v-info-1366.png`。
- 回归测试：`src/components/information-center-workspace.test.ts`（新增，3 测试）含 `days=28/29` 不出“0 个月前”。

### A6 D-P1-1 — 已修 ✅
- 改法：同文件，Skills 卡 `trend: 0`（启用率留在 trendLabel/caption）。
- 验证：同 A3。

### A7 D-P1-3 — 已修 ✅
- 改法：`analytics-workspace.tsx:219-222`，`tokensTrend` 在 `prev<=0` 时返回 `null`（不伪装成 +0%），与 runsTrend 口径一致。
- 验证：`computeTokensTrend` 单元测试覆盖；探针 A1 的两个 `+500%` 徽章中 Token 环比为真实环比（种子上一周期 3000 token，本周期 18000 token）。
- 回归测试：`analytics-workspace.test.ts` 含 `prev=0 → null`。

### A8 D-P2-12 — 已修 ✅（1 处与提案有出入，见下）
- 改法：`mcp-server-service.ts`，`recordMcpServerHealth` 不再写 `updatedAt`（`schema.ts:688-691` 已有 `lastCheckedAt/lastCheckStatus/lastToolCount` 三列，无需 migration）。
- **与提案的出入（已解决，2026-11-20 21:52）**：提案写“只写三列”，初版把 `lastCheckMessage` 的写入保留了（当时担心删掉会使连接测试提示冻结）。用户指示“小偏差也顺手修了”后核查：`testMcpServerConnection` 把测试结果直接返回给调用方（前端显示的是接口返回的新鲜结果），且全仓 grep 确认没有任何界面代码读取 `lastCheckMessage`（只有 schema 列与 `api.ts:254` 类型字段），删写不会冻结任何提示。已按提案字面修：`recordMcpServerHealth` 只写三列，`McpServerHealthInput.message` 删除，`mcp-connection-test.ts` 3 处调用点不再传 `message`；回归测试扩展断言健康检查后 `lastCheckMessage` 保持 `null`。tsc 0、eslint 0、`mcp-server-service.test.ts` 6/6 通过。`lastCheckMessage` 列与读取映射保留（无 migration，旧值残留但无人读取）。
- 验证：回归测试已加入 `src/server/mcp-server-service.test.ts`（健康检查不动 `updatedAt`）；全量 vitest 通过。

### A9 D-P2-11 — 复核无改动 ✅
- 复核：上轮已修（skill `createdAt`/`updatedAt` 取文件 mtime）；本轮确认无回归，未重复改动。

## B 批：移动端与布局

### B1 L-P0-1 — 已修 ✅
- 改法：`analytics-workspace.tsx`，趋势图 SVG 去掉 `min-w-[440px]`。
- 验证：探针 `B1-chart-no-overflow-1366`（图宽 483.7，文档宽 1366）与 `B1-chart-no-overflow-390`（图右缘 350.8 ≤ 390，文档宽 390）均通过。

### B2 L-P0-2 — 已修 ✅
- 改法：同文件，TaskTable 分页移出 `overflow-x-auto` 容器独立成行并加 `flex-wrap`；页码按钮 `<sm` 隐藏，窄屏只留上一页/当前/下一页。
- 验证：`B2-pagination-outside-scroll`（`inScroll: false`，文案“共 12 条，第 1/2 页”）、`B2-page-numbers-visible-desktop`、`B2-pagination-outside-scroll-390`、`B2-only-prev-current-next-390`（页码 0 个、上一页可见）均通过。

### B3 L-P0-3 — 已修 ✅
- 改法：同文件，KPI 迷你图包在 `hidden sm:block` 里（`<sm` 隐藏）；数值加 `truncate`。
- 验证：`B3-sparkline-hidden-390`（宽 80 的迷你图 SVG 0 个可见）、`B3-values-not-clipped`（4 个数值 `scrollW == clientW`）均通过。注：探针初版把 KPI 标签图标也算成迷你图而误报 FAIL，已改为只数宽 80 的火花线 SVG，属探针 bug。

### B4 L-P0-4 — 已修 ✅
- 改法：`chat-panel.tsx` / `chat-toolbar.tsx`，对话标题 span 加 `title={conv.title}`；副标题 390 下隐藏（`hidden sm:block`）。
- 验证：`B4-title-attr`（title=“与 代码探索助手 的对话”）、`B4-subtitle-hidden-390` 均通过；`v-chat-390.png`。

### B5 U-P0-1 — 已修 ✅
- 改法：`chat-toolbar.tsx:39`，文件夹图标包在 `hidden lg:flex` 里（面板本身已是 `hidden lg:block`）。
- 验证：`B5-folder-hidden-390` 通过（390 下不可见）。

### B6 U-P0-2 — 已修 ✅
- 改法：退出条放在 `agent-run-debug-board.tsx` 内（非 `app-workbench`），因为 `focusMode` 是展板局部 state、`toggleFocusMode` 只翻转它，父级按钮无法退出展板全屏；左上角固定 `left-3 top-3 z-50` 的 Minimize2 图标 + “退出全屏”文字按钮，复用 `toggleFocusMode`；`analyticsFocusMode` 名字未动。
- 验证：`B6-exit-bar-fullscreen-390` 通过（全屏按钮已点、退出条找到且可见，位于 13,13）；`v-runboard-fullscreen-390.png`。

### B7 L-P1-1 — 已修 ✅
- 改法：`app-workbench.tsx:469`，移动顶栏品牌名包在 `hidden sm:inline` 里（分隔符 `·` 同样隐藏，`<sm` 只留视图名）。
- 验证：`B7-topbar-view-only` 通过（顶栏文本无“Multi-Agent TeamFlow ·”，文档宽 390）；`v-topbar-390.png`。

### B8 L-P1-2 — 已修 ✅
- 改法：`workbench-primitives.tsx:100`，PageHeader 描述 `line-clamp-2 sm:line-clamp-none`；actions 容器原本已有 `flex-wrap`，未改。
- **与执行过程的出入**：初版工人写成 `sm:line-clamp-1`，协调员已纠正——桌面原本不限行，提案只要求移动端放开到 2 行。
- 验证：静态复核 + 全量测试通过；无独立探针项（描述行无溢出，文档宽 390 各项均通过）。

### B9 L-P1-3 — 已修（复核后判定需改）✅
- 复核过程：上轮已删火花线、数值已 `truncate`；但用 fontTools 实测，`123.5k` 在 36px 下宽 104.7px，390 视口可用约 100px，6–7 位数仍会溢出，判定需改。
- 改法：`capability-center-workspace.tsx`，KPI 数值 `text-[36px]` → `text-[28px]`（固定高度保留）。
- 验证：`B9-kpi-value-28px-no-clip-390` 通过（4 张卡数值均为 28px，`scrollW == clientW`，含 `18.0k` 宽 72px）。

### B10 L-P1-4 — 已修，390 验收通过 ✅（2026-11-20 晚追加修复）
- 改法：`capability-center-workspace.tsx`，能力中心分页加 `flex-wrap`（本批）；用户 21:28 批准追加后，头部操作行与筛选行（搜索 + 排序）也加了 `flex-wrap`。
- **追加修第一轮未生效**：两行加 `flex-wrap` 后探针仍 FAIL，分页右缘仍是 440.3px，截图与上一轮字节相同——两行不是根因。
- **真根因（诊断脚本 `diag-b10.mjs` / `diag2-b10.mjs` / `diag3-b10.mjs`）**：能力网格 `<section class="grid gap-6 xl:grid-cols-...">` 在 <xl 下是隐式单列，`grid-auto-columns: auto`，实测 `grid-template-columns` 为 `424.297px`，而容器只有 356px——轨道被撑到内容最大宽度（卡片内截断描述等），卡片随之 424.3px 宽、被 `overflow-hidden` 的主容器裁掉右端。头部/筛选两行的最小内容宽只有 238px/113px，与 424px 无关；KPI 网格也不是驱动（min-content 103px）。
- **最终修法**：section 加 `grid-cols-1`（即 `repeat(1, minmax(0,1fr))`，轨道以容器为准，内容可收缩）；`xl:` 双列在 ≥1280px 下照常生效，桌面不受影响。头部/筛选两行的 `flex-wrap` 一并保留（窄屏下搜索框 238px + 排序按钮仍需换行）。
- 验证：生产构建 BUILD_ID `NnSw6ZYM9V4O7IOeSKNJI`，全量探针 **26/26 通过**，`B10-pagination-no-overflow-390` 右缘 440.3 → **372px**；全量 vitest 911/4，tsc 0，eslint 0。截图 `v-capability-390.png`（已更新）。验证服务器已停，better-sqlite3 已切回 node ABI。

### B11 L-P1-5 — 已修 ✅
- 改法：`automation-workspace.tsx:722, 800`，自动化操作组加 `max-md:opacity-100` + `group-focus-within:opacity-100`。
- 验证：`B11-actions-visible-390` 通过（5 个“运行”按钮，前 4 个透明度均为 1，文档宽 390）。

### B12 L-P1-6 — 已修 ✅（1 处同类追加）
- 改法：同文件，对话框内容 `px-7` → `px-4 sm:px-7`，两列网格 `grid-cols-2` → `grid-cols-1 sm:grid-cols-2`（:999、:1531）；**同对话框的 :1609“执行目标”网格有同样缺陷，一并改了**（同一对话框、同一类问题，PROGRESS 在此记录）。
- 验证：`B12-dialog-single-col-390` 通过（对话框内 3 个网格均为 1 列，文档宽 390）；`v-automation-dialog-390.png`。

### B13 L-P1-7 — 已修 ✅
- 改法：`artifact-workspace.tsx:777`，产物紧凑行日期 span 及其 `·` 分隔符加 `hidden sm:inline`，保留 Agent 名与版本号。
- 验证：`B13-date-hidden-390` 通过（`MM-DD` 格式日期 span 0 个，文档宽 390）；`v-artifact-390.png`。

### B14 L-P1-8 — 已修 ✅（390 仿真已复核）
- 改法：`settings/provider-config-dialog.tsx:280`，页脚 `DialogFooter` 加 `flex-wrap`（`flex flex-wrap items-center justify-between gap-2`）。
- 390 实际表现：页脚在 `<sm` 下本就经 tailwind-merge 走 `flex-col-reverse` 纵向两行（取消/保存一行，测试并拉取模型一行），`flex-wrap` 在此宽度是无操作的安全网、在 `sm+` 起作用；实测三按钮全部在视口内（右缘最大 254px），文档宽 390，无横向溢出。截图 `v-provider-footer-390.png` 目视确认。
- 验证：`B14-footer-390` 通过（页脚 class 含 `flex-wrap`，`flexWrap: wrap`，`flexDirection: column-reverse`）。
- 注：探针初版曾用 `has-text("配置")` 命中错误的按钮（首个匹配项是带角标的隐藏元素）导致点击超时；已改为精确文本匹配 + 真实鼠标点击，且页脚量测改为只量最上层（供应商配置）对话框——属探针 bug，非代码问题。

### B15 L-P1-9 — 已修 ✅
- 改法：`experience-library.tsx:234`，第 5 张 StatCard（累计使用）加 `max-sm:col-span-2`。
- 验证：`B15-fifth-card-full-width-390` 通过（展开统计后 5 张卡：前 4 张各 154.6px，第 5 张 322px 满宽，class 含 `max-sm:col-span-2`，文档宽 390）。注：统计默认收起为一行摘要，探针须先点“展开统计”再量测；初版未展开导致 `kids: []` 误报，属探针 bug。

## 探针调试中发现的产品外观察（未列入 A/B，不作结论）

- 移动端抽屉点选会话后，抽屉有时不自动关闭（探针因此一度在 `button[title="打开菜单"]` 上超时；抽屉关闭时离屏 `x=-320` 但宽仍 320，探针须按 `x >= 0` 判断开关态）。合成点击与真实触摸可能有差异，未深入定性，暂不立项。
- 供应商列表的“配置”按钮本身可点（真实鼠标点击已打开配置对话框）；探针早期的点击失败是定位器命中错误元素所致，非产品缺陷。

## 未解决 / 需用户拍板

1. ~~**B10 残留**~~——已修（见 B10 节，2026-11-20 晚，探针 26/26 通过）。
2. ~~**A8 偏差**~~——已修（见 A8 节，2026-11-20 21:52，用户指示“小偏差也顺手修了”）。
3. C–F 批：用户 2026-11-20 21:50 说“继续”，已立项 `openspec/changes/audit-batch-c-f/`，实施中。

## 证据

- 探针与结果：`~/workspace/frontend-polish-evidence/audit-batch-a-b/verify.mjs`、`verify-results.json`
- 截图：`v-analytics-1366.png`、`v-analytics-390.png`、`v-capability-1366.png`、`v-capability-390.png`、`v-info-1366.png`、`v-topbar-390.png`、`v-chat-390.png`、`v-runboard-fullscreen-390.png`、`v-automation-dialog-390.png`、`v-artifact-390.png`、`v-experience-390.png`、`v-provider-footer-390.png`
- 新增测试：`src/components/analytics-workspace.test.ts`、`src/components/information-center-workspace.test.ts`（共 7 个新测试；另有 `capability-center-workspace.test.ts`、`mcp-server-service.test.ts` 内新增用例）
