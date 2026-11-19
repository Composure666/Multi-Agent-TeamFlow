# 第二批：一致性收尾（batch2-consistency）— 实施记录

- 日期：2026-11-18
- 范围：审计报告 `~/workspace/frontend-polish-evidence/module-audit-2026-11-18.md` 的第二批十六项（G、B1、B2、B3、B4、C1、C2、C3、E3、E4、I1、I2、J1、F4、D6、D7）。第三组一律未动。
- 方案：`openspec/changes/batch2-consistency/proposal.md`；任务：同目录 `tasks.md`（十六项验收标准）。
- 状态：**十六项全部完成并通过集中验证**（W6，2026-11-18 晚）。未 commit、未 push、未部署（HEAD 仍为 `c383a4a`，全部改动在工作树）。
> 注（2026-11-19，batch5-cleanup W2）：本文提及的 `sidebar.tsx`、`agent-library.tsx`、`team-library.tsx`、`new-conversation-dialog.tsx`、`global-search-trigger.tsx`、`dir-picker-dialog.tsx` 已于 2026-11-18 batch4 §2 删除；现入口：侧栏→`app-workbench.tsx` 内联 `wb-sidebar`、Agent 库→`agent-workspace.tsx`、会话创建→新建任务视图。历史叙述保留原样。
- 证据：`~/workspace/frontend-polish-evidence/batch2-consistency/`（W1–W4 截图与测量 `w1-*`～`w4-*`；W6 截图 `w6-*` 33 张 + 测量 `w6-results.json`、`w6e-results.json`、`w6-results-merged.json`（57 组，含深色与 390 补测）；拍摄脚本 `w6-seed.mjs`、`w6-verify.mjs`、`w6b-verify.mjs`、`w6c-verify.mjs`、`w6d-verify.mjs`、`w6e-verify.mjs` + 各轮日志 `w6*-probe.log`）。

## 分工

| Worker | 负责 | 文件 |
|---|---|---|
| W1 | G 切换控件统一为两种（16 处收敛） | `agent-library.tsx`、`agent-workspace.tsx`、`analytics-workspace.tsx`、`artifact-workspace.tsx`、`artifact-preview-panel.tsx`、`automation-workspace.tsx`、`capability-center-workspace.tsx`、`experience-library.tsx`、`agent-run-debug-board.tsx`、`information-center-workspace.tsx` |
| W2 | B1+B2+B3+B4 密度与间距 | `analytics-workspace.tsx`、`capability-center-workspace.tsx`、`automation-workspace.tsx`、`experience-library.tsx`、`agent-library.tsx`、`team-library.tsx`、`artifact-library.tsx`、`workbench-primitives.tsx`（B2 规范注释） |
| W3 | C1+C2+C3 空/加载/错误态 + E4 | `artifact-library.tsx`、`team-library.tsx`、`src/app/deployments/page.tsx`、`notification-center.tsx` |
| W4 | E3+I1+I2+J1+D6+D7+F4 | `global-search.tsx`、`settings-dialog.tsx`、`agent-run-debug-board.tsx`、`agent-create-wizard.tsx`、`src/app/deployments/page.tsx`、`horizontal-scroll-controls.tsx` |
| W6 | 集中验证 + 记录 | 本文件；**只改记录文件与验证证据，未改任何产品代码** |

## 各改法

### G — 切换控件五种样式统一为两种（W1）— 完成

