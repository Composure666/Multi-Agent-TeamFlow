# 运行展板任务图分析报告

- 分析对象：**运行展板**（左侧导航「运行展板」，`src/components/agent-run-debug-board.tsx`）里的任务图（React Flow 画布）。仓库全文检索无「云心」二字；若用户说的「云心展板」不是运行展板，请指出正确位置，本报告分析的是运行展板这一张图。
- 分析基线：本地 HEAD `89a0ee7` + 未提交的 README/团队详情对话框改动（与任务图无关）。本轮**只分析、不改代码**。
- 方法：通读布局代码（`src/lib/agent-run-debug-board.ts`、`src/components/agent-run-debug-board.tsx`、`src/components/workbench-primitives.tsx`）+ 本地 `next start` 实测（Playwright 路由拦截伪造 API 响应，零 DB 写入；造数：Orchestrator + 3 worker + 7 工具（含 plan_tasks）+ 2 条消息 + 2 个顶层 Run，节点 16 个）。根字号 17px（1rem=17px），以下所有 px 均为 CSS 像素。
- 实测环境：`npx next build` exit 0，`tsc --noEmit` 0 错误；验证服务端口 3167，用完已停。**干扰说明**：测量中途有并行任务重建了 `.next`（BUILD_ID 由 `MmQyOEMxsidbYHA3KS-6D` 变为 `1STezenZagVBhcyXcoGSm`，1920/390 首轮静态 chunk 大面积 500，重启服务后重测通过）。1366 组测于旧构建，1920/390/空态组测于新构建；并行任务只改了 `app-workbench.tsx`（与本报告无关），运行展板三文件（`agent-run-debug-board.tsx`、`agent-run-debug-board.ts`、`workbench-primitives.tsx`）与 HEAD 相比**零改动**，故测量结论不受影响。真实 `.agenthub-data` 未碰（`agenthub.db` mtime 早于实测开始；脚本只发 GET 与 `route.fulfill()`，无写请求）。
- 结论标注：「实测确认」为 Playwright 量出的数字；「代码推断」为读代码得出的结论，未经实测触发。

---

## §0 用户已点名要修的最高优先级：顶部两处空白带

> 用户原话（2026-11-19）：「运行展板里各组件的间隔太大，我想再缩小一点，给下面的任务图留出空间。」红框两处：一是顶部标题卡与阶段条之间，二是阶段条与下方主区（左侧会话栏 + 右侧任务图画布）之间。**报告一到就动手修，本节为最高优先级。**

### §0.1 纵向堆叠的完整账（实测确认，1366×768）

页面纵向是 `PageShell` 内容列（`src/components/workbench-primitives.tsx:26-44`）的 `flex flex-col gap-4 lg:gap-5`，子项依次是（括号内为实测值，根字号 17px）：

| 序号 | 元素 | 文件:行 | 高度/间距 |
|---|---|---|---|
| 0 | PageShell 外层 padding | `workbench-primitives.tsx:39`：`p-4 lg:p-6` | 顶部 **25.5px**（`1.5rem × 17`） |
| 1 | 标题卡 PageHeader | `agent-run-debug-board.tsx:832-949`（`PageHeader` 本体在 `workbench-primitives.tsx:62-112`，外层 `PageCard p-4 sm:p-5`） | **146.5px**（1366；1920 下 125.2px——见 §0.3）；padding 四边各 21.25px |
| — | **空白带 GAP1** | 内容列 `gap-4 lg:gap-5` | **21.2px**（1366；1920 下 21.3px） |
| 2 | 阶段条卡 | `agent-run-debug-board.tsx:950-960`：`PageCard className="flex h-12 shrink-0 items-center px-4 py-0"`，内为 `RunStageProgress`（`1947-2000`，阶段按钮 `h-8`，连接线 `w-5 xl:w-8`） | 固定 **51px**（`h-12 = 3rem × 17`）；5 个阶段：触发—上下文—规划—执行—产出（用户截图说的「规则」即「规划」阶段，`agent-run-debug-board.ts:283` 标题为「规划」） |
| — | **空白带 GAP2** | 内容列 `gap-4 lg:gap-5` | **21.3px**（1366；1920 下 21.2px） |
| 3 | 主区 grid | `agent-run-debug-board.tsx:973-1010`：`grid min-h-0 flex-1`（左 `ConversationRail` + 中画布） | grid 本身无 padding；画布卡外层 wrapper `min-h-[360px] flex-1 p-2`（`1015` 行）再加 **8.5px**；其上 `CanvasToolbar`（`1169` 起）**46.75px**（`min-h-11`） |

