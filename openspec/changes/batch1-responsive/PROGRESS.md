# 第一批：响应式与可达性收尾（batch1-responsive）— 实施记录

- 日期：2026-11-18
- 范围：审计报告 `~/workspace/frontend-polish-evidence/module-audit-2026-11-18.md` 的第一批六项（D2、D3、D4、D5、H2、C4）。第二批与第三组一律未动。
- 方案：`openspec/changes/batch1-responsive/proposal.md`；任务：同目录 `tasks.md`（六项验收标准）。
- 状态：**六项全部完成并通过集中验证**（W5，2026-11-18 晚）。未 commit、未 push、未部署（HEAD 仍为 `c383a4a`，全部改动在工作树）。
> 注（2026-11-19，batch5-cleanup W2）：本文提及的 `sidebar.tsx`、`agent-library.tsx`、`team-library.tsx`、`new-conversation-dialog.tsx`、`global-search-trigger.tsx`、`dir-picker-dialog.tsx` 已于 2026-11-18 batch4 §2 删除；现入口：侧栏→`app-workbench.tsx` 内联 `wb-sidebar`、Agent 库→`agent-workspace.tsx`、会话创建→新建任务视图。历史叙述保留原样。
- 证据：`~/workspace/frontend-polish-evidence/batch1-responsive/`（W1–W4 截图与测量 `w1-*`～`w4-*`；W5 截图 `w5-*` 26 张 + 补测 `w5b/c/d-*` 3 张 + 测量 `w5-results.json`、`w5b-results.json`、`w5c-results.json`；拍摄脚本 `w5-seed.mjs`、`w5-verify.mjs`、`w5-cleanup.mjs`、`w5b-verify.mjs`、`w5c-verify.mjs`）。

## 分工

| Worker | 负责 | 文件 |
|---|---|---|
| W1 | D2 经验库右侧栏小屏改抽屉 | `src/components/experience-library.tsx`、`src/components/experience/experience-sidebar.tsx`、`src/lib/use-media-query.ts`（+ 测试） |
| W2 | D3 + D4 + D5 调试板头部三项（同文件） | `src/components/agent-run-debug-board.tsx`（5 行删除） |
| W3 | H2 徽章 + C4-自动化 | `src/components/automation-workspace.tsx` |
| W4 | C4-经验库 + C4-file-tab | `src/components/experience-library.tsx`、`src/components/file-tab.tsx` |
| W5 | 集中验证 + 记录 | 本文件；**只改记录文件与验证证据，未改任何产品代码** |

## 各改法

### D2 — 经验库右侧栏小屏改抽屉（W1）— 完成

- `use-media-query.ts` 新增 `BELOW_LG_MEDIA_QUERY = '(max-width: 1023px)'` + `useIsBelowLg()`（镜像 D1 的 `useIsBelowXl`；初值 false，挂载后同步，无 hydration mismatch）。
- `ExperienceSidebar` 接受可选 `className` 透传（D1 同款做法，`cn` + tailwind-merge 覆盖默认 `w-64` / `border-l`）。
- `experience-library.tsx`：`isBelowLg` 时不渲染内联侧栏；筛选栏（搜索框后、筛选 Popover 后、「新建经验」前）加 `PanelRight` 图标 + 「侧栏」ghost 按钮（仅 `<lg` 渲染）；抽屉为已有 shadcn `Dialog` + `DIALOG_SIZE_CLASS.md`，标题 sr-only「经验侧栏」，内容为侧栏全量（快速使用指南 / 热门经验 / 最近使用 / 推广卡）；抽屉内点热门/最近条目时先关抽屉再开详情 Dialog（不叠两层）；`≥lg` 行为不变。搜索框 `min-w-[220px]` 未动——挤占解除后自然不再溢出。
- 改前复现（W1，基线构建）：390 下主列 **84px**（审计称约 134px，实测更窄）、主列 scrollW 267（溢出 183，被 MAIN `overflow-hidden` 裁掉）；768 下主列 **202px**、溢出 65。

### D3 — 调试板头部按钮组（W2）— 完成，0 代码改动