- 定两种标准切换：**A 分段控件**（Agent 库侧栏样式：容器 `flex rounded-md bg-muted p-0.5`，激活 `bg-background text-foreground shadow-sm`），用于二选一 / 多路视图切换；**B accent 胶囊**（信息中心样式：激活 `bg-[var(--agenthub-accent)] text-[var(--primary-foreground)]`），用于单选筛选。
- 全仓 grep 盘点：审计六处之外又发现 10 处（调试板 CanvasToolbar 时间线筛选、Agent 主区 mineFilter、经验 kindFilter、自动化星期选择等），共 16 处收敛；另有 1 处无代码改动（`agent-library.tsx:72` 分段已是标准 A，仅补 `role="group"` + `aria-label`）。
- 关键修复（本轮关键发现）：激活胶囊原 `text-white` 在深色下对比度 **1.27:1**（`--agenthub-accent` 随模式翻转，深色为浅米色 `#e6dcc2`，白字印其上几乎不可读）；8 处 `text-white` → `text-[var(--primary-foreground)]`（信息中心、自动化、产物、数据概览、能力中心、Agent 主区、经验资产、调试板 SegmentedFilter；CanvasToolbar 新建处直接用正确写法）。修复后深色 13.43:1、浅色 11.6:1。
- 保留清单（有理由不收敛，见 W1 记录）：`agent-config-form.tsx` / `agent-run-debug-button.tsx` 的 shadcn Tabs（默认已是分段 A）；`settings-dialog.tsx` 明暗模式分段（该文件限 I1 专区 + 白色主题区，刻意保留）；`experience-library.tsx` 筛选弹窗内选项行（Button 变体体系）；`chat-panel.tsx` 文件页签（IDE 式文档页签，不同控件）；复选框、单按钮开关、排序菜单高亮、状态 chips 等非多选切换。
- 未动（G 范围外）：同类深色 `text-white` on accent 仍存在于 `agent-config-form.tsx:895`、`agent-create-wizard.tsx:206` 步骤完成态、`agent-workspace.tsx:1128,1193` 复选框选中态、`capability-center-workspace.tsx:1345`、`analytics-workspace.tsx:896` 分页当前页、`agent-run-debug-board.tsx:882` 主操作按钮、`ask-user-question-dialog.tsx:298` 等处（W1 已列清单，非切换控件，留给后续）。

### B1 — KPI gap 统一（W2）— 完成

- grep 核实审计四处之外无别的 KPI 区（`automation-workspace.tsx:999` 任务详情弹窗 Meta 网格与 `capability-center-workspace.tsx:637` 三栏主内容布局网格均不是 KPI，不动）。
- 四处统一 `gap-3 lg:gap-4`（根字号 17px 下 1366 为 17px）：数据概览 `lg:gap-4` 补上（1366 下本就是 17px，lg 段由 12.75px 补到 17px）；能力中心 `gap-6`（25.5px）改过来；自动化 Stat tiles 补 `lg:gap-4`（12.75px → 17px）；经验资产统计卡同值（B3 改动内一并改，展开态量测）。

### B2 — 侧栏列表行密度统一（W2）— 完成

- 选定一档：**`agenthub-card-interactive` + `px-3 py-2.5`**（取团队行已有的交互卡片档往上统一，不把团队行往下降级）；规范写进 `workbench-primitives.tsx` 顶部注释（B2 一节）。
- Agent 行 `rounded-md border bg-card px-2 py-2` → 同档；团队行仅 padding `py-3` → `py-2.5`；产物行 `rounded-md px-2 py-2 hover:bg-accent` → 同档。
- **重要发现——Agent/团队行线上不可达**：`AgentLibrary` / `TeamLibrary` 只被 `sidebar.tsx` 引用，而 `sidebar.tsx` 全仓无任何 import（已知死代码，审计遗留⑤）；线上 Agent 库视图是 `agent-workspace.tsx`（自写列表），`ArtifactLibrary` 经会话视图「本会话产物库」抽屉可达。因此 Agent/团队两行只能源码级核对（改后三处 class 字面一致），无法浏览器截图量测；产物行浏览器实测见 W6.3。删或接回死代码属第三组 F1，不属本轮。

### B3 — 经验资产四层头栏收敛（W2）— 完成，方案①统计条可折叠

- 未选 ②（Scope Tab 并入搜索栏）：1366 下搜索栏已满（搜索框 + 4 个 kind 按钮 + 分组 + 筛选 + 新建），再并入 3 个 Scope Tab 必然折行；且 Scope Tab 样式归 G 定稿，本项不碰。未选 ③（删 slogan）：slogan 在 `PageHeader` actions 内（`hidden xl:flex`），不占独立纵向空间，删了列表也提不上来——保留，去向明确：仍在页头右侧（1366 可见，390 隐藏，与改前一致）。
- 改法（只动统计条一块）：新增 `statsOpen`（默认 false）；收起态为一行摘要按钮「全部 3 · 已启用 2 · 草稿 1 · 冷资产 0 · 累计使用 25 次」+「展开统计」；展开态为原 5 张卡（B1 的 `lg:gap-4` 已并入）+ 底部「收起统计」行。Scope Tab、搜索栏、PageHeader 均未动。
- 遗留（改前就有，不属本轮）：展开态第 2/4/5 张卡标签换行（「已启用」「冷资产」「累计使用」在窄卡内折行，「25 次」断成两行）——与第三组的「0 次换行」同类，统计卡内容宽度问题。

