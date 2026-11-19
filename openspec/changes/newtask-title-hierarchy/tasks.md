# 新建任务页标题层级（tasks）

- [x] 写 OpenSpec proposal（本文件同目录）
- [x] H1：`text-[27px] md:text-[34px]` → `text-[32px] md:text-[44px]`（`app-workbench.tsx` 约 1359 行）
- [x] “不知道怎么开头？试试这些”：`<p className="mt-7 text-xs …">` → `<h2 className="mt-9 text-[17px] font-bold …">`，文案不变（约 1665 行）
- [x] 最近团队行上方加 `<h2>最近的团队</h2>`（`text-[17px] font-bold`）；团队行 `mt-[26px]` → `mt-3`（约 1687 行）
- [x] `npx tsc --noEmit` 0 错误；eslint（改动文件）0 错误
- [x] 等 `openspec/changes/debug-board-task-graph-analysis/analysis.md` 出现后做 `next build` + Playwright 验证（1366×768 / 1920×1080 / 390，空输入与有内容两种状态，白·石墨 + 深色模式）——该文件出现后才构建验证
- [x] 若 1366×768 溢出：压容器 `pt-10` 或 textarea `min-h-[150px]`，不缩小新标题，重新验证——极限态初测溢出 35.8px，已压 `pt-10`→`pt-6` + textarea 上限 `32vh`→`28vh`（min-h 不影响极限态故未动），重验证通过
- [x] 全量 vitest 保持 894/4
- [x] 写 `PROGRESS.md` + frontend-polish PROGRESS.md 指向；证据进 `~/workspace/frontend-polish-evidence/newtask-title-hierarchy/`