- 审计说的 1024 重叠 / 390 裁切在 Top 5 的 flex-wrap 落地后已不存在：Top 5 W5 迁移调试板到 `PageHeader` 时，actions 容器已是 `flex w-fit shrink-0 flex-wrap items-center gap-2`（`workbench-primitives.tsx`）。W2 复现前（无 Run 选中，旧构建）1024/1280/1366 均 0 重叠 0 裁切，390 下 2 行全部可见；本轮价值是带 Run（含 running 态的暂停按钮）复核一遍。
- 因此本项 **0 代码改动**，不做「更多」菜单（会把次要操作藏一层，且无助于已通过的验收）。主操作（重新运行 / 沉淀经验 / 回到会话）任何宽度下可见可点；running 态下「重新运行」为 disabled（只能重跑顶层已完成 Run 的既有规则），「暂停」可用。

### D4 — 调试板「分享」死按钮（W2）— 完成，删除按钮

- 核实：`:937` 的分享按钮自始至终无 `onClick`，全仓 grep 无任何全局委托/其它引用（仅 import + 该按钮两处）。
- 删而不补的理由：调试板是 SPA 视图态（Zustand `workbenchView: 'run-board'` + 选中会话/Run 均在 store 里），URL 恒为 `/`，全仓无任何读取 `window.location` 恢复视图/会话/Run 的逻辑（全站唯一深链是 `/?setup=`，只进设置分区）；复制 `window.location.href` 得到的是应用首页链接，打开后落在新任务视图，不是当前 Run——作为「分享」是误导性链接。且应用为本地单租户、Basic Auth 之后，链接发给他人也不可用。按 proposal 既定 fallback 删除按钮；`Share2` import 一并移除。

### D5 — 调试板 "Cost -" 占位（W2）— 完成，删除

- 查数据源：全仓 grep `price|pricing|perMillion|usd|成本计价` 无任何按模型计价/用量价格表；唯一用量数据源是 token 用量（`agent_runs.usage` + `/api/usage/summary`），成本从未计算。不为它新建计价体系（那是另一个功能），按预期删掉 `<span>Cost -</span>` 一项。
- I2（面包屑与元信息行 Run label 重复）未动，属第二批。

### H2 — 自动化激活态计数徽章（W3）— 完成

- 徽章 `text-white/20` → `text-white`（审计认定的笔误，实测证实）。
- 实测发现审计结论有误：深色下不只是徽章不可读——激活 pill 本身是 `dark:bg-[var(--agenthub-surface)] dark:text-slate-900`，而所有主题的深色 `--agenthub-surface` 都是深色（ink `#201d17`、白·石墨 `#1c1c1a`、白·工程蓝 `#1b1f2a`），即深色下深字印在深底上，pill 标签与徽章数字均不可读（修复前徽章约 2.0:1，标签约 1.2:1）。因此同一元素的深色态一并修正为浅色 pill，与浅色态对称：pill `dark:bg-[var(--agenthub-surface)]` → `dark:bg-slate-100`（`dark:text-slate-900` 不变）；徽章补 `dark:bg-slate-900/10`（`dark:text-slate-900` 不变）。参照信息中心徽章规范（`information-center-workspace.tsx:345`，徽章只写底色、文字色继承 pill）。
- 审计原文「深色下不受影响」不成立，以本记录为准。

### C4 — 三处原生 `window.confirm` 换 Dialog 确认 — 完成

