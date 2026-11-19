# P0 间距收紧 — 进度记录（2026-11-19）

## 状态：P0 全部完成并复测通过 ✅

只改 2 个文件：`src/components/agent-run-debug-board.tsx`、`src/components/workbench-primitives.tsx`。
未碰 `src/lib/agent-run-debug-board.ts` 及其测试（P1 由下一棒做）。
未 commit / push / 部署；PageShell 共享规范（`gap-4 lg:gap-5`、`p-4 lg:p-6`）未动。

## 6 项逐项

| # | 改动 | 文件:行 | 结果 |
|---|---|---|---|
| P0-1 | 标题卡 padding `p-4 sm:p-5` → `p-3 sm:px-4 sm:py-3` | `workbench-primitives.tsx`：`PageHeader` 新增可选 `compact` prop 透传到 `PageCard`；`agent-run-debug-board.tsx:832` 加 `compact` | ✅ 实测 padding 上下 21.25 → 12.75px；其他 PageHeader 调用处未动，共享默认值不变 |
| P0-2 | 阶段条卡 `h-12` → `h-10`，删死 class `py-0`，按钮 `h-8` 不变 | `agent-run-debug-board.tsx:950` | ✅ 实测 51 → **44.5px**（不是 42.5，见下方注 1） |
| P0-3 | 主区画布 wrapper `p-2` → `p-1.5` | `agent-run-debug-board.tsx:1015` | ✅ 实测 8.5 → 6.375px |
| P0-4 | 工具栏 `min-h-11` → `min-h-10`，`py-1` 保留 | `agent-run-debug-board.tsx:1209` | ✅ 实测 46.75 → **43.5px**（不是 42.5，见下方注 2） |
| P0-5 | 面包屑 `mb-1` / meta `mt-1` → `mb-0.5` / `mt-0.5`，仅本页 | `workbench-primitives.tsx`：走 `compact` prop（description 的 `mt-1` 也一并收紧，本页未传 description，无影响） | ✅ 标题卡总高 146.5 → 104px（1366） |
| P0-6 | 标题 meta model id 截断 | `agent-run-debug-board.tsx:849`：model span 加 `max-w-[220px] truncate`（meta 行是 flex 容器，span 作为 flex item 可截断，与面包屑 `max-w-[260px] truncate` 同款做法） | ✅ 1366 下 meta 回到单行；截图可见 `deepseek-chat-very-long-model-id…` |

## 复测（最终树状态，Playwright 路由拦截伪造 API，16 节点 21 边，BUILD_ID `xJfT2tcpOLIjQrQvLCpgy`）

| 视口 | 画布高（前 → 后） | 画布顶 y | GAP1 / GAP2 | 标题卡高 | 阶段条高 | 工具栏高 | 横向溢出 |
|---|---|---|---|---|---|---|---|
| 1366×768 | 411.3 → **467.8（+56.5，目标约 +59）** | 321.7 → 267.3 | 21.2 / 21.3（未动，共享规范） | 146.5 → 104 | 51 → 44.5 | 46.75 → 43.5 | 阶段条 0 / 工具栏 0 |
| 1920×1080 | 744.5 → **779.8（+35.3，目标约 +38）** | 300.5 → 267.3 | 21.3 / 21.2（未动） | 125.2 → 104 | 51 → 44.5 | 46.75 → 43.5 | 0 / 0 |
| 390×844 | 225.3 → **229.5（+4.2）** | 741.1 → 700.8 | 17 / 17（未动） | 363.1 → 333.4 | 51 → 42.5 | 115.75（不变，多行折行主导） | **阶段条仍溢出 107px**（D8 范围外，未恶化）；工具栏 0 |

附带：fitView 缩放 0.125 → 0.142（@1366）、0.226 → 0.237（@1920）；边穿卡仍 8 处（包围盒计数，P1-D2 的活，未动）；节点重叠 0 对。

## 注：两处比预期少 2px / 1px 的原因（已实测定位，非猜测）