### B4 — 删重复 overflow-hidden（W2）— 完成

- 核实：`agenthub-card-container`（`globals.css:1059-1064`）只定义背景/边框/圆角/阴影，不带 overflow；`automation-workspace.tsx:2187` 根容器 class 表里的两处 `overflow-hidden` 是字面重复。删尾部一处，保留一处。

### C1 — 产物库加载补重试（W3）— 完成

- `artifact-library.tsx` 加载态加 `Button variant=outline size=sm`「重新加载」`onClick=refresh()`，与团队库同一写法。未走 `WorkspaceStateView` 的 `onRetry`：产物库加载块是手写骨架，复用会改结构；按钮形态与团队库逐字一致。

### C2 — 团队库/部署页空态改 EmptyState（W3）— 完成

- 团队库手写空态 → `EmptyState icon=Users title=还没有团队 description=创建团队… action=创建团队/onCreateTeam`，文案/行为逐字一致。
- 部署页虚线框 → `EmptyState title=暂无已发布的部署 description=在工作台里…`（无 action，与原版一致；Server Component，不传 onClick）。
- **重要发现——团队库在 live UI 上不可达（死代码链）**：`TeamLibrary` 唯一挂载点是 `AgentLibrary`，`AgentLibrary` 唯一挂载点是 `sidebar.tsx:390` 的 `Sidebar`，而全仓无任何文件 import `sidebar.tsx` 的 `Sidebar`。C2 团队库改动本身正确（tsc/eslint + 文案逐字核对），但无法经 UI 导航截图验证；W3 用同一 `EmptyState` + action 在产物库抽屉空会话下做了同组件生产渲染证明（见 W6.3 注）。若要恢复该入口，需另立项复活 Sidebar，不属本轮。

### C3 — toast 加「查看全部」（W3）— 完成

- `notification-center.tsx`：toast 底部加 ghost 文字按钮「查看全部通知」（与「标为已读」同样式），点后收起本条 toast + `setWorkbenchView('information-center')` 跳信息中心（站内已有导航写法，与 `app-workbench.tsx` 的 `setView('information-center')` 同源），不标为已读。
- 核实「打开」：按 `notification.target` 类型跳会话/任务/产物/设置（`查看结果/查看任务/查看产物/去设置`），与「查看全部」去列表不冲突。`AUTO_DISMISS_MS = 5200`（紧急 9000ms）不变。

### E3 — 全局搜索尺寸 + 错误态重试（W4）— 完成

- `global-search.tsx`：`max-w-2xl` → `DIALOG_SIZE_CLASS.md`（42rem，根字号 17px 下 714px）；错误态「清空搜索」→「重新搜索」，调 store 的 `runSearch()`（保留查询重试一次，不再清空）。
- `top-[12%]` **保留**：命令面板式弹窗，顶部定位是 cmdk 标准做法；改居中会让搜索面板沉到屏幕中部；全站唯一此类弹窗。
- 附带发现（既有问题，未动）：搜索结果行把消息 `parts` 以 JSON 原文渲染（`[{"type":"text","content":...}]`），是既有渲染问题，非本轮范围。

### E4 — 产物库删除确认补尺寸 class（W3）— 完成

- `artifact-library.tsx:300` 的 `<DialogContent>` 补 `className={DIALOG_SIZE_CLASS.sm}`（28rem，根字号 17px 下 476px）+ import，与 Agent 库删除确认同宽。

### I1 — 设置 Key 说明固定化（W4）— 完成，方案②固定显示

- `settings-dialog.tsx:477-495`：去掉 `tab === 'keys'` 条件与 `hidden md:flex`，改为固定导航项（与各分区同款选中态），点它 `setTab('keys')`；Tooltip 文案原样不动。未选方案①（移入 ProvidersPanel 要动第二个文件）。外观区文案/默认文案未碰（白色主题区只读）。
- 附带说明：390 下顶栏设置按钮因 compact 态不渲染（既有行为），390 验证用 `?setup=api-keys` 深链打开弹窗。

### I2 — 面包屑与元信息行 Run label 去重（W4）— 完成

- `agent-run-debug-board.tsx`：删面包屑末级 Run，保留元信息行 Run label；Cost 未动（第一批 D5 已删）。
- 面包屑现为「分析 / 运行调试 / {标题}」；元信息行保留 `Run run_w6_verify`（标签格式为 `Run <id>`，不是 `Run #N`）。另两处 Run 标注（节点标题、会话列表行）属不同区域，非页头重复，未动。

