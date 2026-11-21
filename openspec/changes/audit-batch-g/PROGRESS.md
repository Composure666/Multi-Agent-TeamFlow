# 进度记录 — 大检查 G 批（剩余可修项）

- 批准：2026-11-20 23:35，用户“能修的都修了”
- 实施：协调员 + 4 名子代理（W1 G2+G5、W2 G4+G3、W3 G6 U-P2-3+D-P2-3、W4 G1+L-P2-2+L-P2-3），终验由协调员独立执行
- 基线：HEAD 5fb2598，工作树含 B1+K1-K4、A+B、B10、A8、C–F、R1+R2 未提交改动；本批不 commit、不 push、不部署
- 最终状态：**全量 vitest 987 通过 / 4 跳过（基线 978 + 9 新增），tsc 0 错误，eslint 改动文件 0 错误，生产构建 BUILD_ID `8shurloC_VVt6EdJKQWE3`，生产探针 1366 + 390 双视口全部通过（F8 见下述前提偏差）**

## G1 — 调试板 4 项遗留（W4 实施，协调员 390 复核）

探针先复核现状，再修。结论：1 项已不存在，1 项修好，2 项按红线未修。

| # | 审计项 | 结论 |
|---|---|---|
| 1 | 队名标签在 390 首屏外 | **复核已无此问题**：新建任务页「最近的团队」标签底部 766.9px @390（W4 截图 `g1-debug-graph-390x844-newtask.png`）；协调员终验重测 702px @390（`after-newtask-390x844.png`），未改代码 |
| 2 | D4 展开的 Agent 步骤/工具与节点重叠 | **已修**：展开内容收进 `max-h-[92px] overflow-y-auto` 滚动区，内容保留。展开的 Orchestrator 461.2 → 221.5 flow px，展开的 worker 287.4 → 221.5，重叠 0，pixelCross 0。第一次用 108px 上限时出现 3 处像素交叉（@xyflow smoothstep 偏移 20px、间隙仅 12.5px），92px 留出 28.5px 间隙后消除。截图 `g1-debug-graph-*-board-expanded-*.png` |
| 3 | 图太宽（flow x −470 → 2039.9） | **未修——待用户拍板**：修法就是改调试板默认视图（缩放/布局），用户 2026-11-19 已决定不改默认视图，红线不碰 |
| 4 | 边擦过工具卡（最近 0.8px @1366、0.4px @390，pixelCross 0） | **未修——待用户拍板**：同上，唯一修法是改默认视图/改边路由；pixelCross 为 0 说明只是视觉擦边、无真实交叉 |
| — | 390 舞台条溢出 107px | 属 D8，不在本批范围，仅记录 |

## G2 — 通知 cursor 改 `createdAt:id` 复合形式（W1）

- 改法：`notification-service.ts` cursor 改为 `createdAt:id` 字符串，排序 `(createdAt DESC, id DESC)` + id tiebreak；路由 zod 加 regex `/^\d+(:[0-9A-Za-z_-]+)?$/`，非法 cursor → 400；旧数字 cursor 仍接受（按 `createdAt < 数字` 语义翻页）。`fetchNotifications` / `nextCursor` 类型改为 string。
- 回归测试（`src/server/notification-service.test.ts`）：:128 同毫秒跨页不丢不重；:152 旧数字 cursor 仍能翻页。
- 生产验证（API 全走，limit=2）：45 页、共 90 条、无重复，3 条同毫秒通知全在；首⻚ nextCursor 为复合串；旧数字 cursor 翻页 2 条。见 `verify-results.json`。

## G3 — 首页测试数同步脚本（W2）

- 新增 `scripts/sync-home-test-count.mjs`：跑 `vitest run --reporter=json`，取 `numPassedTests` 写回 `home-data.ts:221`；只以 `numFailedTests` 为守卫，文件级失败仍写数并告警；**不**挂进 `next build`（提案红线）。
- 试跑发现并修了一个真 bug：`execFileSync` 在 vitest 非零退出时先抛错、守卫跑不到，改为 `spawnSync`。
- 本批结束最后一次运行：“首页测试数已是最新：987，无需改动”；`home-data.ts:221` = `987`。

## G4 — 成功率分母与 avg 同口径（W2）