1. **阶段条 44.5 而非 42.5**：`h-10` 本身是 42.5px，但 PageCard 基底 `sm:p-5` 在 ≥640px 胜出，上下 padding 各 21.25px + 1px 边框，使 flex item 的自动最小高度（`min-height: auto`，内层 `overflow-x-auto` 滚动容器内容最小高为 0）= 44.5px，顶住了 `h-10`。390 下无 `sm:`，实测正好 42.5px。想再省这 2px 需给阶段条卡加 `sm:py-3` 之类（`py-0` 这类无变体 class 会被 `sm:p-5` 压住，正是本次删掉的死 class 的同款陷阱），超出 P0-2 字面范围，未做。
2. **工具栏 43.5 而非 42.5**：`min-h-10` 本身是 42.5px，但栏内最矮内容行实高 42.5px + 底部 1px 边框 = 43.5px，内容顶住了 `min-h`。省 3.25px 而非 4.25px。

合计 1366 画布 +56.5（目标约 +59）、1920 +35.3（目标约 +38），在"约"的容差内；剩余缺口即上述 2 + 1px。

## 检查

- `npx tsc --noEmit`：0 错误
- `npx eslint`（两改动文件）：0 错误
- 全量 vitest：**894 passed / 4 skipped**（104 文件），与基线一致
- 干净生产构建：exit 0（`node node_modules/next/dist/bin/next build`；注：`pnpm build` 的 electron 前置步骤在本机失败——`electron` 包未正确安装，与本次改动无关；分析轮同样用 `npx next build`）
- 隔离验证：`AGENTHUB_DATA_DIR=/tmp/p0-spacing-isolated-data`（空库新建），`/api/conversations` 在复测脚本里全量伪造（不 `route.fetch()`，真实库连读都没读）；真实 `.agenthub-data/agenthub.db` mtime 验证前后不变（2026-11-19 03:51:04 UTC）；服务已停（端口 3167 关闭），隔离目录与探查目录已删

## 证据

`~/workspace/frontend-polish-evidence/debug-board-spacing-graph/`（文件名前缀 `p0-`）：

- `p0-debug-graph-measure.mjs`（分析轮脚本的改编版：输出目录/文件名前缀、`/api/conversations` 全量伪造、阶段条查找 `h-12`→`h-10`、工具栏查找改为 `[data-testid="canvas-toolbar"]`）
- `p0-debug-graph-measurements.json`（三视口全量测量）
- `p0-debug-graph-1366x768-board.png` / `p0-debug-graph-1920x1080-board.png` / `p0-debug-graph-390x844-board.png`
- `p0-build.log`（BUILD EXIT: 0，BUILD_ID `xJfT2tcpOLIjQrQvLCpgy`）、`p0-server.log`、`p0-measure.log`、`p0-checks.log`

## 下一棒（P1）注意

- 本轮未动 `src/lib/agent-run-debug-board.ts` 及其测试，P1-D1/D2/D3 可直接接手。
- 复测脚本 `p0-debug-graph-measure.mjs` 可复用（P1 预期 fitView @1366 约 0.19、边穿卡约 0 需逐像素求交——当前脚本的边穿卡计数仍是包围盒级上界）。

---

# P1 任务图三项（D1/D2/D3）— 进度记录（2026-11-19）

## 状态：P1 全部完成并复测通过 ✅

改 3 个文件：`src/lib/agent-run-debug-board.ts`、`src/lib/agent-run-debug-board.test.ts`、`src/components/agent-run-debug-board.tsx`（只加组标签渲染）。
P0 的 6 项未动（复测画布 1366 467.8px、GAP1/GAP2 21.2/21.3、阶段条 44.5、工具栏 43.5，与 P0 数字完全一致）。
未 commit / push / 部署；无新依赖。

## D1：行高与间隙收紧（按实高布局）