从视口顶到画布内容（工具栏文字）的大致账（1366）：25.5（Shell 顶）+ 146.5（标题卡）+ 21.2（GAP1）+ 51（阶段条）+ 21.3（GAP2）+ 8.5（wrapper p-2）+ 46.75（工具栏）≈ **321px**，画布 pane 实测 `y 321.7、高 411.3px`（`x 347、宽 984px`）。1920 下同款账为 299.5px，画布 pane `y 300.5、高 744.5px`（`x 347、宽 1538px`）。768 高视口下画布只剩约 411px——这就是用户要「给任务图留出空间」的直接背景。

### §0.2 两处空白带的实测值（实测确认）

| 视口 | GAP1（标题卡底边→阶段条顶边） | GAP2（阶段条底边→主区 grid 顶边） | 内容列 gap | PageShell 外层 padding | 标题卡高 / padding | 阶段条卡高 / padding | 主区 canvas wrapper p-2 | 工具栏高 |
|---|---|---|---|---|---|---|---|---|
| 1366×768 | **21.2px** | **21.3px** | 21.25px（`gap-4 lg:gap-5`） | 25.5px 四边（`p-4 lg:p-6`） | 146.5px / 21.25px 四边（`p-4 sm:p-5`） | 51px / 21.25px 四边 | 8.5px 四边 | 46.75px（`min-h-11`），横向溢出 0px |
| 1920×1080 | **21.3px** | **21.2px** | 21.25px | 25.5px 四边 | 125.2px / 21.25px 四边 | 51px / 21.25px 四边 | 8.5px 四边 | 46.75px，横向溢出 0px |
| 390×844 | **17px** | **17px** | 17px（`gap-4`） | 17px 四边（`p-4`） | **363.1px** / 17px 四边 | 51px / 上下 0px、左右 17px | 8.5px 四边 | **115.75px**（折成多行），横向溢出 0px，12 个按钮都在 |

补充实测：阶段条横向溢出 1366/1920 为 0px；390 下阶段条溢出 **107px**（scrollW 427 vs clientW 320，可横向滚动，截图上「执行」只露一半、「产出」在屏外）。390 下标题卡高达 363.1px（面包屑折 2 行、标题折 3 行、meta 折 4 行、操作区折 2 行），主区 grid 顶边 y 529.9、画布 pane y 741.1–966.4，已超出 844 视口底边（见 D8）。

### §0.3 为什么看着像「大片空白」（实测确认）

- **两处 gap 本身只有 21.25px**（`gap-5` 在 17px 根字号下的实测值），数字上并不大；但它们与标题卡自身 21.25px 下 padding、阶段条卡 51px 高里只有 34px 内容（按钮 `h-8`）连在一起，视觉上形成两条横贯全宽（内容列 `max-w-none`，1366 下宽 1243px、1920 下宽 1797px）的灰色带；灰带 + 白卡 padding 的「空」比 21px 这个数字给人的感觉大得多。
- **标题卡比想象中高得多**：1366 下 146.5px，比 1920 下的 125.2px 高出 **21.3px**——截图确认是 meta 行在 1366 下折成两行（长 model id `deepseek-chat-very-long-model-identifier-version-20261118-abcdef` 占了一整行 + `3 Agents` 另起一行），1920 下 meta 是一行。所以 1366 下「标题卡偏高 + 两条灰带 + 细阶段条」的节奏更显空。
- **阶段条卡有个死 class**：调用处写了 `px-4 py-0`（`agent-run-debug-board.tsx:950`），但 PageCard 基底是 `p-4 sm:p-5`——`sm:p-5` 是带变体的 class，在 Tailwind 生成顺序里后于无变体的 `py-0`，≥640px 时胜出。实测：1366/1920 下阶段条卡 padding 四边都是 **21.25px**（`py-0` 完全失效）；390 下（<640px，`sm:` 不生效）padding 才是上下 0px、左右 17px。视觉上被固定高 `h-12`（51px）+ `items-center` 掩盖了（34px 的按钮在 51px 卡里居中，正好放得下），但 class 本身是撒谎的，修的时候应顺手删掉（见 §0.4 第 2 项备注）。
- **画布上方的「空」不止两处 gap**：标题卡 146.5px + 阶段条 51px + 工具栏 46.75px + 三处 padding/gap（25.5 + 21.2 + 21.3 + 8.5）≈ 321px 之后才是画布；也就是说 768 高的视口里，画布只剩 411px。用户框的「两处空白带」是表象，实质是**页头区总共吃了约 42% 的视口高度**。

### §0.4 收紧的精确改法（本轮只给方案，下一轮动手）

