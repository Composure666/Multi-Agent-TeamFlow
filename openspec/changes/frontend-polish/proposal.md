# 前端去“AI 味”优化（frontend-polish）

## Why

2026-11-18 对着代码实测后的诊断：现在的“AI 味 / 模板味 / 廉价味”不是某一个地方的问题，是五层叠加：

1. **品牌色分裂**：对外说的品牌是深色 `#0E0D0B` + 暖金 `#C9A96A`，但 `globals.css` 里实际跑的是另一套——亮色主色工程蓝 `#2F5FD0`、深色 `#60A5FA`、背景 `#0F1115`（偏蓝的 slate 黑）、卡片 `#252932`；金色在整个 CSS 里根本不存在。产品一边喊暖金品牌，一边全身穿着“科技蓝 + slate 灰”，这正是答辩 PPT 里被判死刑的那套配色，也是 2026 年所有 AI 生成落地页的默认肤色。
2. **结构就是模板本身**：`/home` 一共 13 个分区（Hero → 截图 → 工作流 → 架构 → 功能 → Agent → 技术栈 → 快速上手 → 下载 → 指南 → 联系 → 页脚），顺序和 SaaS 模板一模一样；每个分区都是同一个 `SectionHead`（胶囊 eyebrow + 居中大标题 + 一段说明）加一排长得一样的卡片；`cardClass` 全站统一（rounded-2xl + 描边 + 轻阴影），网格不是两列就是三列。
3. **字体没有性格**：`--font-heading` 直接等于 `--font-sans`，标题和正文是同一款 Geist（且只有 latin 子集，中文实际落在系统黑体上）；标题只是“加粗 + 紧凑字距”，和所有 shadcn 模板一模一样。历史遗留：全仓曾有 596 处写死的 `text-[Npx]`，294 处是 10px，移动端 67% 文本小于 14px（后用 token 和根字号 106.25% 补过，但底子还是密、还是小）。
4. **动效只有一种**：hero 是 `home-rise` 交错淡入（60/110/160/210/260ms）加 grid 背景 + glow 光晕——这俩组合就是 AI 落地页的标配；没有滚动触发、没有数字滚动、没有交互反馈，`globals.css` 里给所有元素统一加的只是 300ms 的颜色过渡；`/demo` 回放也是消息一条条出现，没有编排感。
5. **没有识别度的视觉资产**：架构图是内联 SVG 虚线流程图，工整但任何产品都能用；全站没有任何只属于这个产品的视觉符号。答辩 PPT 用的 K2 水墨（宣纸、墨迹、朱印）是现成的、用户自己认的风格，产品里却一点都没借过来。文案也在“解释”而不是“表达”（如截图下“截图是静态资源，若加载失败会显示占位说明”）。

## 已确认的决策（2026-11-18，用户已定）

1. 范围：整个项目前端——`/home` + `/demo` + 工作台 + 全部次要界面（2026-11-18 追加确认：不止项目主页，整个前端都要改）。
2. 颜色：工程蓝为主，金只做点缀。
3. 动效：克制精致、有编排感，不要满屏乱飞。
4. 字体：标题与正文分开，中文标题试衬线（和答辩 PPT 的 Noto Serif 标题一个路子）。
5. 结构：13 个分区砍到 7–8 个；`SectionHead` 不要每区重复；卡片分档。
6. 文案：每区只讲一个点，删解释性长句，用真实数字和真实截图说话。

## What Changes

### A. 设计 token（`globals.css`）

- 蓝主色不变（亮色 `#2F5FD0` / 深色 `#60A5FA`）；新增 `--agenthub-gold: #C9A96A` 及配套 soft/border token。**金色只允许出现在约定的四处**（见 B 节末尾），其余组件禁止用金。
- 卡片分档，不再一个 `cardClass` 走天下：容器卡片（大容器，弱阴影）、内容卡片、交互卡片（hover 有反馈）。
- 阴影分三档并明确使用场景；圆角统一到 `--radius` 体系，消灭各处混用的 `rounded-[18px]` / `rounded-2xl` / `rounded-xl`。
- 恢复可见滚动条：去掉全局 `scrollbar-width: none`，改用细的定制滚动条（深色已有一套 thumb 样式，浅色补一套）。

