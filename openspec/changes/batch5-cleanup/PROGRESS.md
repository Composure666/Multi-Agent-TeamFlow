# 第五批：零散遗留清理（batch5-cleanup）— 实施记录

- 日期：2026-11-19
- 背景：白色主题 + 第一批 + 第二批 + 第四组四轮改动均已做完并验证通过、未提交（HEAD `c383a4a`），用户批准顺手修掉剩下的小项、再各方面测试一下。这是清理批，不是新一轮大改。
- 方案：`openspec/changes/batch5-cleanup/proposal.md`。
- 状态：W1–W7 全部完成并经 W7 在最终树状态下重跑验证（本文件 §W1–§W7）；未 commit、未 push、未部署。
- 证据：`~/workspace/frontend-polish-evidence/batch5-cleanup/`（各 worker 文件名前缀 `w1-*`～`w7-*`）。

## W1 — 调试板工具条内部滚动（proposal §1）— 完成，scrollX 归零

- 现状核实（基线实测，`w1-results-baseline.json`）：工具条单行内容宽 855px（范围组 138 + 展开按钮 115.6 + 视图组 170 + 右侧组 395.4 + 间距/内边距），而画布列宽在 1366 下检查器概览 Tab 时 564px、终端 Tab + 会话侧栏收起时 596px、终端 Tab + 会话侧栏展开时仅 424px，390 下仅 337px。单行无论如何收边距都放不下——batch4 只收 2~4px 是不够的，内部滚动是结构性问题，不是边距问题。
  - 基线 scrollX：1366 无检查器 0；1366 检查器概览 291；1366 终端 Tab + 侧栏收起 259；1366 终端 Tab + 侧栏展开 **431**；390 无检查器 **518**；390 Dialog 检查器 518。
  - 注：W6 记录称“inspector 终端 Tab + 侧栏收起时 1366 下仍有 431px”，本轮基线复测中 431 出现在**侧栏展开**态（clientW 424），侧栏收起态为 259（clientW 596）。两种状态本轮都测、都归零，结论不受影响；数值差异可能是 W6 探针那次收起点击未生效，特此说明。
- 改法（只动 `src/components/agent-run-debug-board.tsx` 的 `CanvasToolbar`，手术式）：
  - 外层 `flex h-11 … gap-1.5` → `flex min-h-11 flex-wrap … gap-1 py-1`：窄了就折到下一行，不再横向滚动；单行时高度与原来一致（46.8px）。
  - 「适配视野」「重置布局」改为纯图标按钮（`size-7`，各省约 60px；`title` 与新增 `aria-label` 保留，功能不变）。
  - 「展开/收起当前 Run」缩为「展开/收起 Run」（省约 30px，`title` 补全“展开/收起当前 Run 的子图”）。
  - 范围/视图分段按钮 `px-2 → px-1.5`、筛选胶囊 `px-2.5 → px-2`；容器 `px-2` 不动。
  - 单行总宽 855 → 约 657px（范围组 129.5 + 展开 85.8 + 视图组 157.3 + 右侧组 259.7 + 间距/内边距）。
  - `overflow-x-auto` 保留作兜底（未来标签变长时滚而不溢出卡片）；工具条加 `data-testid="canvas-toolbar"` 供探针定位。
  - 旧注释按实测重写（旧文案的 910px/634px/441px 与实测不符）。
- 代价（实测可见、可接受）：检查器打开时工具条折两行（高 46.8 → 77.5px），390 下折三行（高 115.8px），画布纵向少约 31px / 69px；1366 无检查器时仍单行（46.8px 不变）。所有按钮不挤扁、不折行（`shrink-0 whitespace-nowrap` 保留）。

### 验证（最终树状态，`next start -p 3171`，隔离库 `AGENTHUB_DATA_DIR=/tmp/batch5-w1-data`，W6 同款种子；验证后服务已停、隔离目录已删除，真实 `.agenthub-data` 未碰）

| 条件 | 改前 scrollX | 改后 scrollX | 工具条高 | 页面级溢出（docScrollW） |
|---|---|---|---|---|
| 1366 无检查器 | 0 | **0** | 46.8（单行） | 1366 |
| 1366 检查器概览 Tab（420px） | 291 | **0** | 77.5（两行） | 1366 |
| 1366 检查器终端 Tab + 侧栏收起（560px） | 259 | **0** | 77.5（两行） | 1366 |
| 1366 检查器终端 Tab + 侧栏展开（560px，最差） | 431 | **0** | 77.5（两行） | 1366 |
| 390 无检查器 | 518 | **0** | 115.8（三行） | 390 |
| 390 Dialog 检查器打开 | 518 | **0** | 115.8（三行） | 390 |

- 静态检查：`npx tsc --noEmit` exit 0；`npx eslint src/components/agent-run-debug-board.tsx` exit 0（改动后仅格式换行，eslint 重跑通过）。
- 相关测试：`npx vitest run src/lib/agent-run-debug-board.test.ts` **52/52** 通过。
- 干净生产构建：`rm -rf .next && node node_modules/next/dist/bin/next build` exit 0，新 BUILD_ID **`114tIwHVYrJzYViXDSqc5`**（`w1-build.log`）。
- 按钮功能回归（`w1-verify-func.mjs`，0 失败）：「收起 Run」→「展开 Run」→「收起 Run」文案翻转正常；「适配视野」「重置布局」图标按钮各 1 个、title 保留、可点；筛选胶囊「错误」点后 `aria-pressed=true`；pageerror 0。
- 截图复核：`w1-toolbar-1366-worst-after.png`（两行工具条全部可见、检查器终端正常）、`w1-toolbar-390-noinspector-after.png`（三行全部可见、无溢出）。
- 过程注：功能探针前两次因导航点击未切到运行展板而超时（与 W6 记录的探针时序问题同类），用 `w1-verify.mjs` 同款 helper 重组后一次通过；产品行为由主探针 2 次全绿（改后复跑一次亦 0 失败）证实，非产品问题。

### 证据目录

`~/workspace/frontend-polish-evidence/batch5-cleanup/`（W1）：

- `w1-seed.mjs`（W6 种子改隔离库路径）、`w1-verify.mjs`（主探针）、`w1-verify-func.mjs`（按钮功能探针）
- `w1-results-baseline.json`、`w1-results-after.json`、`w1-results-func.json`、`w1-build.log`（BUILD_ID `114tIwHVYrJzYViXDSqc5`）
- 截图 13 张：`w1-toolbar-{1366-noinspector,1366-inspector,1366-worst,1366-worst-expanded,390-noinspector,390-dialog}-{baseline,after}.png`（12）+ `w1-toolbar-func-1366.png`（1）

> 未 commit、未 push、未部署；HEAD 仍为 `c383a4a`（本轮 W1 只改 `src/components/agent-run-debug-board.tsx` 的 CanvasToolbar + 新建本记录文件）。