> 约束：Top-5 A2/A3 把 PageShell 外层 `p-4 lg:p-6` 与内容列 `gap-4 lg:gap-5` 定为全站规范（`workbench-primitives.tsx:16-25` 注释），「调用处不要改写 padding」。W12 也明确未动这两处。所以收紧分两档：**页内可动**（不动共享规范）与**动规范**（需同步改注释/spec，慎用）。

**页内可动（推荐先做这组，1366 下共省约 59px，1920 下约 38px，全给画布）：**

| # | 改处 | 文件:行 | 现状 → 改后 | 省出 |
|---|---|---|---|---|
| 1 | 标题卡 padding | `agent-run-debug-board.tsx:832` 的 `PageHeader` → `workbench-primitives.tsx:62` 的 `PageCard p-4 sm:p-5`；只给本页的 PageHeader 传一个收紧的 class（PageCard 已支持 `className` 透传，`workbench-primitives.tsx:46-60`） | `p-4 sm:p-5`（21.25px）→ `p-3 sm:px-4 sm:py-3`（上下 12.75px） | 上下共 **17px** |
| 2 | 阶段条卡高度 | `agent-run-debug-board.tsx:950`：`h-12 … px-4 py-0` | `h-12`（51px）→ `h-10`（42.5px）；按钮 `h-8`（34px）不变，上下各剩 4.25px，仍可点。**顺手删掉已失效的 `py-0`**（见 §0.3，≥640px 时 `sm:p-5` 胜出，留着是死代码；删掉后视觉不变） | **8.5px** |
| 3 | 主区画布 wrapper padding | `agent-run-debug-board.tsx:1015`：`min-h-[360px] flex-1 p-2` | `p-2`（8.5px）→ `p-1.5`（6.375px） | 上下共约 4px（顶部约 2px） |
| 4 | 工具栏高度 | `agent-run-debug-board.tsx:1218` 附近 `CanvasToolbar` 根：`min-h-11 … py-1`，内按钮 `h-7` | `min-h-11`（46.75px）→ `min-h-10`（42.5px），`py-1` 保留 | **4.25px** |
| 5 | 标题 meta 行与面包屑间距 | `workbench-primitives.tsx:99-107`：面包屑 `mb-1`、标题、meta `mt-1` | `mb-1`/`mt-1`（4.25px）各 → `mb-0.5`/`mt-0.5`（2.1px），仅本页 | 约 4px |
| 6 | 标题 meta 行在 1366 下折两行 | `agent-run-debug-board.tsx:849`：meta 里的 model span 直接渲染 `selectedRun?.modelId` 全文（长 model id 把 meta 顶成两行，标题卡 146.5px vs 1920 下 125.2px） | 给 model span 加 `max-w-[220px] truncate`（面包屑标题已有同款 `max-w-[260px] truncate`，`840` 行），或复用节点卡片已有的 `compactModelName`（`agent-run-debug-board.tsx` 内 `NodeMetric` 在用）把 model id 缩短 | **约 21px（仅 1366 档受益）** |

**动规范（不推荐首轮做；若用户仍嫌空再议）：**把本页内容列 gap `gap-4 lg:gap-5`（21.25px）→ `gap-3 lg:gap-3`（12.75px），两处共省 17px——但这要改 `workbench-primitives.tsx:39` 的 PageShell 或给本页开特例，并同步改 A2/A3 注释；且 21.25px→12.75px 后卡片之间只剩 12.75px，标题卡与阶段条几乎贴在一起，视觉上可能显挤，建议先做页内组、实测后再定。

**预期效果：**页内组 1366 下共省约 59px（画布高 411.3px → 约 470px，**+14%**）；1920 下省约 38px（画布高 744.5px → 约 782px，+5%）。两处灰带本身保持 21.25px（只做页内组时），但两侧卡片变薄、标题卡回落，灰带视觉占比下降；若再加 gap 组，灰带收至 12.75px，总计 1366 下省约 76px。

---

## §1 任务图缺点（按影响排序）

### D1 图面一半以上是空白，fitView 一缩字就没法看（高）

