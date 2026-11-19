# 第四组：零散遗留收尾（batch4-leftovers）— 任务清单

- 提案：`openspec/changes/batch4-leftovers/proposal.md`
- 基线：HEAD `c383a4a`；全量 vitest 888 通过 / 4 跳过（第二批 W6 终态）；干净生产构建 BUILD_ID `sMLLe9kUw_UhD_zUpsRUF`。
- 铁律：不 commit、不 push、不部署；不动白色主题 / 第一批 / 第二批已落地的改动；验证种子只种隔离库，验证后清理归零。
> 注（2026-11-19，batch5-cleanup W2）：本文提及的 6 个已删文件（`sidebar.tsx`、`agent-library.tsx`、`team-library.tsx`、`new-conversation-dialog.tsx`、`global-search-trigger.tsx`、`dir-picker-dialog.tsx`）即本批 §2 删除的文件；现入口见 `OVERVIEW.md`。历史叙述保留原样。

## W1 — 经验资产页头与统计卡（proposal §1、§5）

- [ ] §1 页头吸顶：核实现状（页头/统计摘要行/搜索栏/Scope Tab 各自吸顶与否、滚动表现），决定恢复还是保持，写清理由；若恢复，只吸顶页头一行（或页头+搜索栏，取其一说明），复核 390/1366。
- [ ] §5 「0 次」换行 + B3 展开态标签换行：5 张卡的值与标签在 1366/390 下均单行；1366 主列 5px svg 溢出一并看（同根因一起修，无关则单独说明）。
- [ ] 只动 `src/components/experience-library.tsx`（及必需的共享样式）；**不改 `src/components/workbench-primitives.tsx`**（PageShell 注释归 W5，避免同文件撞车）。
- [ ] 自验：tsc、eslint（改动文件）、相关 vitest、Playwright 截图（390/1366，吸顶滚动 + 统计卡展开/收起）。

## W2 — F1 死代码清理（proposal §2）

- [ ] 全仓核实死代码链引用：`sidebar.tsx`、`agent-library.tsx`、`team-library.tsx`、`NewConversationDialog` 及其它链上文件——`import`、动态 `import()`、字符串引用、测试、re-export。
- [ ] 若确认无引用且删除安全：删掉链上文件，修掉随之失效的 import/导出/测试；若有风险：只报告不删，判断依据逐条写清。
- [ ] 自验：tsc、eslint、全量相关测试、Playwright 回归截图（Agent 库主区、团队相关入口、设置等删除前后无变化）。

## W3 — ArtifactWorkspace hover-only 按钮（proposal §3）

- [ ] 逐处核实 `src/components/artifact-workspace.tsx` 内的 hover-only 操作按钮，按 Top 5 同款修法（`focus-within` + 粗指针常显，或收进“···”菜单，取其一说明）。
- [ ] 自验：tsc、eslint（改动文件）、相关 vitest、Playwright（键盘 Tab 聚焦可见、触屏常显、1366/390 截图）。

## W4 — 调试板：Tab 折行 + 空态 + 图内间距（proposal §4、§6、§7c、§7h）

- [ ] §4：390 下 DetailsPanel Tab 改单行（可横滑或收紧），390 全部可点、文档无横向溢出；1366 回归。
- [ ] §6：空运行 / 无节点边界态补齐（复用 `EmptyState` 或现有空画板写法），两种边界实测（无白屏、无报错、无横向溢出）；有 run + 有节点回归。
- [ ] §7c：评估 `src/lib/agent-run-debug-board.ts` 的 `rowGap 340` / `runRowOffsetY 260` 调整，实测节点间距与 fitView；`fitView` minZoom 0.1 不动。
- [ ] §7h：inspector 工具条 1366 下内部滚动核实（能收紧则收紧，既有行为则留遗留说明）。
- [ ] 自验：tsc、eslint（改动文件）、`agent-run-debug-board.test.ts` 相关测试、Playwright 截图。

## W5 — 零散小项 + 第二批探针发现（proposal §7a、§7b、§7d、§7e、§7f、§7g、§8）

- [ ] §7a：1200 字顶格团队行余量 12.4px——评估再压间距/降上限，修或留遗留并说明。
- [ ] §7b：团队 chip「需求到原型团队」折行——收紧或接受现状并说明。
- [ ] §7d：PageShell 注释补 Agent-library 一行（`workbench-primitives.tsx` 注释）。
- [ ] §7e：README.md / README.zh-CN.md:64 的 alt 文案改准（只改文案）。
- [ ] §7f：无 JS 时 `:root` 兜底评估（换成白·石墨浅色 token 或不换，说明理由；若换，核实有 JS 首屏与无 JS 首屏）。
- [ ] §7g：500 字态 +10px 基线溢出核实（既有基线/回归判断，能顺手修则修）。
- [ ] §8a：390 抽屉菜单导航后遮罩不自动关闭——核实、定范围，能修则修，不能修写遗留并说明。
- [ ] §8b：390 会话列表无入口——核实、定范围，能修则修，不能修写遗留并说明。
- [ ] 自验：tsc、eslint（改动文件）、相关 vitest、Playwright 截图（1366/390）。

## W6 — 集中验证 + 记录（全部 worker 收齐后）

- [x] 不沿用各 worker 旧数字，全部在最终树状态下重跑：`npx tsc --noEmit`、eslint（改动文件）、全量 `npx vitest run`、干净生产构建（`rm -rf .next` 后串行构建一次）、Playwright 截图复核（重点：390 折行/换行、空态、死代码删除后的回归）。—— W6 已完成：tsc 0、eslint 0 错误、vitest 890/4/0、构建 BUILD_ID `BiE4hqen5Xo1ZhAQoluQ7`、Playwright 47 组全过（见 PROGRESS.md「W6 集中验证结果」）。
- [x] 写 `openspec/changes/batch4-leftovers/PROGRESS.md`（分工、每项改法与决策理由、验证数字、遗留）+ `openspec/changes/frontend-polish/PROGRESS.md` 末尾加指向一节。
- [x] 证据进 `~/workspace/frontend-polish-evidence/batch4-leftovers/`（`w6-*`）；验证后停服、释放端口、删除隔离库与种子数据。—— 服务已按 PID 停、3166/3167 已释放、`/tmp/batch4-w6-data` 与 `/tmp/batch4-w6-empty-data` 已删、真实 `.agenthub-data` 未碰。
- [x] 汇总汇报：按八项逐项给状态，凡是“决定不做”的项必须写清理由。—— 见 PROGRESS.md「逐项状态（汇报用）」一节；§1 不恢复吸顶、§7d 与 §8a 的 0 改动均已写清理由。