## W3 — G 范围外深色 accent 上的白字（2026-11-19）— 完成

- 修法（batch1 H2 / batch2 G 同款）：`text-white` → `text-[var(--primary-foreground)]`。全仓扫修，不只清单行号。
- 扫修：`text-white` 全仓 61 处；`bg-[var(--agenthub-accent)]` 精确 token 72 串——同串白字 28 处、同串已是 pf 10 处（batch2 G 已修）、无文字 34 处（圆点/进度条/开关轨道/伪元素竖条；`agent-workspace:472,1284` 两处 Button 走默认 `text-primary-foreground`）；另 `bg-primary` 实底 + 白字 1 处、`style backgroundColor: var(--agenthub-accent)` 1 处。
- 改动 31 处 / 19 个文件：直换 28 处（`agent-config-form:895`、`agent-create-wizard:206`、`agent-run-debug-board:882`、`agent-workspace:958,1128,1193`、`analytics:318,896`、`ask-user:231`、`automation:730,823`、`capability:814,1345`、`create-team:1025`、`dispatch-plan:97`、`experience-sidebar:166`、`home-sections:156`、pending 四面板 `127/137/134/173`、`app-workbench:406,437,483,606,991`、`artifact:790,857`）+ 特殊 3 处（ask-user :298 选中圆点 `bg-white`→pf；file-library 附加切换按 attached 分流文字色；最近团队圆按 accent 槽分流文字色）。
- 对比度（WCAG，`w3-contrast.mjs`，12 组主题/模式）：静止态 pf/accent 全部 ≥ 4.5:1（最低 terra 浅 4.70；白·石墨深 1.27→13.43）；唯一不达标 wine 深 hover 3.82（白字 hover 亦仅 4.18，accent-hover token 层面残留，另立项）。
- 自验：`tsc` 0；`eslint`（19 文件）0 错误（1 条 `<img>` warning 改前就有）；全量 vitest 首跑 11 文件超时失败（零断言失败，与另一 worker 并行 `next build` 争用有关），补跑 10/11 通过、单跑 `agent-runner-debug-events.test.ts` 通过（该 beforeAll 超时是 batch1/batch2 已记的并发抖动）；干净构建 exit 0（BUILD_ID `ZjUfH0Uks13w2gtowOIve`，本轮构建；另有他 worker 17:29 的构建 `1qN_-bpPHor3ci8N4ZwIe`，探针补测在该构建上重跑通过）。
- 深色 Playwright 复核（1366，白·石墨深，隔离库 `/tmp/batch5-w3-data`，已清）：12 处实测均为 **13.43:1**（`rgb(28,28,26)` / `rgb(232,228,216)`）——新任务最近团队 accent 圆、Agent 库复选框选中态（经向导真实建 Agent 后测得）、向导步骤 1 完成态、配置表单步骤 1 完成态、新建团队步骤 1 完成态、能力中心分页、数据概览分页当前页 + 「应用」、自动化运行按钮、经验侧栏推广箭头、调试板重新运行、/home 用户气泡；文件库图片附加按钮：未附加白字 19.67、未附加 hover（pf）13.43、已附加态与 hover 同 token（`bg-primary` + pf，文件行已附加态实测同为 13.43）。
- 未修（另立项）：`capability:1346` violet 分支 4.23:1；`debug-board:3216` 状态色圆点（emerald 2.54 / blue 3.68 / rose 3.67 / amber 2.15）；`agent-avatar` 调色板头像；最近团队圆非 accent 槽（`#3E7CB1` 白字 4.45）；ask-user 对话框与派发/待审批面板 live UI 无法触发（需真实模型/待审批），token + 代码验证。
- 证据：`~/workspace/frontend-polish-evidence/batch5-cleanup/`（`w3-contrast.mjs` + `w3-contrast.json`、`w3-seed.mjs`、`w3-verify.mjs` / `w3-verify2.mjs`、`w3-results.json` / `w3-results2.json` / `w3-fileresults.json` / `w3-imgresults.json` / `w3-home-result.json`、截图 `w3-*-dark-1366.png` 17 张、`w3-tsc.log` / `w3-eslint.log` / `w3-vitest.log` / `w3-vitest-rerun*.log` / `w3-build.log` / `w3-probe*.log` / `w3-server*.log`、`w3-record.md`）。
- 探针注：v1 `page.evaluate(字符串函数)` 返回 undefined（字符串只会被当表达式求值），v2 改字符串 IIFE；数据概览会折叠侧栏（focus 模式），探针内须把数据概览放最后；另一 worker 构建中途撕裂 `.next` 曾致 ChunkLoadError，补测在稳定构建上重跑通过。

> 未 commit、未 push、未部署；HEAD 仍为 `c383a4a`（本轮 W3 只改 19 个组件文件内的文字色 token + 新建本记录与证据文件）。

## W2 — 历史文档与 skill 引用 + 孤儿 helper + 斜杠命令 no-op（2026-11-19）— 完成，斜杠命令选 ① store 驱动

- 结论：四件全部完成。详见 `~/workspace/frontend-polish-evidence/batch5-cleanup/w2-report.md`（本节为其摘要；W7 已在最终树上复核 grep 与 Playwright，见 §W7）。

### Spec 与历史记录

- Spec 改指当前真实入口（逐处实测核对）：`specs/04-artifacts.md:309` ArtifactLibrary → 会话视图「本会话产物库」抽屉（`chat-panel.tsx:249`，传当前 conversationId 时只列本会话；点击拉取完整内容开右侧预览，不切会话）；`specs/11-platform.md:238` 整节改写为「已随对话框删除」（该对话框 2026-11-18 已删；现新建会话入口无 boundPath 输入框，全部 `createConversation` 调用点只传 title/mode/agentIds；`GET /api/platform` 路由仍保留但前端暂无调用方，见遗留）；`specs/16-message-search.md:364` 删 trigger 行，`global-search.tsx`（挂 `layout.tsx`，⌘K 监听在组件内 `:36-39`），§9.3 Sidebar 过滤 input → 会话列表现有「搜索对话」input（`app-workbench.tsx:1833`）；同类新发现顺带修 `specs/09-frontend-architecture.md:223-226` 组件树（`<Sidebar />` 分支标注已删，现为 `app-workbench.tsx` 内联 `wb-sidebar` + `WorkbenchViewRouter`）与 `docs/architecture.puml:37`（`[AgentLibrary]` → `[AgentWorkspace]`）。
- 历史记录：17 个 openspec 文件各加 1 行删除注（`batch5-cleanup W2` 标记），正文叙述一字未改；`batch4-leftovers/PROGRESS.md` 遗留项 2 下追加已处理子项。`batch5-cleanup/proposal.md` 本就以「已删」 framing 写现状，未动。