### J1 — 向导改两步指示（W4）— 完成

- `agent-create-wizard.tsx`：steps 改为 `['描述信息', '确认创建']`，`current: 1 | 2`，草稿页 `current={2}`；Q21「不拆屏」决策不动。未选生成中 loading 方案（第 2 步与确认页同一屏，loading 态仍是假步）。

### F4 — 横向滚动箭头（W4）— 完成，触屏常显（溢出驱动）

- `horizontal-scroll-controls.tsx`：显隐改由溢出状态显式驱动（`showLeft/showRight ? 'flex' : 'hidden'`），去掉 `hidden … group-hover:flex`，不依赖 hover。
- 附带发现（已实测）：审计前提不成立——旧写法经 tailwind-merge 后 `hidden` 已被 `flex` 顶掉（node 验证），有内容可滚时箭头实际早就是常显；本次是把行为写明，并顺带去掉无内容时 hover 仍会冒出的误导箭头。

### D6 — 部署页加回工作台链接（W4）— 完成

- `src/app/deployments/page.tsx`：页顶 h1 上方加 `<Link href="/">← 返回工作台</Link>`（next/link + ArrowLeft）。与 W3 的 C2（EmptyState）共存无冲突。

### D7 — 调试板图标 mt-4 改对齐（W4）— 完成，0 代码改动

- 核实：`agent-run-debug-board.tsx` 里 `mt-4` 出现 **0 次**——Top 5 已把页头迁到共享 `PageHeader`，图标块无 `mt-4`。本项已由该迁移解决，不再改代码。W6 在 1366/390 下复核图标与标题行对齐（见 W6.3）。

## W6 集中验证结果（2026-11-18 晚）

> 以下数字全部在最终树状态下重跑，不沿用 W1–W4 的旧数字。验证服务 `next start -p 3157`（127.0.0.1），隔离库 `AGENTHUB_DATA_DIR=/tmp/w6-data-3157`（真实 `.agenthub-data` 未碰）；验证后服务已停、端口已释放、隔离目录已删除。W4 的构建是副本树快照（约 14:45），不在最终树上——W6 已在最终树上重跑构建与全量测试。

### W6.1 树完整性

- `git rev-parse HEAD`：**`c383a4a`**。
- `git status --short`：27 个修改文件（本轮 19 个 + 白色主题 5 个 + 第一批 7 个，三者有重叠：`settings-dialog.tsx` 同时属白色主题与本轮 I1；`agent-run-debug-board.tsx`、`automation-workspace.tsx`、`experience-library.tsx` 同时属第一批与本轮；`use-media-query*.ts`、`experience-sidebar.tsx`、`file-tab.tsx` 仅属第一批，未动）+ 未追踪 `openspec/changes/batch1-responsive/`、`openspec/changes/batch2-consistency/`、`openspec/changes/white-themes/`。无其他改动。
- 抽查关键改动在位：G 两种切换（分段 A + accent 胶囊 B，`text-[var(--primary-foreground)]` 9 处）；KPI gap 四处 `gap-3 lg:gap-4`；B2 三处行 class 字面一致（`agenthub-card-interactive … px-3 py-2.5`）；B3 `statsOpen` 默认收起；B4 根容器 `overflow-hidden` 1 处；C1/C2/E4（`重新加载`、`EmptyState` 两处、`DIALOG_SIZE_CLASS.sm`）；C3「查看全部通知」；E3 `DIALOG_SIZE_CLASS.md` +「重新搜索」；I1「Key 说明」固定项；I2 面包屑无 Run、元信息行 1 处；J1 两步；D6「返回工作台」；D7 `mt-4` 0 处；F4 `showLeft/showRight` 驱动；全仓 `window.confirm` **0 处**。

### W6.2 静态检查 + 全量测试 + 干净生产构建