| 常量 | 旧 → 新 | 选值理由 |
|---|---|---|
| Run→Orchestrator | 210 → 170 | Run 卡实高 130.5 + 约 40 间距 |
| workerGridTopY | 600 → 420 | Orchestrator 卡底边约 356（y 170 + 实高 185.7）+ 约 64；不收这里 D1 总高收不回来 |
| workerRowHeight | 380 → 250 | agent 卡实高 185.7 + 约 64 |
| toolRowHeight | 260 → 190 | tool 卡实高 138 + 约 52 |
| toolGridTopGap | 200 → 120 | 上一行底边到下一行顶边的纯空白 |
| summaryGap | 220 → 120 | 同上 |
| `estimateNodeHeight` agent | 320 → 200 | 实测折叠高 185.7 + 14.3 余量 |
| `estimateNodeHeight` tool | 220 → 150 | 实测 138 + 12 |
| `estimateNodeHeight` message | 200 → 190 | 实测 160.2 / 181.5，取上限 + 8.5 |
| `estimateNodeHeight` run | 130 → 135 | 实测 130.5 + 4.5 |
| `estimateNodeHeight` summary | 170 → 135 | 实测 130.5 + 4.5 |
| `estimateNodeHeight` task | 190（不变） | 无实测值；task 节点不在本图里出现，沿用 |
| `estimateNodeHeight` group（新增） | 28 | 组标签芯片实测 27.5 |

会话图常量（rowGap 240、runRowOffsetY 260、runColGap 400）未动——不在 P1 范围内；会话行距通过 `agentRunGraphExtent`（已用新估计高）自动收紧。测试 `CARD_HEIGHT` 同步改为折叠实高 + 余量（message 190 / run 135 / agent 200 / task 190 / tool 150 / summary 135 / group 28），并把「互不压盖」断言的适用范围写明为折叠态。

## D2：跨层边穿卡

- 删 Orchestrator→汇总直连边（`buildAgentRunDebuggerGraph` 末尾）；无 worker 时的 Orchestrator→汇总边保留（其间无中间层，不穿卡）。
- worker→汇总只连**无工具**的 worker（`buildAgentRunToolDebuggerGraph` 新增返回 `agentsWithTools` 供判断）；尾工具→汇总保留。
- 汇总入边：实测夹具 7 → **3**（3 条尾工具边）；单元夹具 4 → 3（designer + tool-call_1 + tool-call_2）。

## D3/D5：工具按 agent 分块 + 组标签

- `buildAgentRunToolDebuggerGraph` 不再扁平化成统一网格：每 agent 一块，块顶一个 `kind: 'group'` 组标签节点（标签文字 = agent 名 +「工具组」，不可拖、不可选、无 Handle、不进 Inspector），块内是最多 4 列的小网格，链只在块内走。
- **块横向排成一行**（块间 60px，块行整体按旧扁平网格同款公式居中，行视觉中心仍在 centerX + 140 附近）。纵向堆块曾测算过：4 块纵向堆会把图总高推回约 2950px，fitView 反而比改前更小；横排只比扁平网格多 40px 标签位（标签 28 + 12 间距）。代价：图变宽（实测夹具 x −470 → 2040），但 1366/1920 下 fitView 仍是高度主导，无 penalty。
- 组标签渲染只加在 `DebuggerNode` 顶部 early-return（`agent-run-debug-board.tsx`），不动 P0 的任何间距 class。

## 复测（最终树状态，Playwright 路由拦截伪造 API，同一 16 节点规模，BUILD_ID `-6UcmBUP_Tk0Blx-fj2WT`）

| 视口 | fitView | 图总高（flow） | 节点 / 边 | 逐像素穿卡 | 工具链跨行跳跃 | 节点重叠 | 横向溢出 |
|---|---|---|---|---|---|---|---|
| 1366×768 | **0.195**（P0 0.142，目标约 0.19 ✅） | 2075.5（旧 2840） | 19 / 17（16 + 3 组标签；边 21 → 17） | **0** | **0** | 0 对 | 0 |
| 1920×1080 | **0.325**（P0 0.237） | 2075.5 | 19 / 17 | **0** | **0** | 0 对 | 0 |
| 390×844 | 0.1（minZoom 下限，未变） | 2075.5 | 19 / 17 | **0** | **0** | 0 对 | 阶段条仍溢出 **107px**（D8，未恶化）；工具栏 0 |

