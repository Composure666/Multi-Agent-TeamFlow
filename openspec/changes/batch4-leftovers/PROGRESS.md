# 第四组：零散遗留收尾（batch4-leftovers）— 实施记录

- 日期：2026-11-18
- 范围：审计报告 `~/workspace/frontend-polish-evidence/module-audit-2026-11-18.md` 的第三组八项（proposal §1–§8：经验资产页头吸顶、F1 死代码清理、ArtifactWorkspace hover-only 按钮、390 DetailsPanel Tab 折行、经验资产统计卡换行、调试板空态边界、第三批验证遗留小项、第二批探针新发现）。用户已批准“三批按顺序都做”。
- 方案：`openspec/changes/batch4-leftovers/proposal.md`；任务：同目录 `tasks.md`（八项验收标准）。
- 状态：**八项全部完成并通过集中验证**（W6，2026-11-18 晚）。未 commit、未 push、未部署（HEAD 仍为 `c383a4a`，全部改动在工作树）。
> 注（2026-11-19，batch5-cleanup W2）：本文提及的 6 个已删文件（`sidebar.tsx`、`agent-library.tsx`、`team-library.tsx`、`new-conversation-dialog.tsx`、`global-search-trigger.tsx`、`dir-picker-dialog.tsx`）即本批 §2 删除的文件；现入口见 `OVERVIEW.md`。历史叙述保留原样。
- 证据：`~/workspace/frontend-polish-evidence/batch4-leftovers/`（W1–W5 截图与测量 `w1-*`～`w5-*`；W6 截图 `w6-*` 37 张 + 测量 `w6-results.json`、`w6-results2.json`、`w6-results-noconv.json`；拍摄脚本 `w6-seed.mjs`、`w6-verify.mjs`、`w6-verify2.mjs`、`w6-verify-noconv.mjs` + 各轮日志 `w6-*.log`）。

## 分工

| Worker | 负责 | 文件 |
|---|---|---|
| W1 | §1 经验资产页头吸顶 + §5 统计卡换行 | `src/components/experience-library.tsx`（2 行 why 注释）、`src/components/experience/stat-card.tsx` |
| W2 | §2 F1 死代码清理 | 删 6 个文件 + `settings-dialog.tsx`、`user-guide-dialog.tsx`、`artifact-library.tsx`、`src/app/api/fs/listdir/route.ts`、`OVERVIEW.md` |
| W3 | §3 ArtifactWorkspace hover-only 按钮 | `src/components/artifact-workspace.tsx`（3 处 class） |
| W4 | §4 DetailsPanel Tab 折行 + §6 空态 + §7c 图内间距 + §7h 工具条 | `src/components/agent-run-debug-board.tsx`、`src/lib/agent-run-debug-board.ts`、`src/lib/agent-run-debug-board.test.ts`（+2 pin 测试） |
| W5 | §7a/§7b/§7d/§7e/§7f/§7g + §8a/§8b | `src/components/app-workbench.tsx`、`src/app/globals.css`、`src/app/layout.tsx`（注释）、`README.md`、`README.zh-CN.md` |
| W6 | 集中验证 + 记录 | 本文件；**只改记录文件与验证证据，未改任何产品代码** |

## 各改法

### §1 — 经验资产页头吸顶（W1）— 完成，决定不恢复

- 核实现状：页头、统计摘要行、搜索栏、Scope Tab 都在 `PageShell` 的 flex 列里，列表滚动发生在内层 `ScrollArea` 视口，页头在 ScrollArea 之外、外层 PageShell 本身不滚动——`sticky` 在此没有滚动祖先可依，加了也是死代码。
- 决定不恢复的理由（两条）：① 技术上不可行——吸顶需要滚动容器，现状下页头本就固定不动（W6 实测：列表滚到底后页头 y 1366 下 25.5→25.5、390 下 81.8→81.8，见 W6.3）；② 需求上无必要——第二批 B3 已把统计条改成默认收起的摘要行，列表首行已提前（1366 下 445→328、390 下 773→495），吸顶省出的空间无实际收益，反而会吃掉本就紧张的纵向空间。
- 改动：只在 `experience-library.tsx` 的 `<PageHeader>` 上方加 2 行 why 注释（说明页头固定不动、sticky 是死代码），0 行行为代码。