- `npx tsc --noEmit`：**exit 0，错误 0**。
- `npx eslint`（27 个改动文件，`git diff --name-only` 除 openspec 外）：**0 错误**（仅 1 条 warning：`globals.css` 被 eslint 配置忽略，非错误）。
- 全量 `npx vitest run`：**104 个测试文件全部通过；888 通过、4 跳过、0 失败**（= 基线）。W4 全量跑时 `agent-runner-debug-events.test.ts` 曾在并发下 beforeAll 10s 超时、单跑通过——**本轮全量跑中该文件一次通过，W4 的超时未再现**，判定为并发争用一过性抖动，非真失败。
- 干净生产构建：`rm -rf .next && node node_modules/next/dist/bin/next build`（串行，无其他构建并行），**exit 0**，新 BUILD_ID **`sMLLe9kUw_UhD_zUpsRUF`**，构建日志 `error` 0 次。起服后 `/` 200、`/demo` 200（curl 核对）。
- 过程注：验证中途一次运行时重启清掉了 `/tmp`（构建日志与首轮探针日志丢失、服务与隔离库被清）；BUILD_ID 已从 `.next/BUILD_ID` 文件二次核对无误，探针在重启后重建服务、重下种子、从头重跑，数字均为重跑后的最终值。

### W6.3 Playwright 截图复核（十六项，57 组测量）

验证种子（隔离库，验证后已全部清理，计数归零）：会话 `conv_w6verify`（「W6 验证会话」）+ 触发/输出消息各 1 条（含「W6验证关键词」）+ Run `run_w6_verify`（complete，usage 1200 in / 800 out / 100 cache-read）+ 经验 3 条（`exp_w6verify1-3`，usage_count 12/8/5）+ 产物 1 组（`art_w6verify`）+ 自动化 1 条（`auto_w6verify`，prompt 为空，C3 触发器）。清理前 DB 核对：conversations 1 / messages 2 / agent_runs 1 / experiences 3 / artifacts 1 / automations 6（1 条种子 + 5 条 bootstrap）/ agent_teams 0 / agents 5（bootstrap）/ notifications 0；探针未产生额外写入（E4 删除全部取消，J1 草稿未落库）。清理后隔离目录已删除。根字号 17px。

#### G — 完成（浅/深激活均 ≥ 4.5:1）

| 视图 | 浅色激活胶囊 | 深色激活胶囊 | 浅色分段激活 | 深色分段激活 |
|---|---|---|---|---|
| 经验资产 | 11.6:1（`rgb(51,49,45)` / `rgb(245,242,234)`） | **13.43:1**（`rgb(232,228,216)` / `rgb(28,28,26)`） | 15.9:1 | 15.52:1 |
| 数据概览 | 11.6:1 | — | — | — |
| 能力中心 | 11.6:1 | — | — | — |
| 自动化 | 11.6:1 | **13.43:1** | 15.9:1 | 15.52:1 |
| 信息中心 | — | **13.43:1** | — | — |
| Agent 库 | 11.6:1 | — | 15.9:1（「精选 Agent」） | — |

- 对比度为 W6 探针内 WCAG 公式实算（rgba 合成到底色后算亮度），与 W1 的 11.6 / 13.43 / 15.9 / 15.52 逐项一致。深色修复前 1.27:1 的不可读态已不存在。
- 截图目视：深色下自动化/信息中心/经验资产激活胶囊为浅米底 + 深色字，数字与标签清晰。

#### B1 — 完成（四处 gap 均为 17px @1366）

| 位置 | 改后 computed column-gap |
|---|---|
| 数据概览 KPI | **17px**（4 卡） |
| 能力中心 KPI | **17px**（4 卡） |
| 自动化 Stat tiles | **17px**（4 卡；同页另有一 12.75px 网格是任务列表区，非 KPI） |
| 经验资产统计卡（展开态） | **17px**（5 卡） |

#### B2 — 完成（产物行实测；Agent/团队行源码级核对）

| 视口 | 产物行 padding | 行高 | 圆角 | 阴影 |
|---|---|---|---|---|
| 1366 | **12.75px 横 / 10.625px 纵** | **65** | 13.22px | 有（`rgba(15,23,42,0.07) 0 2px 6px`） |
| 390 | 12.75px 横 / 10.625px 纵 | **65** | — | — |

- 行 class：`agenthub-card-interactive group min-w-0 overflow-hidden px-3 py-2.5`；与 W2 改后实测逐项一致。Agent/团队两行因死代码链无法在浏览器里量测，改后三处 class 字面一致（见「各改法 B2」）。

#### B3 — 完成（列表首行明显提前）

| 视口 | 改前首行 y（W2） | 改后首行 y（W6） | 提前 |
|---|---|---|---|
| 1366×768 | 445（卡高 95） | **328**（卡高 95） | **−117px** |
| 390×844 | 773（卡高 138） | **495**（卡高 138） | **−278px** |
| 1366 深色 | — | **328**（卡高 95） | 与浅色一致 |

