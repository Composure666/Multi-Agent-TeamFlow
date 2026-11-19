# 前端优化实施记录（frontend-polish）

> 用户 2026-11-18 02:35 批准：全部改完、留好记录、不提交代码，明天验收再改细节。
> 唯一事实来源：`proposal.md`（决策与改动）与 `tasks.md`（Phase 1–5）。
> 铁律：不 commit、不 push、不部署、不碰 121.40.240.236；只改工作树。
> 注（2026-11-19，batch5-cleanup W2）：本文提及的 `sidebar.tsx`、`agent-library.tsx`、`team-library.tsx`、`new-conversation-dialog.tsx`、`global-search-trigger.tsx`、`dir-picker-dialog.tsx` 已于 2026-11-18 batch4 §2 删除；现入口：侧栏→`app-workbench.tsx` 内联 `wb-sidebar`、Agent 库→`agent-workspace.tsx`、会话创建→新建任务视图。历史叙述保留原样。

## 基线

- HEAD：`9618684 feat(home): make the live demo the hero's primary call-to-action`（master）
- 开始前 `git status`：干净，仅 `openspec/changes/frontend-polish/` 未追踪（提案文件）。
- 工具链：`npx tsc` / `npx eslint` / `npx vitest` 可用（pnpm 不在 PATH）；生产构建用 `node node_modules/next/dist/bin/next build`。

## 每期状态

| 期 | 内容 | 状态 | 验证 |
|---|---|---|---|
| Phase 1 | token 与字体 | ✅ 完成 | tsc ✅ / eslint（改动文件）✅ / vitest sidebar-layout 8/8 ✅ / 生产构建 ✅ / 截图见下 |
| Phase 2 | /home + /demo | ✅ 完成 | tsc ✅ / eslint ✅ / 无相关测试 / 截图见里程碑 |
| Phase 3 | 工作台 | ✅ 完成 | tsc ✅ / eslint 0 errors ✅ / vitest 相关 8 ✅ / 截图见里程碑 |
| Phase 4 | 动效（motion） | ✅ 完成 | tsc ✅ / eslint 0 告警 ✅ / vitest 相关 2/2 ✅ / 生产构建 ✅ / 截图见里程碑 |
| Phase 5 | 次要界面结构重设计 | ✅ 完成 | tsc ✅ / eslint 0 错误 ✅ / 全量测试 868/868 ✅ / 生产构建见里程碑 |
| Phase 5 里程碑 | 最终构建 + 截图抽查 | ✅ 完成 | 构建 ✅ / 截图 6 张 ✅ / 协调员补修 1 处 ✅ |

## 各期改动与验证

### Phase 1 — token 与字体

- 状态：✅ 完成（2026-11-18 凌晨，子代理实施，协调员核对）。
- 改动文件（2 个）：`src/app/globals.css`（+134/−28 计入 diff stat：134 行变动）、`src/app/layout.tsx`（+19/−2）。
  - Gold token：`--agenthub-gold #C9A96A` + soft/border，亮/暗两套。
  - 深色底向暖黑：`--background #0F1115→#0E0D0B`，卡片/浮层/侧栏同步暖化（`#252932→#27231D`、`#1C1F26→#1E1B16`、`#121418→#131110`），蓝主色与文字色未动；深色 remap 层同步跟进，旧值零残留。
  - 阴影三档（sm/card/lg，附使用场景注释）；卡片三档 class（`.agenthub-card-container` / `.agenthub-card` / `.agenthub-card-interactive`，reduced-motion 下 hover 不上抬）；`.font-heading` 工具类；未迁移任何现有组件。
  - 滚动条恢复可见：删 `html, body` 的隐藏规则，浅色补细滚动条（thumb slate 灰）；`.agenthub-hide-scrollbar` 未动。
  - 字体：`layout.tsx` 接入 Noto Serif SC（600/700，`display: swap`，变量 `--font-noto-serif-sc`），`--font-heading` 改指该变量；正文仍 Geist、代码仍 Geist Mono。
- 验证：`npx tsc --noEmit` ✅；`npx eslint`（改动文件）✅（globals.css 不在 eslint 配置内，属预期）；`vitest run src/components/sidebar-layout.test.ts` 8/8 ✅；生产构建 `node node_modules/next/dist/bin/next build` ✅（/home、/demo 均在路由表；better-sqlite3 未报错）。
- 字体下载证据：`.next/static/media/` 下 112 个 woff2；构建 CSS 含 Noto Serif SC @font-face 与 CJK unicode-range（U+4E00）；运行时不请求 Google Fonts。
- 硬编码色值清单：见子代理汇报（`border-slate-200` 199 行、`bg-white` 287 行、`neutral-900` 85 行，另有更广的 slate/neutral/hex 家族 1201 行）；未改任何一处。圆角对应关系：`rounded-[18px]` 1 处、`rounded-2xl` 41 处、`rounded-xl` 103 处（按文件明细见汇报）。
- 偏差：
  1. `subsets: ['chinese-simplified']` 写不进去——Next 16.2.6 的 `font-data.json` 里 Noto Serif SC 只有 latin/cyrillic/latin-ext/vietnamese 四个 subset，tsc 报错；改用 `subsets: ['latin']`，构建仍下载全部 unicode-range 分包（含 CJK），中文标题走 Noto Serif SC 按需加载。原因已写进 `layout.tsx` 注释。
  2. 连带变化：`src/components/ui/card.tsx:41` 与 `src/components/ui/dialog.tsx:125` 已在用 `font-heading` 工具类，`--font-heading` 一改，两处标题自动变衬线，无需改文件（符合提案 B，但未逐个审查）。
  3. Electron standalone 离线可用未完全验证：字体已自托管，但 `.next/standalone/.next/static/media/` 为空——standalone 需另行拷贝 `.next/static`；部署脚本在服务器端，部署时按既有流程确认。
- 截图验证：待协调员用 Playwright 做（见下）。
- 截图验证（协调员，2026-11-18 凌晨，`next start` + Playwright chromium，证据 `~/workspace/frontend-polish-evidence/phase1/`）：
  - `/home` 亮/暗 + 移动端 390px、`/demo` 亮/暗均正常渲染；标题已是衬线（hero 与各分区 h2），深色底为暖黑。
  - 偏差：standalone 服务器起不来——`.next/standalone` 的追踪裁剪丢了 ali-oss 传递依赖 `debug`（`debug/src/index.js` 缺失，`debug` 是指向缺失目标的符号链接），`/home` 500。属既有裁剪问题，与本次改动无关；改用 `node node_modules/next/dist/bin/next start` 验证（同一份 `.next` 构建产物，完整 node_modules），/home 与 /demo 均 200。部署时按既有流程在服务器端处理 standalone 补文件。
  - 截图脚本：`~/workspace/frontend-polish-evidence/shot.mjs`（复用时注意 chromium 路径为 `~/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome`，playwright-core 在 `node_modules/.pnpm/playwright-core@1.60.0/...`）。

### Phase 2 — /home + /demo

- 状态：✅ 完成（2026-11-18 凌晨，子代理实施，协调员核对）。
- 改动文件：`src/app/home/page.tsx`、`src/components/home/home-sections.tsx`、`home-primitives.tsx`、`home-data.ts`、`home-download.tsx`、删除 `home-guide.tsx`、`home-contact.tsx`；`src/app/demo/demo-showcase.tsx`；`src/app/globals.css`（仅 home- 部分：删 hero decor CSS，`.home-title-accent` 改金色实色）。
- /home：13 → 8 分区（Hero、界面预览、工作流、架构、核心功能、数字证明、下载、页脚）；Agents 并入核心功能做横条；Quickstart 命令块并入下载区（`id="quickstart"` 保留）；Guide/Contact 收进页脚；删除 Stack/指南/联系独立分区；新增 `HomeProof`（868/5/8/3，金色大数字）；Hero 去 grid+glow，换 4 条真实消息气泡拼贴（咖啡订阅落地页开头），副文案两句，“一场群聊”金色；SectionHead 居中版只剩界面预览、架构两区；分区背景深浅交替；删截图下解释长文案；标题加 `font-heading`；卡片三档（`containerCardClass` / `cardClass` / `interactiveCardClass`）；`HOME_NAV` 砍到 6 项。
- /demo：会话头加细进度条；结束卡片（“回放结束”+ 5 轮 · 4 件产物 · 5 位 Agent + 下载/源码 CTA）；产物链按生成顺序编号、最新一件金色边框 + 金色圆点；空态文案改写；右栏宽度固定一档 `w-[480px]`；主栏与产物链改卡片档位、边框走 token；页脚长说明缩为一句；头部 pill 保持蓝色。
- 验证：`npx tsc --noEmit` ✅；`npx eslint`（改动文件）✅；home/demo 下无测试，未跑 vitest；未跑生产构建/截图（协调员集中做）。
- 协调员核对：`git status` 确认改动文件与汇报一致；`npx tsc` 复核 ✅；`npx eslint`（17 个改动文件）复核 0 errors，仅 1 条既有 warning（app-workbench.tsx:859 `<img>`，与 HEAD 相同）。报告勘误：汇报称“删除 home-screenshot.tsx / HomeScreenshot 已删除”与事实不符——核查确认 `home-screenshot.tsx` 与“界面预览”分区仍在（`page.tsx:68` 渲染），提案要求保留的分区未删。
- 偏差：① 页脚“使用指南/联系作者”写成纯文本（无可用公开链接；指南一句话 + 微信号 a2327664758），如需链接明天定目标地址；② 金色只在三处，结尾 CTA 小标记（第四处）未加，明天定样式；③ Hero 拼贴用咖啡订阅落地页开头，明天可换文案。

### Phase 3 — 工作台

- 状态：✅ 完成（2026-11-18 凌晨，子代理实施，协调员核对）。
- 改动文件（13 个）：`app-workbench.tsx`、`artifact-preview-panel.tsx`、`artifact-workspace.tsx`、`message-input.tsx`、`message-item.tsx`、`message-parts.tsx`、`run-status-summary.tsx`、`chat-panel.tsx`、`chat-toolbar.tsx`、`horizontal-scroll-controls.tsx`、`workbench-primitives.tsx`、`workbench-detail-primitives.tsx`；`message-list.tsx` 零改动（本来就是 token/语义色）。
- Token 对齐：约 399 处批量替换（脚本 /tmp/phase3-token-replace.py）：`border-slate-200/100` → border token、`bg-white` → surface token、`dark:bg-neutral-900` → surface token、`dark:bg-neutral-800` → surface-raised（带 fallback）、深色 hex → 对应 surface token、`#3370FF` → accent 系列、`#E7F0FF` 等 → accent-soft、blue-50/100/500 → accent token、自定义阴影 → shadow token。保留未动的：`text-slate-*`（靠深色重映射）、语义色 amber/emerald/red/rose/sky、深色头像/胶囊、代码预览块深色、遮罩、产物封面渐变等内容色。
- 新任务页：两处渐变底去掉，删 `RobotMascot`（420px 装饰块 + 光晕 + SVG 机器人），换 `NewTaskHeroFigure`（右栏复用首页同源静态截图 `/images/app-screenshot.png` + 三个说明胶囊）；大标题加 `font-heading`；输入卡片 `rounded-[18px]` → 容器档位。
- 消息列表：thinking 加左侧 3px accent 竖线 + “思考”标签；tool_use/tool cluster 加状态色竖线（运行 amber/成功 emerald/失败 red）；artifact_ref 三态改档位 class；名字/时间戳层级拉开。
- 产物面板：`id` 有但 artifact 缺失时由 `return null` 改为加载态（Spinner + 按需 `fetchArtifact` 拉取，失败给空态 + 关闭按钮；只读演示无此路由直接判缺失）；容器换容器档位，删冲突死宽度 `xl:min-w-[520px]`；图片/代码/SVG 视图 zinc 底色 → token。
- 产物库：主区/详情侧栏换内容档位，网格卡片换交互档位；详情侧栏宽度收敛单档 `w-[360px]`（删 `previewOpen ? 360 : 380` 分支）；加载态改 Spinner + 文字。
- 其余：PageCard → 容器档位；chat-panel/chat-toolbar/run-status-summary/horizontal-scroll-controls/message-input 做 token 替换。
- 验证：`npx tsc --noEmit` ✅；`npx eslint`（改动文件）0 errors，1 warning（既有 img）；`vitest run` 相关 3 文件 8 测试 ✅。协调员复核：tsc ✅；eslint（17 文件）0 errors；grep 确认无 `)]0/` / `)]/[` 脚本残留。
- 偏差/缺失 token（明天定夺）：① 亮色主题无 `--agenthub-surface-raised/sunken`（只在 `.dark` 定义），Phase 3 用带 fallback 写法过渡；② 无文字色 token（`--agenthub-text`），`text-slate-*` 全部保留；③ 无 `--agenthub-error` 等语义 token；④ 圆角数值出入（档位约 15.3/11.9px vs 原 17/12.75px），视觉略小一圈；⑤ 卡片深色底由 `#171717`/`#1C1F26` 变 `#27231D`，稍亮偏暖；⑥ 宽度主值在 `conversation-workspace.tsx`（440/480、可拖 320–760px），不在本次边界内未碰；⑦ 审批卡片本体（PendingMcpToolApprovalsPanel 等）是独立组件，未列入边界未碰，需另排或进 Phase 5；⑧ 列表行产物卡片 `rounded-lg` 未换档位（小于档位最小圆角）；⑨ `message-item.tsx` 不在原定 12 文件内但名字/时间戳统一只能落在此处，只改了一处 class。
- 报告勘误：汇报“未改”清单与 git 状态矛盾（chat-panel、chat-toolbar、horizontal-scroll-controls、workbench-primitives、workbench-detail-primitives 实际均已改动，详见上文）；以 git 状态为准。