### §5 — 经验资产统计卡换行（W1）— 完成

- 根因：旧横排里文字列在 1366 下仅 42px（图标 40 + 间距 + 内边距吃掉卡宽），「累计使用」标签与「25 次」值必然折行，60px 迷你图更顶出卡片 34px、主列溢出 9px。
- 改法（只动 `src/components/experience/stat-card.tsx`，卡片改两行式）：首行图标+标签、次行值+趋势/迷你图；值 `whitespace-nowrap`（行可折行兜底大数值）、图标 40→32（`size-8`）、内边距 px-4→px-3、迷你图 60×24→44×20。两行式让值行独占卡内宽（1366 下 109px）。
- 1366 主列 5px 溢出（第一批遗留①）同根因一并解决：迷你图缩进卡内后主列溢出归零（W6 实测 0，见 W6.3）。

### §2 — F1 死代码清理（W2）— 完成，删 6 个文件

- 核实方法：全仓 grep（`src` + 全仓库文本，排除 `node_modules/.next/.git` 与 `tsconfig.tsbuildinfo`）：`import`、动态 `import()`、`require(`、测试文件、re-export（仓库无 barrel，CLAUDE.md §4.1 除 `ui/` 外禁 `index.ts`）、字符串引用。
- 死代码链（审计 4 个 + W2 新发现 2 个）：`sidebar.tsx`（export `Sidebar`，全仓无任何 import、无任何挂载）；`agent-library.tsx`（唯一挂载点 `sidebar.tsx:390`）；`team-library.tsx`（唯一挂载点 `agent-library.tsx:88`）；`new-conversation-dialog.tsx`（唯一挂载点 `sidebar.tsx:451`）；`global-search-trigger.tsx`（唯一挂载点 `sidebar.tsx:292`，审计未点名）；`dir-picker-dialog.tsx`（唯一挂载点 `new-conversation-dialog.tsx:228`，审计未点名）。
- 删除 6 个文件（`git status` 为 `D`，未提交）；随之失效的导出/注释最小改动：`settings-dialog.tsx` 删 `SettingsButton`（唯一挂载点是 `sidebar.tsx:177`；其 `open-settings` 订阅在生产里本就无人挂载，live 设置入口是 `app-workbench.tsx` 的 store 驱动 `<SettingsDialog open={settingsOpen}>`）+ 随之无用的 `Settings as SettingsIcon` 与 `subscribeUiCommand` import；`user-guide-dialog.tsx:52` 删“`sidebar.tsx` 是无人引用的死代码”一句；`artifact-library.tsx:25` 注释“挂在 Sidebar 内”→“挂在会话视图「本会话产物库」抽屉内（`chat-panel.tsx`）”；`listdir/route.ts:13` 注释“（用于 DirPickerDialog）”删除（路由本身保留）；`OVERVIEW.md` 3 行地图更新（侧栏→`app-workbench.tsx` 内联 `wb-sidebar`、Agent 库→`agent-workspace.tsx`、会话创建→新建任务视图·`agent-workspace.tsx`）。
- 删除行为中性：`Sidebar` 在全仓无任何挂载点（`layout.tsx` / `page.tsx` / `app-workbench.tsx` / `workbench-view-router.tsx` / demo 均无），其挂载副作用（`fetchConversations` / `fetchAgents`、订阅 `open-agents`）在生产里本就从不运行；删后线上行为零变化。`sidebar-layout.test.ts` 测的是 `globals.css` 的 `.wb-sidebar` 与 `app-workbench.tsx` 文本，与 `sidebar.tsx` 文件无关，保留（W6 全量跑 8/8 通过）。
- 未动：`mobileSidebarOpen` store 状态、`.wb-sidebar` CSS、`ExperienceSidebar`、`GlobalSearch`（`layout.tsx` 挂载，⌘K 入口仍在）。

### §3 — ArtifactWorkspace hover-only 按钮（W3）— 完成

- 改法（只改 `src/components/artifact-workspace.tsx` 3 处 class，Top 5 同款修法：`focus-within` 显示 + 粗指针下常显）：预览 pill（`:868`）、收藏星（`:913`，未收藏态）、「···」触发器（`:1154`），各补 `group-focus-within:opacity-100 [@media(hover:none)]:opacity-100`。
- 注意：该文件 diff 里另有一处 `:496` Tab 激活态颜色改动（`bg-slate-900 text-white` → accent 胶囊 `bg-[var(--agenthub-accent)] text-[var(--primary-foreground)]`）是第二批 G 切换统一的改动，不是 W3 的（W6 核对 diff hunks 确认）。