### B. 字体

- 标题字体：Noto Serif SC（`next/font/google`，600/700，`display=swap`；按 unicode-range 自动分包，只下发用到的字）。
- 适用：`/home` 的 h1/h2、`/demo` 的会话标题、工作台的空状态大标题；正文、按钮、标签保持 Geist + 系统黑体；代码保持 Geist Mono。
- 字阶：hero 标题放大、行高放宽；正文下限 14px（移动端 67% 文本 < 14px 的问题不再复发）；标题与正文的行高、字距分开定。
- **金色四处点缀**：① hero 标题里的“一场群聊”四字；② 关键数字（868 测试、5 个 Agent 等）；③ `/demo` 产物链点亮态；④ 结尾 CTA 的小标记。其余地方不出现金色。

### C. `/home` 结构（13 → 8）

- 保留：Hero、界面预览、工作流、架构、核心功能、数字证明（新增小条：868 测试通过 / 5 个内置 Agent / 8 种产物类型 / 3 端）、下载、页脚。
- 合并：Agents 并入核心功能做一条 Agent 横条；Quickstart 的三条命令并入下载区；Guide、Contact 收进页脚链接。
- 删除独立分区：技术栈（Stack）、使用指南、联系方式。
- `SectionHead` 居中版只在 2–3 个分区用，其余改左对齐大标题或满幅色块；分区之间用背景色深浅交替代替全部 `border-b` 分隔。
- Hero：去掉 grid + glow 模板装饰，换成群聊气泡拼贴（真实消息 + Agent 头像，静态构图 + 轻微入场）；“一场群聊”四字用金色；副文案砍到两句以内。
- 架构图：保留内联 SVG 结构，线条与节点按新 token 重着色；虚线流动保留（已支持 reduced-motion）。

### D. `/demo`

- 回放编排：消息按轮次入场，产物链按生成顺序逐个点亮（点亮态用金色边框/圆点），播放进度用“第 N / 5 轮”+ 细进度条表示。
- 结束态：播放完成后出现明确的结束卡片（“回放结束”+ 数字小结 + 下载/源码 CTA），不再是悄悄停住。
- 右栏产物链卡片：统一圆角与 hover 态；空态文案改写。
- 头部 pill 保持蓝色；“只读”说明保留。

### E. 工作台

- Token 对齐：侧栏、聊天、产物面板的边框/底色/文字色全部走 `--agenthub-*` token，消灭散落的 `border-slate-200` / `bg-white` / `neutral-900` 硬编码。
- 新任务页：去掉 `from-[#FCFDFF] to-[#F4F6FB]` 渐变底与 420px 装饰块 + 蓝色光晕，换成与首页一致的 hero 式布局（左文案，右一张真实群聊截图/拼贴）。
- 消息列表：Agent 头像、名字、时间戳的排版统一；流式输出中的 thinking / tool_use 区块给明确的视觉区分（不只是颜色深浅）；artifact_ref 卡片按新卡片档位重做。
- 产物面板：预览 / 空态 / 加载态三态齐全；面板宽度档位固定（不再到处写死 292px / 440px / 560px 三套）。
- 审批与错误态：审批卡片、模型失败、终端失败的文案与样式统一，有明确的下一步操作。
- 移动端：抽屉、触摸目标、双栏折叠逻辑不变，只做视觉对齐与间距修正。

### E2. 次要界面（结构重设计，2026-11-18 用户追加决定）

- 范围：设置（含 MCP / Skills 设置）、Agent 创建器与 Agent 库、产物库与代码编辑器、分析、自动化、能力中心、信息中心、团队库、全部对话框（新建会话、提问、工具搜索、文件库、目录选择、斜杠命令帮助、用户指南、统一创建）、全局搜索、通知中心、Agent 运行调试面板、经验库、`/deployments` 路由。
- 处理：与主界面同一标准——token / 字体 / 卡片档位对齐之外，布局结构也重新设计：每个界面只讲一个主任务，减少嵌套层级，统一空态 / 加载态 / 错误态；对话框统一尺寸档位与按钮位置，全局搜索与通知中心统一为面板式浮层。
- 顺序：主界面完成后再做次要界面（Phase 5），避免 token 未定型时返工。
- 不改：功能逻辑、API、SSE、DB。