### Phase 4 — 动效

- 状态：✅ 完成（2026-11-18 凌晨，子代理实施，协调员核对）。
- 依赖：`motion@14.14.0`（`^14.14.0`），package.json + pnpm-lock.yaml 正常更新；安装波折：本机无 corepack；`npx -y pnpm@11.9.0 add motion` 报错 `[ERR_PNPM_ADDING_TO_ROOT]`（workspace root 需 `-w`）；加 `-w` 后两次失败于 `[EPERM] chown 'pnpm-lock.yaml.<tmp>'`（沙箱 overlayfs 禁止 chown 到 gid 65534 nogroup）；只改了 `pnpm-lock.yaml`、`package.json`、`node_modules/.pnpm-workspace-state-v1.json` 三个文件的属主元数据为 root:root（内容无变化），随后安装成功、`pnpm install` 校验通过。以后再 `pnpm add` 遇同类 EPERM 同法处理。
- 改动文件：新增 `src/components/home/home-motion.tsx`（`Reveal`：whileInView，opacity + y 14→0，0.4s，once，内含 MotionConfig reducedMotion="user"；`CountUp`：进入视口 0→目标值 0.5s，reduced-motion 直接显示终值）；`home-sections.tsx`（截图/工作流/架构/功能四区包 Reveal，管线卡片与 Agent 横条 delay 0.08s；HomeProof 数字改 CountUp）；`demo-showcase.tsx`（根部 MotionConfig；结束卡片 motion.div 入场；产物链 motion.button 挂载淡入，最新产物金色圆点点亮时 scale [1,1.6,1] 0.35s）；`message-list.tsx`（根部 MotionConfig；每条消息 motion.div 挂载淡入，key 稳定，流式不重播）；`artifact-preview-panel.tsx`、`artifact-workspace.tsx`（面板 aside 滑入，opacity + x 16，0.3s）。
- 未动：`demo-replay.ts`（回放逻辑只字未改）、`globals.css`、`layout.tsx`、`message-parts.tsx`、`ui/button.tsx`、`app-workbench.tsx`、`home-download.tsx`/`home-header.tsx`。
- 验证：`npx tsc --noEmit` ✅（协调员复核 ✅）；`npx eslint`（6 个改动文件）0 告警；`vitest run` artifact-workspace 2/2 ✅；生产构建 ✅（41/41 静态页）。构建体积：Turbopack 构建不打印 First Load JS 表；产物清单推导（非官方口径）：`/` 约 2581 kB、`/home` 约 903 kB、`/demo` 约 706 kB；改版前基线未记录，无对比数字；motion 所在共享 chunk 约 160 kB/路由（与其它共享模块合包，无法单独剥离）。
- 偏差：① 按钮按压未用 motion（Base UI asChild 限制 + 已有 CSS active:translate-y-px）；② 面板关闭无退出动画（需父级 conversation-workspace.tsx 包 AnimatePresence，不在边界内）；③ message-parts 未动（流式重播风险，消息级入场已覆盖）；④ app-workbench 未动（无需要 motion 的点）；⑤ home-rise 保持 560ms 未动；⑥ 下载区无入场动画（不在边界内）。
- 里程碑验证（协调员）：`next start` + Playwright，证据 `~/workspace/frontend-polish-evidence/phase4/`：/home 正常动效与 reduced-motion 两版内容均完整呈现（标题衬线、金色“一场群聊”、气泡拼贴可见；reduced-motion 下无隐藏内容）；/demo 与工作台无回归（工作台截图与 Phase 2-3 dismissed 后的新任务页字节一致，首启指南弹窗此次未再弹出，疑似关闭状态已持久化）。

### Phase 5 — 次要界面

- 状态：✅ 完成（2026-11-18 凌晨，两名子代理并行实施，协调员合并核对）。
- 5A（设置 + Agent + 对话框 + 搜索 + 通知 + 审批卡片）：
  - 新增 `src/components/dialog-sizes.ts`（对话框三档 sm/md/lg：`sm:max-w-md` / `sm:max-w-2xl` / `sm:max-w-4xl`，18 个对话框统一引用）；三态复用 Phase 3 的 `workbench-primitives`（EmptyState / InlineError / WorkspaceStateView），未另造。
  - 设置：顶部 Tabs 改左侧纵向导航（8 分区）+ 右侧内容区，尺寸升大档；各分组 section 改 agenthub-card；providers/failover/model-assignment/oss/site 各面板加载/空态统一 + token。
  - Agent：创建向导三步指示器（AgentCreateWizard：描述 → 草稿 → 确认；AgentConfigForm：基本信息 → 模型与适配器 → 工具与提示词，与 Tabs 同步；CreateTeamDialog 自动模式：描述目标 → 确认成员 → 创建）；agent-library 空态改 EmptyState（带创建按钮）；agent-workspace 约 60 处硬编码色扫为 token，卡片走三档。
  - 对话框：18 个统一尺寸档位（小：unified-create、slash-command-help、删除确认；中：new-conversation、dir-picker、add-agent、create-agent、ask-user-question、agent-tool-search、file-library；大：user-guide、team-detail、create-team、prompt-enhance-modal、设置）；按钮位置统一（主按钮右下、取消在左，DialogFooter）；ask-user-question 的 `#3370FF` 全部改 accent token。
  - 全局搜索/通知：搜索面板边框走 token，补加载态；notification-center 按钮底色走 token；notification-meta info/system 级走 token（语义色保留）。
  - 审批卡片：pending-mcp-tool-approvals / pending-bash-commands / pending-writes / dispatch-plan-card 统一为 agenthub-card + 各自语义边框（violet/orange/amber 保留），按钮 `bg-[#3370FF]` 改 accent token，操作按钮在卡片右侧。
  - 验证：tsc ✅；eslint（40 个文件）0 错误、2 warning（既存未使用变量）；vitest 相关 13/13 ✅。
- 5B（产物库/编辑器 + 分析/自动化 + 各中心 + 团队库 + 经验资产 + 调试板 + /deployments）：
  - artifact-library：新增加载失败态（InlineError + 重试），加载/空态统一为图标 + 一句话 + 操作按钮；行标题与搜索框提到 14px。artifact-code-editor：外包 token 边框 + 底色框，不改 CodeMirror 行为。
  - analytics-workspace：页头与卡片标题 font-heading + token；5 张内容卡与 KPI 卡换 agenthub-card、去 hover 抬升；加载态改为图标 + 一句话 + 重新加载；恢复内容区可见滚动条。
  - automation-workspace：外壳 agenthub-card-container，卡片/行/底部三栏换档位；错误横幅换 InlineError；空态统一 EmptyState；筛选 pill 与视图切换激活态改工程蓝 token；恢复滚动条。
  - capability-center：标题 font-heading，CapabilityCard/KpiCard 换档位，表格走 token，EmptyRow/EmptyHint 改图标 + 一句话 + 操作；头像渐变与热门条渐变改纯色 token。
  - information-center：删本地 EmptyStateLite 改用共享 EmptyState；加载态统一；筛选 pill 激活态改工程蓝；通知行去 hover 上浮、只留边框/底色反馈；正文提到 14px；恢复滚动条。
  - team-library：团队卡换 agenthub-card-interactive；空态加“创建团队”。
  - experience：标题 font-heading、副标题 14px；加载/空态统一；experience-card/stat-card/sidebar/create-dialog/editor/detail 换档位、提到 14px、token 边框。
  - agent-run-debug-board/button：画布区与工具栏底色走 token；错误横幅补深色变体 + 14px；空画板加“回到会话”；RunListItem 选中/hover 改 accent token。
  - conversation-workspace：仅 token 对齐（去两处 `dark:bg-neutral-900` / `dark:bg-neutral-950/30`）；右侧面板宽度 440/480 与拖拽逻辑未动。
  - /deployments：无改动——核查确认没有页面 UI，只有 `src/app/deployments/[id]/[[...path]]/route.ts` 一个静态资源路由；部署呈现面是消息里的 deploy_status 卡片（不在清单内），未新建页面。
  - 验证：tsc ✅；eslint（17 个文件）0 错误；vitest 相关 11/11 ✅。
- 合并核对（协调员）：全量 `npx tsc --noEmit` ✅；全量 `npx vitest run` 102 个文件、868 通过、4 跳过（与基线一致）；eslint（全部改动文件）0 错误、3 warning（均为既存：app-workbench:859 img、model-assignment-panel:25、provider-config-dialog:89 未使用变量）；5A 与 5B 无文件冲突（dialog-sizes.ts 仅 5A 新建，17 个文件引用；5B 未建重复文件）；并发编辑中出现过一次瞬时 tsc 报错（5A 跑时 5B 文件中间态），重跑即消失，最终状态干净。
- 偏差：① 经验库 4 个对话框仍是内容驱动的 4 档（指南 md / 新建 3xl / 详情 4xl / 编辑 5xl），未强行统一进 dialog-sizes.ts；② 审批卡片容器底色保留 violet/orange/amber 淡底（区分类型），只统一档位与按钮；③ 对话框沿用 shadcn 自带淡入/缩放，未另加 motion 入场；④ 密集数据区的次要信息（表格次列、时间戳、数量角标、徽章、Tab/pill 标签）仍保留 12px，text-3xs（10px）已全部消灭；⑤ 加载态只有图标 + 一句话（无操作按钮，分析/经验/信息三个加载卡片给了“重新加载”）；⑥ 图表 SVG 颜色保留（CHART_COLORS、网格线、sparkline 色，SVG presentation attribute 不能用 `var()`）。

## 最终里程碑验证（全部五期之后，2026-11-18 凌晨）

- 全量 `npx tsc --noEmit` ✅；全量 `npx vitest run` 102 个文件、868 通过、4 跳过（与基线一致）；eslint（全部改动文件）0 错误、3 warning（均为既存：app-workbench:859 img、model-assignment-panel:25、provider-config-dialog:89 未使用变量）。
- 生产构建 `node node_modules/next/dist/bin/next build` ✅ exit 0（/home、/demo 在路由表）；`next start` + Playwright 截图，证据 `~/workspace/frontend-polish-evidence/phase5/`：/home、/demo、工作台 Agent 库、产物库、设置弹窗、数据概览均正常；设置左侧导航 + 分组卡片、Agent 库筛选 pill 与卡片、数据概览 KPI 卡与图标空态均符合预期。
- 协调员补修：截图发现产物库空态仍是纯文字“暂无产物”（`artifact-workspace.tsx:590`，Phase 5B 改的是 `artifact-library.tsx`，此分支在其边界外）；已改为共享 EmptyState（图标 + 一句话 + “新建任务”按钮；有筛选无匹配时为“清除搜索与筛选”），tsc ✅、eslint ✅、相关测试 5/5 ✅，重建 + 复拍确认。
- 小观察：数据概览页侧栏呈图标收起态（品牌竖排），疑似该视图自身行为，非本次改动引入（截图可见）。
- 最终工作树：79 个文件改动（+2502/−2335），另新增 `dialog-sizes.ts`、`home-motion.tsx`；删除 2 个文件（home-guide.tsx、home-contact.tsx）；HEAD 仍为 9618684，未 commit、未 push、未部署。

## 里程碑验证（Phase 2+3 之后，2026-11-18 凌晨）