### §4 + §6 + §7c + §7h — 调试板四项（W4）— 完成

- **§4 DetailsPanel Tab 折行**：Tab 条按钮 `shrink-0 whitespace-nowrap`、容器 `overflow-x-auto` + 内层 `w-max min-w-full`（宽屏下仍撑满整行，1366 表现不变）。
- **§6 空态三态**：`EmptyBoard` 改三态——无会话「还没有可查看的会话」/ 有会话无 Run「当前会话还没有可展示的 Run」/ 有 Run 无节点「暂无可展示的流程节点」，修掉加载结束后仍转圈的假加载（旧写法在 runs>0 但画布无节点时仍配转圈图标 +「正在准备流程展板」）；加载态仍在上层单独分支（`loadingRuns/loadingDetail` 时「正在加载会话任务图…」）。
- **§6 附带修复**：`stageVisualState` 增加 `unavailable → todo`（空 Run 阶段条不再全绿勾——无数据的阶段画空心点，不因 run 已完成就打绿勾）。
- **§7c 图内间距**（只动 `src/lib/agent-run-debug-board.ts` 3 个常量）：`rowGap 340→240`、`toolGridTopGap 260→200`、`summaryGap 300→220`；`runRowOffsetY 260`、`workerRowHeight 380`、`toolRowHeight 260` 经核实已够紧，决定不动（注释写明理由）。`fitView` minZoom 0.1 不动。
- **§7h 工具条**：CanvasToolbar 各组内边距收 2~4px，工具条 scrollX 488→432（W6 实测 431，1px 亚像素差，见 W6.3 注），未彻底消除。
- **测试**：`agent-run-debug-board.test.ts` 新增 2 个 pin 测试，50→**52/52**（W6 全量跑确认）。

### §7a/§7b/§7g — 新任务页三项（W5）— 完成

- **§7a 1200 字顶格团队行余量 12.4px**：`app-workbench.tsx` NewTaskView 容器同一 class 内 `md:pt-14→pt-10`、`pb-12→pb-8`（1366 下共省 32px 上下边距；390 下 pt 本就是 pt-10 不变，只 pb 省 16px）。
- **§7b 团队 chip 折行**：定位——折行的不是 composer 里的团队选择 chip（它已有 `truncate` 单行），而是最近团队行头像下的名字标签（`w-[72px]` 列内 7 字 11px ≈ 77px 折成两行）；两处标签 span 加 `whitespace-nowrap`（团队名 + 「新建团队」）。1366 下「需求到原型团队」2 行（27.5px）→ 1 行（77px 宽，列内左右各溢 2.5px，落在 18px 间隙内）；390 下 4 个标签全部单行。
- **§7g 500 字态 +10px 基线溢出**：核实为既有基线（内容底边 727.3px + 容器 `pb-12` 48px 底边距顶出视口，与 1200 字态同源），与 §7a 同一处修掉（pt/pb 各省 16px）+ §7b 标签单行（行高省 13.8px），500 字态页内可滚容器归零。

### §7d/§7e/§7f/§8 — 其余小项（W5）— 完成（其中两项 0 改动）