- **现象（实测确认）：**造数图 16 个节点（2 消息 + 2 Run + 1 Orchestrator + 3 worker + 7 工具 + 1 汇总），图总范围 x 115→1455、y 0→2840（flow 单位），fitView 缩放 **0.125 @1366**（画布 984×411.3px）、**0.226 @1920**（画布 1538×744.5px）、**0.1 @390**（触 minZoom 下限）。12px 正文缩到约 **1.5px @1366**、2.7px @1920、1.2px @390——首屏根本读不了字。截图上图在画布里只占中间约 167px 宽的一条（1340 × 0.125），两侧各剩约 400px 空白，只能滚轮放大看局部，看局部又丢全局。另：12/16 节点标签被截断、14/16 描述被截断（三视口相同；截断本身是 `truncate`/`line-clamp` 的设计，但在 0.125 缩放下连「有没有字」都看不清）。
- **证据（实测 + 代码）：**节点实测高度（flow 单位）vs lib 保守值：message 160.2/181.5 vs 200；run **130.5 vs 130**（实测比估计高 0.5px，可忽略）；agent **185.7 vs 320**（ slack 134px）；tool **138 vs 220**（slack 82px）；summary 130.5 vs 170。沿关键路径（消息→Run→消息→Run→Orchestrator→worker→工具→工具→汇总）卡片实高合计约 1381px，总高 2840px，**纵向空白约 1459px（51%）**。节点两两矩形相交 0 对（折叠态下布局本身不压盖，见「已修过」）。代码侧留白来源（Run 级坐标）：Run→Orchestrator 固定 210px（`agent-run-debug-board.ts:445`，Run 卡实高 130.5，空约 80px）；Orchestrator（y=210，卡实高 185.7，底边约 396）→ worker 网格顶 600，空约 204px；worker 行高 380px 而卡实高 185.7px，行内空 194px；工具网格顶距 worker 卡实底边约 334px；工具行高 260px 而卡实高 138px，行内空 122px；汇总顶距工具卡实底边约 302px。`estimateNodeHeight`（`684-701`）：agent 320 / tool 220 / message 200 / run 130 / summary 170，均为「保守上界」，折叠态实高远低于它。
- **影响：**首屏不可读是任务图最影响体验的问题；且 fitView 的 `minZoom: 0.1`（`agent-run-debug-board.tsx:136`，注释称「一屏看全」）把这个行为锁死了——图越大字越小。
- **关联历史：**batch4 已把 rowGap 340→240、toolGridTopGap 260→200、summaryGap 300→220（`agent-run-debug-board.ts:411-415` 注释），但留白仍占大头；W12 报告也指出「图内节点行距决定了节点纵向间距与 fitView 缩得很小后大面积留白」，当时未动。
- **建议：**按实高布局而非保守高布局：worker 行高 380→约 250（卡高 185.7 + 64 间距），工具行高 260→约 190（卡高 138 + 52），toolGridTopGap 200→约 120，summaryGap 220→约 120，Run→Orchestrator 210→约 170；或引入 dagre 做紧凑分层布局。改动面：`src/lib/agent-run-debug-board.ts` 的常量 + `estimateNodeHeight` 语义；测试 `src/lib/agent-run-debug-board.test.ts:1170-1293` 锁了 200/220/240 等数值，改后须同步更新。预期：同规模图总高约 2840→约 1900px，fitView 缩放 @1366 约 0.125→约 0.19，首屏字约 1.5px→约 2.3px（仍小，需配合 D6 的默认视角策略才能真正读）。

### D2 跨层直连边穿过中间层节点（高）

- **现象（实测确认）：**汇总节点入边 **7 条**（Orchestrator + 3 worker + 3 尾工具，其余节点入边各 1、首行消息 0）。边与非端点节点包围盒相交 **8 处**（三视口相同；方法：每条边的轴向包围盒 vs 非端点节点矩形，是包围盒级重叠、非逐像素路径求交，计数为上界）：
  - `agent-ag_reviewer → tool-call_tool_003` 穿 `tool-call_tool_004`：36.2×17.2px（1366 屏幕像素；1920：65.7×31.3）
  - 同边另穿 `tool-call_tool_001`：18.1×17.2px
  - `agent-ag_orchestrator → summary-output` 穿 `agent-ag_designer`：**0.6×23.2px**（仅擦边一线；3 worker 时中间 worker 卡横跨 x 640–920，边走 x≈780–795，正在其上）
  - `agent-ag_frontend → summary-output` 穿 `tool-call_tool_001` 与 `tool-call_tool_003`：各 36.3×17.2px
  - `agent-ag_reviewer → summary-output` 穿 `tool-call_tool_004` 与 `tool-call_tool_006`：各 36.2×17.2px
  - `tool-call_tool_004 → summary-output` 穿 `tool-call_tool_006`：18.1×17.2px
  - 8 处中有 6 处是「→汇总」的边，1 处是 reviewer 的工具链边。截图上能看到一条绿色竖线从 Orchestrator 直插汇总，穿过 worker 行与工具行。