补充：汇总入边 3；1366 下会话图行布局（flow 单位）：msg2 y 0、run2 y 260、msg1 y 635、run1 y 895、Orchestrator y 1065、worker y 1315、组标签 y 1635、工具 y 1675、汇总 y 1945、底边 2075.5。实测折叠高与新估计一致：agent 185.7 / tool 138 / message 160.2–181.5 / run 130.5 / summary 130.5 / group 27.5。

### 关于两处数字的说明（已核实，非猜测）

1. **图总高 2075.5，未到约 1900 的目标**：会话图第二行固定成本 635px（rowGap 240 + runRowOffsetY 260 + run 135）不在 P1 范围内；展开 Run 子图自身已压到 1180.5px。fitView 仍达 0.195，是因为 P0 的画布已加高到 467.8px。若以后要再压总高，动会话图行距（rowGap / runRowOffsetY）是下一刀。
2. **包围盒穿卡计数仍报 3 处，逐像素报 0**：3 处全是同行工具链边的包围盒角与组标签矩形的重叠（1366 下 30.3×2.3px）。已按 `@xyflow/system` 的 `getPoints`/`getDirection` 重新推导：上下 Handle 的步进方向只看 y，同行链边实际是「下沉 20px → 横走 → 从目标中心升上去」，水平段走在工具卡底边之下（flow y 1833，卡底 1813），没有采样点落进任何标签矩形。包围盒计数是上界假阳性，逐像素 0 是真值。

## 已知取舍与残留（本轮不修）

- **D4（P2）**：收紧后展开态 Agent 卡（4 步约 340px）超出 200 的估计高，更容易压住下一行。测试注释已写明「互不压盖」断言只对折叠态成立；修法是展开步骤封顶（P2）。
- **无工具 worker→汇总边仍可能穿工具卡**：按 D2 规定保留的边，smoothstep 水平段走中点 y，若该 worker 的卡中心与汇总中轴之间有工具卡即会穿过。只在「存在无工具 worker」的图里出现；P1 实测夹具的 3 个 worker 都有工具，实测为 0。单元夹具（designer 无工具）即属此类，几何上存在，复测夹具未覆盖。
- **组内工具超过 4 个时块内换行**，链仍在块内走，但会出现块内跨行跳跃。实测夹具每 agent 最多 3 个工具，均为单行，跳跃 0。
- **图变宽**：块横排使实测夹具 x 范围 −470 → 2040；1366/1920 下 fitView 仍高度主导，无影响；agent 很多时宽度继续长，无封顶。

## 检查

- `npx tsc --noEmit`：0 错误
- `npx eslint`（3 个改动文件）：0 错误
- 全量 vitest：**896 passed / 4 skipped**（104 文件；基线 894/4，+2 是新增的有意测试：D2 汇总入边集合、D3 分块/标签/同行断言）
- 干净生产构建：exit 0（`node node_modules/next/dist/bin/next build`；`pnpm build` 不可用仍是既有环境问题，与 P0 同）
- 隔离验证：`AGENTHUB_DATA_DIR=/tmp/p1-isolated-data`（空库新建），`/api/conversations` 在复测脚本里全量伪造；真实 `.agenthub-data/agenthub.db` mtime 前后不变（2026-11-19 03:51:04 UTC）；服务已停（端口 3167 关闭），隔离目录与 /tmp 探针已删

## 证据

`~/workspace/frontend-polish-evidence/debug-board-spacing-graph/`（文件名前缀 `p1-`）：

- `p1-debug-graph-measure.mjs`（P0 脚本改编：逐像素路径求交、工具链跨行跳跃、图总高 flow 值、EST 更新为 P1 折叠高）
- `p1-debug-graph-measurements.json`（三视口全量测量）
- `p1-debug-graph-1366x768-board.png` / `p1-debug-graph-1920x1080-board.png` / `p1-debug-graph-390x844-board.png`
- `p1-build.log`（BUILD EXIT: 0，BUILD_ID `-6UcmBUP_Tk0Blx-fj2WT`）、`p1-server.log`、`p1-measure.log`、`p1-checks.log`