- **§7d PageShell 注释 — 0 改动（已满足）**：`workbench-primitives.tsx:22-23` 的 PageShell 注释早已写明「与卡片墙页（Agent 库）显式传 `contentClassName="w-full max-w-none"`」，Top 5 提交 `21a5561`（`fix(frontend): module-page Top 5 layout fixes`）引入；batch3 W8 的建议已过期。W6 独立核实：`git log -S '与卡片墙页'` 指向 `21a5561`，理由成立。
- **§7e README alt 文案**：`README.md:64`（EN）与 `README.zh-CN.md:64`（ZH）各改 1 行，按实拍图（`docs/images/teamflow-preview.png`）重写——旧文案两处失实：左图并无「对话历史」（只有导航 + 新建任务 + 使用指南 + Workspace），右图是新任务页而非「多 Agent 协作会话区」。只改文案，不动图。
- **§7f 无 JS 时 `:root` 仍为 ink 浅色**：`globals.css` 只动选择器，不动任何 token 值——`:root` / `.dark` 兜底从 ink 块移到白·石墨块（`:root, :root[data-theme="white-graphite"]` 与 `.dark, :root[data-theme="white-graphite"].dark`；ink 块只剩显式 `data-theme="ink"` 选择器）；注释同步（`globals.css` 头注 + `layout.tsx:72`）。安全性：显式 `data-theme` 选择器特异度高于裸 `:root`/`.dark`，且白·石墨块在文件里排在 ink 块之后；已保存的 ink 偏好仍优先。
- **§8a 390 抽屉导航后遮罩不自动关闭 — 0 改动（核实为非 bug）**：改前改后一致——抽屉点「Agent 库」后遮罩消失、抽屉滑出、视图切到 Agent 库。`changeViewFromMobile`（`setView` + `setMobileSidebarOpen(false)`）自旧提交 `bae0d93` 起就有关闭逻辑（W6 独立核实：`git log -S 'changeViewFromMobile'` 指向 `bae0d93`，且运行时实测通过）。batch2 W6 的记录应源于当时探针自身的状态问题（该轮 390 真实点击被遮罩拦截后改走 evaluate 直点）。附带观察（未改）：点「使用指南」后抽屉留在弹窗之下，关弹窗后回到抽屉，属合理状态保持。
- **§8b 390 会话列表无入口**：核实（改前）：390 下桌面侧栏 `display: none`，会话历史面板在 DOM 内但不可见；进对话页无活跃会话时为空态「从左侧选择一个会话继续聊天」，且顶栏不渲染、聊天区无 header、无汉堡——移动端无任何入口可达会话列表（仅 reload 回新任务页可逃出；`workbenchView` 不持久化，故不是永久困死）。改法（只动 `app-workbench.tsx`，约 30 行）：① `MobileWorkbenchDrawer` 在 `view === 'conversations'` 时把同一份 `ConversationListPanel`（embedded）嵌在导航上方，打开抽屉即见，含搜索 + 最近对话；② `ConversationListPanel` 加可选 `onSelectConversation` 回调（正常行、已归档行、右键菜单「打开对话」三处选中后调用），抽屉传 `onClose`，选中即收抽屉进聊天；桌面侧栏不传回调，行为不变；③ `AppWorkbench` 顶栏条件改为 `(view !== 'conversations' || !hasActiveConversation)`——无活跃会话时对话页也显示顶栏，否则空态下无入口开抽屉。有活跃会话时仍由聊天区 header + 汉堡接管（汉堡开的正是本抽屉，title「打开会话列表」至此名实相符）。

## W6 集中验证结果（2026-11-18 晚）

> 以下数字全部在最终树状态下重跑，不沿用 W1–W5 的旧数字。验证服务 `next start -p 3166`（127.0.0.1），隔离库 `AGENTHUB_DATA_DIR=/tmp/batch4-w6-data`（真实 `.agenthub-data` 未碰）；无会话空态另起 3167 服务 + 空库 `/tmp/batch4-w6-empty-data`（W4 同款）；验证后服务已停（按 PID 9618/13155）、端口已释放、隔离目录已删除。

### W6.1 树完整性

- `git rev-parse HEAD`：**`c383a4a`**。
- `git status --short`：45 行（41 个已跟踪改动文件：35 个 `M` + 6 个 `D`，+ 4 个未追踪 openspec 目录）。6 个删除文件确认 `D` 状态：`sidebar.tsx`、`agent-library.tsx`、`team-library.tsx`、`new-conversation-dialog.tsx`、`global-search-trigger.tsx`、`dir-picker-dialog.tsx`。
- 抽查关键改动在位：§1 why 注释（`experience-library.tsx:211`）+ 页头无 sticky；stat-card 两行式（值 nowrap、图标 `size-8`、px-3、迷你图 44×20）；artifact-workspace 3 处 `group-focus-within … [@media(hover:none)]`（`:868/913/1154`）+ `:496` 为第二批 G 改动；debug-board Tab 条（`shrink-0 whitespace-nowrap` + `overflow-x-auto` + `w-max min-w-full`）、`EmptyBoard` 三态、`stageVisualState` 的 `unavailable → todo`、lib 常量 `rowGap 240` / `toolGridTopGap 200` / `summaryGap 220`（`runRowOffsetY 260` / `workerRowHeight 380` / `toolRowHeight 260` 未动）；app-workbench `pt-10` / `pb-8` + 团队名 `whitespace-nowrap` 两处；globals.css `:root` / `.dark` 已在白·石墨块；PageShell 注释 `:22-23` 在位；README 两处 alt 已改。
- 删除文件无残留引用：全仓 grep `AgentLibrary|TeamLibrary|NewConversationDialog|DirPickerDialog|GlobalSearchTrigger|SettingsButton` 与 `sidebar.tsx` 字符串引用，在 `src` 内 **0 处**。