- 生产构建 `node node_modules/next/dist/bin/next build` ✅ exit 0（/home、/demo 在路由表）。
- `next start` + Playwright 截图，证据 `~/workspace/frontend-polish-evidence/phase2-3/`：/home 亮/暗/移动端 390px、/demo 亮/暗、工作台新任务页亮/暗（首启指南弹窗需点“稍后再说”关闭后截；工作台根路由用 `domcontentloaded`，全局 SSE 会让 `networkidle` 永远不到）。
- 确认：/home 8 分区、衬线标题、金色“一场群聊”与金色数字 868/5/8/3、Hero 气泡拼贴、架构图重着色、页脚纯文本微信号；/demo 进度条满格、产物链 1–4 编号、最新一件金色边框 + 金色圆点、状态“播放完成”；结束卡片代码确认（`demo-showcase.tsx:149`，`status==='done'` 时渲染 `DemoEndCard`，在消息列表底部，需滚动可见，本次截图未直接拍到）；工作台新任务页 hero 式布局、衬线大标题、无渐变无装饰块、输入卡片容器档位。
- 注意：静态截图资源 `/images/app-screenshot.png` 仍是旧版界面（含机器人装饰块），/home 界面预览区与新任务页右栏都在用它——改版后截图与实物不符，见待定夺问题 14。

## 与提案的偏差

- 里程碑验证方式：Phase 2 与 Phase 3 并行实施后共用一次 production standalone 构建 + Playwright 截图验证（而非每期各一次构建），因两期文件无重叠、构建耗时约数分钟；typecheck / lint / 测试仍每期独立做。
- standalone 服务器验证改用 `next start`：`.next/standalone` 追踪裁剪丢了 ali-oss 传递依赖 `debug`，`/home` 500；属既有裁剪问题，与改动无关（见 Phase 1）。
- Phase 2 报告勘误：汇报称删除 `home-screenshot.tsx`，核查不实——文件与“界面预览”分区仍在。
- Phase 3 报告勘误：汇报“未改”清单与 git 状态矛盾，以 git 状态为准。
- 协调员清理（2026-11-18 凌晨）：删已无引用的死 CSS `.home-card`（globals.css，grep 确认零引用）；修 `user-guide-data.ts` 过期注释（指南分区已并入页脚）。
- Phase 3 产物面板新增按需 `fetchArtifact` 拉取（原缺失时直接 return null）：小幅行为变化，只读演示无此路由直接判缺失；明天验收时确认。
- Phase 1 的暖黑与字体已在 Phase 2/3 中复用，未发现冲突。

## 留给用户明天定夺的细节问题

Phase 1：
1. 暖黑色值（`#27231D` / `#1E1B16` / `#131110`）未经过截图确认——够暖吗、层次够分明吗；另 `.dark` 对比度注释数值是按旧背景算的，需重算。→ ✅ 第三轮已落实：确认不改值（四档 R>G>B 均成立，暖偏向真实；阶梯极浅，层次靠边框/阴影读出）；对比度注释重算为 15.7/13.1/7.7/7.6（vs `#0E0D0B`），四级全过 AA，后两级过 AAA。
2. 圆角 token 与工具类数值出入（`--radius-2xl` 约 15.3px vs `rounded-2xl` 17px）；卡片档位用 token 圆角还是保留工具类圆角。→ ✅ 第三轮已落实：统一走 token，`--radius: 0.5rem → 0.5556rem`，2xl ≈ 17px 与 `rounded-2xl` 对齐。
3. 阴影 sm 与 card 在浅色下很接近（alpha 0.04 vs 0.05），如觉得分档不明显可再拉开。→ ✅ 第三轮已落实：sm 降到 0.03，card 提到 0.07 并加深加糊。
4. 浅色滚动条 thumb 用 slate 灰，未引入品牌蓝。→ ✅ 第三轮已落实：浅色 thumb 换品牌蓝 rgba（0.35，hover 0.55）；深色未动。
5. Noto Serif SC 字体包 5.75MB 进构建产物（101 个 woff2，按需加载），包体积增量是否可接受。→ 用户 2026-11-18 早上已接受。
Phase 2：
6. 页脚“使用指南/联系作者”现为纯文本（指南一句话 + 微信号 a2327664758）；如需改成链接，定目标地址。→ ✅ 第二轮已做：页脚改为真实微信二维码位（见“第二轮细节修复”第 2 项）。
7. 金色第四处（结尾 CTA 小标记）未加，定样式。→ ✅ 第二轮已加：细金线 + 小菱形（见“第二轮细节修复”第 3 项）。
8. Hero 拼贴文案现为咖啡订阅落地页开头，可换其他真实对话。→ ✅ 第二轮已换成「光影造像工坊」showcase 对话（见“第二轮细节修复”第 4 项）。
Phase 3：
9. 亮色主题补 `--agenthub-surface-raised/sunken` token 吗；补文字色 token（`--agenthub-text`）与语义 token（`--agenthub-error`）吗。→ ✅ 第三轮已落实：`:root` 补 raised `#FFFFFF`、sunken `#F7F8FA`、text `#0F172A`、error `#DC2626`，`.dark` 补 text `#E5E7EB`、error `#F87171`；19 处旧 fallback 全部清零，grep 残留 0 处。
10. 圆角接受档位数值（略小一圈）还是调 `--radius`。→ ✅ 第三轮已落实：调 `--radius` 至 0.5556rem，2xl ≈ 17px 与 `rounded-2xl` 对齐（见第 2 项）。
11. 卡片深色底变亮偏暖（`#27231D`），截图确认。→ ✅ 第三轮已落实：确认不改值（阶梯顶端，改暗会压缩层次）；深色截图已确认。
12. 右侧面板宽度 440/480 两档要不要收敛为一档（在 `conversation-workspace.tsx`，需另排）。→ ✅ 第三轮已落实：收敛为单值 480px（删 `Math.max` 分支，拖拽 320–760 不动）。
13. 审批卡片（PendingMcpToolApprovalsPanel 等）视觉统一另排还是进 Phase 5。→ ✅ 第三轮已落实：核实补 2 处缺口（writes 卡缺 amber 边框、dispatch 待确认卡未用 agenthub-card）。
14. 静态截图资源 `/images/app-screenshot.png`（3200×2000）仍是旧版界面（含已删的机器人装饰块），/home 界面预览区与新任务页右栏都在用它——是否要在改版后重新截一张新版工作台截图替换。→ ✅ 第二轮已重拍替换（见“第二轮细节修复”第 1 项）。
15. 工作台侧栏顶部品牌在 1440px 下显示截断（“Multi-Age…”），确认是否接受（疑似既有 truncate 行为）。→ ✅ 第三轮已落实：品牌名折成两行 `Multi-Agent` / `TeamFlow`，去掉该行 `truncate`；副标题保留截断（见第三轮遗留）。
Phase 4：
16. 面板关闭无退出动画——是否把 conversation-workspace.tsx 纳入补做 AnimatePresence，或留到 Phase 5。→ ✅ 第三轮已落实：父级包 AnimatePresence，面板 exit（opacity + x 16，0.3s）+ 把手 0.2s 淡出；根部补 MotionConfig reducedMotion="user"。
17. CountUp 0.5s 内 868 滚动略快，是否放宽到 0.8–1s（它不算严格意义的入场动画）。→ ✅ 第三轮已落实：放宽到 0.9s。
18. home-rise 560ms 超过提案 500ms 上限，既有机制未动，是否统一改。→ ✅ 第三轮已落实：统一到 500ms，交错延迟未动。
19. 按钮按压未用 motion（Base UI asChild 限制 + 已有 CSS active:translate-y-px），是否另议实现。→ ✅ 第三轮已落实：保持 CSS 方案（已核对 Base UI 1.5.0 源码，motion 的 whileTap 无法注入 asChild 子元素，会泄漏为未知 DOM 属性；motion.div 包一层破坏 inline-flex 布局契约）。
20. 下载区无入场动画（不在 Phase 4 边界），是否补。→ ✅ 第三轮已落实：`home-download.tsx` 内用 `<Reveal>` 包住整个下载区。
Phase 5：
21. 三步向导的落点——AgentCreateWizard / AgentConfigForm / CreateTeamDialog 三处指示器 + 已有步骤对齐是否正确；草稿页既是能力预览也是确认页，是否接受，还是拆成两个独立步骤。→ ✅ 第三轮已落实：三处均对齐，0 改动；草稿页保持一处合并作为确认页，不拆。
22. 对话框三档宽度（小 md / 中 2xl / 大 4xl）与个别取舍（提问 720→672px、工具搜索 3xl→4xl、用户指南 5xl→4xl、设置 3xl→4xl）是否合适；经验库 4 个对话框是否也要收进三档。→ ✅ 经验库 4 个对话框第二轮已统一进三档（见“第二轮细节修复”第 5 项）。
23. 密集数据区次要信息保留 12px 是否接受（整表提 14px 会撑爆工具型界面密度）。→ ✅ 第三轮已落实：保留 12px（审计 text-xs 923 处 + text-3xs 182 处，正文载体全部 ≥14px）。
24. 审批卡片容器底色（violet/orange/amber 淡底）是否收敛为单一中性底。→ ✅ 第三轮已落实：4 文件全部改为中性 surface，语义边框与图标色保留。
25. /deployments 是否需要补一个部署列表页（目前只有资源路由，没有页面 UI；补页面是新增功能）。→ ✅ 第二轮已加列表页（见“第二轮细节修复”第 6 项）。
26. 加载态是否严格要求都有操作按钮（目前只有图标 + 一句话）。→ ✅ 第三轮已落实：按规则补 12 处重试按钮（会失败/会持久等待的数据加载视图必须有重试；纯瞬时内联 spinner 豁免）。

## 第二轮细节修复（2026-11-18 上午，用户早上验收后定）