### F. 动效

- 新增依赖 `motion`（MIT，`motion/react`），只做 transform/opacity 动画；所有动效遵循 prefers-reduced-motion（`globals.css` 已有兜底）。
- 出现位置（仅三处）：入场（首页分区滚动触发、数字滚动）、交互反馈（按钮按压、卡片 hover、产物点亮）、布局变化（产物面板开合、消息入场）。
- 不做：页面切换转场、装饰性粒子/循环动画、任何超过 500ms 的入场动画。

### G. 文案

- 每区只讲一个点；删掉解释性长句（如截图下的“截图是静态资源……”`/demo` 页脚的长说明改写为一句）。
- 数字用真实值（868 测试、5 个内置 Agent、8 种产物类型、3 端）；不用“高效”“强大”这类空词。
- 按钮文案保持“在线演示 / 下载桌面端 / 查看源码”不变。

### H. 细节与无障碍

- 焦点态可见（focus-visible ring 走 `--ring`）；对比度：金色只用在大字号/加粗文字上，不用在正文小字上。
- Toast、复制成功、空状态、加载骨架屏的文案与样式统一。
- 滚动条恢复可见（见 A）。

## Capabilities

### Modified Capabilities

- `frontend`: 首页、演示页、工作台 SHALL 使用统一的蓝主色 + 金点缀 token；金色 SHALL 只出现在约定的四处。
- `frontend`: 标题字体 SHALL 与正文字体分离；中文标题 SHALL 使用衬线字体；正文 SHALL 不小于 14px。
- `frontend`: 首页 SHALL 不超过 8 个分区；`SectionHead` 居中版 SHALL 至多出现在 3 个分区。
- `frontend`: 动效 SHALL 只出现在入场、交互反馈、布局变化三类场景；SHALL 只用 transform/opacity；SHALL 遵循 prefers-reduced-motion。
- `frontend`: 工作台各面板 SHALL 使用 `--agenthub-*` token，不得硬编码 slate/neutral 色值。

## Impact

- `src/app/globals.css`：token、字体、滚动条、阴影/圆角档位。
- `src/app/layout.tsx`：Noto Serif SC 接入。
- `src/components/home/*`：home-sections、home-primitives、hero 装饰相关样式、home-data 文案。
- `src/app/demo/demo-showcase.tsx` + `demo-replay`：回放编排、进度、结束态。
- `src/components/app-workbench.tsx`、message-list、artifact-workspace、artifact-preview-panel 等：token 对齐、卡片档位、三态。
- 次要界面（`src/components/settings/*`、settings-dialog、agent-create-wizard、agent-library、artifact-library、artifact-code-editor、analytics-workspace、automation-workspace、capability-center-workspace、information-center-workspace、team-library、experience-library、各对话框、global-search、notification-center、agent-run-debug-board、`src/app/deployments`）：按新 token 与卡片档位重做布局结构，统一空态 / 加载态 / 错误态与对话框尺寸档位（Phase 5，主界面之后）。
- 新增依赖：`motion`（需用户确认，见 Open Questions）。
- 不改：任何功能逻辑、API、SSE 事件、DB schema、鉴权、沙箱、终端；不改移动端 Capacitor 壳；不改 logo。

## 已确认（2026-11-18，用户决定）

1. 新增依赖 `motion`：**通过**。
2. 深色底：按提案，向暖黑 `#0E0D0B` 靠。
3. 首页分区合并：按提案 C 节执行。
4. 金色：就四处，不加第五处。
5. 分期：按提案，分四期提交。
6. **实施前置条件**：先出静态效果图，用户看过效果图再决定是否采用本方案；效果图通过之前不动代码。
