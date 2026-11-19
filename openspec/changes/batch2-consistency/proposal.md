# 第二批：一致性收尾（batch2-consistency）

> 注（2026-11-19，batch5-cleanup W2）：本文提及的 `sidebar.tsx`、`agent-library.tsx`、`team-library.tsx`、`new-conversation-dialog.tsx`、`global-search-trigger.tsx`、`dir-picker-dialog.tsx` 已于 2026-11-18 batch4 §2 删除；现入口：侧栏→`app-workbench.tsx` 内联 `wb-sidebar`、Agent 库→`agent-workspace.tsx`、会话创建→新建任务视图。历史叙述保留原样。

## 背景

- 来源：`~/workspace/frontend-polish-evidence/module-audit-2026-11-18.md`（2026-11-18 下午只读审计，A–J 共 10 组问题）。
- Top 5（D1、H1、A1+A2+A3、F1+F2+F3、E1+E2）已在 `openspec/changes/module-audit-top5/` 做完；第一批（D2、D3、D4、D5、H2、C4）已在 `openspec/changes/batch1-responsive/` 做完并通过验证（vitest 888/4，构建 BUILD `qsb0rLVYe7dZR7BgnBm8Z`）。
- 其后第三批（batch3-leftovers）与白色主题（white-themes，默认白·石墨）已做完；当前基线：**vitest 888 通过 / 4 跳过**，HEAD `c383a4a`，白色主题 + 第一批改动均未提交。
- 用户 2026-11-18 ~20:22 拍板「三批按顺序都做」：第一批 → 第二批 → 第三组。本 change 只做第二批十六项（G、B1、B2、B3、B4、C1、C2、C3、E3、E4、I1、I2、J1、F4、D6、D7），不碰第三组（经验资产页头吸顶、F1 死代码、ArtifactWorkspace hover-only、390 DetailsPanel Tab 折行、「0 次」换行、调试板空态边界）。
- 审计结论均为源码静态核对（审计时本地服务未跑）；第一批已证实审计有三处与实测不符（D3 已被 Top 5 的 flex-wrap 解决、H2 深色问题比审计说的严重、C4 file-tab 的 confirm 不在 Tab 关闭而在编辑退出）。**本轮每项都要实测复现后再修**，审计行号以 worker 实测为准，行号漂移了以 grep 为准。

## 目标

十六项全部落地并通过集中验证；只改工作树，不 commit、不 push、不部署。

## 改动

### G — 切换控件五种样式统一为两种（M）

- 现状（审计 G1）：六处切换用五种视觉语言——Agent 库侧栏分段控件（`agent-library.tsx:66-81`，`rounded-md bg-muted p-0.5`，激活 `bg-background shadow-sm`）；经验资产库下划线 Tabs（`experience-library.tsx:292-306`，激活 `border-b-2 border-accent`）；数据概览下划线 Tabs（`analytics-workspace.tsx:556-565`，激活 `h-0.5` 指示条 + 计数）；自动化胶囊 pills（`automation-workspace.tsx:2285-2310`，激活 `bg-slate-900 text-white`，全站唯一的深色 pills）；信息中心胶囊 pills（`information-center-workspace.tsx:317-340`，激活 `bg-accent text-white` + 圆点 + 计数）；Agent 库主区两个独立 outline 按钮当切换（`agent-workspace.tsx:497-530`）。
- 改法：定两种标准切换——**二选一视图用分段控件**（Agent 库侧栏样式）；**多选筛选 pills 统一激活色为 accent**（自动化 `bg-slate-900` 改掉）。Agent 库主区的两个按钮合并为分段控件。下划线 Tabs 的两处（经验资产 Scope、数据概览）按语义归入两种之一：Scope 是二选一/多选筛选，二者择一，不要留第三种。先全仓 grep 盘点是否还有审计之外的切换样式（例如 `Tabs` 组件的其他用法、`toggle` 类名），有则一并收敛或在记录里写明为何保留。
- 验收：全站切换只剩分段控件与 accent 胶囊两种；激活态颜色统一；截图复核六处（浅/深）。

### B1 — KPI gap 统一（S）

- 现状（审计 B1）：同类 KPI 卡片区 gap 分别是 12px（数据概览 `analytics-workspace.tsx:358`、`gap-3 lg:gap-4`）、24px（能力中心 `capability-center-workspace.tsx:639`、`gap-6`）、12px（自动化 `automation-workspace.tsx:2182`）、12px（经验资产 `experience-library.tsx:211`）。
- 改法：KPI 区统一 `gap-3 lg:gap-4`（与数据概览一致），能力中心 `gap-6` 改过来。先 grep 核实是否还有别的 KPI 区未列入。
- 验收：四处 gap 一致；截图对照无视觉跳变。