- 改后 1366 各层 y：摘要行 155（h 39）→ 搜索 207 → Scope Tab 265 → 首行 328；390：摘要行 237（h 39）→ 首行 495。slogan 1366 可见、390 隐藏，与改前一致；1366/390 均 0 横向溢出。展开态首行 y 484（1366），5 张卡正常渲染，KPI gap 17px。

#### B4 — 完成

- 根容器 class 内 `overflow-hidden` **1 次**，computed overflow-x/y 均为 hidden，容器框 x286 y26 w1055 h717——与 W2 改前框完全相同，布局无变化。

#### C1 — 完成

- 拦截 `/api/artifacts` 延迟 5s：加载态出现「正在加载产物…」+「重新加载」按钮（可见）；点后请求数 **1 → 2**；随后产物行出现；1366 0 溢出。

#### C2 — 完成（部署页实测；团队库源码级核对 + W3 同组件渲染证明）

| 位置 | 实测 |
|---|---|
| 部署页空态 1366/390 | `EmptyState` 标题「暂无已发布的部署」在 `PageCard` 内；虚线框残留 **0 个**；描述完整；0 溢出 |
| 团队库空态 | live UI 不可达（死代码链，见「各改法 C2」）；源码核对：`EmptyState` + `action=创建团队/onCreateTeam`，文案与原手写版逐字一致；W3 已用同一组件在产物库抽屉空会话下做过生产渲染证明 |

#### C3 — 完成

- toast（「复制失败」，360px 宽，右下 x989 y639）：按钮「标为已读」「查看全部通知」俱全；点「查看全部通知」后落在信息中心（PageHeader 标题 present），toast 消失；再触发一次不点，**6.5s 后消失**（AUTO_DISMISS_MS=5200 不变）。

#### E3 — 完成

| 视口 | 弹窗框 | top | max-width | 视口内 | 溢出 |
|---|---|---|---|---|---|
| 1366×768 | 714×303 @ (326, 92) | 12% | 714px（= 42rem @ 17px） | 是 | 0 |
| 390×844 | 356×303 @ (17, 101) | 12% | `calc(100% - 34px)` | 是 | 0 |

- 断网模拟下错误态「搜索失败 + 重新搜索」（无「清空搜索」，查询 `W6验证` 保留）；放行后点「重新搜索」→ **2 条结果**，查询不变、无失败文案（1366 与 390 均同）。

#### E4 — 完成

| 视口 | 删除确认框（根字号 17px，sm 档 28rem=476px） | 视口内 | 溢出 |
|---|---|---|---|
| 1366×768 | **476px**，`max-width: 476px`，标题「删除产物」 | 是 | 0 |
| 390×844 | **356px**（视口 390−2×17 边距，`sm:` 档未生效属预期），left 17px | 是 | 0 |

- 两次均为取消关闭，种子产物保留（清理前 DB 核对 artifacts 仍为 1）。

#### I1 — 完成

| 视口 | 切到「外观」后「Key 说明」 | 点「Key 说明」落点 |
|---|---|---|
| 1366×768 | 仍在导航末位（可见） | 供应商分区（`aria-current` 为供应商，含「供应商优先级」块） |
| 390×844（`?setup=api-keys` 深链） | 仍在 | 同上（W4 方法复核） |

- 导航项顺序：外观 / 供应商 / 对象存储 / 模型与分配 / 故障转移 / 移动端 / 发布 / 官网 / 通知 / Key 说明。

#### I2 — 完成

- 1366：面包屑「分析 / 运行调试 / W6验证关键词…」（无 Run）；元信息行「完成 Run run_w6_verify 30s 2,100 Tokens deepseek-flash 1 Agents」——页头 `Run run_<id>` 恰好 **1 处**。
- 390：面包屑同上无 Run（w6f 精确核对：面包屑元素文本 `分析/运行调试/W6验证关键词…`，`crumbHasRun: false`）；元信息行 1 处。
- 口径注：W4/W6 探针的 `headerRunLabelCount` 用 `/Run #\d+/` 正则得 0，是因为实际标签格式为 `Run run_w6_verify`，不是 `Run #N`；结论以面包屑元素与元信息行文本为准。另两处 Run 标注（节点标题、会话列表行）属不同区域，非页头重复。

#### J1 — 完成