- **C4-自动化（W3）**：删掉 `runAutomationAction` 里的 `window.confirm`，删除改为两步——点删除先开确认 Dialog（`deleteTarget` state），点「删除」后由新增 `confirmDeleteTask` 执行原删除逻辑（删任务、清选中、通知、刷新）；取消/关闭只清 state，不删除。Dialog 复用 Agent 库删除对话框写法（`agent-library.tsx:172`）：`DIALOG_SIZE_CLASS.sm`、标题「删除自动化任务」、描述「确认删除自动化任务「X」？该操作不可恢复。」、取消（outline）+ 删除（红底，删除中 disabled 显示「删除中...」）。删除入口（卡片更多菜单、列表行、详情面板）均走同一 `runAutomationAction('delete')`，三路同修。
- **C4-经验库（W4）**：`handleDelete` 改为只置 `deleteTargetId`；新增 `confirmDelete`（调 `deleteExperience`、更新列表、关弹窗，`deleting` 期间按钮禁用并显示「删除中...」）；底部新增 Dialog，`DIALOG_SIZE_CLASS.sm`，标题「删除经验」/描述沿用原 confirm 文案「确定要删除这条经验吗？删除后无法恢复。」/取消 + 红色「删除」。
- **C4-file-tab（W4）**：新增 `discardOpen` state；编辑→浏览按钮在 dirty 时只开 Dialog，不再同步 confirm；确认「放弃修改」后才 `draft = content` 并退出编辑；取消/`onOpenChange` 关闭只关弹窗，不动任何 state（编辑态与内容原样保留）。标题沿用原 confirm 文案「放弃未保存的修改？」，描述「未保存的修改将被丢弃，文件恢复为上次保存的内容。」；`DIALOG_SIZE_CLASS.sm`，取消 + 红色「放弃修改」。
- 注意：`file-tab.tsx:142` 的 confirm 实际在「编辑→浏览」退出编辑按钮上，不是 Tab 的 × 关闭（`closeFile` 本身无 confirm）；任务书的「Tab 关闭处理里」说法与源码不符，改的是该 confirm 所在处，语义不变。

## W5 集中验证结果（2026-11-18 晚）

> 以下数字全部在最终树状态下重跑，不沿用 W1–W4 的旧数字。验证服务 `next start -p 3145`（127.0.0.1），隔离库 `AGENTHUB_DATA_DIR=/tmp/w5-data-3145`（真实 `.agenthub-data` 未碰）；验证后服务已停、端口已释放、隔离目录已删除。

### W5.1 树完整性

- `git rev-parse HEAD`：**`c383a4a`**。
- `git status --short`：本轮 7 个文件（`agent-run-debug-board.tsx`、`automation-workspace.tsx`、`experience-library.tsx`、`experience/experience-sidebar.tsx`、`file-tab.tsx`、`use-media-query.ts`、`use-media-query.test.ts`）+ 白色主题 5 个未提交文件（`themes.ts` / `themes.test.ts` / `globals.css` / `layout.tsx` / `settings-dialog.tsx`，未动）+ `openspec/changes/frontend-polish/PROGRESS.md`（白色主题一节，系 white-themes 轮已加，非本轮）+ 未追踪 `openspec/changes/batch1-responsive/`、`openspec/changes/white-themes/`。无其他改动。
- 抽查关键改动在位：D2 抽屉入口（`experience-library.tsx:318`「侧栏」按钮 + `:451` Dialog）；`Share2` / `Cost -` 在 `agent-run-debug-board.tsx` 中 0 处；徽章 `text-white` + 深色 pill `dark:bg-slate-100`（`automation-workspace.tsx:2331-2341`）；三处 Dialog（`experience-library.tsx:464`、`file-tab.tsx:206`、`automation-workspace.tsx:2567`，均为 `DIALOG_SIZE_CLASS.sm`）；全仓 `window.confirm` **0 处**。

### W5.2 静态检查 + 全量测试 + 干净生产构建

- `npx tsc --noEmit`：**exit 0，错误 0**。
- `npx eslint`（本轮 7 个改动文件）：**0 错误**。
- 全量 `npx vitest run`：**104 个测试文件全部通过；888 通过、4 跳过、0 失败**。基线说明：白主题轮 886，+2 恰好是 W1 新增的 `useIsBelowLg` 测试（`use-media-query.test.ts` 6 → 8）；4 跳过不变。W1 全量跑时 `agent-runner-debug-events.test.ts` 曾在并发下 beforeAll 超时、单跑通过——**本轮全量跑中该文件一次通过（7.7s），W1 的超时未再现**，判定为并发争用一过性抖动，非真失败。
- 干净生产构建：`rm -rf .next && node node_modules/next/dist/bin/next build`（串行，无其他构建并行），**exit 0**，新 BUILD_ID **`qsb0rLVYe7dZR7BgnBm8Z`**，构建日志 `error` 0 次。`/home` 200、`/home` 与 `/` 均 200（起服后 curl 核对）。