- **证据（代码）：**汇总同时收三组直连边（`agent-run-debug-board.ts:569-576`）；边是 `smoothstep`（`1609-1622`），源在上、目标在下时几乎走垂直线；节点宽度 agent 280 / tool 290（`agent-run-debug-board.tsx:1337-1343`），列宽 worker 360 / tool 350（`agent-run-debug-board.ts:404-414`），行居中公式 `startX = centerX - (totalWidth - colWidth)/2` 使各行视觉中心落在 centerX+140 附近，而 Run/汇总卡宽 310/270，中心在 centerX+155/+135——边与卡中心基本对齐，穿卡不是偶然，是结构性的。是否压住节点取决于列数：worker 1 个或 3 个时中间 worker 被穿；工具 3 列时中间工具被穿。
- **影响：**长边压在卡片上时，边与卡片描边/文字叠在一起，既难看又干扰点击判断（边的热区盖住卡片边缘）。
- **建议：**删掉 Orchestrator→汇总直连边（语义上汇总已由 worker 与尾工具收口，Orchestrator 直连是冗余的）；worker→汇总改为只连「尾工具→汇总」，无工具的 worker 才直连汇总；或改用 dagre + 正交路由。改动面：`buildAgentRunDebuggerGraph` 末尾 + 测试。预期：汇总入边从 7 减到约 3（尾工具数），穿层边基本消失。修后须用逐像素路径求交复测（本次包围盒计数是上界）。

### D3 工具链边在扁平网格里蛇形交叉（高）

- **现象（实测确认）：**工具节点按「每个 agent 的全部工具」扁平化成一个统一网格（`buildAgentRunToolDebuggerGraph`，`agent-run-debug-board.ts:582-700` 注释称「避免单列纵向堆积」），但边仍按 agent 内链式串接（`previousNodeIdByAgent`）：实测 `agent-ag_reviewer → tool-call_tool_003` 穿过 `tool-call_tool_004` 与 `tool-call_tool_001`（36.2×17.2 / 18.1×17.2px，包围盒级）——reviewer 的工具在网格第 1 行第 3 列与第 2 行，链从第 1 行末尾跳回第 2 行开头，横穿整行；多 agent 时链与链互相交叉，也与无关工具卡交叉。
- **证据（代码）：**`flattened` 列表按 agent 分组顺序铺网格（`650-676`），边却按 `previousNodeIdByAgent` 串接（`678-692`）；网格列数固定 `toolMaxCols = 4`，与 agent 数无关，所以链的跳行位置不可预测。
- **影响：**工具一多（6 个以上）就看不出「谁调了哪个工具」，边成了乱麻；工具卡上的「· agentName」后缀是唯一的归属提示，字又小。
- **建议：**工具网格按 agent 分组分块排布（每 agent 一块，块内小网格，块间留空 + 组标签），链只在块内走；或工具节点直接挂在其 agent 卡正下方成列（回归纵向堆叠但每列只属于一个 agent）。改动面：`buildAgentRunToolDebuggerGraph` + 测试。预期：链不再跨行跳跃，归属一目了然。

### D4 展开态 Agent 卡片可超出 320px 保守高，压住下一行（中，代码推断，未实测展开态）

- **现象：**Agent 卡片默认折叠（`DebuggerNode` 内 `useState(false)`，`agent-run-debug-board.tsx:1314`），折叠态实测高 **185.7px**；点开后步骤列表**不设上限**——`getVisibleAgentDebuggerSteps(steps, true)` 在展开态返回全部步骤（`agent-run-debug-board.ts:1144-1153`），每步约 30px。按实测折叠高推算展开高 ≈ 185.7 − 44（折叠步骤行）− 24（折叠工具行）+（24 + 30×步数）+ 78（工具芯片区）≈ 220 + 30×步数：3 步约 310px（320 以内，安全），**4 步约 340px（超 20px），5 步约 370px（超 50px），8 步约 460px（超 140px）**。worker 行高 380px：8 步展开卡压住下一行 worker 约 80px；工具网格顶 = worker 行顶 + 320 + 200：12 步展开卡（约 580px）压住工具行约 60px。
- **证据（代码）：**`estimateNodeHeight('agent') = 320`（`684-701`）注释称「保守上界」；测试 `agent-run-debug-board.test.ts:1151-1153` 也把 320 写为「保守上界高度：展开态最高」，并以它断言「任意两张卡片互不压盖」——但该断言只对 fixture（步数少）成立，步数一多即失效。布局（`buildAgentRunDebuggerGraph`）不知道展开态，展开是节点内部 `useState`，布局无法补偿。本次实测造数只用了折叠态，展开态压盖未实测触发，故标为代码推断。
- **影响：**用户一点展开就可能看到卡片叠卡片；且这是用户主动操作触发的，比静态重叠更难察觉原因。
- **建议：**二选一：(a) 展开态步骤列表封顶显示（如最多 6 步 +「+N 个步骤」——现已有 `hiddenCount` 机制，只在折叠态用 `slice(0,3)`，展开态可复用）；(b) 展开时按实测高度重新布局（节点量出高度后调 `position`，React Flow 的 `useNodesState` 支持）。(a) 改动小，推荐先做。改动面：`getVisibleAgentDebuggerSteps` + `NodeAgentCurrentStep`；测试同步。