### `skills/add-experience.md`

- `:25` 前置阅读 7：`sidebar.tsx`（`Mode` 联合、TabButton）→ `app-store.ts:31`（`AppWorkbenchView` 联合）、`workbench-navigation.ts`（`WORKBENCH_NAVIGATION`）、`app-workbench.tsx`（视图映射约 `:184-189`）。
- `:162` §8 第一步：改 `sidebar.tsx` 加 `Mode`/`TabButton` → 视图三处：`app-store.ts:31` 联合加 `'experiences'`；`workbench-navigation.ts` 加 `{ id: 'experiences', label: '经验资产', icon: BookOpen, group: 'workspace', ... }`（`:30` 现状，桌面侧栏与移动端抽屉都读这张表，不用另写 Tab）；`app-workbench.tsx` 视图映射（`:189` 现状）加 `experiences: () => <ExperienceLibrary … />`。
- §8 另修同段过期内容：数据不进 `app-store.ts`（现无 `experiencesByAgent`/`upsertExperience`/`removeExperience`，全仓 grep 为 0）——`experience-library.tsx` 自持 `useState`，直接调 `lib/api.ts` 的 `fetchExperiences` 等 helper（约 `:1463` 起，已核实）。
- 实施记录（P0，2026-09-13）节首加注：以下为当时记录，`sidebar.tsx`（含「资产」Tab）已于 2026-11-18 删除，现入口为 `experiences` 视图；历史叙述保留原样。
- 核对方法：上述文件/行号均按当前代码实测，步骤可走通。

### 孤儿 helper — 已删

- 删 `src/lib/api.ts` 整段「Filesystem (DirPicker)」：`getServerPlatform()`、`listDirectory()` + 随之无用的 `ListDirResult`、`ServerPlatform` 类型（19 行）。依据：全仓 grep（含测试文件、动态/字符串引用），删除前除定义外无任何调用方；删后 `src` 内 0 处。`/api/platform` 与 `/api/fs/listdir` 两个服务端路由保留（不在本项范围；batch4 已决定保留 listdir 路由）。

### 斜杠命令 — 选 ① store 驱动（已实测）

- 为什么不选 ②（删除命令）：两个入口在 live UI 里都有现成位置且是用户可见功能——设置弹窗已有 store 驱动（`app-workbench.tsx:105,205` 的 `<SettingsDialog open={settingsOpen}>`）；Agent 库已有视图切换（`app-workbench.tsx:186` 的 `agents: () => <AgentWorkspace …>`，侧栏导航同款 `setView('agents')`）。恢复成本是两行 store 调用，且与使用指南弹窗的 `goSettings`/`goView`（`user-guide-dialog.tsx:115-125`）同款模式；删命令等于删功能，没有理由。
- 改动：`src/components/message-input.tsx` 删 `emitUiCommand` import；`executeSlashCommand` 里 `settings` → `openSettingsTarget()`（store action，置 `settingsOpen=true` + 收移动端抽屉，`app-store.ts:366`），`agents` → `setWorkbenchView('agents')` + `setMobileSidebarOpen(false)`（与 `changeViewFromMobile` 同款收抽屉）。`MessageInput` 只在 `chat-panel.tsx:217` 渲染，store 恒可用。`src/lib/ui-command-events.ts`：`UiCommand` 从 `'open-settings' | 'open-agents' | 'open-user-guide'` 收为 `'open-user-guide'`；`emitUiCommand` 仍被 `app-workbench.tsx:629,1035`（使用指南入口 ×2）使用，`subscribeUiCommand` 仍被 `user-guide-dialog.tsx:95` 使用，均未动。`src/components/sidebar-layout.test.ts` 未动（它只数 `app-workbench.tsx` 里的 `emitUiCommand('open-user-guide')`，仍为 2 处）。
- Playwright 实测（W2，隔离库 `/tmp/batch5-w2-data`，dev 服务 3173）：`/settings` 菜单「打开设置」出现、Enter 后设置弹窗打开（含「Key 说明」「外观」）、Esc 关闭；`/agents` 菜单「打开 Agent 管理」出现、Enter 后切到 Agent 库视图（标题「Agent 库」+「创建」按钮，输入框消失）；pageerror 0。W7 在最终树上重跑通过（见 §W7）。

### 自验（W2）

- `npx tsc --noEmit` exit 0；`npx eslint`（3 个改动 src 文件）exit 0。
- 全量 vitest：首轮 868 通过 / 1 失败 / 29 跳过（7 文件失败，全部是 `beforeAll` hook 10s 超时与 1 个 ppt 超时，皆为未碰的 server 测试文件）；7 文件单独重跑 6/7 通过，剩余 1 文件（`agent-runner-debug-events.test.ts`）单独再跑通过（单跑 9.91s，逼近 10s hook 上限，并行负载下超时，属负载抖动，与本次改动无关）。停服后最终重跑：**104 文件全部通过；894 通过 / 4 跳过 / 0 失败**（`w2-vitest-full2.log`）。通过数 894 vs batch4 基线 890 的差值来自同批其他 worker 在同树并行落地的改动（如 `search-service.test.ts`），本人未增删任何测试。`src/components/sidebar-layout.test.ts` **8/8**。
- grep 复核：`src` 内已删文件标识符（`AgentLibrary|TeamLibrary|NewConversationDialog|DirPickerDialog|GlobalSearchTrigger|SettingsButton` + 6 个 `*.tsx` 字符串）**0 处**；`open-settings`/`open-agents` 在 `src` 内 **0 处**；`listDirectory|getServerPlatform|ListDirResult|ServerPlatform` 在 `src` 内 **0 处**。文档内剩余 84 行提及均为三类已注明上下文：① 18 行新加的删除注（含 skill 实施记录注）；② 6 行改写后的 spec/skill（逐行标「已删」并指当前入口）；③ 各 openspec 历史文件内的旧叙述（每文件顶部已有删除注）；另 `batch5-cleanup/proposal.md` 3 行是本批现状描述（本就写明已删）。
- 过程注：首次在 3171 起服撞上同批 W1 worker 的 `next start`（`EADDRINUSE`，curl 200 实际命中了 W1 的服务）；改用 3173 并核对 `/api/conversations` 返回 `[]` 后才下种。另有一次 `pkill -f "next dev -p 3173"` 自匹配杀掉了自己的 shell（前几轮同款教训），改按 PID/端口停服。

> 未 commit、未 push、未部署；HEAD 仍为 `c383a4a`。

## W4 — 搜索结果行 JSON 原文渲染（2026-11-19）— 完成

- 详见 `~/workspace/frontend-polish-evidence/batch5-cleanup/w4-record.md`（本节为其摘要；W7 已在最终树上重跑 API + Playwright，见 §W7）。