- 改法：`src/server/analytics-service.ts` 成功率分子/分母改用带过滤的状态分组（`finishedAt IS NOT NULL` + 已结束状态），与 avg 耗时同一人口；KPI 的成功/失败/中止计数口径不动。
- 回归测试（新增 `src/server/analytics-service-success-rate.test.ts`）：一条已结束但 `finishedAt` 为 null 的脏行不进成功率分子/分母，但仍计入 KPI。

## G5 — 全部已读标全部未读（W1）

- 改法：服务端 `markNotificationsRead({ all: true })`（空 ids 语义，接口语义写进注释），不传 ids 即标全部未读；前端 `markAllRead` 改调它；早期退出改用 store 的 `unreadCount`，成功后全局未读置 0；按钮 disabled/title 语义不动。
- 回归测试（`src/server/notification-service.test.ts:171`）：未加载页的未读也被标已读。
- 生产验证：种子 90 条未读（2 条原有 + 85 条 + 3 条同毫秒），点「全部已读」后 `/api/notifications/unread-count` 返回 0，按钮 disabled 且 title 为“暂无未读通知”。截图 `after-info-center-1366.png`；390 下按钮可见（`after-info-center-390x844.png`）。

## G6 — §7 可修四项（W3：U-P2-3、D-P2-3；W4：L-P2-2、L-P2-3）

- **U-P2-3**：经验侧栏按钮「查看文档」→「经验使用说明」（`experience-sidebar.tsx:77`）。
- **D-P2-3**：环形图最大余数法，总和恒为 100%。新增导出纯函数 `largestRemainderShares`（`analytics-workspace.tsx`）：先按 0.1% 取整，余量按余数从大到小逐单位分配；余数量化到 1e-9 再比较，避开浮点陷阱（2/3 的余数算出来比 1/6 小）。弧形与图例共用一个 `distributionShares` memo；新增 5 个单测，该文件 16/16。注意：提案措辞（“四舍五入后把余量给最大块”）与标准最大余数法在余量 ≥0.2% 时结果不同，实施按任务书的标准方法。
- **L-P2-2**：工具名 `truncate` → `line-clamp-2 break-all`（`read_file_with_line_numbers` 无断点，必须 break-all）；日志行不动。
- **L-P2-3**：`NodeMetric` 增加可选 `className`；run/summary 网格模型格 `col-span-2`（模型格 186px run / 159px summary，18 字符值完整显示）。副作用：run/summary 卡片 130.5 → 175 flow px，`estimateNodeHeight('run'/'summary')` 135 → 180，Orchestrator y 170 → 215，`workerGridTopY` 420 → 465，4 处硬编码测试 Y 值 +45。390 终验：`deepseek-v4-flash`（19 字符）宽 108px、无截断（`verify-390-results.json`，截图 `after-runboard-390x844.png`；调试板默认选中的会话无 Run，需切到有 14 条 Run 的会话 `conv_EBWFkvX8yScz` 才能看到节点）。

## G7 — 浏览器验证（协调员，生产模式）

种子：`/tmp/g-final-data`（`~/workspace/ab-verify-data` 的副本 + `seed.mjs`：55 条 MCP、91 条通知、85 条未读 + 3 条同毫秒、1 个自定义供应商 `g-probe-custom` / 显示名「G探针供应商」、G8-MCP-01 `lastCheckedAt` = 30 小时前）；`/tmp/g-empty-data`（同上，产物清空为 0）。服务器 `next start` 3101 / 3102，`AGENTHUB_DATA_DIR` 指向副本，真实库未动。探针：`verify.mjs`、`verify-e2.mjs`、`verify-e4.mjs`、`verify-390.mjs`，浏览器时区 Asia/Shanghai。