- 基线：HEAD 仍为 9618684；最终工作树 84 个文件改动（+2575/−2343，含第一轮），未 commit、未 push、未部署（服务器未碰）。
- 1. 旧图删了重拍：`public/images/app-screenshot.png` 与 `docs/images/teamflow-preview.png`（旧图 md5 相同，双生文件）一并替换为新版工作台新任务页截图，3200×1600（第一版按 1600×1000 @2x 拍出 3200×2000，下半部约 25% 为页面留白，遂改 1600×800 @2x 重拍）。拍摄：production 构建 + `next start`（127.0.0.1:3102）+ Playwright；首启指南弹窗点“稍后再说”关闭；右栏 `NewTaskHeroFigure` 嵌着旧图，拍前用 JS 隐藏该 figure 并把所在 grid 收成一列，避免把旧图烤进新图。alt 文案与 /home 预览区可见说明文字同步更新为新任务页描述（`home-screenshot.tsx`、`app-workbench.tsx`、`home-sections.tsx:202`）。验证：/home 预览区实测加载新图（naturalWidth 3200 × 1600，截图确认无机器人装饰块）；工作台新任务页右栏引用同一路径，同步更新。
- 2. 联系作者二维码位：页脚“联系作者”改为二维码位——真实微信二维码图 `public/images/wechat-qr.png`（用户 2026-11-18 ~09:23 提供，微信号 Composure°，湖南郴州，942×1398）+ “微信扫码联系作者”文案（`home-sections.tsx` `HomeFooter()`）。`home-data.ts` 的 `AUTHOR_WECHAT = 'a2327664758'` 常量及其 import 已删除（微信号以二维码卡片上的 Composure° 为准）。验证：滚动到页脚后 img complete、naturalWidth 942，截图确认二维码卡清晰显示（lazy 加载：未滚动到页脚前 naturalWidth 为 0，属正常行为）。
- 3. 金色第四处：下载区顶部加细金线 + 小菱形（`bg-[var(--agenthub-gold)]`，`home-download.tsx`），与效果图一致；金色未扩到别处。
- 4. Hero 拼贴文案：`HERO_CHAT`（`home-sections.tsx:47`）咖啡订阅对话换成 `src/server/demo-seed.ts` 的「光影造像工坊」showcase 对话，4 气泡结构不变（你 / Orchestrator / PM 小灰 / 前端工程师），文案与 /demo 播放内容一致。验证：/home 截图确认四条气泡。
- 5. 经验库对话框统一进三档：4 个对话框改走 `dialog-sizes.ts` 的 `DIALOG_SIZE_CLASS`（sm `sm:max-w-md` / md `sm:max-w-2xl` / lg `sm:max-w-4xl`，经 `cn()` 覆盖 ui/dialog 默认 `sm:max-w-sm`）：指南 `experience-sidebar.tsx:167`（md→sm 档）、新建 `experience-create-dialog.tsx:100`（3xl→md 档）、详情 `experience-library.tsx:415`（内联 `min(896px…)` + max-w-4xl → lg 档，删内联 style）、编辑 `:433`（`min(1024px…)` + max-w-5xl → lg 档，1024→896 收窄；先例：用户指南 5xl→4xl 已在 Phase 5 接受）。
- 6. /deployments 列表页：数据已拿到——部署记录不在 DB，在磁盘 `<dataDir>/deployments/<dep_id>/.agenthub/manifest.json`（无部署表）；`src/server/deployment-service.ts` 有 `readDeploymentManifest` / `deploymentPreviewPath`（→ `/deployments/<id>`）/ `getDeploymentsRoot`，原先无列表函数。新增 `listDeployments()`（读 root 下目录，按 `DEPLOYMENT_ID_RE` 过滤，读 manifest，跳过损坏，createdAt 倒序）+ `src/app/deployments/page.tsx`（服务端组件，nodejs runtime，force-dynamic；标题、版本、日期、打开链接、复制按钮；空态；无删除——无删除 API）+ 客户端 `deployment-copy-button.tsx`（剪贴板 + “已复制”反馈）。验证：`deployment-service.test.ts` 8/8 ✅（含最新在前排序与空目录）；本地实测 /deployments 200，空态正常（本机 0 个部署；有数据分支由单测覆盖）。
- 验证总汇：全量 `npx tsc --noEmit` ✅；eslint（11 个改动文件）0 错误、1 warning（既存：app-workbench:859 品牌图标 `<img>`，非本轮引入）；全量 `npx vitest run` 102 个文件、869 通过、4 跳过（基线 868 + 本轮新增 listDeployments 测试 1 个）；生产构建 `node node_modules/next/dist/bin/next build` ✅ exit 0（路由表含 /deployments）；`next start` + Playwright 截图，证据 `~/workspace/frontend-polish-evidence/phase5-round2/`：workbench-reshot.png（3200×1600）、home-light-round2.png（整页）、home-preview-newshot.png、home-footer-qr.png、home-stats-countup.png、demo-light-round2.png、deployments-round2.png、workbench-light-round2.png、workbench-settings-round2.png；关键截图实测：数字 count-up 滚动入场后达 868/5/8/3（整页截图里显示 0 是截图时动画未跑，属截图伪影）、页脚二维码加载显示、/demo 播放完成产物链 4/4、设置对话框正常。
- 构建插曲：第一轮后的首次生产构建失败，202 个错误全在 Noto Serif SC 字体管线（`Can't resolve '@vercel/turbopack-next/internal/font/google/font'`），与第二轮改动无关（字体/layout 未动）；原因是 `.next/static/media` 只有 12 个文件（第一轮有 112 个 woff2），构建缓存陈旧/不完整；`rm -rf .next` 后干净重建成功（113 个 media 文件，字体正常下载；`curl fonts.googleapis.com` 200，网络无问题）。中途一次运行时重启打断了全量 vitest（工作树未损，服务器进程被杀），重跑后通过；最终构建与服务器均为重启后重新做的。
- 遗留：① 09:38 已部署到服务器的预览是 ~09:25 快照（BUILD_ID g8Eu5hbh7KWwFIfHKGs-n），不含第二轮改动——需第二次部署才带上（部署由父代理安排，本轮未碰服务器）；② 待定夺问题其余 19 项（1–4、9–13、15–21、23、24、26）未动，等用户再定；③ 截图尺寸由 3200×2000 变为 3200×1600（去留白），README 嵌入的 teamflow-preview.png 已同步替换；④ standalone/Electron 构建仍有既有问题（ali-oss 传递依赖 `debug` 缺失致 /home 500，字体需拷入 standalone），验证用的 `next start`，部署时处理（见 Phase 1）。

## 改版前后对比（2026-11-18 中午，用户要求看真实界面改前/改后）

- 对比图（每组左改前、右改后，1600×1000 视口，图顶标“改前/改后”；单张原图同目录）：
  - `~/workspace/frontend-polish-evidence/before-after/home-compare.png`（首页 /home，浅色）
  - `~/workspace/frontend-polish-evidence/before-after/demo-compare.png`（演示页 /demo，浅色，播完状态）
  - `~/workspace/frontend-polish-evidence/before-after/workbench-newtask-compare.png`（工作台新任务页，浅色）
  - `~/workspace/frontend-polish-evidence/before-after/settings-compare.png`（设置页，浅色）
  - 单张：`before-{home,demo,workbench,settings}.png` / `after-{home,demo,workbench,settings}.png` 同目录。
- 改前来源：`git worktree`（`~/workspace/teamflow-before`，detached HEAD 9618684，保留未删；主工作树未动，无 stash/checkout/reset/commit/push/deploy）。注：最初建在 `/tmp/teamflow-before`，因跨设备无法 move 且 /tmp 只有 512M 装不下构建产物，改在 workspace 下重建。
- 改前构建排障（均只动 worktree，不动主树）：① Turbopack 拒绝软链的 node_modules（“points out of the filesystem root”）→ 实拷 node_modules（1.6G）及嵌套的 `apps/mobile/node_modules`、`packages/shared/node_modules`；② 首次构建类型检查失败（缺 `@capacitor/cli`，因嵌套 node_modules 未拷）；③ 收集页面数据时 SQLITE_BUSY——新 DB 是 rollback-journal 模式，3 个并行 worker 各自跑 bootstrap 写操作撞锁 → 预置 WAL（`journal_mode = WAL`）；④ 接着 SQLITE_CONSTRAINT_PRIMARYKEY——bootstrap 的“空时插入内置 Agent”是 check-then-insert，并行下竞态 → 用一次性 vitest 单进程跑 `src/db/client.ts` 预 seeding（5 个 Agent），临时测试文件用后已删；⑤ standalone 的 /home 500（既有 ali-oss `debug` 缺失问题）→ 改用 `next start`（127.0.0.1:3103）。最终构建成功（BUILD_ID j6Ga1icYOkdqG32tRP6me），/home、/demo、/ 均 200。
- 改后来源：当前工作树（五期 + 第二轮），复用已有生产构建（`next start` 127.0.0.1:3102），按 1600×1000 重拍 4 张（未沿用 phase5-round2 的 1440×900/整页图，以保证同视角同尺寸）。拍摄脚本 `/tmp/shot-compare.mjs`，拼图脚本 `/tmp/compose-compare.py`（标签用 Noto Sans CJK）。
- 肉眼核对（逐张）：改前首页导航 7 项、蓝色“**一场群聊**”、长段防御性文案、“界面预览/先看一眼真实界面”区；改后导航 6 项、衬线标题 + 金色“**一场群聊**”、收紧文案 + 对话拼贴。改前 /demo 产物链无编号、无进度条；改后编号 1–4、#4 金边、顶部进度条满。改前工作台右栏是机器人装饰块；改后是嵌套的产品截图（`app-screenshot.png`，新版）。改前设置是顶部页签对话框；改后是左侧导航 + 分组卡片。无拍错、无串屏；/demo 两边均为播完状态（产物 4/4）。
- 注意：工作台这组目前拍的是“带截图 figure”的改后状态；用户随后决定去掉新任务页截图，见下节“新任务页去掉截图”，工作台对比图将按去掉后的状态重拍，其余 3 组不变。

## 对话框溢出修复（2026-11-18 中午，用户审阅时报“很多创建窗口超出屏幕窗口”）

- 复现：生产构建 + `next start`（127.0.0.1:3102）+ Playwright，逐个打开 11 个创建类窗口，在 1366×768 与 1920×1080 下截图 + 量 DialogContent 矩形与按钮位置。脚本 `/tmp/shot-dialogs.mjs`（9 个首态）、`/tmp/shot-dialogs-deep.mjs`（2 个深层态：创建团队手动模式、创建 Agent 详细配置）。
- 复现结果（修前）：9 个首态对话框在两个视口下**全部**在视口内、无裁切按钮。真正溢出的是**创建团队 → 手动详细创建**（1366×768）：对话框底 730，底部按钮“取消/创建团队”底边 734（被裁 4px，点不到底边），第 5 个成员行底边 773（被裁 43px）。文件库 1366×768 时内部“上传文件 / 图片”按钮在折叠线下 11px（对话框自带 max-h-[85vh] + overflow-y-auto，滚动可达，非视口溢出，见遗留）。
- 根因（已核实，非猜测）：`create-team-dialog.tsx:309` 的 DialogContent 只有 `max-h-[90vh] overflow-hidden`，没有 grid-rows 结构；中间 `min-h-0 flex-1 overflow-y-auto` 所在的 grid 行是 auto——行按内容撑高，`flex-1` 不起约束作用，内容把 footer 顶出 max-h，被 overflow-hidden 裁掉。`dialog-sizes.ts` 三档确实只定 max-w；基础 `DialogContent`（`ui/dialog.tsx`）也没有 max-h/overflow 兜底——未定 max-h 的对话框（经验新建、统一创建、提问、添加 Agent 等）全靠内容高度自限。反证：已定 max-h + grid-rows 的（创建 Agent、工具搜索、设置）均无溢出；添加 Agent 的列表自带 `max-h-[420px]` 内部滚动，本身有界。
- 修复（3 个文件，未动对话框内容本身）：
  1. `src/components/ui/dialog.tsx`——基础 DialogContent 加 `max-h-[calc(100vh-2rem)] overflow-y-auto`，作为全部 43 处 DialogContent 的兜底；已自带 max-h/overflow-hidden 的对话框经 tailwind-merge（`cn()` 后传入者胜）保留自身值，不受影响。全库核查：无 `overflow-visible` 依赖；全局搜索结果列表自带 `max-h-[60vh]`、经验库详情/编辑用固定高 + overflow-hidden，均不受影响。
  2. `src/components/create-team-dialog.tsx`——主对话框改 `grid max-h-[calc(100vh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden`（与创建 Agent/工具搜索/设置同一模式）；标题 + 模式切换 + 步骤条合并为 grid 第一行（`flex flex-col gap-4` 包裹，间距与原 grid gap-4 一致），中间滚动、底部按钮固定。
  3. `src/components/experience/experience-create-dialog.tsx`——加 `grid grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden`，中间 `flex gap-5` 加 `min-h-0 overflow-y-auto`（其 3 个子节点正好是标题/内容/footer，无需包一层）。
- 验证：全量 `npx tsc --noEmit` ✅；eslint（3 个改动文件）0 错误；无 dialog 相关单测（grep 无 test 文件，未跑全量 vitest）。生产构建 ✅（BUILD_ID 1bO2wGhRhIbRch9-k7FhAp），重启 3102（pid 9882），重拍两个视口的 9 个对话框 + 2 个深层态：全部 0 溢出、0 裁切按钮。创建团队手动模式 1366×768：footer“取消/创建团队”完整在框内（689–723，对话框底 740）；elementFromPoint 点名：“取消”命中 BUTTON、可点，“创建团队”因表单未填处于 disabled（属表单校验，rect 在框内）；成员列表第 5 行在列表内部滚动区内，可滚动到达。证据 `~/workspace/frontend-polish-evidence/dialog-overflow/`：`1366x768-fixed/`、`1920x1080-fixed/`、`1366x768-deep-fixed/`（各含 measurements.json + PNG）。
- 遗留/未测：① 文件库 1366×768 内部按钮折叠线下 11px（可滚动到达），未动；② 创建 Agent 向导第 2 步（能力草稿）/第 3 步（确认创建）需 LLM 生成草稿，本地无模型 key 未触发实测——结构上已有 max-h + 内部滚动 + 本次基础兜底；③ 提问对话框（ask-user-question）只在真实 agent 提问时弹出，本地无法触发——内容区 ScrollArea 自带 `max-h-[50vh]`，加基础兜底；④ `team-detail-dialog.tsx:205` 同样是 `max-h-[90vh] + overflow-hidden` 无 grid-rows（内部有 `min-h-0 flex-1 overflow-y-auto` 滚动区），同类隐患但不在本次创建类清单内，未复现、未改，等父代理定；⑤ 顺带核实：`sidebar.tsx` 无引用方，`NewConversationDialog` 与 `AgentLibrary`（含创建 Agent 按钮与 Agent/团队页签）属死代码，真实入口是 Agent 库“创建”→ 统一创建对话框；新增对话对话框本身已有 `max-h-[85vh]`，不受影响。

## 新任务页去掉截图（2026-11-18 中午，用户决定；接“改版前后对比”与“对话框溢出修复”之后做）