### 根因

- 渲染链：`global-search.tsx` → `SearchResultItem`（`search-result-item.tsx`）原样渲染 `hit.snippetHtml`（`dangerouslySetInnerHTML`）。
- `snippetHtml` 的两条生成路径（`src/server/search-service.ts`）：FTS 路径干净（`messages_fts` 只索引 parts 里 `type='text'` 的 `content`，`snippet()` 出来的就是正常文本）；**LIKE 兜底路径是 bug**：`runLikePath` 用 `substr(m.parts, max(1, instr(m.parts, ?) - 30), 80)` 直接切 `parts` 列的 JSON 原文。store（`src/stores/search-store.ts:66`）在查询汉字 < 3 个时走 LIKE——即几乎所有英文查询和 1–2 字中文查询——所以搜「渲染」「bash」这类词时行内显示 `[{"type":"text","content":...}]`。
- 复现（修前）：`search-service.test.ts` 新增 5 项测试全部失败，snippet 实测为 `'[{"type":"text","content":"渲染<b>加粗</b>方案"}]'`、`'"callId":"call_1","toolName":"bash","args":…'`。

### 改法（只动 `src/server/search-service.ts` + 测试 + 一行类型注释）

- `runLikePath`：匹配条件（`m.parts LIKE`）、排序（`created_at DESC`）、分页都不动；只把 snippet 生成从 SQL 切 JSON 改为取回 `m.parts` 后在 JS 里生成。
- 新增 `buildLikeSnippet(partsJson, query)` + `partsToSnippetText(parts)`：按 spec 03 历史拼接映射 + `message-parts.tsx` 的展示口径把 parts 转一行纯文本——text/thinking/code 取 content；tool_use 用 `ToolUsePart` 同款 `getToolDisplayName`（`src/lib/tool-display.ts`，已是消息渲染在用的 helper）写成 `[调用 执行命令]`，bash 的字符串 `command` 单列（只取字符串，不 dump args JSON）；tool_result 只留可读字符串结果（`result` 字符串或 `output` 字段，其余跳过，PartList 同样把它合并进 tool_use）；artifact_ref → `[产物: id]`；deploy_status / deploy_candidates / 附件用 spec 03 的 `[部署预览：…]`、`[部署候选：…]`、`[图片附件：…]` 形式。空白折叠成单空格。
- 窗口保持旧 SQL 同款（命中前 30 字、共约 80 字），命中词包 `<mark>`（与 FTS 路径一致）；命中只落在 JSON 字段名/工具名原文里时（如搜 `bash` 只匹配到 `"toolName":"bash"`），窗口从文本开头取、不标 mark——行内仍是正常文本。
- 文本先转义（`& < > "`）再拼 `<mark>`：snippet 经 `dangerouslySetInnerHTML` 渲染，消息文本里的 `<b>` 等不再原样进 DOM（旧写法同样不转义，这是顺带收紧）。
- `src/shared/types.ts`：`SearchHit.snippetHtml` 注释由「FTS 有 mark、LIKE 是纯文本」改为「两路都含 `<mark>`，其余为纯文本」。
- 前端零改动：`SearchResultItem` 已按 `<mark>` 渲染 snippetHtml，无需动。未动：搜索查询、重试（`runSearch()`）、排序、FTS 路径、`global-search.tsx`、`search-result-item.tsx`、store。

### 自验（W4）

- `npx vitest run src/server/search-service.test.ts`：**15/15 通过**（新增 5 项：LIKE 纯文本无 JSON、混合 parts 结构化标签、tool_use-only 标签、HTML 转义；另把旧断言「LIKE 无 mark」改为「LIKE 有 mark」，与 FTS 一致）。
- `npx tsc --noEmit` exit 0；`npx eslint`（3 个改动文件）exit 0。
- 干净生产构建：`rm -rf .next && next build` exit 0，`error` 0 次，新 BUILD_ID **`1qN_-bpPHor3ci8N4ZwIe0`**（`w4-build.log`）。
- 全量 `npx vitest run`：与 W4 无关的并发抖动——首跑 6 文件失败 / 1 测试失败（871 通过、26 跳过）；同期 W3 的全量跑同样 1 测试失败（851 通过、46 跳过），其日志里失败文件全是 `beforeAll` 10s 超时 / 单测 5s 超时（`agent-runner-debug-events`、`automation-service`、`context-compaction-service`、`conversation-context`、`mcp-server-service`、`notification-service`、`skill-service`、`terminal-session-service`、`tools/bash`、`tools/write-artifact`、`ppt-export`），与搜索无关，系两路 `next build` + 两路全量 vitest 并行在 1.5 CPU 虚拟机上的争用（batch2 已记录过同款一过性抖动）。重跑 11 个可疑文件：9 通过，剩余 2 个（`agent-runner-debug-events`、`conversation-context`）仍是 `beforeAll` 超时；单跑两者：`conversation-context` 4 通过，`agent-runner-debug-events` 1 跳过（无失败）。W3 的日志里 `search-service.test.ts (15 tests)` ✓。最终全量数以 W7 集中验证为准（§W7：**894/4，0 失败，一次过**）。
- Playwright（W4，隔离库 `/tmp/batch5-w4-data`，端口 3161，BUILD_ID `1qN_-bpPHor3ci8N4ZwIe0`；种子会话 `conv_w4search` + 消息 4 条 + 产物 `art_w4search`；验证后服务已停、端口已释放、隔离目录已删除，种子计数归零；真实 `.agenthub-data` 未碰）：
  - API 直查：`/api/search?q=渲染&fallback=like` → `msg_w4_mixed` snippet 为 `先想想W4验证<mark>渲染</mark>方案 [调用 执行命令] pnpm test W4验证渲染管线已重构完成 [产物: art_w4se…`，`msg_w4_text` 为 `W4验证<mark>渲染</mark>管线优化方案需要重构`；`q=bash` → tool_use-only 行 `[调用 执行命令] pnpm build`。
  - 1366 搜「渲染」：2 行，`hasJsonRaw: false`，`hasMark: true`，文档无横向溢出。1366 搜「bash」：2 行，`hasJsonRaw: false`；`hasMark: false`——属预期：`bash` 只匹配到 JSON 里的 `"toolName":"bash"`，渲染文本里没有该词，按设计不标 mark，只出 `[调用 执行命令]` 标签。
  - 390 搜「渲染」：2 行，`hasJsonRaw: false`，`hasMark: true`，无溢出。
  - 回归：搜「回归」出 1 条结果（`W4验证普通搜索<mark>回归</mark>词`）；点结果后弹窗关闭；切到「对话」视图核对：会话标题在位、命中消息在位、命中元素 `message-msg_w4_regress` 在位。注：刚点完时停在新任务首页是既有行为——`setActiveConversation` 只切 active 会话、不切 `workbenchView`（`app-store.ts:554`、`message-highlight-layer.tsx`），与本次改动无关；进「对话」视图即见会话已打开（见遗留）。
  - 截图目视另见：跳入的会话里 parts 按原有消息渲染正常展示（工具卡「执行命令 · 调用中」+ pnpm test 终端块、产物卡「W4 验证产物」），与搜索行标签口径一致。

