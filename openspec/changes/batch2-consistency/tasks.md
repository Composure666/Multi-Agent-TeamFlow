# 第二批：一致性收尾 — 任务清单

- OpenSpec：`openspec/changes/batch2-consistency/proposal.md`
- 基线：HEAD `c383a4a`；vitest 888 通过 / 4 跳过；构建 BUILD_ID `qsb0rLVYe7dZR7BgnBm8Z`；白色主题（5 文件）+ 第一批（7 文件）改动未提交（不动）。
- 铁律：不 commit、不 push、不部署；不引入新依赖；不碰第三组。
> 注（2026-11-19，batch5-cleanup W2）：本文提及的 `sidebar.tsx`、`agent-library.tsx`、`team-library.tsx`、`new-conversation-dialog.tsx`、`global-search-trigger.tsx`、`dir-picker-dialog.tsx` 已于 2026-11-18 batch4 §2 删除；现入口：侧栏→`app-workbench.tsx` 内联 `wb-sidebar`、Agent 库→`agent-workspace.tsx`、会话创建→新建任务视图。历史叙述保留原样。
- 并行须知：多 worker 会改同一文件（如 `experience-library.tsx`、`automation-workspace.tsx`、`artifact-library.tsx`、`src/app/deployments/page.tsx`、`settings-dialog.tsx`）。只做手术式 `muse.edit`（exact old_text，锚点唯一），**绝不整文件重写**；改前重读目标区域；edit 撞上已变的文本时重读再试，不要强行覆盖他人的改动。

## W1 — G 切换控件统一为两种（M）

- [ ] 读审计 G1 六处 + 全仓 grep 盘点审计之外的切换样式（`Tabs` 其他用法、pills、`toggle` 类名），有则一并收敛或在汇报里写明为何保留
- [ ] 定两种标准切换：二选一视图用分段控件（Agent 库侧栏样式 `agent-library.tsx:66-81`）；多选筛选 pills 统一激活色为 accent（自动化 `bg-slate-900` 改掉）；Agent 库主区两个 outline 按钮（`agent-workspace.tsx:497-530`）合并为分段控件；经验资产 Scope Tab 与数据概览 Tabs 按语义归入两种之一，不留第三种
- [ ] 自验：tsc + eslint（改动文件）+ 相关 vitest；`next build` + `next start -p 3151` 截图复核（六处浅/深，激活态可辨），服务用后停掉
- [ ] 证据进 `~/workspace/frontend-polish-evidence/batch2-consistency/w1-*`；汇报：盘点结果、每处归入哪种、实测截图、遗留

## W2 — B1+B2+B3+B4 密度与间距（M）

- [ ] B1：grep 核实全部 KPI 区；统一 `gap-3 lg:gap-4`，能力中心 `gap-6` 改过来
- [ ] B2：三处侧栏行（Agent `agent-library.tsx:119` / 团队 `team-library.tsx:110` / 产物 `artifact-library.tsx:210`）统一为一档（二选一并写进注释成规范）
- [ ] B3：`experience-library.tsx` 四层头栏收敛（三选一：统计条可折叠 / Scope Tab 并入搜索筛选栏同一行 / slogan 删除或移到空态文案）；实测 1366 下列表首行 y 坐标改前改后对比；G 动过 Scope Tab 样式的以 G 定稿为准，本项只做结构收敛
- [ ] B4：核实 `automation-workspace.tsx` 根容器两处 `overflow-hidden` 是否真的重复（注意 `agenthub-card-container` 本身是否带 overflow）；删一处留一处
- [ ] 自验：tsc + eslint（改动文件）+ 相关 vitest；`next build` + `next start -p 3152` 截图复核（KPI gap、侧栏行高、头栏收敛前后、布局对照），服务用后停掉
- [ ] 证据进 `~/workspace/frontend-polish-evidence/batch2-consistency/w2-*`；汇报：四项各自的改法与实测数字、遗留

## W3 — C1+C2+C3 空/加载/错误态 + E4（S×4）