- 改动（只动 `src/components/app-workbench.tsx` 一个文件）：Hero 区两列 grid（`xl:grid-cols-[minmax(0,1fr)_minmax(0,500px)]` / `2xl:…560px`）收成单列，`<NewTaskHeroFigure />` 引用去掉；该组件只在新任务页用，定义一并删除；随之无用的 `ImageOff` import 删除（`Waypoints` 保留——输入栏工具条也在用）。输入卡片本来就在 Hero 下方通栏，无需再加宽。注释同步更新（原“右侧放大版机器人吉祥物”已过时）。
- 未动：/home 预览区（`home-screenshot.tsx` 仍用 `app-screenshot.png` 做产品预览）、`public/images/app-screenshot.png` 文件本身保留。
- 验证：全量 `npx tsc --noEmit` ✅；eslint（app-workbench.tsx）0 错误、1 warning（既存品牌图标 `<img>` :858，非本轮引入）；生产构建 ✅（BUILD_ID xziE-mu-xMC6krHd03HuS），重启 3102（pid 11174），Playwright 1600×1000 重拍新任务页确认单列、无截图 figure。工作台对比图已按去掉后的状态重拍重拼：`~/workspace/frontend-polish-evidence/before-after/workbench-newtask-compare.png`（最终态：改前=老版机器人装饰块，改后=单列无截图；其余 3 组对比图由同一批 after 图重拼，内容无变化，home 组复核——预览区完好）。

## 第三轮（效果图收尾 + 新建任务页 A 方案 + /home 深色背景）（2026-11-18 下午，用户拍板后实施）

- 来源：用户 2026-11-18 ~13:16 拍板“19 项做完”+“新建任务页做好看点，给效果图让我选”；~13:21 选 A 方案（加图片/图标）；~13:27 追加 /home 深色背景不能纯黑。实施：4 名实施员并行（Token/动效/首页、面板、对话框/向导/审批/加载态、新建任务页）+ 1 名验证员；HEAD 仍为 9618684，未 commit、未 push、未部署。最终工作树 85 个文件改动（+3293/−2660，`git status` 91 行，含未追踪文件）。
- 26 个待定夺问题至此**全部解决**（7 项第二轮 + 19 项本轮，逐项状态见“留给用户明天定夺的细节问题”一节）。

### 19 项落实（逐项决定）

- **Q1 暖黑**：确认不改值。四档 R>G>B 均成立，暖偏向真实存在；但阶梯极浅（背景→沉底仅 1.03:1、沉底→面 1.13:1、面→抬升 1.24:1），层次主要靠边框/阴影读出。`.dark` 对比度注释重算更新：旧注释 16.0/12.7/7.7/7.4 与任一旧背景都对不上（`#0F1115` 实算 15.3/12.7/7.4/7.4），新值 **15.7 / 13.1 / 7.7 / 7.6**（vs `#0E0D0B`，WCAG 公式实算），四级全过 AA，后两级过 AAA。文件：`src/app/globals.css`。
- **Q2+Q10 圆角**：统一走 token。`--radius: 0.5rem → 0.5556rem`（乘数不变）；结果（根字号 106.25% = 17px）：2xl = 1rem ≈ **17px** 与 `rounded-2xl` 对齐；xl ≈ 13.2px、lg ≈ 9.4px、md ≈ 7.6px、sm ≈ 5.7px，三档相对级差保留。文件：`globals.css`。
- **Q3 阴影**：浅色拉开——sm `0 1px 2px rgba(15,23,42,0.03)`，card `0 2px 6px rgba(15,23,42,0.07)`（sm 只降 alpha，card 同步加深加糊），两档不再只差 0.01 alpha。文件：`globals.css`。
- **Q4 滚动条**：浅色 thumb 由 slate 灰改为品牌蓝 rgba（`scrollbar-color` 0.45、thumb 0.35、hover 0.55）；深色滚动条未动。文件：`globals.css`。
- **Q9 亮色 token**：`:root` 补 `--agenthub-surface-raised: #FFFFFF`、sunken `#F7F8FA`、text `#0F172A`、error `#DC2626`；`.dark` 补 text `#E5E7EB`、error `#F87171`（深色 raised/sunken 现有值未动）。19 处带旧冷色 fallback 的用法全部清零（`app-workbench.tsx` 13 处 + `artifact-workspace.tsx` 3 处 + `workbench-detail-primitives.tsx` 2 处 + `artifact-preview-panel.tsx` 1 处），全仓 grep `surface-raised,#|surface-sunken,#` 残留 0 处。文件：`globals.css` + 上述 4 文件。
- **Q11 卡片深色底**：确认不改值。`#27231D` 偏暖偏亮属实（相对亮度 0.0172，四档最亮；与背景对比仅 1.24:1），但它是 surface-raised 阶梯顶端，改暗会压缩本已很浅的层次。
- **Q12 面板宽度**：收敛为单值 **480px**。核实：两档不是两个 class，而是 `useState(440)` 默认宽 + 有产物预览时 `Math.max(rightWidth, 480)` 下限；取 440 会把预览面板保证宽度收窄 40px，是回归（480 也是 /demo 右栏现行值）。改动：新增 `DEFAULT_RIGHT_PANEL_WIDTH = 480`，删 `Math.max` 分支与已无用的 `previewArtifactId` 订阅；拖拽 min/max（320–760）与 `resizeConversationPanelWidth` 导出函数原封不动。文件：`src/components/conversation-workspace.tsx`。
- **Q13 审批卡片**：核实补 2 处缺口——5A 报告“已统一”不完全准确：`pending-writes-panel.tsx` 缺 amber 语义边框（已补 `border-amber-200 dark:border-amber-900/50`），`dispatch-plan-card.tsx` 待确认卡用的是 shadcn `Card` 而非 agenthub-card（已补 agenthub-card class，Card 自身 bg-card/ring 保留）。其余两卡已统一无改动。文件：上述 2 文件。
- **Q15 品牌截断**：品牌名折成两行（`Multi-Agent` / `TeamFlow` 两个 block span，去掉该行 `truncate`，与 compact 态 863–867 行同一规范）；副标题 `BRAND_TAGLINE_EN` 保留 `truncate`。定位过程：`sidebar-layout.tsx` 文件不存在（只有同名 `.test.ts`），`sidebar.tsx` 是死代码，真实品牌元素在 `app-workbench.tsx:872–873`；根因是可用宽约 104px 而 14px 品牌名约 150px。侧栏顶栏因多一行略增高，属预期。文件：`src/components/app-workbench.tsx`。
- **Q16 面板关闭退出动画**：`ResizableRightPanel` 的 `<aside>` 改 `motion.aside`，只加 `exit={{ opacity: 0, x: 16 }}` + 0.3s（与入场一致）；刻意不加 `initial`/`animate`（入场保持原样，避免内外两层各滑 16px 叠成 32px）。父级两个 `AnimatePresence` 包面板（`key="right-panel"`）与拖拽把手（把手改 `motion.button`，退出 0.2s 淡出，否则面板退出动画进行中把手先卸载、聊天区瞬间宽 24px 闪烁）。退出期间面板仍占位，动画播完才卸载；只有关闭时才触发，切换产物不卸载不重播。reduced-motion：原链路对面板无覆盖（`message-list.tsx:230` 的 MotionConfig 只覆盖消息列表子树），故在本文件根部补包一层 `MotionConfig reducedMotion="user"`。文件：`conversation-workspace.tsx`。
- **Q17 CountUp**：0.5s → **0.9s**（`home-motion.tsx:48`）；reduced-motion 直接显示终值未动。
- **Q18 home-rise**：560ms → **500ms**（`globals.css:842`）；交错延迟（60/110/160/210/260ms）未动。
- **Q19 按钮按压**：保持 CSS 方案，0 改动。`ui/button.tsx` 的 `buttonVariants` 已含 `active:not-aria-[haspopup]:translate-y-px`，asChild 渲染的元素同样生效。技术障碍（已核对 Base UI 1.5.0 源码 `esm/button/Button.js` → `useRenderElement`）：Base UI Button 经 `render` prop（Slot 式合并）渲染，子元素由调用方提供，props 与 ref 经 `mergeProps`/`useMergedRefs` 合并后才落到真实元素；motion 的 `whileTap` 需要由 motion 自己渲染/控制的元素才能绑定手势，`motion.create(ButtonPrimitive)` 无法把 motion props 注入 asChild 子元素（会作为未知 DOM 属性泄漏，React 会 stripping 并告警，手势永不绑定），且 motion 自管的 `style.transform` 会与 Base UI 的 `style` 合并逻辑冲突；用 motion.div 包一层则把按压位移移到 wrapper 上，破坏 `inline-flex shrink-0` 布局契约与 `:active` 作用域。
- **Q20 下载区入场**：`home-download.tsx` 内用一个 `<Reveal>` 包住 `Container` 内全部下载区内容（金标 + SectionHead + 两卡 + quickstart），与 `home-sections.tsx` 四区包法一致；下载区本体在该文件，`home-sections.tsx` 无下载区代码可包，故未动该文件（等价实现，非漏做）。
- **Q21 向导落点**：三处均对齐，0 改动。AgentCreateWizard 描述页 `current={1}`、草稿页 `current={3}`（草稿页内容是第 2 步草稿但功能是确认，计为确认页，第 2 步标 done、第 3 步 active 是对齐的）；AgentConfigForm 的 `FormSteps` 用 `findIndex(activeTab)` 推导，与受控 Tabs 同一 state 天然同步；CreateTeamDialog 自动模式 `current={step==='preview'?2:step==='creating'?3:1}`，失败回退 preview→2，手动模式不渲染指示器。**决定：草稿页保持一处合并作为确认页，不拆**——拆成两步多一次点击且无新增信息，草稿本身就是确认内容。
- **Q23 12px**：保留 12px，0 改动。审计：全仓 `text-xs` 923 处 + `text-3xs` 182 处逐类抽查，正文载体全部 ≥14px（消息正文、卡片名、表主列、任务卡标题、产物库行标题、对话框标题/说明、设置主文案均为 14px）；12px 只在时间戳、角标、徽章、Tab/pill、表格次列、表单 label/辅助文案、页脚细则、代码块/等宽密集数据、调试板事件预览、卡片描述。勘误：Phase 5 写的“text-3xs（10px）已全部消灭”不准确——`text-3xs` 仍在 182 处使用，但 `globals.css` 已将其定义为 0.6875rem（11px，下限已抬升）；全仓已无 `text-[10px]/[11px]/[12px]` 裸写。
- **Q24 审批底色**：4 文件全部改为中性 surface——3 个面板条带容器 `bg-violet-50/45` / `bg-orange-50/45` / `bg-amber-50/40`（+ 各自 dark 淡底）→ 统一 `bg-[var(--agenthub-surface)]`，保留 `border-t` 分隔；dispatch 待确认卡 `bg-amber-50/50 dark:bg-amber-950/15` 删除，回归 Card 自身 `bg-card`。各类型语义边框（violet/orange/amber）与语义图标色全部保留；任务行内 `running` 状态 amber 底是状态色未动；只读计划卡 `bg-primary/5` 不在三色之列未动。文件：4 个审批卡片文件。
- **Q26 加载态**：按规则补 **12 处**。拍板规则：会失败/会持久等待的数据加载视图必须有重试类操作按钮；纯瞬时内联 spinner（按钮内 spinner、消息流式输出）豁免。补法统一用既有模式（加载卡内“重新加载”按钮 + 失败时 `InlineError` 带重试，`retryKey` 触发重拉）：settings/providers-panel、failover-panel（最严重的一处：失败后 `config=null` 导致加载视图永远卡死）、model-assignment-panel、provider-priority-panel、provider-config-dialog（另把保存/删除/测试按钮在 loadError 时禁用，堵住误保存）、settings-dialog（保存按钮 loadError 时禁用；OSS 状态横幅失败后无限转圈→改为错误文案 + 重试）、oss-panel（接 `statusError`/`onRetryStatus`）、team-detail-dialog（onRetry + 加载视图“重新加载”）、file-library-dialog（列表上方 InlineError 重试）、team-library（`catch(() => {})` 吞错改 loadError + 重试）、artifact-preview-panel（缺失态加“重试”，仅非只读；只读演示无此路由，重试无意义）、workbench-primitives（`WorkspaceStateView` 加载分支加可选 `onRetry` prop）+ mcp-servers-settings / skills-settings（传入 `load()`）。已合规未改：分析/经验/信息加载卡、产物库失败态、artifact-workspace 失败态、automation 仪表盘错误、dir-picker、agent-run-debug-button、file-explorer、app-workbench 用量区、create-team 生成失败、message-parts/item/input、run-status-summary 等（审计表见对话框组汇报）。

