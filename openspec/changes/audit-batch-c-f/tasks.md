# 任务清单 — 大检查 C 批 + D 批 + E 批 + F 批

## C 批：数据 P1（口径类）

- [x] C1 D-P1-5 `usage/summary/route.ts` + `automation-service.ts`：`fetchUsageSummary` 与自动化 dashboard 传 `tzOffsetMinutes`，服务端复用 `resolveTzShift`/`startOfDay`；回归测试：CST 02:00 的运行计入“今日”
- [x] C2 D-P1-4 `analytics-workspace.tsx:369-372` + `automation-workspace.tsx:379-382`：后端按天聚合 Token（有数据源则画线，无则删 Token 卡火花线）；自动化任务数卡删火花线
- [x] C3 D-P1-7 `automation-workspace.tsx:1935-1938, 2231` + `automation-service.ts:156-167, 202-228`：今日 delta 改为截至此时 vs 昨日同时段；环比窗口改等长日历区间；回归测试
- [x] C4 D-P1-6 `analytics-workspace.tsx:555`：页签“全部”用 `totalRuns`
- [x] C5 D-P1-2 `capability-center-workspace.tsx:299-304`：MCP caption 删“· N 次调用”整段
- [x] C6 D-P1-8 `information-center-workspace.tsx:144, 631-637`：接 cursor 分页“加载更多”；pill 计数改服务端聚合；与 U-P1-5 合并实施；回归测试：超 80 条能继续加载
- [x] C7 D-P1-9 `home-data.ts:218-226`：**最后做**，改为最终全量 vitest 实测通过数

## D 批：一致性整改

- [x] D1 U-P1-3 产物库迁到 `PageHeader`/`PageShell`；`icon` 统一全部传（Agent 库/数据概览/自动化补图标）；迁移前后 390 + 1366 截图对比
- [x] D2 U-P1-4 抽共享 `KpiCard`，三页全部迁移；迁移前后截图对比；单拎出来先做、单独验证
- [x] D3 U-P1-5 信息中心按 C6 做“加载更多”（两项合并，只做一次）；其余页列表头注明总数与加载方式
- [x] D4 U-P1-6 三处自写空态并入 `EmptyState`（小尺寸变体）；信息中心加载态改用 `WorkspaceStateView`
- [x] D5 U-P1-1 「查看全部」统一文案：弹窗「查看全部」/ 页内跳转「查看全部任务/记录」/ 清空筛选「清除搜索与筛选」
- [x] D6 U-P1-2 绑定关系卡补 `onViewAll={() => setShowAllSection('bindings')}`
- [x] D7 U-P2-8 排序控件统一用能力中心带 Label 的下拉（自动化两处都改）
- [x] D8 U-P2-2 「查看全部」弹窗统一截断 50 条 + “共 N 条”

## E 批：失败反馈与删除校验

- [x] E1 U-P1-7 失败反馈：`agent-workspace.tsx` 3 处 + `app-workbench.tsx` 召唤/列表 5 处 + `settings-dialog.tsx` 保存，走各页已有反馈通道；`startConversation`/`startTeamConversationById` 补进行中守卫
- [x] E2 U-P1-8 删除校验 `res.ok`：`team-detail-dialog.tsx:116-124` + `provider-config-dialog.tsx:151-158`，失败 `setError` 且弹窗不关；回归测试
- [x] E3 §6 两处裸 `confirm()` 改 Dialog（与 E2 同文件）；改完全仓 grep 确认无残留
- [x] E4 U-P1-9 产物库空态按钮 onClick 改为新建任务（`setView('new-task')`）
- [x] E5 U-P1-10 对话空态加「打开会话列表」与「新建任务」两个按钮

## F 批：P2 扫尾

- [x] F1 L-P2-1 队名加 `max-w-[72px] truncate`
- [x] F2 L-P2-4 演示顶栏窄屏按钮只留图标
- [x] F3 L-P2-5 设置三处长 URL 加 `title={hint.url}`
- [x] F4 L-P2-6 通知目标标签上限改 `max-w-[160px]`
- [x] F5 D-P2-1 平均耗时改服务端聚合；导出写 `truncated: true`；回归测试
- [x] F6 D-P2-2 总数旁标注“含子任务”
- [x] F7 D-P2-4 去掉 LIVE 徽章与脉冲绿点
- [x] F8 D-P2-5 `formatSyncTime`：`>=24h` 返回 `MM-DD HH:mm 同步`
- [x] F9 D-P2-6 成功率环比显示“↑ N 个百分点”
- [x] F10 D-P2-7 无步骤进度 0%，去掉 `Math.max(8, …)` 保底；回归测试
- [x] F11 D-P2-8 相对时间补“前”；无 Run 显示“暂无运行”
- [x] F12 D-P2-9 Agent 库详情无真实数据时时间列显示“—”
- [x] F13 D-P2-10 产物库标题改为“最近创建”
- [x] F14 U-P2-5 所列图标按钮统一补 `aria-label`（`title` 保留）
- [x] F15 U-P2-6 `dialog.tsx` 关闭按钮文案改为「关闭」
- [x] F16 U-P2-7 三处禁用按钮补 `title` 说明原因
- [x] F17 U-P2-9 自动化任务列表加分页（10 条/页，复用已有分页 UI 模式）

## 验证

- [x] V1 `./node_modules/.bin/tsc --noEmit` 0 错误；`eslint`（改动文件）0 错误
- [x] V2 回归测试（C1/C3/C6/F5/F10/E2）+ 全量 vitest（基线 911/4，只接受新增）
- [x] V3 生产模式验证：`ensure-electron` → `next build`（查 BUILD_ID）→ `next start`（数据副本）→ Playwright 390 + 1366 探针 + 截图逐项核对；U-P1-4 与 U-P1-3 做迁移前后截图对比；证据进 `~/workspace/frontend-polish-evidence/audit-batch-c-f/`
- [x] V4 C7 最后做：以最终全量 vitest 数改首页数字，重新验证首页截图
- [x] V5 写 PROGRESS.md；tasks 全打勾