### W5.3 Playwright 截图复核（六项，61 项测量 + 3 轮补测）

验证种子（隔离库，验证后已全部清理，计数归零）：会话 `conv_w5verify`（「W5 验证会话」）+ 触发/输出消息各 1 条 + Run `run_w5_verify`（complete，usage 1200 in / 800 out / 100 cache-read）+ `run_w5_running`（running）+ 经验 3 条（`exp_w5verify1-3`，usage_count 12/8/5）+ 工作区文件 `w5-verify.txt`（3 行，原始内容未保存）+ 自动化 2 条（API 建，`auto_LeJJ7VgwRzYq` 启用 / `auto_EH60tu5plBSu` 暂停；建任务时 API 顺带建了 2 个同名会话，一并清理）。清理后 `conversations / messages / agent_runs / experiences / workspaces / automations(W5) / W5 任务会话` 均为 0；隔离目录已删除。另：自动化 1 条（暂停）与经验 1 条（`exp_w5verify1`）由 UI 确认删除删掉，DB 核对无误（见 C4）。

#### D2 — 完成

| 视口 | 主列宽 | 列表视口宽 | 搜索框（外层） | 内联侧栏 | 抽屉入口 |
|---|---|---|---|---|---|
| 390×844 | **356**（改前 84，+272） | 356 | 322，x34–356，无溢出 | 无 | 「侧栏」按钮可见（x115，w68） |
| 768×1024 | **474**（改前 202，+272） | 474 | 440，x294–734，无溢出 | 无 | 「侧栏」按钮可见（x294，w68） |
| 1366×768 | 783 | 783 | 244，无溢出 | 272（x1069–1341）完整显示 | 无 |
| 1920×1080 | 1337 | 1337 | 798，无溢出 | 272（x1623–1895）完整显示 | 无 |

- 390/768 下 `docScrollW == viewportW`，主列 `scrollW == clientW`，无横向溢出；390/768 抽屉打开：390 下 356×726（x17,y59）、768 下 714×760（x27,y132），均视口内、0 溢出，内容指南/热门/最近齐全；Esc 关闭后 Dialog 0 个。
- 小观察（非阻塞，见遗留）：1366 下主列 `scrollW 788 vs clientW 783`，5px 来源已定位——统计卡内一张 60×24 趋势 svg（`y=228`，父卡文案「13 次」）右沿超出主列 5px；文档 `scrollW == 1366`，无页面级横向溢出；该值与 W1 改后实测的 788 完全一致，非本轮引入。

#### D3 — 完成（0 代码改动，带 Run 复核通过）

| 场景 | 按钮数 | 重叠 | 裁切 | 文档横向溢出 | 容器 |
|---|---|---|---|---|---|
| 1024×768 | 7（含暂停） | 0 | 0 | 否 | 509×30，1 行，x=468–976 |
| 1280×800 | 7 | 0 | 0 | 否 | 509×30，1 行，x=724–1232 |
| 1366×768 | 7 | 0 | 0 | 否 | 509×30，1 行，x=810–1318 |
| 390×844（下拉框选会话） | 7 | 0 | 0 | 否 | 320×68，2 行，x=35–355 |
| 1024 侧栏展开（nav hover） | 7 | 0 | 0 | 否 | 509×30，1 行 |
| 1024 显式选中 running Run | 7 | 0 | 0 | 否 | 509×30，1 行 |

- 6 场景按钮均为「沉淀经验 / 回到会话 / 重新运行 / 暂停 / 刷新 / 复制 Run ID / 全屏」（分享已删，见 D4）；running Run 会自动选中（`availableRuns[0]`），「重新运行」为 disabled、「暂停」可用；容器 `flexWrap: wrap`，390 下自动折 2 行。

#### D4 — 完成

- 6 个 D3 场景 `shareBtnCount: 0`；其余同排按钮（刷新 / 复制 Run ID / 全屏）未动。删除理由见「各改法 D4」。

