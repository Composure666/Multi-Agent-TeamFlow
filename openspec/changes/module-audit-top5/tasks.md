## Implementation（分两波并行 + 集中验证）

文件归属（防冲突，各 worker 只动自己名下的文件）：
- W1（D1+H1）：`src/components/agent-workspace.tsx`、`src/components/agent-run-debug-board.tsx`；如需新建 `src/lib/use-media-query.ts`（+ 测试）归 W1。
- W2（A 规范 + 能力中心/自动化 A 迁移 + E1+E2）：`src/components/workbench-primitives.tsx`、`src/components/capability-center-workspace.tsx`、`src/components/automation-workspace.tsx`。
- W3（F1+F2+F3 + 信息中心 gutter）：`src/components/agent-library.tsx`、`src/components/artifact-library.tsx`、`src/components/information-center-workspace.tsx`。
- W4（第二波，W2 完成后）：`src/components/analytics-workspace.tsx`、`src/components/experience-library.tsx`（A 迁移，用 W2 落地的 PageHeader 变体）。
- W5（第二波，W1 完成后）：`agent-workspace.tsx`、`agent-run-debug-board.tsx` 的页头迁移（A1/A2/A3 剩余两页）。
- W6（验证员，全部完成后）：集中验证 + 截图 + 记录。

### Phase 1 — 第一波并行（W1 / W2 / W3）

#### W1：D1 详情抽屉 + H1 深色标题
- [ ] Agent 详情：两个详情组件（`agent-workspace.tsx:915/922/1165/1172`）根 `aside` 重构为接受 `className` 透传（默认保持 `hidden … xl:block`）；<xl 时选中的详情在 `Dialog`（`DIALOG_SIZE_CLASS.md`）中打开；≥xl 行为不变。
- [ ] 调试板检查器（`agent-run-debug-board.tsx:1111`）：<xl 时点节点打开 Dialog 呈现 `DetailsPanel`；≥xl 行为不变。
- [ ] 视口判断：复用站内已有的 media-query hook；如无，在 `src/lib/use-media-query.ts` 新加最小实现 + 单元测试。
- [ ] H1：`agent-workspace.tsx:931`、`:1181` 标题补 `dark:text-slate-50`，`:934`、`:1184` 描述补 `dark:text-slate-400`；全仓 grep `text-slate-950` / `text-slate-900`，同类漏网一并补。
- [ ] 验证：`npx tsc --noEmit`、eslint（本 worker 文件）；Playwright：1024/768/390 下点 Agent / 点节点能打开详情 Dialog；深色下详情标题可读；截图存证据目录。

#### W2：PageHeader/PageShell 规范 + 能力中心/自动化迁移 + 对话框三档
- [ ] `workbench-primitives.tsx`：`PageHeader` 扩展——`icon` 可选；新增可选 `breadcrumb?` / `meta?`；标题改为 `font-heading text-2xl font-semibold tracking-tight`；`PageShell` 注释写明 gutter 规则（`p-4 lg:p-6`，`max-w-5xl` 默认，数据型页面显式 `max-w-none`）。
- [ ] 能力中心：页头迁新 `PageHeader`（保留图标块）；外壳迁 `PageShell`（去掉 `p-3 lg:p-4` 改写，`max-w-none`）；E1：4 个对话框改走 `DIALOG_SIZE_CLASS`（新增/编辑→md，删除确认/连接测试→sm，通用详情→md）。
- [ ] 自动化：页头迁新 `PageHeader`；外壳迁 `PageShell`（`max-w-none`）；E2：两个大弹窗改走 lg 档，去掉详情弹窗的 2px accent 边框；其余尺寸/高度保持。
- [ ] 验证：`npx tsc --noEmit`、eslint（本 worker 文件）；Playwright：迁移后页头截图（浅/深各一）、两个自动化弹窗尺寸截图。

#### W3：悬停行操作 + 信息中心 gutter
- [ ] F1 `agent-library.tsx:150`、F2 `artifact-library.tsx:260-264`：补 `group-focus-within:opacity-100` + `[@media(hover:none)]:opacity-100`。
- [ ] F3 `information-center-workspace.tsx:567-577`、`:587-596`：补 `group-focus-within/row:inline` / `group-focus-within/row:opacity-100` + `[@media(hover:none)]:inline` / `[@media(hover:none)]:opacity-100`。
- [ ] 信息中心外壳：去掉 `PageShell` 的 `p-2 lg:p-2.5` 改写（回到默认 gutter），`max-w-none` 保留。
- [ ] 验证：`npx tsc --noEmit`、eslint（本 worker 文件）；Playwright（hover:none 模拟）：三处行操作触屏下常显；键盘 Tab 聚焦时可见。

### Phase 2 — 第二波并行（W4 / W5，前置 worker 完成后）

#### W4：数据概览 + 经验资产 A 迁移（W2 完成后）
- [ ] 数据概览：页头迁新 `PageHeader`（无图标）；外壳迁 `PageShell`（`max-w-none`）。
- [ ] 经验资产：页头迁新 `PageHeader`（保留图标块，右侧 slogan 保留现状）；外壳迁 `PageShell`（默认 `max-w-5xl`，内层横栏 `px-6` 收敛到 `px-4 lg:px-6`）。
- [ ] 验证：`npx tsc --noEmit`、eslint（本 worker 文件）；Playwright：两页页头截图（浅/深各一）。

#### W5：Agent 库 + 调试板页头迁移（W1 完成后）
- [ ] Agent 库：h1 `text-[22px]` → `PageHeader`（图标可选，缺省不用），描述补 `dark:text-slate-400`；外壳迁 `PageShell`。
- [ ] 调试板：页头 → `PageHeader` 的 breadcrumb + meta 变体（面包屑与元信息行保留）；外壳迁 `PageShell`（`max-w-none`）。
- [ ] 验证：`npx tsc --noEmit`、eslint（本 worker 文件）；Playwright：两页页头截图（浅/深各一）。

### Phase 3 — 集中验证（W6，全部完成后）

- [ ] 全量 `npx tsc --noEmit` ✅；eslint（全部改动文件）0 错误；全量 `npx vitest run`（基线 876 通过 / 4 跳过，含新增测试）。
- [ ] 干净生产构建 `rm -rf .next && node node_modules/next/dist/bin/next build` ✅ exit 0。
- [ ] `next start` + Playwright 截图：D1（1024/768/390 详情可打开）、H1（深色标题可读）、A1（迁移后的各页页头）、F1–F3（触屏常显）、E1–E2（对话框尺寸）；证据 `~/workspace/frontend-polish-evidence/module-audit-top5/`。
- [ ] 对话框抽查：1366×768 与 1920×1080 下改动过的对话框 0 溢出（第三轮成果不回归）。
- [ ] 记录：`openspec/changes/module-audit-top5/PROGRESS.md` 完整记录；`openspec/changes/frontend-polish/PROGRESS.md` 末尾加指向小节。

## Out of scope（另开 change）

- Top 5 之外的审计发现（B/C/D2–D7/E3–E4/F4/G/H2/I/J）。
- 页面内容、功能逻辑、API、数据流、主题 token。