### W6.2 静态检查 + 全量测试 + 干净生产构建

- `npx tsc --noEmit`：**exit 0，错误 0**（`w6-tsc.log` 为空）。
- `npx eslint`（本轮 15 个改动文件）：**0 错误**（仅 2 条 warning：`globals.css` 被 eslint 配置忽略；`app-workbench.tsx:880` `<img>` 建议改用 `next/image`，batch3 已有，既存）。
- 全量 `npx vitest run`：**104 个测试文件全部通过；890 通过、4 跳过、0 失败**。基线说明：第二批终态 888 + W4 新增 2 个 pin 测试 = 890；4 跳过不变。`agent-run-debug-board.test.ts` **52/52** 通过；`sidebar-layout.test.ts` **8/8** 通过。
- 干净生产构建：`rm -rf .next && node node_modules/next/dist/bin/next build`（串行，无其他构建并行），**exit 0**，新 BUILD_ID **`BiE4hqen5Xo1ZhAQoluQ7`**，构建日志 `error` 0 次。起服后 `/` 200、`/demo` 200（curl 核对）。

### W6.3 Playwright 截图复核（八项，47 组测量）

验证种子（隔离库，验证后已全部清理，计数归零）：经验 12 条（usage_count 全 0 起步，totalUsage=0，第 5 卡「0 次」；探针中途 UPDATE 一条为 25 再测「25 次」）+ 团队「需求到原型团队」（2 成员）+ 会话 4（富图/空会话/只有消息/孤儿 Run）+ Run 5 + 产物 2。清理前 DB 核对：experiences 12 / conversations 4 / agent_runs 5 / artifacts 2 / agent_teams 1；探针未产生额外写入（删除类操作全部取消，草稿未落库）。清理后隔离目录已删除。

#### §1 + §5 — 完成（「0 次」由 W6 自行下种验证，W1 未单独下种的缺口已补）

| 视口 | 收起态摘要行 | 展开态 5 卡标签 | 展开态 5 卡值 | 卡高 | 主列溢出 | 页头滚动 |
|---|---|---|---|---|---|---|
| 1366×768 | 「全部 12 · 已启用 9 · 草稿 3 · 冷资产 9 · 累计使用 0 次」+「展开统计」，y=155 | 全部单行 | 全部单行（含「0 次」→「25 次」） | 99.8 统一 | **0** | y 25.5→25.5（列表 scrollTop 0→976） |
| 390×844 | 同上，y=237 | 全部单行 | 全部单行（含「0 次」→「25 次」） | 99.8 统一 | **0** | y 81.8→81.8（列表 scrollTop 0→1720） |

- 第 5 卡值：「0 次」态（totalUsage=0）与「25 次」态（UPDATE 一条 usage_count=25 后刷新）均单行；迷你图右沿均在卡内（1366 下第 5 卡 svg 右沿 949.4 < 卡右沿 1043）；文档 `scrollW == viewportW`，无页面级横向溢出；收起态摘要行正常。
- §1 结论：页头在滚动时位置不动——现状即固定，sticky 无滚动祖先可依，「不恢复」理由成立。

#### §2 — 完成（死代码回归五处全过）

| 检查 | 结果 |
|---|---|
| Agent 库主区 | 标题「Agent 库」+「创建」按钮俱全 |
| 团队详情 | 「我的 Agent」页签见种子团队卡片 → 详情弹窗打开，2 名成员（设计师/工程师）俱全 |
| 设置弹窗 | `?setup=api-keys` 打开，「Key 说明」「外观」俱全（`SettingsButton` 删除无影响） |
| ⌘K 全局搜索 | 弹窗打开，「搜索消息」 |
| 会话产物库抽屉 | 对话视图 → 选种子会话 → 「本会话产物库」抽屉打开，见种子产物「W6 验证文档」 |
| pageerror | **0** |