### B2 — 侧栏列表行密度统一（S）

- 现状（审计 B2）：Agent 行 `agent-library.tsx:119`（`rounded-md border bg-card px-2 py-2`，plain 边框行）；团队行 `team-library.tsx:110`（`agenthub-card-interactive … px-3 py-3`）；产物行 `artifact-library.tsx:210`（`rounded-md px-2 py-2 hover:bg-accent`，无边框 hover 行）——三种行高、两种卡片档位。
- 改法：三处统一为一档（二选一：`agenthub-card-interactive` + `px-3 py-2.5`，或统一 plain 行 + 同一 padding；选定后写进 `workbench-primitives.tsx` 或行组件注释，成为规范）。注意第一批 W1 动过 `experience-library.tsx` 但未动这三处侧栏行；Batch 1 的 `use-media-query` 与本项无关。
- 验收：三处行高/padding/档位一致；截图对照（浅/深）。

### B3 — 经验资产四层头栏（M）

- 现状（审计 B3）：`src/components/experience-library.tsx:196-211` 标题栏（`px-6 py-4`）、`:211` 统计条（5 张卡，`px-6 py-4`）、`:221-282` 搜索 + 筛选栏（`px-6 py-3`）、`:285-310` Scope Tab 栏（`px-6`）四层横栏依次堆叠，都是 `border-b` + `px-6`，列表区要到约 200px 高之后才开始。标题栏右侧 slogan「每一次运行，都是下一次更好的开始」只在 `xl` 以上显示（`hidden xl:flex`），窄屏直接消失。
- 改法：三选一并写进记录——① 统计条改为可折叠（默认收起一行摘要）；② Scope Tab 并入搜索筛选栏同一行；③ slogan 删除或移到列表空态文案里。目标：列表起始高度明显提前（实测 1366 下列表首行 y 坐标改前改后对比）。G 项若动了 Scope Tab 的样式，本项与之衔接（不要两处各改各的样式）。
- 验收：1366/390 下列表首行 y 坐标实测提前；四层不再全量堆叠；slogan 去向明确。

### B4 — 删重复 overflow-hidden（S）

- 现状（审计 B4）：`src/components/automation-workspace.tsx:2149` 根容器 `<section className="flex h-full min-w-0 flex-col overflow-hidden agenthub-card-container overflow-hidden">`，`overflow-hidden` 出现两次。
- 改法：先核实两处是不是真的重复（注意第一批 W3 动过同一文件，行号可能已漂移；`agenthub-card-container` 本身是否也带 overflow 效果——如是，删 class 里那一处还是删容器 class 里的，要看清）。删一处，保留一处。
- 验收：`overflow-hidden` 在该元素上只出现一次；布局无变化（截图对照）。

### C1 — 产物库加载补重试（S）

- 现状（审计 C1）：`src/components/artifact-library.tsx:175-183` 加载态只有图标 + 「正在加载产物…」+ 说明，无重试；团队库（`team-library.tsx:79-87`）与经验库（`experience-library.tsx:329-340`）的加载态都有「重新加载」按钮。第三轮 Q26 定了「会失败/会持久等待的数据加载视图必须有重试」。
- 改法：产物库加载态补「重新加载」按钮，与团队库同一写法（`WorkspaceStateView` 的 `onRetry` 机制在 `workbench-primitives.tsx:131`，能复用就复用，复用不了就照团队库手写同款）。
- 验收：产物库加载态出现重试按钮；点重试触发重新加载（实测）。

### C2 — 团队库/部署页空态改 EmptyState（S）

- 现状（审计 C2）：`EmptyState`（`workbench-primitives.tsx:70`）已被 Agent 库、产物库、经验资产库采用，但团队库（`team-library.tsx:90-101`）手写了一个与之同构的空态（图标圆 + 标题 + 描述 + 按钮，少了 PageCard 包裹，视觉上轻一级）；部署页（`src/app/deployments/page.tsx:35-44`）手写虚线框空态。
- 改法：两处都改用 `EmptyState`（部署页的虚线框如被认定为空态第二种样式可保留，但须写进规范并经本轮确认——默认改为 `EmptyState`）。文案与按钮行为与原手写版一致。
- 验收：两处空态渲染为统一 `EmptyState`；截图对照。