#### D5 — 完成

- 6 个 D3 场景 `hasCostDash: false`。
- 元信息行完整态（补测 w5d，真鼠标点会话图「完成」节点选中已完成 Run）：「完成 Run run_w5_verify 30s 2,100 Tokens deepseek-flash 1 Agents」——时长/Tokens/模型/Agents 均为真实值，无 Cost。
- 元信息行运行态（6 场景均为自动选中的 running Run）：「运行中 Run run_w5_running - - deepseek-flash 1 Agents」——时长与 Tokens 的 `-` 是 usage 为空时的真实空值（代码 `totalTokens === null ? '-'`），不是占位。
- 补测方法注：w5c 用合成 `dispatchEvent` 点图节点未选中（meta 仍为 running Run），w5d 改真鼠标点击节点中心（`2.1k` 卡片）后选中成功。

#### H2 — 完成

| 模式 | 徽章文字 / 有效底色 | 徽章对比度 | pill 标签对比度 | 结论 |
|---|---|---|---|---|
| 浅色 | 白字 / rgb(63, 69, 85)（白 20% 叠 slate-900） | **9.57:1** | 17.83:1 | 可读 ✓ |
| 深色 | slate-900 / rgb(219, 224, 228)（slate-900 10% 叠 slate-100） | **13.41:1** | 16.28:1 | 可读 ✓ |

- 与 W3 实测逐项一致（同一 WCAG 公式，lab/oklab→sRGB 换算后合成）。截图目视：深色下「全部 7」pill 为浅色底 + 深色字，数字清晰。

#### C4 — 完成（三处，Dialog 全部 sm 档）

| 场景 | Dialog 框（根字号 17px，sm 档 28rem=476px） | 视口内 | 溢出 | 行为 |
|---|---|---|---|---|
| 自动化删除 1366×768 | 476×150 @ (445, 309)，标题「删除自动化任务」 | 是 | 0 溢出 | 取消后「全部」7 → 7，任务保留；再开点确认 7 → 6，DB 核对暂停种子已删 |
| 自动化删除 390×844 | 356×214 @ (17, 315) | 是 | 0 溢出 | 取消后「全部」6 → 6，任务保留 |
| 经验删除 390×844 | 356×192 @ (17, 326)，标题「删除经验」 | 是 | 0 溢出 | 取消后行仍在、Dialog 关闭 |
| 经验删除 1366×768 | 476×150 @ (445, 309) | 是 | 0 溢出 | 取消后行仍在；再开点确认，`exp_w5verify1` 已删（DB 核对 3 → 2） |
| file-tab 放弃修改 1366×768 | 476×150 @ (445, 309)，标题「放弃未保存的修改？」 | 是 | 0 溢出 | 取消后仍在编辑、草稿含追加文本、`●未保存` 仍在；确认后回浏览态、显示原始内容、追加文本消失、`●未保存` 消失 |
| file-tab 放弃修改 390×844 | 356×214 @ (17, 315) | 是 | 0 溢出 | 取消后仍在编辑、草稿与 `●未保存` 原样保留 |

- 全程原生 `window.confirm` **0 次触发**（8 个页面的 dialog 监听器 + C4 各页监听器全部 `[]`）；全仓 grep `window.confirm` 0 处。
- 记录口径注：`w5-results.json` 里 `c4-exp-1366-confirm.rowStillPresent: true` 是因为另外两条种子经验（`exp_w5verify2/3`）仍在——探针按标题前缀「W5 验证经验」匹配；DB 核对确认被删的正是 `exp_w5verify1`（3 → 2），删除有效。
- file-tab 390 沿用 W4 的方法：同一页改视口、重新制造 dirty 再开 Dialog（只测取消）。

## 逐项状态（汇报用）