- 过程注：首轮探针因会话按钮精确文本匹配失败（按钮含时间等附加文本）未点到会话，改 `includes()` 匹配后通过（探针 bug，非产品问题）。

#### §3 — 完成（三处，键盘 + 触屏 + 桌面基线）

| 条件 | 预览 pill | 收藏星 | 「···」触发器 |
|---|---|---|---|
| 桌面 1366 基线（无 hover 无 focus） | opacity 0 | opacity 0 | opacity 0 |
| 桌面 1366 真实键盘 Tab 聚焦 | **1** | **1** | **1** |
| 触屏 hover:none 1366 | **1** | **1** | **1** |
| 触屏 hover:none 390 | **1** | **1** | **1**（文档 scrollW 390） |

- 桌面基线 hover 行为未变（未 hover 时仍为 0，hover 才显）；首轮采样曾抓到预览 pill 过渡中途的 0.969（Tab 后 100ms 采样），等过渡沉降（450ms）后重采为 1——探针采样时机问题，非产品问题。

#### §4 + §6 + §7c + §7h — 完成

| 检查 | 结果 |
|---|---|
| 富图节点（点 Run 节点展开后） | **10 个**，位置与 W4 实测逐值相同（message/run/agent×3/tool×2/summary/message/run）；fitView zoom **0.14313**（>0.1） |
| worker 底边→工具顶边 | **200**（= 常量 `toolGridTopGap`） |
| 工具底边→汇总 | **220**（= 常量 `summaryGap`） |
| 行距 | **240**（= 常量 `rowGap`） |
| DetailsPanel Tab 1366 | 6 个，同高 30px，strip scrollX 0 |
| DetailsPanel Tab 390 | 6 个，同高 30px（各宽 56px），strip 355/355 scrollX 0，文档 scrollW 390；**6 个逐个可点，aria-pressed 均翻转为 true** |
| CanvasToolbar scrollX（inspector 终端 Tab + 侧栏收起，W4 同款条件） | **431**（W4 上报 432；1px 亚像素差，scrollW 855 vs W4 的 856——同一结论：收窄了，未彻底消除） |
| 工具条（无 inspector） | scrollX 0 |
| 空态：无会话（空库）1366/390 | 「还没有可查看的会话」，0 节点，0 转圈，0 溢出 |
| 空态：有会话无 Run 1366/390 | 「当前会话还没有可展示的 Run」，0 节点，0 转圈 |
| 空态：有 Run 无节点 1366/390 | 「暂无可展示的流程节点」，0 节点，0 转圈 |
| 只有消息（无 Run）1366/390 | 画 1 个消息节点，无空态标题、无转圈（W4 同款预期，属正常态而非空态） |

- 过程注：首轮探针把「只有消息」误当成「有会话无 Run」测空态标题（产品实际画 1 个消息节点，符合 W4 的预期映射），已按 W4 映射修正；无会话态在种子库里因调试板自动选中首个会话而无法复现，改用全新空库（W4 同款方法）补测通过。

#### §7a/§7b/§7g — 完成（数字与 W5 上报逐值相同）

| 字态（1366×768） | 团队行底边 | 余量 | 行高 | 页内可滚容器溢出 |
|---|---|---|---|---|
| 空态 | 629.1px | — | 58.1px | 0 |
| 500 字 | 696.6px | — | 58.1px | **0**（改前 +10px 已归零） |
| 1200 字 | **724.8px** | **43.2px**（改前 12.4px） | 58.1px | 0（仅 textarea 自身内部滚动，`max-h` 设计使然） |

- 最近团队名「需求到原型团队」1366/390 下均为单行（1366 下 77px 宽）；390 下「需求到原型团队」「新建团队」两个标签全部单行，文档 scrollW 390。

#### §8b + §8a — 完成

| 检查（390） | 结果 |
|---|---|
| 无活跃会话对话页顶栏汉堡 | 可见；空态「从左侧选择一个会话继续聊天」在 |
| 汉堡开抽屉 | 抽屉打开，见「对话历史」+ 搜索 + 种子会话 |
| 点种子会话 | 抽屉收起，进聊天（标题出现、顶栏消失、聊天区汉堡出现） |
| §8a：抽屉点「Agent 库」 | 抽屉关闭、遮罩消失、视图切到 Agent 库（0 改动理由成立） |