### C3 — toast 加「查看全部」（S）

- 现状（审计 C3）：`src/components/notification-center.tsx:148-165` 的 toast 只有「打开」和「标为已读」两个按钮；`AUTO_DISMISS_MS = 5200`（紧急 9000ms）后自动消失。信息中心就是通知历史列表（`information-center-workspace.tsx`，有筛选、全部标为已读、删除已读），但 toast 上没有任何入口跳过去。
- 改法：toast 底部加一个「查看全部通知」文字入口，点后跳信息中心（沿用站内已有的「打开」/导航写法，不要新造导航机制）。核实「打开」按钮现在的跳转目标，避免两个入口行为冲突。
- 验收：toast 上出现「查看全部通知」；点击后落在信息中心；5.2s 自动消失行为不变。

### E3 — 全局搜索尺寸 + 错误态重试（S）

- 现状（审计 E3）：`src/components/global-search.tsx:79-82` 弹窗手写 `max-w-2xl`（恰好等于 md 档的值，但没引用 `DIALOG_SIZE_CLASS.md`）与 `top-[12%]`（全站唯一的弹窗顶部定位，其余弹窗居中）。错误态按钮是「清空搜索」（`:129-137`），点完只清空输入框、不重试失败的搜索——语义上是「放弃」不是「重试」。
- 改法：尺寸改走 `DIALOG_SIZE_CLASS.md`；错误态按钮改为「重新搜索」（保留查询重试一次）。`top-[12%]` 是否保留：全局搜索是命令面板式弹窗，顶部定位有其合理性——核实后决定，保留须在记录里写明理由，改掉须截图证明居中后无问题。
- 验收：弹窗尺寸走三档常量；错误态点「重新搜索」后用原查询重试一次；1366×768 与 390 下 0 溢出。

### E4 — 产物库删除确认补尺寸 class（S）

- 现状（审计 E4）：`src/components/artifact-library.tsx:296` 的 `<DialogContent>` 无 className，走 `ui/dialog` 默认 `sm:max-w-sm`（448px）；Agent 库的删除确认明确用了 `DIALOG_SIZE_CLASS.sm`（`agent-library.tsx:172`，`max-w-md` 672px）。同类弹窗两种宽度。
- 改法：补 `className={DIALOG_SIZE_CLASS.sm}`。
- 验收：产物库删除确认弹窗宽度与 Agent 库一致（实测 476px @ 根字号 17px）；1366×768 与 390 下 0 溢出。

### I1 — 设置 Key 说明固定化（S）

- 现状（审计 I1）：`src/components/settings-dialog.tsx:477-495`，`tab === 'keys'` 时导航栏底部多出一个「Key 说明」项（带 Tooltip），切到别的分区就消失；且只在 `md` 以上显示（`hidden md:flex`）。
- 改法：二选一并写进记录——① 移到「供应商」面板内部作说明块；② 固定显示（与当前 Tab 无关，点它跳到供应商分区）。不要第三种。
- 验收：切 Tab 时该项不再出现/消失；说明内容仍可达。

### I2 — 面包屑与元信息行 Run label 去重（S）

- 现状（审计 I2）：`src/components/agent-run-debug-board.tsx:833-838` 面包屑「分析 / 运行调试 / {标题} / {Run}」；`:842-853` 元信息行又含 Run label、时长、Tokens、Cost、模型、Agents。Run label 出现两次。第一批 D5 已删掉 Cost 一项，本轮不动 Cost。
- 改法：面包屑去掉末级 Run，或元信息行去掉 Run label，二选一。选定后截图证明只剩一处。
- 验收：Run label 全页只出现一次（面包屑或元信息行，二选一）。

### J1 — 向导中间步点亮或改两步指示（S）

- 现状（审计 J1）：`src/components/agent-create-wizard.tsx:193-196` 的 `WizardSteps` steps 是 `['描述信息', '能力草稿', '确认创建']`，但 `current` 只取 `1 | 3`；`:141` 描述页 `current={1}`；`:98` 草稿页 `current={3}`。生成中仍停在第 1 步，草稿一出直接跳到第 3 步，第 2 步「能力草稿」永远不会成为当前步。原因是草稿页与确认页是同一屏（Q21 已决策不拆）。
- 改法：二选一并写进记录——① 改为两步指示（「描述信息 → 确认创建」）；② 生成中把第 2 步置为当前态（loading 态）。Q21 的「不拆屏」决策不动。
- 验收：指示器步数与实际流程对上（两步，或生成中第 2 步有 loading 当前态）；截图复核。