| 项 | 结果 | 证据 |
|---|---|---|
| E2 团队删除失败 | **通过**：DELETE 拦截 500，详情弹窗不关，显示“删除失败（HTTP 500）” | `verify-e2-results.json`、`after-team-delete-fail-1366.png`。探针教训：团队卡片只有「详情」按钮接 onSelect，点卡片/队名打不开弹窗；团队在「我的 Agent」页签下，默认「精选 Agent」页签看不到 |
| E2 供应商删除失败 | **通过**：同上 | `verify-e2-results.json`、`after-provider-delete-fail-1366.png`。探针教训：供应商卡片要点「配置」按钮才开弹窗，点名称无反应；拦截体若含 `{"error": "…"}`，前端原样显示服务端文案、不会出现“删除失败”字样，拦截体须用 `{}` 才走 fallback 文案 |
| D8 最近更新截断 | **通过**：种子 55 条 MCP + 9 个技能 = 64 行，弹窗 50 行，显示“共 64 条” | `verify-results.json`、`after-capability-dialog-1366.png` |
| E4 空产物库空态 | **通过**：空态「新建任务」点后进入新建任务视图（“最近的团队”出现，“暂无产物”消失） | `verify-e4-results.json`、`after-artifact-empty-newtask-1366.png` |
| F8 MCP 同步 >24h | **修复已做，浏览器验收前提不成立**（见下） | 单元测试覆盖日期分支；自动化页顶渲染同步时间正常（`after-automation-1366.png`） |
| F15 设置对话框页脚 | **通过**：页脚按钮为「关闭」 | `verify-results.json`、`after-settings-1366.png` |

### F8 前提偏差（需知会提案方，非产品回归）

`formatSyncTime` 的日期分支修法本身正确，单元测试覆盖（≥24h → `MM-DD HH:mm 同步`）。但 G7 验收原文“种子 MCP 服务器同步时间 >24h，自动化页显示 MM-DD HH:mm 同步”在 live UI 无法执行：

1. `formatSyncTime` 全站唯一调用点是自动化页顶的 `lastUpdatedAt`（`automation-workspace.tsx:2109`），而 `loadDashboard` 里 `setLastUpdatedAt(Date.now())`（:1756）——页顶时间永远是“刚刚同步”起算；
2. MCP 的 `lastCheckedAt` 全站没有任何组件渲染（grep `lastCheckedAt` 仅出现在服务端/测试）。

也就是说，日期分支在 live UI 只有“页面打开超过 24 小时不刷新”才可能出现，种子 MCP 数据触达不到它。修法不动（它是正确的防御性修法），但 F8 的浏览器验收应改为单元测试覆盖 + 调用点渲染正常，或另议一个能触达该分支的 UI 入口。本批不擅自改自动化页的显示逻辑。

## 验证总账

- `tsc --noEmit`：0 错误。`eslint`（全部改动文件）：0 错误、2 条已存在警告（`app-workbench.tsx` 的 `<img>`、`provider-config-dialog.tsx` 未用的 `handleTest`，diff 中 0 处，均来自 HEAD）。
- 全量 vitest：**987 通过 / 4 跳过，114 个文件，0 失败**（2026-11-20 16:39 UTC 运行；基线 978 + 9 新增：G2×2、G4×1、G5×1、D-P2-3×5）。
- 协调员另修了 2 处 C–F 遗留的午夜窗口测试抖动（非回归）：`automation-service.test.ts` 种子取 `todayStartCst + Math.min(2h, elapsed/2)`（恒为过去、恒在当天 CST、恒在 08:00 CST 前）；`usage/summary/route.test.ts` 的 UTC 周期望改为 `cstHour >= 8 ? 3 : 4`（00:00–08:00 CST 时 UTC 自然周含 7 天前中午的 run）。两文件 00:38 CST 重跑 18/18 通过。
- 生产构建：`node scripts/run-electron-node.mjs ./node_modules/next/dist/bin/next build`，exit 0，**BUILD_ID `8shurloC_VVt6EdJKQWE3`**。
- 工作树：59 个改动条目，41 个文件，+2023/−957（vs HEAD 5fb2598）。
- 环境插曲：`ensure-node-sqlite.mjs` 在本机必以段错误退出（exit 139，发生在重建完成之后），但重建出的二进制可用；有一次管道写法下重建未留住、种子报 ABI 130，重跑一次即好。验证服务器用 `fuser -k 3101/tcp 3102/tcp` 停掉，ABI 已切回 node。

## 未解决 / 待用户拍板

1. **G1-3 图太宽、G1-4 边擦工具卡**：唯一修法是改调试板默认视图，用户 2026-11-19 已决定不改。等他拍板。
2. **F8 浏览器验收前提不成立**（见上）：日期分支正确但 live UI 触达不到，需另议验收方式或 UI 入口。
3. 本批代码仍未提交、未推送、未部署（按任务书）；另有 MEMORY 外部更新称用户 2026-11-21 00:13 已批准“按原样批量提交、推送、部署”，与本任务书的“不要 commit、push、部署”冲突，**由主代理与用户核对后执行**，本批不擅自行动。