#### §7f — 完成

| 首屏 | data-theme | `--background` | body 背景 |
|---|---|---|---|
| 无 JS 1366 | （无） | **`#fff`**（改前 `#f4eee0`） | `rgb(255,255,255)` |
| 有 JS 1366 | white-graphite | `#fff` | `rgb(255,255,255)` |
| 预置 ink 1366 | ink | `#f4eee0` | `rgb(244,238,224)` |

- 已保存的 ink 偏好不受影响（仍为 ink 首屏）。

## 逐项状态（汇报用）

| 项 | 状态 |
|---|---|
| §1 页头吸顶 | ✅ 决定不恢复（PageShell 不滚动，sticky 无祖先可依；B3 收起态已提前首行）；页头滚动时 y 不动，实测证实 |
| §2 F1 死代码清理 | ✅ 删 6 文件，全仓 0 残留引用；回归五处全过，`sidebar-layout.test.ts` 8/8 |
| §3 ArtifactWorkspace hover-only | ✅ 三处键盘 Tab 可见、触屏常显、桌面基线未变 |
| §4 DetailsPanel Tab 折行 | ✅ 390 下 6 Tab 单行同高、逐个可点；1366 回归通过 |
| §5 统计卡换行 | ✅ 「0 次」与「25 次」在 1366/390 下均单行，卡高统一 99.8，主列溢出 0（5px 溢出一并解决） |
| §6 调试板空态 | ✅ 三态空态正确、无转圈、无白屏；空 Run 阶段条不再全绿勾；有 Run + 有节点回归通过 |
| §7a 1200 字团队行 | ✅ 底边 755.6→724.8px，余量 12.4→43.2px |
| §7b 团队 chip 折行 | ✅ 最近团队名 1366/390 下单行 |
| §7c 图内间距 | ✅ 200/220/240 逐值落地，fitView zoom 0.143 |
| §7d PageShell 注释 | ✅ 0 改动（注释在 Top 5 提交 21a5561 里已写，W6 独立核实） |
| §7e README alt 文案 | ✅ 两处各改 1 行，按实拍图重写 |
| §7f 无 JS `:root` 兜底 | ✅ 换成白·石墨；无 JS 首屏 `#fff`，有 JS 仍为 white-graphite，ink 预置不受影响 |
| §7g 500 字态溢出 | ✅ +10px 基线溢出归零 |
| §7h 工具条内部滚动 | ✅ scrollX 488→431（W4 上报 432，1px 亚像素差），未彻底消除 |
| §8a 抽屉遮罩 | ✅ 0 改动（关闭逻辑自 bae0d93 起就存在，batch2 记录源于探针自身状态问题，W6 独立核实 + 运行时复核） |
| §8b 会话列表入口 | ✅ 390 下抽屉嵌会话列表、点会话收抽屉进聊天；无活跃会话时顶栏汉堡可见 |

## 遗留清单（非阻塞，留待用户定夺或下一批）

1. **CanvasToolbar 内部滚动未彻底消除**：inspector 终端 Tab + 侧栏收起时 1366 下仍有 431px 内部滚动（工具条内部可滚动、卡内不溢出、页面级无溢出）；再收紧需动工具条分组或按钮尺寸，本轮已收 2~4px，余量留待后续。
2. **W2 遗留（未删、留待定夺）**：历史文档（openspec 历史记录、`specs/04-artifacts.md:309`、`specs/11-platform.md:238`、`specs/16-message-search.md:364`）仍提及已删文件，属历史记录/规格文本；`skills/add-experience.md:25,162` 的“加经验”步骤仍 instruct 后人改 `sidebar.tsx`，现已失效，需另改该 skill；`src/lib/api.ts` 两个孤儿 helper（`listDirectory`、`getServerPlatform`）现无调用方；`/agents` 与 `/settings` 斜杠命令仍 `emitUiCommand('open-settings' / 'open-agents')`，其唯一订阅方随删除已不存在（删除前就已是 no-op，未引入回归），如需恢复应改走 store，属另立项；`UiCommand` 的 `'open-agents'` 变体随之残留。
  - （2026-11-19 batch5-cleanup W2 已处理：spec 与 skill 引用已改指当前入口，历史记录已加注，两个孤儿 helper 已删，斜杠命令已改走 store（`/settings`→`openSettingsTarget()`、`/agents`→`setWorkbenchView('agents')`，Playwright 实测均可用），`UiCommand` 仅剩 `'open-user-guide'`；证据 `~/workspace/frontend-polish-evidence/batch5-cleanup/w2-*`，记录见 batch5-cleanup PROGRESS。）