| 项 | 状态 |
|---|---|
| D2 经验库抽屉 | ✅ 390 主列 84→356、768 主列 202→474；抽屉开合可用；1366/1920 内联侧栏不变 |
| D3 按钮组 | ✅ 6 场景 0 重叠 0 裁切；0 代码改动（Top 5 flex-wrap 已解决，带 Run 复核通过） |
| D4 分享死按钮 | ✅ 已删除（URL 恒为 `/`、无深链恢复，复制链接会误导）；6 场景 share 0 处 |
| D5 "Cost -" | ✅ 已删除；完整态元信息行 2,100 Tokens 真实值，运行态 `-` 为真实空值 |
| H2 徽章 | ✅ 浅 9.57:1、深 13.41:1；深色 pill 同元素问题一并修掉 |
| C4 三处 Dialog | ✅ 全部 sm 档、0 溢出；取消保留、确认执行；原生 confirm 全仓 0 处 |

## 遗留清单（非阻塞，留待用户定夺或下一批）

1. **1366 下经验库主列 5px 溢出**：统计卡趋势 svg（60×24，父卡「13 次」）右沿超出主列 5px（`scrollW 788 vs clientW 783`）；文档无横向溢出、截图无视觉重叠；该值与 W1 改后实测一致，非本轮引入。是否修等下一批定。
2. **390 下 DetailsPanel Tab 折行**（提案已知遗留，第三组）：6 个 Tab 在 390 下各标签折成两行，能点但拥挤；本轮未动。
3. **经验资产第 5 统计卡值「0 次」换行**（提案已知遗留，第三组）：窄卡内大字号值拆两行；本轮未动。
4. **调试板空 run / 无节点边界态**（提案已知遗留，第三组）：本轮只验证了有 run + 有节点的正向路径。
5. **I2 面包屑与元信息行 Run label 重复**（第二批）：本轮未动。
6. **POST /api/automations 建任务会顺带建同名会话**：验证种子清理时需连带删会话（W5 已处理，计数归零）；是否合乎预期由后续确认。

## 证据目录

`~/workspace/frontend-polish-evidence/batch1-responsive/`（W5 新增）：

- `w5-verify.mjs`、`w5-verify.log`、`w5-results.json`（主跑 61 项）、`w5-seed.mjs`、`w5-cleanup.mjs`、`w5b-verify.mjs` + `w5b-results.json`、`w5c-verify.mjs` + `w5c-results.json`、`/tmp/w5d-verify.mjs`（已删，方法见 D5 注；截图 `w5d-d5-complete-run-1366.png` 保留）
- `w5-build.log`（干净构建，BUILD_ID `qsb0rLVYe7dZR7BgnBm8Z`）、`w5-server.log`（3145 服务，已停）
- 截图 29 张：`w5-d2-{390,768,1366,1920}-closed.png`（4）、`w5-d2-{390,768}-drawer.png`（2）、`w5-d3-{1024,1280,1366,390,1024-running,1024-navhover}.png`（6）、`w5-h2-badge-{light,dark}-1366.png`（2）、`w5-c4-auto-delete-{1366,390}.png` + `w5-c4-auto-delete-1366-confirmed.png`（3）、`w5-c4-exp-delete-{1366,390}.png` + `w5-c4-exp-delete-{1366-confirmed,390-cancelled}.png`（4）、`w5-c4-filetab-discard-{1366,390}.png` + `w5-c4-filetab-discard-{1366-confirmed,1366-cancelled,390-cancelled}.png`（5）、`w5b/c/d-d5-complete-run-1366.png`（3）

> 未 commit、未 push、未部署；HEAD 仍为 `c383a4a`。

## W5 过程备注（不影响结论）

- 种子脚本 `w5-seed.mjs` 末尾的计数 helper 有 bug（`db.prepare(sql).get(undefined)` 报 "Too many parameter values"）；插入语句在其前已全部落库，W5 核对计数 1/2/2/3/1 无误后才继续，helper 已修（无参时调 `.get()`）。
- 停服时一次 `pkill -f "next start -p 3145"` 误匹配了自己的 shell（pattern 自匹配，W6 曾有同类教训），服务未停；改按 PID（3244）停服确认，端口已释放。
- 验证中途 `~/MEMORY.md` 被外部改动（另一进程删了两处旧文案：奶娃头像偏好句首半句与「DO NOT commit/push 指示已解除」半句），与本轮任务无关，仅记一笔。