> 未 commit、未 push、未部署；HEAD 仍为 `c383a4a`。

## W5 — POST /api/automations 建任务顺带建同名会话（2026-11-19）— 完成，结论：预期行为，0 改动

- 详见 `~/workspace/frontend-polish-evidence/batch5-cleanup/w5-investigation.md`（本节为其摘要；W7 已在最终树上用 API 实测复核，见 §W7）。
- 代码零改动：`git status` 与任务开始前一致（HEAD `c383a4a`）；W7 复核：`automation-service.ts` 不在改动文件之列。

### 发生位置（调用链）

1. 路由 `src/app/api/automations/route.ts:39-56`：POST 只做 zod 校验后调 `createAutomation()`，本身不建会话。
2. 服务 `src/server/automation-service.ts:238-267` `createAutomation()`：先插 `automations` 行（`conversationId: input.conversationId ?? null`），随后调 `ensureAutomationBinding(row)` 并回写绑定。
3. 绑定 `src/server/automation-service.ts:488-532` `ensureAutomationBinding()`：`conversationId` 为空时调 `createConversation({ title: automation.title, mode: 'single', agentIds: [agentId] })`（:517-523），即**同名单聊会话**，随后把 `agentId`/`conversationId` 回写到 `automations` 行（:525-530）。`agentId` 为空时同理先取默认 Agent（`ag_orchestrator` → 任一内置 → 任一 Agent，`getDefaultAutomationAgentId()` :535-545）。
4. 该绑定不是 POST 专属：`updateAutomation`（:294）、`enableAutomation`（:306）、`runAutomation`（:339）每次都先走 `ensureAutomationBinding()`——绑定是自动化实体的不变量，不是创建时的副作用。

### 为什么必须有会话：执行载体

- `runAutomation()`（:339-400）：执行 = `sendMessage({ conversationId: automation.conversationId, content: automation.prompt, mentionedAgentIds: [automation.agentId] })`，返回类型是 `BoundAutomationRow`（`agentId`/`conversationId` 均非空）。没有会话就没有地方发 prompt、没有 AgentRun、没有可落盘的消息/产物。
- 定时调度同样走这条路：`src/server/automation-scheduler.ts:47` 调 `runAutomation()`。
- spec 01 约束（`specs/01-core-entities.md:348`）：“真实 Agent 执行必须复用 Conversation/AgentRun 路径，不直接调用 LLM SDK”——会话就是该复用路径的载体。
- 通知也依赖它：`publishAutomationRunNotification()` 用真实会话标题告诉用户结果位置（:560-575，含 2026-09-16 线上报障注释）。

### Spec 依据（两处明文写死，不是推断）

- `specs/08-db-schema.md:354`（§12 automations 语义）：“`agent_id` / `conversation_id` 允许为空；保存或运行时由 `AutomationService` 自动选择默认 Agent、**创建同名会话并回写绑定**。”
- `specs/01-core-entities.md:296-310`（Automation 接口）：“`conversationId?: string // 可选；为空时服务层自动创建同名会话并回写绑定`”；同文件 :293：“执行时复用 Conversation、AgentRun、Tool 和 Workspace 沙箱能力。”

### 调用方（UI 层面也是“未指定则自动”）

- 唯一调用方：`src/components/automation-workspace.tsx:2061`（`handleSaveAutomation`）→ `src/lib/api.ts:700-709` `createAutomation()` → `POST /api/automations`。无其他调用方（全仓 grep）。
- 新建表单 `automation-workspace.tsx:1600-1631`「执行目标」区：Agent 下拉默认 `Auto · 自动指派`，会话下拉默认 `未绑定会话`，区标题旁标注“未指定则自动选择”；`buildAutomationSaveBody()`（`automation-workspace-model.ts:88-110`）把空选择转为 `null` 发给后端。
- 保存后 `handleSaveAutomation` 还调 `refreshConversations()`（:2073）——UI 本身预期会话列表会多一条。
- 若用户已选现有会话，`ensureAutomationBinding()` 不新建，只校验存在、自动取消归档、把 Agent 加进会话（:499-515）。

### 测试依据（行为已被测试锁定）

- `src/server/automation-service.test.ts:54-71` 用例名即结论：`'auto-binds a default agent and task-named conversation when creating automation'`——断言 `automation.conversationId` 非空、新建会话 `title === 自动化标题`、`agentIds === [automation.agentId]`。
- 同文件另有绑定会话被归档时自动取消归档、手动运行成功通知等用例，均以该绑定会话为前提。

### 批注：batch1 遗留 6 的现象解释

- W5 验证种子“建 2 个自动化 → 多 2 个同名会话”是上述机制的正常表现，清理时连带删会话的做法正确（计数归零无误）。
- 附带观察（不在本项改动范围）：`deleteAutomation()`（:297-302）只删自动化行（run/log 级联），**不删**绑定的会话——删任务后同名会话会留在会话列表里。这是与创建对称的另一端，若将来要改需用户定夺并同步 spec；本项不碰（见遗留）。

### 自验（W5）

- `npx vitest run src/server/automation-service.test.ts`：**12/12 通过**（`w5-vitest.log`）。
- `npx tsc --noEmit`：exit 0，错误 0。
- eslint：无改动文件，无需跑。
- 未做 Playwright/API 级实测：结论为预期行为且已有 service 级测试锁定该行为，按任务书“是预期 → 不要改代码”，不再另起 live 服务验证；未碰真实 `.agenthub-data`，无隔离库需要清理。W7 补做了 API 级实测（见 §W7：POST 201，会话 2→3，同名会话与绑定一致）。

> 未 commit、未 push、未部署；HEAD 仍为 `c383a4a`。

## W6 — 白·工程蓝浅 accentInk 裕量 + /home 预览图重拍（2026-11-19）— 完成

- 详见 `~/workspace/frontend-polish-evidence/batch5-cleanup/w6-report.md`（本节为其摘要；W7 已在最终树上重算 24 组 + live 实测，见 §W7）。

### §6 白·工程蓝浅 accentInk：4.55 → 4.91:1

- 改动（仅 1 个 token + 注释 2 行）：`src/app/globals.css` 白·工程蓝**浅色块** `--agenthub-gold-ink: #241b04` → **`#1a1402`**（accent `#a37f22` 未动）；深色块同名 token `#241b04`（底色 `#c9a96a`，7.59:1）未动；顶部主题注释同步记录新值与裕量。

