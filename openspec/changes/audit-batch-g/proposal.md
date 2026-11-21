# 大检查 G 批（剩余可修项）— 提案

- 日期：2026-11-20
- 背景：C–F 与 R1+R2 修完后，用户 2026-11-20 23:33 问“还有什么没修的”，23:35 说“能修的都修了”。本批收拢三处来源的可修项：(a) 11-19 调试板轮的 4 个遗留；(b) C–F 实施中发现、当时没动的 4 个小尾巴（cursor 同毫秒、C7 漂移、D-P2-1 分母、F16 全部已读）；(c) §7 里可修的 4 项；(d) 5 处只做了源码锁、没拿浏览器实测的验证缺口。
- 不在本批：**U-P2-1**（抽屉会话列表首屏外——改动会牺牲导航可达性，审计明确说需单独拍板， blanket 的“都修了”不算拍板）、**U-P2-4**（设置三入口是有意设计）、**L-P2-7**（首页数字当前未溢出，无物可修）。这三项的取舍已向用户说明。

## G1 调试板 4 项遗留（11-19 轮，须先探针复核现状）

来源：`openspec/changes/debug-board-spacing-graph/PROGRESS.md` 末节 leftovers（部署 #9 后记录）。先用生产模式探针（390×844 + 1366，调试板有运行数据的种子）逐项复核，**只修仍存在的问题**，已不存在的在 PROGRESS 记“复核已无此问题”并附截图：
- 队名标签在 390 下掉到首屏外；
- D4 重叠；
- 图太宽；
- 一条边擦过工具卡。
- 约束：用户 2026-11-19 已决定**不改调试板默认视图**，本项不动默认视图的决定；若其中某项的修法就是改默认视图，先停下、记入 PROGRESS 待用户拍板，不要擅自改。

## G2 通知分页 cursor 同毫秒跨页可能漏 1 条

`src/server/notification-service.ts:25, 112`：cursor 是裸 `createdAt` 毫秒值，`lt(createdAt, cursor)`。修法：cursor 改为 **`createdAt:id` 复合形式**，服务端按 `(createdAt DESC, id DESC)` 排序，id 做同毫秒 tiebreak；前端把 cursor 当不透明字符串透传；路由 zod 与 `lib/api.ts` 同步改。**兼容**：服务端同时接受旧数字 cursor（仅 createdAt），避免已打开的页面翻页报错。回归测试：同一毫秒两条通知跨页不丢不重。

## G3 首页测试数漂移（C7 根治）

`home-data.ts:221` 的手写数字随测试数漂移（975 → 978 已同步过两次）。修法：新增 **`scripts/sync-home-test-count.mjs`**——跑 `vitest run --reporter=json` 取通过数写回 `home-data.ts`；本批结束时跑一次，以最终全量为准。**不接 `next build`**（全量约 60s，会拖慢每次构建）；用法记入 PROGRESS 与脚本头注释。

## G4 D-P2-1 平均耗时与成功率分母对齐

`src/server/analytics-service.ts:360-361`：`successRate` 的分母 `finishedTotal` 来自按状态聚合（含“已结束但 `finishedAt` 为 null”的脏行），`avgDurationMs` 的 SQL 聚合排除了这类行，两口径至多差 1 行。修法：**成功率分母改用与 avg 相同的人口**（已结束且 `finishedAt` 非 null 的行）；KPI 的成功/失败/中止计数口径不动。回归测试：构造一条已结束但 `finishedAt` 为 null 的脏行，两口径一致。

## G5 「全部已读」只标已加载的通知

`information-center-workspace.tsx:282-288`：`markAllRead` 只传已加载页的未读 ids（`markNotificationsRead({ ids: unreadIds })`，`notification-service.ts:174`）。修法：**服务端支持不传 ids 即标全部未读**（`markNotificationsRead` 接受空 ids 语义，或新增 `markAllNotificationsRead`，实施时二选一，接口语义写进注释）；前端 `markAllRead` 改调它，不再只传已加载的 ids；按钮 disabled/title 语义不动。回归测试：未加载页的未读也被标已读。

## G6 §7 可修的四项

- **U-P2-3**：经验侧栏按钮改名「经验使用说明」（审计原文建议，一词改动）。
- **D-P2-3**：环形图取整改**最大余数法**，各片四舍五入后把残差补到最大一片，总和恒为 100%。
- **L-P2-2**：运行展板工具行窄屏**工具名允许两行**（保留时长/状态列，不隐藏信息）。
- **L-P2-3**：运行展板节点模型格改 **`col-span-2`**（或移入节点副行，实施时二选一，390 截图验证）。

## G7 补浏览器验证（5 处此前只做了源码锁）

- **E2**：Playwright 路由拦截让团队/供应商 DELETE 返回 500，确认删除失败弹窗不关且显示错误。
- **D8**：种子 55+ 条（最近更新或绑定关系其一），弹窗截断 50 条 + “共 N 条”。
- **E4**：无产物的数据库副本下，产物库空态「新建任务」点后进新建任务视图。
- **F8**：种子一个 MCP 服务器同步时间 >24h，自动化页显示 `MM-DD HH:mm 同步`。
- **F15**：打开设置对话框，页脚按钮文案为「关闭」（C–F 探针曾因入口选择器写错未覆盖；入口为侧栏齿轮按钮）。

## 验证

- `tsc --noEmit` 0 错误（直接跑 `./node_modules/.bin/tsc --noEmit`）；`eslint`（改动文件）0 错误。
- 回归测试：G2（同毫秒跨页）、G4（脏行口径）、G5（未加载页标已读）+ 全量 vitest（基线 978 通过 / 4 跳过，只接受新增）。
- 生产模式验证（`next build` + `next start`，数据用副本，不动本地库；构建前先 `node scripts/ensure-electron-sqlite.mjs`，查 `.next/BUILD_ID`）：390×844 + 1366 双视口 Playwright 探针 + 截图，逐项核对——G1 四项现状复核、G2 翻页不丢、G5 全部已读、G7 五项。G3 的同步脚本最后跑一次，首页数字以最终全量为准。
- 证据进 `~/workspace/frontend-polish-evidence/audit-batch-g/`（探针脚本、结果 JSON、截图）。

## 不做

- 不 commit、不 push、不部署。
- 不动 U-P2-1、U-P2-4、L-P2-7（见文首）。
- 不动调试板默认视图的决定；不接 `next build` 的测试数同步钩子。
- 不碰 A–F、R1+R2 已修的部分，除非复核发现回归。