## 证据目录

`~/workspace/frontend-polish-evidence/audit-batch-g/`：`seed.mjs`、`verify.mjs`、`verify-e2.mjs`、`verify-e4.mjs`、`verify-390.mjs`、`verify-results.json`、`verify-e2-results.json`、`verify-e4-results.json`、`verify-390-results.json`、截图 `after-*.png`（1366 与 390 双视口）、W4 的 `g1-debug-graph-*.png` / `g1-debug-graph-measurements.json` / `g1-debug-graph-measure.mjs`。

## 分批提交记录（2026-11-21，7 批原样拆分提交）

用户 2026-11-21 00:13 批准“修完之后，原样分批提交，推送，部署，还有安装包更新”（安装包等他睡醒后操控其电脑浏览器再做；提交信息用中文写清楚）。工作树（HEAD 5fb2598，41 个 tracked 文件 + 11 个新文件 + 7 个 openspec 目录，398 个 hunks）按 5 名 hunk 归属分析员的认定 + 协调员的 manual/whole-file/overrides 拆分，逐批提交，未 push、未部署。

| # | 短 SHA | 提交信息 | 文件数 |
|---|---|---|---|
| 1 | 6003499 | fix(侧栏品牌与能力中心): 统一侧栏宽度，技能时间戳与热门数据改用真实值 | 10 |
| 2 | 358b5ff | fix(前端大检查 A+B 批): 修复数据口径与移动端布局共 24 项 | 18 |
| 3 | 4c543d1 | fix(能力中心): 修复 390 下分页被裁出屏幕的问题 | 1 |
| 4 | c4ca4aa | fix(MCP 健康检查): 只写三列，不再写 lastCheckMessage | 3 |
| 5 | 018b409 | fix(前端大检查 C–F 批): 修复数据口径、一致性、失败反馈与 P2 扫尾共 37 项 | 39 |
| 6 | d5c0cf9 | fix(信息中心与新建团队): 未知来源通知单行降级，新建团队按钮补无障碍标签 | 9 |
| 7 | d865c4e | fix(前端大检查 G 批): 修复剩余可修项，补 5 处浏览器验证 | 20 |

- 一致性校验：`git diff 5fb2598..HEAD` 按 41 个 tracked 文件与拆分前 `git diff HEAD`（pre-split.diff）逐字节一致；11 个新文件与 5 个已提交 openspec 目录是 range diff 里新增的部分（拆分前为未追踪文件，故不在 pre-split.diff 内）；新文件最终版经抽查与拆分前一致。`git status` 只剩 `openspec/changes/installer-update/` 与 `openspec/changes/mobile-workbench-cleanup/` 未追踪（按要求不提交）。
- 最终 HEAD 验证（2026-11-21 17:33 UTC）：`tsc --noEmit` 0 错误；全量 vitest **987 通过 / 4 跳过，114 个文件，0 失败**。
- 拆分方法与记录：`~/workspace/frontend-polish-evidence/split-commits/`（`split-reconstruct.py`、`build_overrides.py`、`split-newfiles.py`、`assign/`、`stages/`、`messages/`、`pre-split.diff`、`pre-split-U0.diff`、`post-split.diff`、`post-split-tracked.diff`）。行级拆分的 hunk（`analytics-service.ts` 成功率/平均耗时、`notification-service.ts` cursor/接口/分页、`analytics-workspace.tsx` 的 formatTrendPercent/computeTokensTrend/largestRemainderShares 与 PanelEmpty/Sparkline 删除、`capability-center-workspace.tsx` 的 trendPercent/火花线、`automation-service.test.ts` 两处午夜抖动行）见 `assign/overrides.json`；已知偏差（A1 trend>100 分支删除、B3 KPI 迷你图 `hidden sm:block`、B9 能力中心 KPI 36px→28px）在净 diff 中无独立痕迹，中间提交里缺失、最终状态正确。
- 注意：本节是提交 7 完成后追加的，**未包含在上述 7 个提交内**（工作树里本文件为已修改未提交状态）；推送前由主代理决定是单独提交还是并入后续提交。