### 试过的方案与数值（WCAG 公式）

| 候选 accentInk | 对比度（on `#a37f22`） | 裕量 | 结论 |
|---|---|---|---|
| `#241b04`（改前） | 4.55:1 | 0.05 | 基线 |
| `#1e1603` | 4.80:1 | 0.30 | 改善偏小 |
| **`#1a1402`（采用）** | **4.91:1** | **0.41** | 再深一档，同系暖棕（HSL 色相 43°→45°，饱和 80%→86%，明度 8%→5%） |
| `#171103` | 5.02:1 | 0.52 | 亦同系，但已是两档深，留作后备 |
| `#120e01` | 5.16:1 | 0.66 | 接近黑色，暖棕特征渐失 |
| `#000000` | 5.62:1 | 1.12 | 纯黑，脱离暖棕同系，不取 |

- 「调整浅色档 accent 底色明度」一途已验证**走不通**：该对比对的底色就是 accent `#a37f22` 本身（铁律不动）；且算过：把 accent 加深反而**降低**对比度（`#97741e` vs `#241b04` = 3.92:1），只有调浅才升，但调浅 = 动 accent 主色。故唯一合法杠杆就是 accentInk 再深一档。
- 另核实：`--agenthub-gold-ink` 在 `src/` 内只有定义、无组件引用（token 级保障），改值无渲染回归面。

### 全量重算（W6，`w6-contrast.mjs`，复用 W3 方法，直接读落地 `globals.css`）

- 24 组**全部 ≥ 4.5:1，0 失败**；最低由白·工程蓝浅 4.55 变为**白·水墨深 4.66:1**；白·工程蓝浅 accentInk/accent `#1a1402` on `#a37f22` = **4.91:1**，其余 23 组与 W3 表逐值一致。W7 在最终树上独立重算一致（见 §W7）。

### §7 /home 预览图重拍：白·石墨

- 拍摄（`w6-shot.mjs`，batch3 同款 1600×800 @2x，12 项断言全 PASS）：`data-theme=white-graphite`，浅色（无 `.dark`），body 背景 `rgb(255, 255, 255)`；新任务页 A 版标题、batch3 新副文案、「增强提示词」chip 107×33、品牌名两行无截断、副标题完整、首启指南已关、无横向溢出、建议行底边 494px（≤800）。PNG **3200×1600**，`w6-newtask-1600x800.png`（目视：纯白底、石墨黑字、琥珀金团队圆标，符合白·石墨）。
- 替换与核对（`w6-verify.mjs`，全 PASS）：`public/images/app-screenshot.png` 与 `docs/images/teamflow-preview.png` 旧 md5 均为 `2a4828f0…`，新 md5 均为 **`1e85f504a3a0db84651cebf5192b9ef6`**（两处彼此一致、与旧值不同、与新截图一致）；只换图文件，文案未动；GitHub PNG 补推不在本轮，未推。
- /home 预览区实测：img `complete=true`、`naturalWidth=3200`、`naturalHeight=1600`，`w6-home-preview-check.png` 目视新图在位。

### 自验（W6）

- `npx tsc --noEmit` exit 0（改动后跑过两次，第二次在同批其他 worker 落地后，仍 0 错误）；`npx eslint src/app/globals.css src/lib/themes.ts` 0 错误（css 仅 1 条已知 warning“文件被配置忽略”）；`npx vitest run src/lib/themes.test.ts` **11/11 通过**——断言无需改（卡片 accent `#a37f22` 未动；accentInk 不在测试断言内）。

### 构建经过（据实记录）

- 原计划 `rm -rf .next` 后干净构建：**未执行**——当时另一 worker 的 `next-server`（3171）正用共享 `.next`（BiE4hqen 构建），`rm` 会撞车。
- 改走 scratch 副本：① `/tmp` 是 512M tmpfs，副本 490M 直接写满致 webpack 构建 ENOSPC；② 副本改放 `~/workspace/scratch-batch5-w6-build` + 软链 `node_modules` 后，Turbopack 拒绝对项目外的软链，改 `--webpack` 构建在取 Noto Serif SC 字体时触发 `fonts.googleapis.com` 下载审批卡（`44a9ffde-…`，至今 pending，用户睡着未批），构建僵死——**已 kill，无残留**。
- 最终采用**同伴刚做完的干净 Turbopack 构建 `ZjUfH0Uks13w2gtowOIve`**（01:18–01:23 跑完，未触发字体审批，Turbopack 缓存命中）：它基于当前工作树（含本 W6 的 token 改动 + 同批其他 worker 01:06–01:07 落地的改动），与本任务“按当前树重拍”的要求一致。`next start` 用该构建在 127.0.0.1:**3141**、隔离库 `AGENTHUB_DATA_DIR=/tmp/batch5-w6-data` 跑起来；验证后已停服（3141 已释放）、隔离目录已删、scratch 副本已删。
- 注意：该构建是同伴的，W7 最终验证仍会自己重建并复核（BUILD_ID 以 W7 为准）——W7 已重建，见 §W7（BUILD_ID `Uj1B6GQ8PoWepS2jgOBEo`）。
- 遗留给协调员：`fonts.googleapis.com` 的下载审批卡（`44a9ffde-518a-4d7f-a84d-598944fac54b`）仍 pending——它是我已 kill 的 webpack 构建触发的，现已无用，批不批都不影响本 W6；但后续任何**干净构建**若走冷缓存仍可能再弹字体下载审批（W3 也遇到过同类一过性字体问题），W7 构建时留意。W7 实测：干净构建一次成功，未弹审批（见 §W7）。

> 未 commit、未 push、未部署；HEAD 仍为 `c383a4a`（本 W6 净改动：`globals.css` 1 token + 2 行注释、2 张 PNG）。

## W7 — 最终统一验证（2026-11-19）— 全部重跑通过

- 验证员：W7。W1–W6 全部收齐，**未沿用任何 worker 旧数字**，以下全部在最终树状态下重跑。工作目录 `~/workspace/multi-agent-teamflow`，HEAD `c383a4a`。全程串行（tsc → eslint → vitest → 干净构建 → Playwright），未与其他构建/测试并行。
- 证据：`~/workspace/frontend-polish-evidence/batch5-cleanup/`（`w7-*` 前缀：`w7-seed.mjs`、`w7-verify.mjs`、`w7-theme-switch-ui.mjs`、`w7-contrast.mjs`、截图 23 张、测量 json、tsc/eslint/vitest/build/server/probe 日志）。

### 1. 树完整性

