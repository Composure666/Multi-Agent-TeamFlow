# Tasks — 运行展板间距收紧 + 任务图 P1 修复

- [x] P0-1 标题卡 padding 收紧（PageHeader 新增 className/compact 透传到 PageCard；只本页）
- [x] P0-2 阶段条卡 h-12 → h-10，删死 class `py-0`
- [x] P0-3 画布 wrapper p-2 → p-1.5
- [x] P0-4 工具栏 min-h-11 → min-h-10
- [x] P0-5 面包屑/meta 间距 mb-1/mt-1 → mb-0.5/mt-0.5（仅本页，走 PageHeader 新增 prop）
- [x] P0-6 标题 meta model id 截断 max-w-[220px] truncate（或 compactModelName）
- [x] P0 验证：tsc 0、eslint 0、vitest 894/4、干净构建、Playwright 复测画布高度（1366 目标 +59px，1920 目标 +38px）与 0 横向溢出
- [x] P1-D1 行高与间隙收紧（worker 380→250、tool 260→190、toolGridTopGap 200→120、summaryGap 220→120、Run→Orchestrator 210→170、workerGridTopY 600→420；estimateNodeHeight 改贴近实高；测试数值同步更新）
- [x] P1-D2 删 Orchestrator→汇总直连；worker→汇总只连无工具者；尾工具→汇总保留（汇总入边 7→3）
- [x] P1-D3/D5 工具按 agent 分块排布 + 组标签，链只在块内走（跨行跳跃 0）
- [x] P1 验证：tsc 0、eslint 0、vitest 896/4（+2 为新增有意测试）、干净构建、Playwright 复测 fitView（@1366 0.195，目标 ~0.19）、边穿卡数（逐像素 0）、工具链跨行跳跃（0）、390 位置记录不恶化
- [x] 记录：openspec/changes/debug-board-spacing-graph/PROGRESS.md + frontend-polish PROGRESS.md 指向；证据进 ~/workspace/frontend-polish-evidence/debug-board-spacing-graph/