### 新建任务页 A 方案重做（用户 2026-11-18 ~13:21 选 A，加图片/图标）

- 基线：效果图 artifact（slug `xin-jian-ren-wu-ye-she-ji-fang-an`）经 inspect 核验，A 方案逐字 spec 已取到。两个核验结论：①“金色描边”实际只是输入框左上一角约 38% 的极淡金色渐变，不是整圈金框；②效果图 A 区无任何真实图片（images.total=0），只有 emoji、单字色块头像与 CSS 圆点——图片/图标需另行补。
- 改动（只动 `src/components/app-workbench.tsx` 一个文件，+461/−412）：工作台外壳/侧栏未动；主区改 660px 居中单列、文字居中（旧 1280px 通栏 hero 已拆）。Crumb `WORKBENCH — NEW TASK`（11px、.1em、`#9A958A`、700）；标题 Noto Serif SC 34px/行高 1.15/900、移动端 27px，文案“一句话，组一支队开工”（“组一支队”工程蓝，深色 `#7FB0FF`）；副文案 13.5px/1.7/`#777268`/max-w 480px 逐字照抄。Composer 白底卡片、1.5px `#D9DDE6` 边框、18px 圆角、16px padding、阴影 `0 12px 32px rgba(47,95,208,.10)`；textarea 无边框、15px/1.65、min-height 78px、不可缩放；占位句逐字用效果图的光影造像工坊小红书示例句。金色只在左上一角：实现手法与效果图说明略有不同——未用 mask-composite（兼容性脆弱），改用两条 38% 渐变描边（上沿横向 + 左沿纵向，`rgba(201,169,106,.55)→透明`），视觉同样是左上角金色、非整圈金框。Chips + CTA：底部 1px `#E7E5E0` 分隔线、左 chips 右 CTA；chip 12px/600/radius 999/padding 7px 10px、工作台底色；CTA“创建任务 →”（ArrowRight 图标）`#2F5FD0` 底白字、radius 999、padding 10px 18px、13.5px/800，深色下底 `#60A5FA` 配深色字（白字在浅蓝上对比度不足）。示例 pills：引导文“不知道怎么开头？试试这些”+ 4 个 pill 逐字照抄，点按填入输入框并聚焦，配 lucide 图标（Image / PenLine / BarChart3 / LayoutTemplate）。最近团队：距 pills 26px，4 个 38px 圆头像横排居中、间距 18px，下方 11px `#8A857B` 队名，选中态加工程蓝 ring。深色按总表落实（底 `#0E0D0B`、卡片 `#1C1A17`、线 `#2E2A24`、字 `#EDE9E1`）。未恢复已删的 NewTaskHeroFigure 截图，仍为单列。
- chips/最近团队 → 真实功能映射：团队 chip 接既有团队/Agent 选择（旧 agent 下拉 + 快捷团队胶囊合一的下拉菜单：8 个 `SUMMON_TEAMS` 点选调新抽出的 `selectTeam`，只换人选、不覆盖已打好的输入内容；旧胶囊的填词行为 `applySubcategoryPrompt` 已无人调用，随之删除）；产出 chip——现有代码里**没有独立的“产出类型”字段**，未做死按钮：菜单映射到既有的场景分类（图文→设计产物、文档→内容文档、代码→代码开发、数据分析→金融投资），切换改 chip 文案并重排最近团队候选顺序，对应关系已写进代码注释；参考图 chip 接既有附件上传流程（与旧回形针按钮同一隐藏 file input，附件列表、粘贴传图、删除附件均保留）；“更多” chip 只收真实存在的两项——写入审批 Review/Auto 切换、提示词增强（含原 `PromptEnhanceModal`），“优先级”在现有代码里无对应功能，未造假项；CTA 与旧圆形发送按钮同一 `submit()`，禁用条件不变。最近团队行——效果图的「光影造像工坊 / 文案小队 / 数据分析组」**不是真实可召唤团队**（`SUMMON_TEAMS` 里没有，光影造像工坊只存在于 /demo 回放数据），按不造假数据改用真实团队（默认产出“图文”时依次为需求到原型团队、代码交付团队、日常协作小队，产出切换会重排）；单字色块为 fallback（8 个团队的 `iconUrl` 全部未填，无真实头像可用），配色按效果图顺序（`#2F5FD0` / `#3E7CB1` / `#C9A96A`）；点按选中团队（`selectTeam`，含真实 Agent 解析）；“＋ 新建团队”灰底 `#5B606B`，经新增 `onOpenAgents` prop 跳到 Agent 库视图（`CreateTeamDialog` 的入口在 `AgentWorkspace` 内，本文件无权直接打开，需用户在 Agent 库点“创建团队”，两步到达）。保留未删：输入框、粘贴上传、提示词增强弹窗、附件、审批模式、提交逻辑、`contentOverflow` 提示；最近对话列表（`ConversationListPanel`）未动，与最近团队行并存。删掉的：旧 hero 大标题 + 场景分类 Tabs + 快捷团队胶囊（功能由团队 chip 菜单、最近团队行、示例 pills 承接）、旧 agent 下拉、旧圆形发送按钮、底部装饰性状态栏（其“已选小队”信息现由团队 chip 文案承担）。
- 图片/图标补充：未造任何图片；emoji 已全部换成 lucide 图标（团队 Users、产出/更多 ChevronDown、参考图 ImagePlus、创建 ArrowRight、pills 配图、菜单选中 Check）；最近团队保留单字色块 fallback。
- 未完成/待定：副文案后半句“系统在你打字时就帮你配好”承诺了实时匹配，真实实现暂无该逻辑——文案按效果图照抄，代码里留了注释，是否改文案等用户验收时定。

### /home 深色背景（用户 2026-11-18 ~13:27 追加，优先级高）

- 诊断：根因是深色 `--agenthub-surface-muted` 与 `--background` 同为 `#0E0D0B`，浅色靠白/`#F7F8FA` 交替的分段在深色下塌陷。6 个分区纯黑无变化：Hero（无背景）、界面预览、工作流、架构、功能、下载；仅数字证明区（accent-soft 蓝 tint）与页脚（`#1E1B16`）有变化。暖黑阶梯本身太浅（沉底 vs 背景仅 1.03:1），单靠填色分不出段。
- 加的元素（全部在 `globals.css` 约 861–914 行，`.dark` 作用域 + `/home` 专属 section id，浅色零改动，未新增金色）：Hero `#top`（888 行）蓝图网格（48px，蓝 4.5%）+ 顶部柔和蓝光晕（760×400，`rgba(96,165,250,0.11)`，顶部居中）；`#preview`/`#architecture`/`#download`（899 行）沉底 `#131110` + 顶部 1px 淡白分隔线 `rgba(255,255,255,0.05)`，恢复深浅交替节奏；`#workflow`/`#features`（906 行）顶部一道极淡蓝光（`rgba(96,165,250,0.05)`，640×260），只提亮分区开头；`#proof`（911 行）上下 1px 淡蓝框线 `rgba(96,165,250,0.14)` 收边（本已有蓝 tint，未改底色）；页脚未动（`#1E1B16` 本已有区分）。刻意未全页铺纹理、无大面积 glow。

### 验证总汇（验证员独立跑，全部实际验证）

- 全量 `npx tsc --noEmit` ✅ 0 错误；eslint（78 个现存改动文件，globals.css 跳过）0 错误、3 warning（均为既存：app-workbench:865 `<img>`、model-assignment-panel:25、provider-config-dialog:89 未使用变量）；全量 `npx vitest run` 102 文件、**869 通过、4 跳过**（与第二轮后基线一致）；生产构建 ✅ exit 0（`rm -rf .next` 后干净构建，无 Noto Serif 字体错误；BUILD_ID `e-_liaCgIhpqCpVuafLpb`）。工作树：85 文件 +3293/−2660，HEAD 9618684。
- `next start`（127.0.0.1:3102，next-server pid 2004，BUILD_ID `e-_liaCgIhpqCpVuafLpb`，验证结束仍在跑，未杀）；/home 200、/demo 200。
- 截图证据 `~/workspace/frontend-polish-evidence/round3/`（68 张 PNG；拍摄脚本 `shot-round3.mjs`、`shot-round3-home.mjs`（滚动触发版）、`shot-dialogs-round3.mjs`、`shot-dialogs-team-detail.mjs`）：/home 浅/深 × 1366/1920 整页、/demo 浅/深 1366（播完）、新任务页 A 方案浅/深 × 1366/1920 + 1440×900、设置/Agent 库/数据概览抽查。肉眼核对：深色 /home Hero 蓝图网格克制可见、沉底带与分隔线读出分段，**像素实测纯黑 #000000 像素 0.000%，Hero 底色正好是 #0E0D0B**，无大块纯黑空洞；数字滚动到 868/5/8/3（金色）正常，页脚微信 QR 正常；浅色 /home 结构、文案、配色与第二轮一致，目视无变化；新任务页标题、composer 左上角淡金渐变 L 形线（亮/暗放大确认均可见、克制）、chips、示例 pills、最近团队行均在，亮/暗两尺寸无布局破损；品牌名 1440×900 放大确认「Multi-Agent / TeamFlow」两行完整显示（`slices/brand-1440-zoom.png`）。拍摄方法勘误：首批整页截图因 whileInView 未触发导致 Hero 以下全空白，核查确认第二轮的整页截图同样有此空白带，属拍摄方法问题非产品问题，已改用滚动到底再截整页的方法重拍。
- 对话框溢出重测：证据 `round3/dialog-overflow/`（每尺寸 14 项 + measurements.json）。9 首态 + 2 深层态 + 团队详情（正常/强制错误）+ 文件库（正常/强制错误），1366×768 与 1920×1080 逐项实测，**全部 overflowTop/Bottom/Left/Right = 0，真实裁切按钮 0 个**。team-detail / file-library 重试态用路由拦截强制 API 500 触发：团队详情红色 InlineError「mock load failure」+「重试」按钮（对话框增高至 432px 仍完整容纳）；文件库「文件列表加载失败：HTTP 500」+「重试」按钮（645→704px），均 0 溢出、0 裁切。两处数值说明（非缺陷）：① experience-create 的“Close”按钮量得 0×0 矩形——DOM 里存在一个零尺寸关闭按钮（该对话框视觉上本无 X，用取消关闭；第二轮记录的 lastBtn 是“创建”而非 Close，属同一既有状态）；② 滚动区内按钮与第二轮修复后数值完全相同（create-team-manual 成员行 bottom 762 vs 对话框底 740；file-library 上传按钮 681 vs 670；error 态 718 vs 707）——均在可滚动区域内，滚动可达，上一轮即按此口径判定通过。注：上一轮遗留的 `team-detail-dialog.tsx:205` 同类隐患（max-h+overflow-hidden 无 grid-rows）本轮实测未复现（正常态与强制错误态均 0 溢出），结构模式本身未改，如后续内容变长仍需留意。旧脚本说明：中途一次运行时重启清空了 /tmp，对话框旧脚本丢失，本轮已按同样方法重写并改存 evidence 目录。
- 过程插曲：第一次构建中途运行时重启导致 `.next` 不完整（无 BUILD_ID），已重新干净构建成功。

### 遗留/小观察（非回归，供验收时定）

- 副文案 caveat：新任务页副文案“系统在你打字时就帮你配好”承诺了暂无的实时匹配，是否改文案等用户定。
- 侧栏品牌副标题仍截断：品牌名两行已修好，但下方副标题仍显示「Multi-Agent…」省略号（1366/1440/1920 均如此；Q15 决定只修品牌名行，副标题保留 truncate）。
- 「需求到原型团队」chip 标签在 1366 与 1920 下都折成两行（composer 定宽 660px 所致）。
- /home「界面预览」配图仍嵌第二轮重拍的工作台截图，图中侧栏品牌还是旧的「Multi-Age…」截断态，与本轮品牌修复不同步——需重拍 `app-screenshot.png` 才同步（本轮未做，等用户定）。
- /home 桌面端终端代码块的 `git clone https://github.com/Composure666/Multi-Agent-TeamFl…` 行在右缘被视觉截断（横向溢出、可滚动，既有）。
- 手动创建团队的成员行右侧逐行显示字面「text」——查代码是 `{a.modality}` 字段值（内置 Agent 的 modality 即为 "text"），第二轮已存在，非本轮引入。
- 验证过程在本地开发库新建了一个测试团队「验证团队-round3」（team_J75GgUyNf7OA，1 名成员 Orchestrator），只为能打开团队详情对话框测量；git 工作树不受影响（库文件未被追踪），如需清理可在 Agent 库 → 我的 Agent → 该团队详情 → 删除团队。
- 数据概览页侧栏为图标收起态——查代码确认是既定行为（`compact = collapsed || ((view==='analytics'||view==='run-board') && !navHovered)`），非回归。