- `git rev-parse HEAD` = `c383a4a`；`git status --short` 77 行（45 行前四轮 + 本轮；未 commit、未 push、未部署）。
- 本轮改动文件逐项在位：W1 `src/components/agent-run-debug-board.tsx`；W2 `src/lib/api.ts`、`src/components/message-input.tsx`、`src/lib/ui-command-events.ts`、`skills/add-experience.md`、`specs/04,09,11,16-*.md`、`docs/architecture.puml` + 17 个 openspec 历史文件；W3 19 个文件全在（`git diff --name-only` 计数 19）；W4 `src/server/search-service.ts`、`src/server/search-service.test.ts`、`src/shared/types.ts`；W5 **0 改动**（`automation-service.ts` 不在改动文件之列）；W6 `src/app/globals.css` + 两张新图。
- 两张新图 md5：`public/images/app-screenshot.png` 与 `docs/images/teamflow-preview.png` 均为 **`1e85f504a3a0db84651cebf5192b9ef6`**（与旧 `2a4828f0…` 不同，两处一致）；`file` 确认 PNG **3200×1600**。
- `src` 内已删文件标识符（`sidebar.tsx`、`agent-library.tsx`、`team-library.tsx`、`new-conversation-dialog.tsx`、`global-search-trigger.tsx`、`dir-picker-dialog.tsx` + `AgentLibrary|TeamLibrary|NewConversationDialog|DirPickerDialog|GlobalSearchTrigger`）**0 处**；孤儿 helper（`listDirectory|getServerPlatform|ListDirResult|ServerPlatform`）**0 处**；`open-settings`/`open-agents` **0 处**；`window.confirm` **0 处**。
- accentInk 落地值：白·工程蓝浅 `#1a1402`（`globals.css:691`），深色块 `#241b04` 未动（`:756`）；accent 主色 `#a37f22` 未动。

### 2. 静态检查 + 全量测试（串行）

- `npx tsc --noEmit`：**exit 0，0 错误**（`w7-tsc.log` 空）。
- `npx eslint`（本轮全部 26 个改动文件，含 `globals.css` + `themes.ts`）：**0 错误**，2 条已知 warning（`globals.css` 被配置忽略；`app-workbench.tsx:880` `<img>`，改前就有）。
- 全量 `npx vitest run`：**104 文件全部通过；894 通过 / 4 跳过 / 0 失败**，一次过，无超时抖动（`w7-vitest.log`，53s）。与 W2 停服后最终重跑的 894/4 一致；相对 batch4 基线 890/4 的 +4，主因是 W4 给 `search-service.test.ts` 新增的测试（现 15/15，W4 记录为新增 5 项）。

### 3. 干净生产构建（串行）

- `rm -rf .next && npx next build`：**exit 0**，`Compiled successfully in 78s`，`error` 0 次，新 BUILD_ID **`Uj1B6GQ8PoWepS2jgOBEo`**（`w7-build.log`）。冷缓存字体拉取未触发审批，一次成功，无需重试（W6 遗留的那张 pending 审批卡与本次构建无关）。

### 4. Playwright 回归（`next start -p 3177`，BUILD_ID `Uj1B6GQ8PoWepS2jgOBEo`，隔离库 `AGENTHUB_DATA_DIR=/tmp/batch5-w7-data`；种子：3 agents + `conv_w7full` 富图会话（4 Run）+ `conv_w7search` 搜索会话（4 消息 + 1 产物）+ 团队 1；验证后服务已停、端口已释放、隔离目录已删除，种子计数归零；真实 `.agenthub-data` 未碰——删除前核对隔离库 W7 会话 3 条（2 种子 + 1 自动化同名会话）/ W7 自动化 1 条，真实库 W7 会话 0 / W7 自动化 0）

#### W1 调试板工具条 — 全部 scrollX 0

| 条件 | scrollX | 工具条高 | clientW | 页面级溢出 |
|---|---|---|---|---|
| 1366 无检查器 | **0** | 46.8（单行） | 984 | 1366 |
| 1366 检查器概览 Tab | **0** | 77.5（两行） | 564 | 1366 |
| 1366 检查器终端 Tab + 侧栏收起 | **0** | 77.5（两行） | 596 | 1366 |
| 1366 检查器终端 Tab + 侧栏展开 | **0** | 77.5（两行） | 424 | 1366 |
| 390 无检查器 | **0** | 115.8（三行） | 337 | 390 |
| 390 Dialog 检查器打开 | **0** | 115.8（三行） | 337 | 390 |

- clientW 与 W1 基线逐值一致（984/564/596/424/337），高度与 W1 改后值一致（46.8/77.5/115.8），`flexWrap: wrap`。
- **431 口径差异（W1 注的复核）**：W7 实测确认 431 出现在**侧栏展开**态（clientW 424），侧栏收起态 clientW 596（W1 基线 scrollX 259）；batch4 W6 记录的“终端 Tab + 侧栏收起时 431”应为其探针那次收起点击未生效所致。两种状态本轮都测、都归零，结论不受影响。

#### W2 斜杠命令 — 均可用

- `/settings`：菜单「打开设置」出现 → Enter → 设置弹窗打开（含「Key 说明」「外观」）→ Esc 关闭；`/agents`：菜单「打开 Agent 管理」出现 → Enter → 切到 Agent 库视图（标题「Agent 库」+「创建」按钮，输入框消失）。pageerror 0。

#### W3 深色 spot — 通过

- 白·石墨深下调试板「重新运行」按钮实测：`rgb(28,28,26)` on `rgb(232,228,216)` = **13.43:1**（与 W3 的 12 处实测值一致）。其余 12 处以 W3 的深色实测为准（W7 未逐处重拍深色，见验证范围注）。

#### W4 全局搜索 — 全部通过

- API 直查（`fallback=like`）：搜「渲染」2 条，snippet 为 `先想想W7验证<mark>渲染</mark>方案 [调用 执行命令] pnpm test W7验证渲染管线已重构完成 [产物: art_w7se…` 与 `W7验证<mark>渲染</mark>管线优化方案需要重构`，无 JSON 原文；搜「bash」3 条（含 `msg_w7_out` 的 `[调用 拆分任务] [调用 执行命令] pnpm test 完成`，该消息含 bash tool_use，属正常多命中），首条 `[调用 执行命令] pnpm build`。
- UI 1366 搜「渲染」：2 行，`hasJsonRaw: false`，`hasMark: true`，无溢出；搜「bash」：3 行，`hasJsonRaw: false`，`hasMark: false`（属 W4 设计：`bash` 只匹配到 JSON 里的 `"toolName":"bash"`，渲染文本里没有该词，不标 mark）；搜「回归」：1 条，点结果后弹窗关闭。390 搜「渲染」：2 行，`hasJsonRaw: false`，`hasMark: true`，无溢出。

#### W5 自动化创建 — 符合预期（API 实测）