### F4 — 横向滚动箭头（S，低）

- 现状（审计 F4）：`src/components/horizontal-scroll-controls.tsx:51-55` 的箭头 `hidden … group-hover:flex`，只在 hover 容器时出现；触屏上无箭头，但内容本身可直接左右滑动，影响有限。
- 改法：二选一——① 触屏下常显箭头（`@media (hover: none)` 显示）；② 去掉箭头只留滑动。不要既留 hover 箭头又在触屏常显之外的第三种。
- 验收：触屏视口下箭头可见可点（或箭头已移除、滑动仍可用）；桌面 hover 行为不变。

### D6 — 部署页加回工作台链接（S）

- 现状（审计 D6）：`src/app/deployments/page.tsx:22-77` 整页无任何导航链接，只有每行的「打开」和「复制」；`/deployments` 是独立页面（不在工作台壳内），用户从工作台消息里的部署卡片跳过来后没有「返回工作台」链接，只能靠浏览器后退。
- 改法：页顶加「← 返回工作台」链接（href 回工作台根路径，沿用站内链接写法）。删除/筛选/排序以后再议（需 API，不属本轮）。
- 验收：页顶出现返回链接；点击后回到工作台。

### D7 — 调试板图标 mt-4 改对齐（S）

- 现状（审计 D7）：`src/components/agent-run-debug-board.tsx:825` 标题左侧图标块 `<div className="mt-4 flex size-9 …">` 用 `mt-4` 硬顶来对齐两行标题（面包屑 + h1），换行数或字号一变就错位。
- 改法：图标块改 `self-center` 或与标题行 `items-center` 对齐，去掉 `mt-4`。截图证明两行标题下图标仍居中对齐。
- 验收：`mt-4` 消失；图标与标题行对齐（1366/390 截图）。

## 不做

- 第三组（经验资产页头吸顶、F1 死代码、ArtifactWorkspace hover-only、390 DetailsPanel Tab 折行、「0 次」换行、调试板空态边界）一律不动。
- 白色主题与第一批的未提交改动不动（`themes.ts` / `themes.test.ts` / `globals.css` / `layout.tsx` / `settings-dialog.tsx` ——注意 I1 要动 `settings-dialog.tsx`，只改 Key 说明那一处，不得碰白色主题改过的外观区文案/默认文案；`experience-library.tsx` / `agent-run-debug-board.tsx` / `automation-workspace.tsx` / `file-tab.tsx` / `use-media-query.ts` 的第一批改动只读不改），也不把它们混进本轮的改动描述。
- 不引入新依赖；不改 spec 定义的接口/数据结构；不碰安全约束。
- G 的两处下划线 Tabs 与 B3 的 Scope Tab 如涉及同一处样式，G 与 B3 的 worker 以 G 的定稿为准，B3 只做结构收敛、不另起样式。

## 验证（集中验证 W7 统一重跑，不沿用 worker 旧数字）

- `npx tsc --noEmit` 0 错误；eslint（改动文件）0 错误。
- 全量 `npx vitest run`（基线 888 通过 / 4 跳过，0 失败）。
- 干净生产构建 exit 0（`rm -rf .next` 后构建；注意 `.next` 共用——构建串行，worker 各自构建时如遇并发冲突重试一次；验证服务用 `next start`，端口各 worker 错开 3151–3156，验证后停服）。
- Playwright 截图复核：重点 G 收敛、B3 头栏、C1/C2/C3 空/错态、E3/E4 对话框、D6/D7；每项给实测数字（宽度/溢出/可达性），不只给「通过」。
- 验证种子（本地开发库）用完清理，计数归零；证据进 `~/workspace/frontend-polish-evidence/batch2-consistency/`。
- 记录：`openspec/changes/batch2-consistency/PROGRESS.md` + `openspec/changes/frontend-polish/PROGRESS.md` 末尾加指向一节。

## 遗留（已知，不属本轮）

- 经验资产第 5 统计卡值「0 次」换行（第三组）。
- 390 下 DetailsPanel Tab 折行（第三组）。
- 调试板空 run / 无节点边界态（第三组）。
- 经验资产 1366 下主列 5px 溢出（统计卡趋势 svg，Batch 1 遗留①，非本轮引入）。