## 主题切换器（theme-switcher，另开 change，见 `openspec/changes/theme-switcher/`）

- 用户 2026-11-18 ~14:37 要换主题、不要蓝白；~14:43 拍板六套全都要、默认水墨宣纸。OpenSpec 与 token 表见 `openspec/changes/theme-switcher/proposal.md`；实施记录见同目录 `PROGRESS.md`。
- 追加同轮任务（2026-11-18 ~14:58）：新建任务页输入框太小，按原版（A 改版前单列版）位置与尺寸改宽，A 视觉语言保留；只动 `app-workbench.tsx`。
- 集中验证（W4，2026-11-18）：Phase D 已完成，记录见 `openspec/changes/theme-switcher/PROGRESS.md`「Phase D — 集中验证」一节——全量 tsc/eslint/vitest/构建全绿，首页 + 设置页 24 组截图逐张通过，新任务页 12 组因 W5 改动过期、证据见 W5，浅色 blue 清扫 57 处（`app-workbench.tsx` 除外）。

## 模块页布局审计 Top 5（module-audit-top5，另开 change，2026-11-18 晚）

- 用户要求再审各功能模块页布局与结构，只读审计（`~/workspace/frontend-polish-evidence/module-audit-2026-11-18.md`，A–J 共 10 组问题）后拍板先做 Top 5：D1（详情侧栏 <1280px 消失）、H1（详情深色标题不可读）、A1+A2+A3（页头与 gutter 不统一）、F1+F2+F3（悬停才可见的行操作）、E1+E2（对话框尺寸绕开三档常量）。W1–W5 分两波实施、W6 集中验证（含经验资产 `max-w-none` 一处小修正）：tsc 0 错误、eslint 0 错误、vitest 882 通过 / 4 跳过、干净构建 exit 0（BUILD_ID `3zEsCSB4UDSgVxrlXxaBG`）、44 张 W6 截图逐项通过；完整记录见 `openspec/changes/module-audit-top5/PROGRESS.md`。

## 第三批遗留小项（batch3-leftovers，另开 change，2026-11-18 晚）

- 用户 ~18:07 拍板先做第三批（9 项早轮遗留），随后追加 3 项线上 bug（Agent 库边距、信息中心计数、调试板溢出与间距）+ 默认主题改石墨琥珀，共 13 项，全部完成并通过验证；完整记录见 `openspec/changes/batch3-leftovers/PROGRESS.md`，证据见 `~/workspace/frontend-polish-evidence/batch3-leftovers/`。
- 逐项：酒红对比度 4.58:1 → **5.35:1**（深 primary `#b03b52` + 暖白字 `#fdf3ec`）；/home 预览图重拍 3200×1600（graphite 主题，两处 md5 旧 `178cc727…` → 新 `2a4828f0…`）；柔光椭圆加宽 1500px + 光心上移；副文案改为「创建后系统帮你把人和分工配好」；品牌副标题换行三行完整；1200 字团队行上限 40vh → 32vh，1366 下行底 755.6px 可见（余量仅 12.4px，偏紧）；成员行 "text" 映射为「文本」等中文标签；文件库按钮固定底部，+11px → −17px；终端代码块换行显示；Agent 库 max-w-none，1920 下内容 1088 → 1609px、卡片 4 → 6 列；信息中心计数根因两层过滤叠加已修，六分类数字一致（全部 15 / 未读 8 / 异常 10 / 任务 5 / 系统 0 / 配置 0）；默认主题 graphite（`DEFAULT_THEME='graphite'`，防闪 fallback 同步，已保存选择不受影响）；调试板溢出逐项归零（含节点重叠真根因——旧位置保留导致 Run 节点盖住消息节点），间距收紧；/home 页脚副标题实测不截断，0 改动。
- W7 集中验证：tsc 0 错误、eslint 93 文件 0 错误 3 既存警告、全量 vitest **882 通过 / 4 跳过 / 0 失败**、干净生产构建 exit 0（BUILD_ID `sRfxgc8IwfRk0D319U6bP`）、Playwright 截图复核 **14 项全部 PASS**；最终数字见 `openspec/changes/batch3-leftovers/PROGRESS.md`「W7 集中验证」一节。
- 遗留（非阻塞）：1200 字团队行余量 12.4px 偏紧；「需求到原型团队」chip 标签折两行；调试板图内节点行距在 lib 文件中未动；PageShell 注释未补 Agent 库一句；README alt 文案不准确；无 JS 时 `:root` 仍为 ink 浅色；500 字态 +10px 基线溢出。
- 未 commit、未 push、未部署；HEAD 仍为 9618684。

## 白色主题（white-themes，另开 change，2026-11-18 晚）

- 用户 ~20:48 提出加白色主题并设为默认，~20:58 在三张白色效果图里选了 1、2、3（白·石墨 / 白·工程蓝 / 白·水墨），删除石墨琥珀 / 松柏深绿 / 曜石黑金，默认改为白·石墨；完整记录见 `openspec/changes/white-themes/PROGRESS.md`，证据见 `~/workspace/frontend-polish-evidence/white-themes/`。
- 改动：注册表 `THEME_IDS` 改为 `['ink', 'terra', 'wine', 'white-graphite', 'white-blue', 'white-ink']`，默认 `white-graphite`；`globals.css` 删旧三套 6 个块、新增三套 6 个块（chart-3 金系改青色 `#2DD4BF`）；防闪脚本白名单 + 两处 fallback 同步新默认；设置外观区三套新文案 +「默认白·石墨」；头栏下拉注册表驱动，0 改动。
- 对比度：24 组全部 ≥ 4.5:1（W1 实测 + W3 独立重算一致）；修了 3 处 accentInk——白·石墨浅 3.38 → **4.89**、白·工程蓝浅 3.59 → **4.55**（裕量仅 0.05，遗留）、白·水墨深 3.71 → **4.66**。
- W3 集中验证：tsc 0 错误、eslint 0 错误、全量 vitest **886 通过 / 4 跳过 / 0 失败**、干净生产构建 exit 0（BUILD_ID `Xv8o20dAi30A-1zazzXhp`，首次构建因冷缓存字体拉取失败、未改代码重试成功）；Playwright 18 组截图（3 套 × 浅/深 × 首页/新任务页/设置）数值全过 + 头栏下拉/设置外观卡复核；默认/回落全过——清存首开白·石墨（浅/深）、非法值回落、预置 graphite/pine/obsidian 均回落白·石墨、预置 wine 仍为 wine；无闪烁（实际绘制帧判定，计算样式滞后读数为慢速 VM 伪影）。
- 遗留（非阻塞）：白·工程蓝浅 accentInk 4.55 裕量薄；无 JS 时 `:root` 仍为 ink 浅色；`/home` 预览图仍是 graphite 旧图未重拍。
- 未 commit、未 push、未部署；HEAD 仍为 `c383a4a`。

## 第一批：响应式与可达性收尾（batch1-responsive，另开 change，2026-11-18 晚）

- 用户 2026-11-18 ~20:22 拍板「三批按顺序都做」，本 change 只做第一批六项（D2、D3、D4、D5、H2、C4），不碰第二批与第三组；完整记录见 `openspec/changes/batch1-responsive/PROGRESS.md`，证据见 `~/workspace/frontend-polish-evidence/batch1-responsive/`。
- 改动：D2 经验库 `<lg` 侧栏收进 Dialog 抽屉（新增 `useIsBelowLg`，侧栏 className 透传，`≥lg` 不变）；D3 0 代码改动（Top 5 的 flex-wrap 已解决，带 running Run 复核通过）；D4 分享按钮删除（URL 恒为 `/`、无深链恢复，复制链接会误导）；D5 `Cost -` 删除（无计价数据源）；H2 徽章 `text-white/20`→`text-white`，并修正了深色 pill 同样不可读的问题（深色 pill 改浅色）；C4 三处 confirm 换 `DIALOG_SIZE_CLASS.sm` Dialog（自动化删除、经验库删除、file-tab 编辑→浏览放弃修改）。
- W5 集中验证（最终树状态重跑）：tsc 0 错误、eslint 0 错误、全量 vitest **888 通过 / 4 跳过 / 0 失败**（基线 886 + W1 新增 2 个 lg 测试；W1 曾报的 `agent-runner-debug-events` 并发超时本轮未再现）、干净生产构建 exit 0（BUILD_ID `qsb0rLVYe7dZR7BgnBm8Z`）；Playwright 六项复核：D2 390 主列 84→356、768 主列 202→474，抽屉开合可用，1366/1920 内联侧栏不变；D3 六场景 0 重叠 0 裁切；D4 分享 0 处；D5 元信息行无 Cost，完整态 2,100 Tokens 真实值；H2 浅 9.57:1、深 13.41:1；C4 三处 Dialog 全部 0 溢出、取消保留、确认执行，原生 confirm 全仓 0 处。
- 遗留（非阻塞）：1366 下经验库主列 5px 溢出（统计卡趋势 svg 右沿超 5px，与 W1 改后值一致）；390 DetailsPanel Tab 折行、「0 次」换行、调试板空态边界（第三组）；I2 Run label 重复（第二批）；POST /api/automations 会顺带建同名会话。
- 未 commit、未 push、未部署；HEAD 仍为 `c383a4a`。

## 第二批：一致性收尾（batch2-consistency，另开 change，2026-11-18 晚）

- 用户 2026-11-18 ~20:22 拍板「三批按顺序都做」，本 change 只做第二批十六项（G、B1、B2、B3、B4、C1、C2、C3、E3、E4、I1、I2、J1、F4、D6、D7），不碰第三组；完整记录见 `openspec/changes/batch2-consistency/PROGRESS.md`，证据见 `~/workspace/frontend-polish-evidence/batch2-consistency/`。
- 改动：G 切换控件统一为两种（分段控件 + accent 胶囊，16 处收敛，并修掉深色激活胶囊 `text-white` 1.27:1 不可读）；B1 KPI gap 四处统一 17px；B2 侧栏行统一 `agenthub-card-interactive + px-3 py-2.5`；B3 统计条默认收起（列表首行 1366 下 445→328、390 下 773→495）；B4 删重复 `overflow-hidden`；C1 产物库加载补「重新加载」；C2 团队库与部署页空态改 `EmptyState`；C3 toast 加「查看全部通知」跳信息中心；E3 搜索弹窗走 `DIALOG_SIZE_CLASS.md`、错误态改「重新搜索」；E4 产物库删除确认补 sm 档；I1「Key 说明」固定为导航项；I2 面包屑去 Run 留元信息行；J1 向导改两步指示；F4 箭头改溢出驱动；D6 部署页加「← 返回工作台」；D7 0 代码改动（Top 5 迁移已解决）。
- W6 集中验证（最终树状态重跑）：tsc 0 错误、eslint 0 错误、全量 vitest **888 通过 / 4 跳过 / 0 失败**（W4 曾报的 `agent-runner-debug-events` 并发超时本轮未再现）、干净生产构建 exit 0（BUILD_ID `sMLLe9kUw_UhD_zUpsRUF`）；Playwright 十六项复核：G 激活胶囊浅 11.6:1、深 13.43:1，分段浅 15.9:1、深 15.52:1；B1 四处 gap 17px；B2 产物行 h 65、padding 12.75/10.625；B3 首行提前 117px/278px；C1 点重试请求 1→2；C3 点入口落信息中心、6.5s 自动消失；E3 714px（390 下 356px）0 溢出、重试出 2 条结果；E4 476px/356px；I1/I2/J1/F4/D6/D7 1366/390 均过。最终数字见 `openspec/changes/batch2-consistency/PROGRESS.md`「W6 集中验证结果」一节。
- 遗留（非阻塞）：Agent/团队行与团队库空态在死代码里（`sidebar.tsx` 全仓无引用，删或接回另行决策）；B3 展开态统计卡标签换行；G 范围外深色 `text-white` on accent 仍存多处；1366 经验库主列 5px 溢出（第一批遗留）；390 DetailsPanel Tab 折行、「0 次」换行、调试板空态边界（第三组）；搜索结果行 JSON 原文渲染；390 抽屉菜单导航后遮罩不自动关闭。
- 未 commit、未 push、未部署；HEAD 仍为 `c383a4a`。