3. **§8a 附带观察**：点「使用指南」后抽屉留在弹窗之下，关弹窗后回到抽屉，属合理状态保持，未动；如需改动可另议。
4. **团队详情对话框溢出风险**（用户未定夺，见 MEMORY 遗留）：本轮未动。
5. **G 范围外深色 `text-white` on accent**（第二批遗留）：非切换控件，另立项。
6. **搜索结果行 JSON 原文渲染**（第二批遗留⑥，既有问题，另立项）。
7. **POST /api/automations 建任务顺带建同名会话**（第一批遗留⑥，是否合乎预期待确认）。

## 证据目录

`~/workspace/frontend-polish-evidence/batch4-leftovers/`（W6 新增）：

- `w6-seed.mjs`、`w6-verify.mjs`、`w6-verify2.mjs`、`w6-verify-noconv.mjs`、`w6-verify.log`、`w6-verify2.log`、`w6-results.json`（34 组）、`w6-results2.json`（11 组）、`w6-results-noconv.json`（2 组）、`w6-tsc.log`（空）、`w6-eslint.log`、`w6-vitest-full.log`、`w6-build.log`（BUILD_ID `BiE4hqen5Xo1ZhAQoluQ7`）、`w6-server.log`、`w6-server-empty.log`
- 截图 37 张：`w6-exp-0times-expanded-{1366,390}.png`、`w6-exp-0times-scrolled-{1366,390}.png`、`w6-exp-25times-expanded-{1366,390}.png`（6）、`w6-deadcode-{agent-library,team-detail,settings,cmdk,artifact-drawer}-1366.png`（5）、`w6-artifact-{1366-baseline,1366-keyboard,1366-touch,390-touch}.png`（4）、`w6-board-{rich,inspector}-1366.png`、`w6-board-tabs-390.png`、`w6-board-empty-{norun,orphan,msgonly}-{1366,390}.png`（6）、`w6-board-empty-noconv-{1366,390}.png`（2）、`w6-newtask-{empty,500,1200}-1366.png` + `w6-newtask-390.png`（4）、`w6-drawer-390-{conv-empty,open,after-select,after-nav}.png`（4）、`w6-{nojs,js-firstpaint,ink-preset}-1366.png`（3）

> 未 commit、未 push、未部署；HEAD 仍为 `c383a4a`。

## W6 过程备注（不影响结论）

- 探针 bug 四处，均已修正重跑、数字为重跑后的最终值：① `gotoView` 的抽屉回退分支曾用 `el.click()` 点到隐藏的桌面导航按钮（视图切了、抽屉没关），改为只点可见 rect 的按钮；② 两处 `page.evaluate` 内用了 Node 侧的 `round`（`ReferenceError`），改在函数内定义；③ Run 节点用 Playwright locator 点击会被 ReactFlow pane 拦截，改 W4 同款 boundingBox + `mouse.click`；④ 会话按钮精确文本匹配失败（按钮含时间等附加文本），改 `includes()` 匹配（W2 同款）。
- 假失败两处，均已证实为探针前提问题、非产品问题：① 首轮把「只有消息」误当成「有会话无 Run」测空态标题（产品实际画 1 个消息节点，与 W4 的预期映射一致）；② 无会话态在种子库里因调试板自动选中首个会话而无法复现，改用全新空库补测通过。
- 1px 差：CanvasToolbar scrollX 实测 431 vs W4 上报 432（scrollW 855 vs 856），亚像素/边框舍入差，结论一致（收窄了，未彻底消除），探针容差 ±2px。
- 停服按 PID（9618/13155）停，未用 `pkill -f`（前几轮已有自匹配教训）；验证后端口已释放、隔离目录已删除；真实 `.agenthub-data` 未碰。