### D5 工具没有视觉分组，归属只能靠边认（中）

- **现象：**工具网格是单一扁平网格，无组标题、无分隔；一个工具属于哪个 agent，只能看它连向谁（边已如 D3 那样交叉）或看卡片内「工具名 · agentName」小字后缀（`agent-run-debug-board.tsx:1421-1426`）。
- **证据（代码）：**`buildAgentRunToolDebuggerGraph` 的扁平化注释（`650-656`）；工具卡渲染（`1419-1430`）。
- **建议：**与 D3 同一改法解决（按 agent 分块 + 组标签），或至少给工具卡加一条 agent 色带/角标。改动面同 D3。

### D6 筛选/聚焦只变淡，不改变布局与视野（中）

- **现象：**时间线筛选（全部/Agent/工具/错误）走 `focusAgentRunDebuggerGraph`（`agent-run-debug-board.ts:906-944`）：不匹配的节点 `opacity-35 grayscale`、相关边透明度降到 0.22/0.45，但**节点位置与图尺寸完全不变**，fitView 缩放也不变。用户想「只看错误」时，图还是原来那么大、字还是那么小。
- **证据（代码）：**`focusAgentRunDebuggerGraph` 只改 `emphasis` 与边 `opacity`；`agent-run-debug-board.tsx:264-266` 的 `focusedGraph` 直接替换节点/边。
- **影响：**筛选这个最能帮用户「找重点」的功能，在大图上几乎没用。
- **建议：**筛选时对不匹配节点改用「折叠隐藏」（从图中移除并重算布局）或「聚焦缩放」（fitView 只框住匹配节点）；至少给「错误」筛选加一个「定位到第一个错误节点」的跳转。改动面：`focusAgentRunDebuggerGraph` + 画布 `fitView` 调用处（`agent-run-debug-board.tsx:293-317`）。预期：筛后图大幅缩小，首屏可读。

### D7 拖拽位置在数据演进时可能钉住过期坐标（低）

- **现象：**手动拖过的位置存在 `draggedPositionsRef`（`agent-run-debug-board.tsx:193-196`），只在换范围/换 Run/换筛选（`canvasLayoutKey`，`270` 行）时清空；SSE 事件、详情重拉等刷新一律保留拖过的位置（注释称「否则每来一条事件卡片就弹回原位」）。若拖动后数据演进（新增工具节点、展开子图），被拖的节点钉在旧坐标，可能压住新节点；且拖拽本身允许用户把卡片拖到任意位置制造重叠，「重置布局」是唯一恢复手段。
- **证据（代码）：**`handleNodesChange`（`319-330`）记录所有 position 变更；`setFlowNodes`（`280-290`）用 `dragged.get(id) ?? node.position`。
- **影响：**低频，但一旦发生用户很难定位原因（batch3 修的正是同类问题：旧位置保留导致 Run 盖消息，`280-284` 注释；现只保留「亲手拖过」的位置，残留风险限于拖过又演进的场景）。
- **建议：**拖过的位置在重算图时做一次碰撞校验（与新布局的卡片矩形求交，压住则落回布局坐标并提示）；或给拖过的位置加「已过期」标记。改动面：`setFlowNodes` 的 effect。预期：拖拽不再制造静态重叠。

### D8 小屏 390px：图在首屏外，阶段条被截断（中，实测确认）