- 步骤 1 指示器：`1 描述信息 → 2 确认创建`（当前第 1 步）；填意图点「生成草稿」（无模型 key，走本地规则出草稿）后指示器 `✓ 描述信息 → 2 确认创建`（当前第 2 步）。两步与实际流程对上，无永远到不了的中间步。

#### F4 — 完成

| 场景 | 无溢出行箭头 | 有溢出行箭头 | 点右箭头 |
|---|---|---|---|
| 1366 Agent 库 | 两箭头 `display:none`（1019=1019） | 两箭头 `display:flex`（2254>1028） | `scrollLeft 4 → 381`（真实点击） |
| 390 触屏 Agent 库 | 左箭头隐藏（已到头，`scrollLeft 0`）、右箭头可见（901>320） | 两箭头均可见（1894>329，`scrollLeft 4`） | `scrollLeft 0 → 220` |

- 390 的点击用 evaluate 直点：390 下抽屉菜单导航后遮罩不自动关闭，Playwright 真实点击会被遮罩拦截（探针问题，见「W6 过程备注」）；1366 下真实点击已验证通过，390 下箭头显隐与滚动行为与之一致。

#### D6 — 完成

| 视口 | 回链位置 | 点击后 |
|---|---|---|
| 1366×768 | x301 y43，`href="/"` | 落到 `http://127.0.0.1:3157/`，工作台导航可见 |
| 390×844 | x21 y43，`href="/"` | 同上 |

#### D7 — 完成（0 代码改动，Top 5 迁移已解决，带对齐复核通过）

| 视口 | 图标 | 标题块 | 对齐 |
|---|---|---|---|
| 1366×768 | y48 h43，centerY 69 | y48~128 | 图标纵向落在标题块内 ✓ |
| 390×844 | y100 h43，centerY 121 | y100~287 | 同上 ✓ |

- 两尺寸文档均无横向溢出；`mt-4` 在 `agent-run-debug-board.tsx` 中 0 处。

## 逐项状态（汇报用）

| 项 | 状态 |
|---|---|
| G 切换统一两种 | ✅ 16 处收敛；激活胶囊浅 11.6:1、深 13.43:1，分段浅 15.9:1、深 15.52:1（深色 `text-white` 1.27:1 已修） |
| B1 KPI gap | ✅ 四处均为 17px @1366 |
| B2 侧栏行 | ✅ 一档 `agenthub-card-interactive + px-3 py-2.5`；产物行实测 h 65、padding 12.75/10.625；Agent/团队行死代码内源码核对 |
| B3 头栏收敛 | ✅ 统计条默认收起；首行 y 1366 下 445→328、390 下 773→495；slogan 保留在页头右侧 |
| B4 重复 overflow-hidden | ✅ 1 处；容器框与改前完全相同 |
| C1 加载重试 | ✅ 按钮可见；点后请求 1→2，产物行出现 |
| C2 空态 EmptyState | ✅ 部署页实测；团队库源码核对 + W3 同组件渲染证明（live UI 不可达，死代码链） |
| C3 toast 查看全部 | ✅ 入口在，点击落信息中心；6.5s 自动消失不变 |
| E3 搜索尺寸+重试 | ✅ md 档 714px（390 下 356px），0 溢出；错误态「重新搜索」重试出 2 条结果；`top-[12%]` 保留有理由 |
| E4 删除确认尺寸 | ✅ 476px @1366、356px @390，0 溢出，与 Agent 库同宽 |
| I1 Key 说明固定 | ✅ 切 Tab 不消失；点它跳供应商分区；1366/390 均过 |
| I2 Run label 去重 | ✅ 面包屑 0 处、元信息行 1 处；1366/390 均过 |
| J1 向导两步 | ✅ 步骤 1→2 与流程对上；Q21 不拆屏不动 |
| F4 滚动箭头 | ✅ 溢出驱动显隐；1366 真实点击 4→381、390 点击 0→220 |
| D6 部署页回链 | ✅ 页顶「← 返回工作台」，点击回工作台；1366/390 均过 |
| D7 图标对齐 | ✅ 0 代码改动（Top 5 已解决）；图标纵向落在标题块内；1366/390 均过 |

## 遗留清单（非阻塞，留待用户定夺或下一批）