## 第四组：零散遗留收尾（batch4-leftovers，另开 change，2026-11-18 晚）

- 用户 2026-11-18 ~20:22 拍板「三批按顺序都做」，本 change 只做第三组八项（§1 页头吸顶、§2 F1 死代码、§3 ArtifactWorkspace hover-only、§4 DetailsPanel Tab、§5 统计卡换行、§6 调试板空态、§7 第三批验证遗留小项、§8 第二批探针新发现），不碰前三轮已落地的改动；完整记录见 `openspec/changes/batch4-leftovers/PROGRESS.md`，证据见 `~/workspace/frontend-polish-evidence/batch4-leftovers/`。
- 改动：§1 决定不恢复吸顶（PageShell 不滚动，sticky 无祖先可依；B3 收起态已提前首行），只加 2 行 why 注释；§5 统计卡改两行式（值 nowrap、图标 40→32、px-4→px-3、迷你图 60×24→44×20）；§2 删 6 个死代码文件（sidebar / agent-library / team-library / new-conversation-dialog / global-search-trigger / dir-picker-dialog）+ 5 处随之失效的 import/注释/地图；§3 ArtifactWorkspace 三处按钮补 `focus-within` + 粗指针常显；§4 Tab 条改可横滑单行；§6 EmptyBoard 改三态 + `stageVisualState` 的 `unavailable → todo`；§7c 图内间距三常量收窄（rowGap 340→240、toolGridTopGap 260→200、summaryGap 300→220）；§7h 工具条内边距收 2~4px；§7a/§7g 新任务页 pt/pb 各省 16px；§7b 最近团队名加 `whitespace-nowrap`；§7e README 两处 alt 重写；§7f `:root`/`.dark` 兜底移到白·石墨块；§8b 390 抽屉嵌会话列表 + 顶栏条件放宽；§7d 与 §8a 为 0 改动（注释在 Top 5 提交 21a5561 里已写；遮罩关闭逻辑自 bae0d93 起就存在，batch2 记录源于探针自身状态问题）。
- W6 集中验证（最终树状态重跑）：tsc 0 错误、eslint 0 错误、全量 vitest **890 通过 / 4 跳过 / 0 失败**（基线 888 + W4 新增 2 个 pin 测试；`agent-run-debug-board.test.ts` 52/52）、干净生产构建 exit 0（BUILD_ID `BiE4hqen5Xo1ZhAQoluQ7`）；Playwright 八项复核：统计卡「0 次」与「25 次」在 1366/390 下均单行、卡高统一 99.8、主列溢出 0、页头滚动时 y 不动；死代码回归五处全过、全仓 0 残留引用；ArtifactWorkspace 三处键盘 Tab 可见、触屏常显；调试板富图间距 200/220/240、390 下 6 Tab 单行同高逐个可点、三态空态正确、无转圈；1200 字团队行底边 724.8px、余量 43.2px，500 字态溢出归零；390 抽屉见对话历史、点会话收抽屉进聊天、导航后遮罩关闭；无 JS 首屏 `--background` `#fff`，有 JS 仍为 white-graphite，ink 预置不受影响。最终数字见 `openspec/changes/batch4-leftovers/PROGRESS.md`「W6 集中验证结果」一节。
- 遗留（非阻塞）：CanvasToolbar 内部滚动未彻底消除（1366 下仍有 431px）；历史文档与 `skills/add-experience.md` 仍提及已删文件、`src/lib/api.ts` 两个孤儿 helper、`/agents` 与 `/settings` 斜杠命令成 no-op（均另立项）；团队详情对话框溢出风险（用户未定夺）；G 范围外深色 `text-white` on accent；搜索结果行 JSON 原文渲染；POST /api/automations 顺带建同名会话。
- 未 commit、未 push、未部署；HEAD 仍为 `c383a4a`。

## 第五批：零散遗留清理（batch5-cleanup，另开 change，2026-11-19 凌晨）

- 用户 2026-11-19 ~01:00 问“还有未完成的优化任务吗”后批准顺手修掉剩下的小项、再各方面测试一下；完整记录见 `openspec/changes/batch5-cleanup/PROGRESS.md`，证据见 `~/workspace/frontend-polish-evidence/batch5-cleanup/`。
- 改动：W1 调试板工具条改折行（`flex-wrap`，图标化「适配视野」「重置布局」，「展开/收起 Run」缩文案），1366/390 六条件 scrollX 全归零；W2 历史文档与 skill 里的已删文件引用改指当前入口（17 个 openspec 文件加删除注，spec 四处改写），`src/lib/api.ts` 删两个孤儿 helper（`listDirectory`、`getServerPlatform`），斜杠命令 `/settings`、`/agents` 改走 store 驱动（`openSettingsTarget()` / `setWorkbenchView('agents')`），`UiCommand` 仅剩 `'open-user-guide'`；W3 全仓扫修 31 处深色 accent 白字 → `text-[var(--primary-foreground)]`（19 文件）；W4 LIKE 兜底搜索 snippet 改 JS 生成 parts 纯文本（`[调用 执行命令]`、`[产物: id]` 等标签，命中词包 `<mark>`）；W5 0 改动（POST /api/automations 顺带建同名会话核实为预期行为，spec 08 §12 与 spec 01 明文写死）；W6 白·工程蓝浅 accentInk `#241b04` → `#1a1402`（accent `#a37f22` 未动），对比度 4.55 → 4.91:1；/home 预览图两处重拍白·石墨 3200×1600（md5 均 `1e85f504a3a0db84651cebf5192b9ef6`）。
- W7 集中验证（最终树状态重跑）：tsc 0 错误、eslint 0 错误（本轮 26 文件）、全量 vitest **894 通过 / 4 跳过 / 0 失败**（104 文件，一次过）、干净生产构建 exit 0（BUILD_ID `Uj1B6GQ8PoWepS2jgOBEo`）；Playwright 回归：工具条六条件 scrollX 全 0（431 口径复核：431 在侧栏展开态，收起态 259，两种都归零）、斜杠命令均可用、搜索「渲染」/「bash」/「回归」无 JSON 原文且有 `<mark>`、建自动化会话 2→3 且同名会话与绑定一致、24 组对比度全 ≥4.5:1（最低 4.66 白·水墨深，白·工程蓝浅 4.91，经设置外观区真实点卡切换复核）、/home 新图在位 3200×1600、390/1366/1920 三档无溢出；深色 spot 调试板「重新运行」13.43:1。
- 遗留（非阻塞）：wine 深 hover 3.82:1、capability violet 分支 4.23、debug-board 状态色圆点、agent-avatar 调色板、最近团队圆 `#3E7CB1` 槽 4.45、`/api/platform` 暂无前端调用方、删自动化不删绑定会话、点搜索结果停新任务首页（既有行为）、团队详情对话框溢出风险（用户未定夺）、GitHub PNG 补推待定。详见 `openspec/changes/batch5-cleanup/PROGRESS.md`「遗留清单」。
- 未 commit、未 push、未部署；HEAD 仍为 `c383a4a`。

## README demo 链接 + 团队详情对话框溢出（readme-demo-link-team-dialog，另开 change，2026-11-19）

- 用户 2026-11-19 10:19 下令：README 放最新 demo 链接；团队详情对话框溢出风险修掉；安装包更新等他测试完再说。完整记录见 `openspec/changes/readme-demo-link-team-dialog/PROGRESS.md`，证据见 `~/workspace/frontend-polish-evidence/readme-demo-link-team-dialog/`。
- 改动：两份 README 徽章行下方恢复 ecf4ed9 原样的顶部 demo 链接（http://121.40.240.236/demo），第 79 行引导语改掉过时的“once deployed / 部署后访问”；team-detail-dialog.tsx 按 create-team 同款改 grid-rows 三行结构（头行 / 滚动内容区 / 固定底部）。
- 验证：复现确认 12 成员时 1366 下 footer 超出 462.7px、1920 下超出 166.3px 且无滚动；修后两档视口 footer 均可见（底边余量 17px），内容区可滚到底（12 名成员全可达），编辑态同样 0 溢出；tsc 0 错误、eslint 0 错误、全量 vitest 894 通过 / 4 跳过、干净构建 exit 0（BUILD_ID `9C80MJP-HZ4E6lVPC8CTh`，首轮构建遇白·主题轮同款字体拉取抖动，重试即成功）。
- 遗留（非阻塞）：team-detail-dialog.tsx:116 与 provider-config-dialog.tsx:151 的删除确认是裸 `confirm()`（第一批 C4 只 grep 了 `window.confirm`，漏网）；安装包更新等用户测试完再说。
- 未 commit、未 push、未部署；HEAD 仍为 `89a0ee7`。

## 新建任务页标题层级（newtask-title-hierarchy，另开 change，2026-11-19）

- 用户 2026-11-19 11:27 改主意：不要三个方案的重设计（效果图 `xin-jian-ren-wu-ye-chong-she-ji-fang-an` 作废），只要标题调大 + 多级标题。完整记录见 `openspec/changes/newtask-title-hierarchy/PROGRESS.md`，证据见 `~/workspace/frontend-polish-evidence/newtask-title-hierarchy/`。
- 改动（只动 `src/components/app-workbench.tsx` 新建任务视图）：H1 `text-[27px] md:text-[34px]` → `text-[32px] md:text-[44px]`；“不知道怎么开头？试试这些”由灰色小字 `<p>` 升级为 `mt-9 text-[17px] font-bold` 的 `<h2>`；最近团队行上方新增 `<h2>最近的团队</h2>`，团队行 `mt-[26px]` → `mt-3`。其余一律不动。
- 兜底：标题实际长高约 80px，极限态（textarea 顶满）初测溢出 35.8px；容器 `pt-10` → `pt-6`、textarea 上限 `min(320px,32vh)` → `min(320px,28vh)`，极限态余量 +11.9px。
- 验证：tsc 0 错误、eslint 0 错误（1 条 `<img>` warning 既有）、全量 vitest 894 通过 / 4 跳过、干净构建 exit 0（BUILD_ID `4y7C7mRibhcGyomiVXX1g`）；Playwright：1366×768 空态团队行底 691.1（余量 76.9）、500 字态 709.5（余量 58.5）、极限态 756.1（余量 11.9）、1920 余量 388.9、深色同数，0 横向溢出。
- 遗留（非阻塞）：390×844 下团队名标签在折叠线之下 27.3px（改前已存在，本轮改善 17px，未根治，需另立项）。
- 未 commit、未 push、未部署；HEAD 仍为 `89a0ee7`。

## 运行展板间距收紧 + 任务图 P1 修复（debug-board-spacing-graph，另开 change，2026-11-19）

- 用户点名修运行展板顶部空白带，随后按顺序做任务图 P1 三项。完整记录见 `openspec/changes/debug-board-spacing-graph/PROGRESS.md`，分析报告见 `openspec/changes/debug-board-task-graph-analysis/analysis.md`，证据见 `~/workspace/frontend-polish-evidence/debug-board-spacing-graph/`。
- P0（间距收紧）：标题卡 padding、阶段条 h-12→h-10、画布 wrapper p-2→p-1.5、工具栏 min-h-11→min-h-10、面包屑/meta 间距、model id 截断；1366 下画布 411.3→467.8px（+56.5）。
- P1-D1：行高与间隙按实测折叠高收紧（worker 380→250、tool 260→190、toolGridTopGap 200→120、summaryGap 220→120、Run→Orchestrator 210→170、workerGridTopY 600→420；estimateNodeHeight agent 320→200、tool 220→150、message 200→190、run 130→135、summary 170→135）；图总高 2840→2075.5px，fitView @1366 0.142→0.195。
- P1-D2：删 Orchestrator→汇总直连，worker→汇总只连无工具者，尾工具→汇总保留；汇总入边 7→3，逐像素边穿卡 0。
- P1-D3/D5：工具按 agent 分块横排 + 组标签，链只在块内走；工具链跨行跳跃 0。
- 验证：tsc 0 错误、eslint 0 错误、全量 vitest 896 通过 / 4 跳过（+2 为新增有意测试）、干净构建 exit 0（BUILD_ID `-6UcmBUP_Tk0Blx-fj2WT`）；390 下阶段条仍溢出 107px（D8，未恶化）。
- 遗留（非阻塞）：展开态 Agent 卡超高压行（D4，P2）、无工具 worker→汇总边在特定几何下仍可穿工具卡、组内超 4 工具块内换行、图变宽。详见 `openspec/changes/debug-board-spacing-graph/PROGRESS.md`「已知取舍与残留」。
- 未 commit、未 push、未部署；HEAD 仍为 `89a0ee7`。