- **现象（390×844 实测）：**标题卡高达 **363.1px**（面包屑折 2 行、标题折 3 行、meta 折 4 行、操作区折 2 行），占了 43% 的视口高；阶段条横向溢出 **107px**（scrollW 427 vs clientW 320，可横向滚动，截图上「执行」只露一半、「产出」在屏外）；工具栏折成 3 行、高 **115.75px**（12 个按钮都在，横向溢出 0px，可达）；画布 pane 只有 **337×225.3px**，位于 y 741.1–966.4，**超出 844 视口底边**——汇总节点在 y 982.6 处，首屏完全看不到图的全貌，必须滚动页面。fitView 缩放 **0.1**（触 minZoom 下限），12px 字缩到 1.2px。左侧会话栏隐藏（wrapper `display:none`，栏内仍有 6 行数据），改由顶部汉堡菜单（`title="打开菜单"`）开抽屉 + 会话下拉 select 进入；检查器走 Dialog（Top-5 D1，未在本轮复测打开）。
- **证据：**`debug-graph-390x844-board.png`；测量 JSON 390 组（`gaps.toolbarHeight: 115.75px`、`paneRect`、`fitViewScale: 0.1`、边穿越 8 处同桌面）。
- **影响：**390 下任务图基本不可用：首屏看不到图，看到也要滚页 + 缩放 0.1；阶段条还要横向滑才能看全。
- **建议：**390 下标题卡改紧凑版（标题只留一行截断、meta 只留状态 + Run id 两项、操作区只留「重新运行」主按钮其余收进「更多」）；阶段条在小屏改纵向列表或横向滚动加渐隐提示；画布默认不 fitView 全图、改默认缩放到当前 Run 附近（配合 D6）。改动面：`PageHeader` 响应式、`RunStageProgress`、`CanvasToolbar`、fitView 默认策略。

### D9 空态：有消息无 Run 时画一张无意义的「消息链」（中，实测确认）

- **现象（实测确认，两个变体）：**
  - **变体 A（runs=[]，消息保留）：三种 EmptyBoard 文案均未出现。**画布渲染出 2 个孤立 user 消息节点（`用户消息 / 关联 Run 0`），两节点以一条边相连；页头显示「暂无 Run」。即：会话有消息、但没有任何 Run 时，板上是一条没有 Run 信息的「消息链」，看起来像图、实际什么也说明不了。
  - **变体 B（runs=[] 且 messages=[]）：EmptyBoard 第二态正常出现**，节点数 0，文案为标题「当前会话还没有可展示的 Run」+ 提示「运行阶段会按触发、上下文、规划、执行和产出依次展开。」+「回到会话」按钮。
  - 第一态「还没有可查看的会话」（无会话时）与第三态「暂无可展示的流程节点」（有 Run 但无节点时）本次均未触发。
- **证据（代码）：**`buildAgentRunSessionDebuggerGraph`（`agent-run-debug-board.ts:710-750`）：`if (linkedRuns.length === 0 && hasRunBackedGraph) continue`——只有「会话里已有 Run」时才跳过无关联 Run 的消息；runs 为空时 `hasRunBackedGraph` 为 false，user 消息照常入图、再由 `previousTerminalNodeId` 串成链。`canRenderCanvas`（`agent-run-debug-board.tsx:265-268`）只看节点数，2 个消息节点即视为「可渲染」，于是 EmptyBoard 被绕过。
- **影响：**新会话刚发完消息、Run 还没生成时（或 Run 列表拉取失败但消息已到时），用户看到的是一张空有其表的图，容易误以为 Run 出了问题。
- **建议：**无 Run 时不画消息链，直接走 EmptyBoard 第二态（或新增「消息已发、Run 生成中」的等待态）；`canRenderCanvas` 的判断改为「有 Run 节点才算可渲染」。改动面：`buildAgentRunSessionDebuggerGraph` 的跳过条件 + `canRenderCanvas`。另：有 Run 但无工具/无子 Run 时图只有 Run + Orchestrator + 汇总三张卡，汇总落在 `workerGridTopY = 600`，Run 与汇总之间空约 490px——小图的空白问题与 D1 同源，不另立项。

### 已修过、不再列为缺点的项

- batch3：旧位置保留导致 Run 节点盖住消息节点——已修（只保留亲手拖过的位置，`agent-run-debug-board.tsx:280-290`）。
- batch3：工具栏横向溢出 441px——已修（batch5 改为 flex-wrap 折行收容，`CanvasToolbar` 注释 `1169-1180`）。
- batch4：rowGap 340→240、toolGridTopGap 260→200、summaryGap 300→220、workerRowHeight 相关——已收紧，但仍是 D1 留白的大头。
- batch4：空 Run 三态 EmptyBoard——已做，见 D9。
- W12：会话栏长标题断行、工具栏按钮折行——已修。

---

## §2 修改建议总表（按优先级）