---

# 最终统一验证（2026-11-19，P0+P1 合并后最终树状态）

## 状态：P0 + P1 全部达标 ✅

终验在最终树状态上把全部验证独立重跑一遍（不沿用工人数字）：HEAD `89a0ee7`，工作树未提交（预期）。只做验证与记录：**未改任何产品代码**，未 commit / push / 部署，未加新依赖。

## 改动范围核对

`git status` / `git diff --stat` 核对：本轮产品文件只改了 4 个——`src/components/agent-run-debug-board.tsx`、`src/components/workbench-primitives.tsx`、`src/lib/agent-run-debug-board.ts`、`src/lib/agent-run-debug-board.test.ts`（共 +205/−87 行），与任务规定的 P0+P1 范围一致，无超出范围的产品改动。另有此前未提交的无关改动（README 两份、team-detail-dialog.tsx、app-workbench.tsx 标题），确认存在，未碰。

## 静态检查与构建

| 检查 | 终验结果 | 工人数字 | 对照 |
|---|---|---|---|
| `npx tsc --noEmit` | **0 错误**（exit 0） | P0 0 / P1 0 | 一致 |
| `npx eslint`（4 个产品文件） | **0 错误**（exit 0） | P0 0 / P1 0 | 一致 |
| 全量 vitest | **896 通过 / 4 跳过**（104 文件，exit 0） | P1 896/4 | 一致（基线 894/4，+2 为 P1 新增有意测试） |
| 干净生产构建 | **exit 0**，BUILD_ID **`o7rnKpf0x2SAkUgMS1NNh`** | P1 `-6UcmBUP_Tk0Blx-fj2WT` | 通过；BUILD_ID 不同是因为终验重新构建 |

构建注：首轮构建 exit 1，是已知的偶发 flake——Turbopack 拉取 Noto Serif SC 字体失败（`noto_serif_sc_*.module.css` module-not-found）；**重试一次即成功**，与任务提示及 P1 轮（readme-demo-link 轮亦有同款抖动）一致，非回归。

## Playwright 实测（同一 16 节点 21 边造数，路由拦截伪造 API，零 DB 写）

验证服务 `next start -p 3180`（BUILD_ID `o7rnKpf0x2SAkUgMS1NNh`），隔离库 `AGENTHUB_DATA_DIR=/tmp/final-isolated-data`；测完服务已停、隔离目录已删。实测脚本为 P1 脚本的改编版（`final-debug-graph-measure.mjs`，注明来源）。

| 视口 | 画布高（终验 / P0） | GAP1/GAP2 | 标题卡 | 阶段条 | 工具栏 | fitView（终验 / P1） | 图总高 | 汇总入边 | 逐像素穿卡 | 工具链跨行跳跃 | 节点重叠 | 横向溢出 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1366×768 | **467.8** / 467.8 | 21.2 / 21.3 | 104 | 44.5 | 43.5 | **0.1947** / 0.195 | 2075.5 | 3 | **0** | **0** | 0 | 0 |
| 1920×1080 | **779.8** / 779.8 | 21.3 / 21.2 | 104 | 44.5 | 43.5 | **0.3248** / 0.325 | 2075.5 | 3 | **0** | **0** | 0 | 0 |
| 390×844 | **229.5**（y 700.8）/ 229.5 | 17 / 17 | 333.4 | 42.5 | 115.75 | 0.1（minZoom 下限） | 2075.5 | 3 | **0** | **0** | 0 | 阶段条仍溢出 **107px**（D8，未恶化）；工具栏 0 |

逐项对照：