1. **Agent/团队行与团队库空态在死代码里**（B2、C2）：`sidebar.tsx` 全仓无引用，`AgentLibrary`/`TeamLibrary` 线上不可达；删或接回需另行决策（第三组 F1 死代码清理）。
2. **B3 展开态统计卡标签换行**（改前就有）：「已启用/冷资产/累计使用」「25 次」在窄卡内折行，与第三组「0 次换行」同类。
3. **G 范围外的深色 `text-white` on accent 仍存在**：`agent-config-form.tsx:895`、`agent-create-wizard.tsx:206`、`agent-workspace.tsx:1128,1193`、`capability-center-workspace.tsx:1345`、`analytics-workspace.tsx:896`、`agent-run-debug-board.tsx:882`、`ask-user-question-dialog.tsx:298` 等（W1 已列清单，非切换控件）。
4. **1366 下经验库主列 5px 溢出**（第一批遗留①，Batch 1 遗留，非本轮引入）：统计卡趋势 svg 右沿超出主列 5px；文档无横向溢出。
5. **390 下 DetailsPanel Tab 折行 / 经验资产第 5 统计卡值「0 次」换行 / 调试板空 run 边界态**（提案已知遗留，第三组）。
6. **搜索结果行 JSON 原文渲染**（E3 附带发现，既有问题）：消息 `parts` 以 JSON 原文显示，非本轮范围。
7. **390 下抽屉菜单导航后遮罩不自动关闭**（W6 探针发现，既有行为）：移动端抽屉里点导航项后遮罩仍在，须手动点遮罩关闭；390 下会话列表亦无入口（W3 已记）。如需修，另立项。

## 证据目录

`~/workspace/frontend-polish-evidence/batch2-consistency/`（W6 新增）：

- `w6-seed.mjs`、`w6-verify.mjs`（浅色 1366 主跑）、`w6b-verify.mjs`（深色 1366 + 390）、`w6c-verify.mjs`（390 补测）、`w6d-verify.mjs`（390 补测之二）、`w6e-verify.mjs`（390 补测之三）、`w6-results.json`、`w6e-results.json`、`w6-results-merged.json`（57 组）、`w6-probe.log`、`w6b-probe.log`、`w6c-probe.log`、`w6d-probe.log`、`w6e-probe.log`、`w6-server.log`
- 截图 33 张：`w6-{experience,analytics,capability,automation,agent-library}-1366.png`（5）、`w6-dark-{automation,infocenter,experience}-1366.png`（3）、`w6-experience-{expanded-1366,390}.png`（2）、`w6-c1-{loading,loaded}-1366.png`（2）、`w6-c3-{toast,information-center}-1366.png`（2）、`w6-e3-1366-{dialog,error,retry}.png` + `w6-e3-390-{dialog,error,retry}.png`（6）、`w6-e4-delete-dialog-{1366,390}.png`（2）、`w6-d6-{deployments,after-click}-1366.png` + `w6-d6-deployments-390.png`（3）、`w6-i1-{1366-appearance-tab,1366-keys-tab,390-appearance-tab}.png`（3）、`w6-j1-1366-{step1,step2}.png`（2）、`w6-board-{1366,390}.png`（2）、`w6-f4-390-touch.png`（1）

> 未 commit、未 push、未部署；HEAD 仍为 `c383a4a`。

## W6 过程备注（不影响结论）

- 种子脚本初版查 `deployments` 表计数报 `no such table: deployments`（部署数据不在该表）；种子插入本身全部成功（1/2/1/3/1/1/0），计数行已删。
- 390 探针连踩三处既有移动端导航限制：① 会话列表在隐藏左栏里，390 下会话按钮存在但不可见——改用 1366 选会话再缩视口（W3 同款）；② 抽屉菜单导航后遮罩不自动关闭，Playwright 真实点击被拦截——F4 390 点击改用 evaluate 直点（仍走 React onClick），1366 真实点击已过；③ w6e 的 `breadcrumbHasRun: true` 是探针取 header 内第一个 div 的误报，w6f 精确核对面包屑元素文本确认无 Run。
- 停服时一次 `pkill -f "next start -p 3157"` 误匹配了自己的 shell（pattern 自匹配，Batch 1 W5 曾有同类教训），服务未停；改按 PID（1686）停服确认，端口已释放。
- 验证中途一次运行时重启清掉了 `/tmp`（首轮探针中断、构建日志丢失）；BUILD_ID 已从 `.next/BUILD_ID` 二次核对，探针重建服务、重下种子、从头重跑，数字均为重跑后的最终值。