- [ ] C1：`artifact-library.tsx:175-183` 加载态补「重新加载」按钮（与团队库同一写法；能复用 `WorkspaceStateView` 的 `onRetry` 就复用）
- [ ] C2：团队库（`team-library.tsx:90-101`）与部署页（`src/app/deployments/page.tsx:35-44`）手写空态改 `EmptyState`；文案与按钮行为与原版一致
- [ ] C3：`notification-center.tsx:148-165` toast 加「查看全部通知」文字入口，点后跳信息中心（沿用站内已有导航写法；先核实「打开」按钮的跳转目标，避免冲突）；5.2s 自动消失不变
- [ ] E4：`artifact-library.tsx:296` 删除确认 Dialog 补 `className={DIALOG_SIZE_CLASS.sm}`（与 Agent 库删除确认同宽）
- [ ] 自验：tsc + eslint（改动文件）+ 相关 vitest；`next build` + `next start -p 3153` 截图复核（加载重试、两处空态、toast 入口与跳转、删除确认宽度与 0 溢出），服务用后停掉
- [ ] 证据进 `~/workspace/frontend-polish-evidence/batch2-consistency/w3-*`；汇报：四项各自的改法与实测数字、遗留

## W4 — E3+I1+I2+J1+D6+D7+F4（S×7）

- [ ] E3：`global-search.tsx:79-82` 尺寸改走 `DIALOG_SIZE_CLASS.md`；错误态「清空搜索」改为「重新搜索」（保留查询重试一次）；`top-[12%]` 去留核实后决定并写明理由
- [ ] I1：`settings-dialog.tsx:477-495` 的「Key 说明」固定化（二选一：移到「供应商」面板内部作说明块，或固定显示、点它跳供应商分区）；**只改这一处，不得碰该文件里白色主题改过的外观区**
- [ ] I2：`agent-run-debug-board.tsx` 面包屑末级 Run 与元信息行 Run label 二选一去重；全页只剩一处
- [ ] J1：`agent-create-wizard.tsx` 指示器二选一（改两步指示，或生成中第 2 步置 loading 当前态）；Q21「不拆屏」决策不动
- [ ] D6：`src/app/deployments/page.tsx` 页顶加「← 返回工作台」链接，点后回工作台
- [ ] D7：`agent-run-debug-board.tsx:825` 图标块 `mt-4` 改 `self-center`/行内对齐，去掉 `mt-4`
- [ ] F4：`horizontal-scroll-controls.tsx:51-55` 箭头二选一（触屏常显，或去掉箭头只留滑动）
- [ ] 自验：tsc + eslint（改动文件）+ 相关 vitest；`next build` + `next start -p 3154` 截图复核（搜索弹窗、设置导航、调试板 Run label 与图标对齐、向导步数、部署页回链、滚动箭头），服务用后停掉
- [ ] 证据进 `~/workspace/frontend-polish-evidence/batch2-consistency/w4-*`；汇报：七项各自的改法与实测数字、遗留

## W5 — G 之外的收尾核对（不做，见注）

> 本轮不设 W5 独立实现 worker：G（W1）、B（W2）、C+E4（W3）、E3/I/J/D/F（W4）已覆盖十六项。W6 为集中验证。

## W6 — 集中验证 + 记录（W1–W4 全部收齐后）

- [ ] 树完整性：`git status --short`（只应有本轮改动 + 白色主题 5 文件 + 第一批 7 文件未提交 + `openspec/changes/batch2-consistency/`）；HEAD 仍为 `c383a4a`
- [ ] 最终树状态下重跑：`npx tsc --noEmit`、`npx eslint`（全部改动文件）、全量 `npx vitest run`、干净生产构建（`rm -rf .next` 后构建，串行，记录新 BUILD_ID）
- [ ] Playwright 截图复核十六项（重点 G 收敛、B3 头栏、C1/C2/C3 空/错态、E3/E4 对话框、D6/D7）；每项给实测数字
- [ ] 验证种子清理干净；证据汇总进 `~/workspace/frontend-polish-evidence/batch2-consistency/`（w6-* + 测量 json）
- [ ] 写 `openspec/changes/batch2-consistency/PROGRESS.md`（分工、每项改法、验证数字、遗留）；`openspec/changes/frontend-polish/PROGRESS.md` 末尾加指向一节
- [ ] 汇总汇报：十六项逐项状态 + 验证数字 + 遗留