- `POST /api/automations`（`{title:'W7 自动化验证任务', prompt:'W7 验证 prompt', scheduleType:'manual', status:'draft'}`）：**201**，`automationId: auto_UkJpOXptsBNs`，`boundConversationId: conv_yGIaWTX7xDfB`；会话数 **2 → 3（+1）**，同名会话出现且 id 与绑定一致。结论与 W5 一致：预期行为，不改代码。

#### W6 主题 — 24 组全过 + live 实测 + 真实 UI 切换

- 24 组全量重算（`w7-contrast.mjs`，直接读落地 `globals.css`，与 W6 同方法）：**24 组全部 ≥ 4.5:1，0 失败**，最低 **4.66:1**（白·水墨深 accentInk/accent）；白·工程蓝浅 `#1a1402` on `#a37f22` = **4.91:1**，其余 23 组与 W6 表逐值一致（`w7-contrast.json`）。
- Live 计算样式：默认白·石墨浅 `#241703` on `#b97a14` = 4.89:1；切白·工程蓝浅后 `#1a1402` on `#a37f22` = **4.91:1**，accent 主色 `#a37f22` 未动。
- 真实 UI 切换（`w7-theme-switch-ui.mjs`，`w7-theme-switch-ui.json`，0 失败）：经 `/settings` 开设置弹窗 → 点「外观」tab → 点「白·工程蓝」卡 → `data-theme` 由 `white-graphite` 变为 `white-blue`（浅色），live 对比度 4.91:1。注：首轮补测因探针未先点「外观」tab（设置弹窗默认落在「供应商」tab，外观面板不渲染）而假失败，属探针问题，与产品无关；主探针 `w7-verify.mjs` 的主题段因此走了 `data-theme` 直置路径记录在案，现由本补测以真实 UI 覆盖。

#### W7 /home 新预览图 + 三档复核

- /home：三档预览 img 均 `complete=true`、`naturalWidth=3200`、`naturalHeight=1600`（src `app-screenshot.png`，即 `public/images/` 的新图）；`docScrollW` 1366/1920/390 均等于视口宽，无横向溢出。注：/home HTML 引用的是 `app-screenshot.png`（`docs/images/teamflow-preview.png` 供 README 等处引用，两文件 md5 相同）。
- 工作台三档（新任务页 + Agent 库）：390/1366/1920 `docScrollW` 均等于视口宽，无溢出；Agent 库标题在位。

### 验证范围注（W7 未重做的）

- W3 的 12 处深色实测逐处重拍：W7 只 spot 测了调试板「重新运行」按钮（13.43:1，与 W3 一致）；其余 11 处以 W3 的实测为准，token 改法与已 spot 的同款，风险低。
- W2 的 skill 步骤逐行走通、W5 的 service 级测试：W7 未重跑 skill 手工步骤与 `automation-service.test.ts` 单测（W2/W5 自验已过，且全量 vitest 894/4 一次过已覆盖两者）。
- 探针自身问题两件（均非产品问题）：① 主探针首跑因 `searchInDialog(page, q)` 误传参数在搜索段崩溃（`locator.fill: expected string, got object`），修调用处后重跑全绿；② `pkill -f "next start -p 3177"` 自匹配杀掉自己的 shell（W2 同款教训），改按端口 `fuser -k 3177/tcp`（PID 29625）停服。
- pageerror：全程 0（`w7-results.json` 无 pageerror 计数）。

> 未 commit、未 push、未部署；HEAD 仍为 `c383a4a`。

## 遗留清单（非阻塞，留待用户定夺或下一批；凡“决定不做”均写清理由）

1. **wine 深 hover 3.82:1**（W3）：`--agenthub-accent-hover` 在 wine 深色被提亮至 `#be5e71`，pf 白字 hover 亦仅 4.18:1，任何浅色字都难达 4.5，属主题 token 层面残留，非文字色可选范围（静止态 5.35 已达标）。另立项需动 `--agenthub-accent-hover` 的 wine 深色混色比例。
2. **capability violet 分支 4.23:1**（W3，`capability-center-workspace.tsx:1346`）：固定紫色 `bg-violet-500 text-white` 非 accent，pf 在其上更差（深色 3.74–4.03:1）；需另定紫色档或加深 violet，另立项。
3. **debug-board 状态色圆点**（W3，`agent-run-debug-board.tsx:3216` 折叠会话指示 + `:1991/2731/2738` 小圆点）：固定状态色非 accent（emerald `#10b981` 白字 2.54 / blue `#3b82f6` 3.68 / rose `#f43f5e` 3.67 / amber `#f59e0b` 2.15），需另定状态色文字方案，另立项。
4. **agent-avatar 调色板**（W3，`agent-avatar.tsx:73`）：rose/orange/amber/emerald/teal/sky/indigo/violet/fuchsia/slate 固定色 + 白字，非 accent；头像色板需整体另定文字色方案，另立项。
5. **最近团队圆 `#3E7CB1` 槽 4.45:1**（W3，`app-workbench.tsx:1699`）：最近团队圆三色轮换（accent / `#3E7CB1` / gold），accent 槽已配 pf，其余槽保留白字——pf 在 `#3E7CB1` 上各模式仅 3.56–4.11:1，白字 4.45 亦未达标；gold 槽各主题金底白字待算。轮换调色板需按槽定文字色，另立项。
6. **`/api/platform` 暂无前端调用方**（W2）：其唯一客户端就是刚删的 `getServerPlatform`；`GET /api/platform` 路由本身保留。如后续确认该路由也不再需要，可另立项删路由，本轮未动。
7. **删自动化不删绑定会话**（W5，`automation-service.ts:297-302`）：`deleteAutomation()` 只删自动化行（run/log 级联），不删绑定的会话——删任务后同名会话会留在会话列表里。这是与创建对称的另一端，若将来要改需用户定夺并同步 spec；本项不碰。
8. **点搜索结果停新任务首页**（W4）：`setActiveConversation` 只切 active 会话、不切 `workbenchView`（`app-store.ts:554`、`message-highlight-layer.tsx`），点完停在新任务首页是既有行为；进「对话」视图即见会话已打开。与本次改动无关，未修。
9. **团队详情对话框溢出风险**（batch4 遗留 4，用户未定夺）：本批不在范围，未动。
10. **GitHub 的 3 张 PNG 与 2 处删除补推**（用户定夺，方法未定）：本轮只换本地图文件，不推。
11. **`fonts.googleapis.com` 下载审批卡 `44a9ffde-…` 仍 pending**（W6）：系 W6 已 kill 的 webpack 构建触发，现已无用；W7 干净构建一次成功、未再弹审批。批不批都不影响本批。
12. **ask-user 对话框与派发/待审批面板 live UI 未触发**（W3）：ask-user 需真实模型跑 ask_user（pending 在内存态，非 DB 可种）；pending 面板需真实待审批。两处均已 token + 代码验证（与已实测的同款 Button/圆点同一改法），待有模型 key 时再补 live 截图。