| 优先级 | 项 | 改法要点 | 改动面 | 预期效果 |
|---|---|---|---|---|
| **P0（用户点名）** | §0 两处空白带 | 页内组：标题卡 padding 21.25→12.75、阶段条 h-12→h-10（51→42.5px，顺手删死 class `py-0`）、画布 wrapper p-2→p-1.5、工具栏 min-h-11→min-h-10、面包屑/meta 间距 4.25→2.1px、meta model id 截断（1366 下 meta 回单行） | `agent-run-debug-board.tsx`（832/849/950/1015/1218 行附近）+ `workbench-primitives.tsx`（PageCard className 透传已支持） | 1366 下纵向省约 59px，画布 411→约 470px（+14%）；1920 下省约 38px（+5%） |
| P1 | D1 图太稀疏 | 按实高收紧行高与间隙（worker 380→~250、tool 260→~190、toolGridTopGap 200→~120、summaryGap 220→~120、Run→Orchestrator 210→~170）或 dagre 紧凑布局 | `src/lib/agent-run-debug-board.ts` 常量 + `estimateNodeHeight`；测试同步 | 同规模图总高约 2840→约 1900px，fitView @1366 约 0.125→约 0.19 |
| P1 | D2 跨层边穿卡 | 删 Orchestrator→汇总直连；worker→汇总只保留无工具者；尾工具→汇总保留 | `buildAgentRunDebuggerGraph` 末尾 | 汇总入边从 7 减到约 3，穿层边基本消失 |
| P1 | D3/D5 工具链交叉、无分组 | 工具按 agent 分块排布 + 组标签，链只在块内走 | `buildAgentRunToolDebuggerGraph` | 归属一目了然，链不再跨行跳跃 |
| P2 | D4 展开态超高 | 展开步骤封顶（如 6 步 +「+N」），复用现有 `hiddenCount` | `getVisibleAgentDebuggerSteps` + `NodeAgentCurrentStep` | 展开不再压住下一行 |
| P2 | D6 筛选不变布局 | 筛选时隐藏非匹配节点并重算布局，或聚焦缩放只框匹配节点 | `focusAgentRunDebuggerGraph` + fitView 调用处 | 筛后图缩小，首屏可读 |
| P2 | D8 390 首屏无图 | 390 下标题卡紧凑版、阶段条改纵向或加渐隐提示、默认缩放改到当前 Run 附近 | `PageHeader` 响应式、`RunStageProgress`、`CanvasToolbar`、fitView 默认策略 | 390 下首屏可见任务图 |
| P2 | D9 有消息无 Run 的退化图 | 无 Run 时不画消息链，直接走 EmptyBoard 第二态；`canRenderCanvas` 改为有 Run 节点才算可渲染 | `buildAgentRunSessionDebuggerGraph` 跳过条件 + `canRenderCanvas` | 空会话不再画无意义的消息链 |
| P3 | D7 拖拽过期坐标 | 重算图时对拖过位置做碰撞校验，压住则落回布局坐标 | `setFlowNodes` 的 effect | 拖拽不再制造静态重叠 |

---

## §3 实测方法与证据

- 服务：本地 `next start -p 3167`（`npx next build` exit 0，新 BUILD_ID `MmQyOEMxsidbYHA3KS-6D`；`npx tsc --noEmit` 0 错误），`/home` 200；实测结束服务已停。测量中途并行任务重建 `.next`（BUILD_ID 变为 `1STezenZagVBhcyXcoGSm`），1366 组测于旧构建、其余组测于新构建；运行展板三文件与 HEAD 相比零改动，结论不受影响（见文件头干扰说明）。
- 造数：Playwright 路由拦截伪造 `/api/conversations`、`/api/conversations/*/messages`、`/api/conversations/*/agent-runs`、`/api/conversations/*/agent-runs/*/debug` 等响应（复用 batch3 W12 `w12-measure.mjs` 的做法），**零 DB 写入**，真实 `.agenthub-data` 未碰；验证服务用完即停。
- 造数规模：Orchestrator + 3 worker（前端工程师、UI 设计师、评审员，各带 1 个 child run）+ plan_tasks 拆 4 个任务 + 7 个工具节点（含 plan_tasks，分属 3 个 agent）+ 2 条 user 消息 + 2 个顶层 Run（会话图排两行），节点 16 个、边 21 条；保留 W12 全部长串最坏情况（长会话标题、长 Agent 名、长 model id、长工具名、长任务标题）。
- 证据目录：`~/workspace/frontend-polish-evidence/debug-board-task-graph-analysis/`：
  - `debug-graph-measurements.json`（合并总表，5 组结果：1366/1920/390 board + 2 组空态）
  - `debug-graph-measure.mjs`（扩展后实测脚本）
  - `debug-graph-1366x768-board.png`、`debug-graph-1920x1080-board.png`、`debug-graph-390x844-board.png`、`debug-graph-1366x768-empty.png`、`debug-graph-1366x768-empty2.png`
  - `debug-graph-build.log`（BUILD EXIT: 0）、`debug-graph-server.log`、`debug-graph-tsc.log`（0 错误）
- 说明：本报告分析的是**运行展板**的任务图；仓库无「云心」二字，若用户所指另有其图，请指出。
