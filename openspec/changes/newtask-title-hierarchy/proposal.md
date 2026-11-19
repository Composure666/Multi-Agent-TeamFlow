# 新建任务页标题层级（proposal）

## 背景

用户 2026-11-19 11:27 改了主意：不要之前三个方案的重设计（效果图 `xin-jian-ren-wu-ye-chong-she-ji-fang-an` 作废），只要把新建任务页的标题调大、弄多级标题。当前页（设计 A 落地态）只有一个 H1，两个次级区块（示例 pills、最近团队）都没有标题，层级是扁的。

## 改动（只改 `src/components/app-workbench.tsx` 新建任务视图）

1. H1“一句话，组一支队开工”：`text-[27px] md:text-[34px]` → `text-[32px] md:text-[44px]`；字体（font-heading）、字重（font-black）、蓝色点缀、行高比例（leading-[1.15]）都不变。
2. “不知道怎么开头？试试这些”：`mt-7 text-xs` 的 `<p>` 升级为真正的 `<h2>`，`text-[17px] font-bold`，文案不变，间距改为 `mt-9`。
3. 最近团队行上方加一个二级标题“最近的团队”，同样 `text-[17px] font-bold`；团队行间距由 `mt-[26px]` 改为 `mt-3`。
4. 不动：眉标 `WORKBENCH — NEW TASK`、副文案、输入框、工具栏、pills、团队行、侧栏。

## 约束

- 1366×768 下页面仍须完整放下。batch 4 量过最近团队行底 724.8px、余量 43.2px；标题长高约 80px（H1 +11.5、示例标题 +17、新 H2 净 +50.5），预计会溢出约 35px。
- 若实测溢出，优先压容器上边距（`pt-10`）或输入框最小高度（textarea `min-h-[150px]`），绝不反过来缩小新标题。
- 另一轮（运行展板分析）正在占用生产构建做实测：先做改动 + tsc/eslint + OpenSpec；`next build` 与 Playwright 验证等 `openspec/changes/debug-board-task-graph-analysis/analysis.md` 出现后再做。

## 验证

- `npx tsc --noEmit` 0 错误；eslint（改动文件）0 错误；全量 vitest 保持 894/4。
- Playwright 实测 1366×768 / 1920×1080 / 390：H1 与两个 H2 的渲染字号、最近团队行底边 vs 视口高度、0 横向溢出；白·石墨默认主题 + 深色模式都看一眼。
- 验证用隔离库，真实 `.agenthub-data` 不碰，用完清理。