- **P0**：画布高 1366 467.8px（P0 前 411.3，+56.5，目标约 +59）、1920 779.8px（+35.3，目标约 +38），与 P0 数字**逐项完全一致**（GAP1/GAP2、标题卡、阶段条 44.5、工具栏 43.5 均与 P0 相同，无恶化；阶段条/工具栏比 42.5 目标多出的 2px/1px 仍是 P0 已解释的原因，未变）。
- **P1-D1**：fitView @1366 0.1947（P1 0.195，目标约 0.19 ✅）、@1920 0.3248（P1 0.325）；图总高 2075.5px（P1 同数，未到约 1900 的目标）。P1 关于「差 9% 是因为会话图第二行固定成本 635px 不在本轮范围」的解释**核实成立**：实测节点布局 msg2 y0、run2 y260、msg1 y635、run1 y895——第二行起点 y=635 = rowGap 240 + runRowOffsetY 260 + run 135，且会话图两常量终验未动；Run 子图自身已压到 1180.5px（run1 y895 → 底边 2075.5）。
- **P1-D2**：汇总入边 7→**3**；逐像素穿卡 **0**。包围盒计数仍报 3 处，与 P1 相同；终验用**独立脚本**（`final-verify-pixel.mjs`，0.5px 步进采样，比 P1 的 2px 细 4 倍 + 最近距离诊断）重测：逐像素仍为 0，且 3 条被包围盒标记的边到组标签矩形的最近距离为 **3.8 / 3.8 / 3.9 屏幕像素**——边根本没碰到标签，包围盒重叠只是边包围盒的角落假阳性。**P1「包围盒 3 处是假阳性」的结论独立验证成立。**
- **P1-D3**：工具链跨行跳跃 **0**；节点重叠 0 对；0 横向溢出（390 阶段条除外，见下）。
- **390**：fitView 0.1（minZoom 下限）、阶段条仍溢出 107px、画布位置 y 700.8 与 P0 相同、工具栏 115.75 不变——**不比 P0 更差**（D8 不在本轮）。

补充观察（非失败）：独立像素验证中，全图所有边到非端点节点矩形的全局最近距离为 0.9 屏幕像素（agent→group 标签边掠过一个工具卡角，@1366），未触及（0 才算碰到），不计入穿卡；但余量很小，若后续改布局值得留意。

## 隔离验证

- 真实 `.agenthub-data/agenthub.db` mtime 在 Playwright 测量前后**不变**：`2026-11-19 04:18:44.709762610 +0000`（测前 = 测后）。
- 如实说明：该 mtime 与 P0/P1 工人记录的 `03:51:04 UTC` 不同——它是在本终验会话的 vitest 全量运行期间（04:18:07–04:19）移动的，发生在 Playwright 测量开始之前；Playwright 测量阶段本身（隔离库 + 全量伪造 API）未碰真实库。
- 验证服务已停（端口 3180 关闭，curl 连接被拒），隔离目录 `/tmp/final-isolated-data` 已删。

## 结论

**P0 间距收紧与 P1-D1/D2/D3 在最终树上合并后全部达标**：静态检查（tsc/eslint/vitest/构建）全过，Playwright 三视口实测数字与 P0、P1 工人数字一致（fitView 0.1947 vs 0.195、0.3248 vs 0.325 为四舍五入内的同一值；其余逐项相等），D2 包围盒假阳性结论经独立细采样验证成立。无回归。残留问题沿用 P1 记录（D4 展开态超高、無工具 worker→汇总边的特定几何风险、组内超 4 工具块内换行、图变宽），本轮不修。

## 证据

`~/workspace/frontend-polish-evidence/debug-board-spacing-graph/`（文件名前缀 `final-`）：

- `final-debug-graph-measure.mjs`（P1 脚本改编：前缀/端口/BUILD_ID 更新，测量逻辑未变）
- `final-debug-graph-measurements.json`（三视口全量测量，failures: []）
- `final-debug-graph-1366x768-board.png` / `final-debug-graph-1920x1080-board.png` / `final-debug-graph-390x844-board.png`
- `final-build.log`（重试成功的构建；首轮字体拉取 flake 见 `final-checks.log`）、`final-server.log`、`final-measure.log`、`final-checks.log`
- `final-verify-pixel.mjs` / `final-verify-pixel.log` / `final-verify-pixel-measurements.json` / `final-verify-pixel-1366x768-board.png`（D2 假阳性独立验证：0.5px 步进 + 最近距离诊断）
