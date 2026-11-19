# 第一批：响应式与可达性收尾 — 任务清单

- OpenSpec：`openspec/changes/batch1-responsive/proposal.md`
- 基线：HEAD `c383a4a`；vitest 886 通过 / 4 跳过；构建 BUILD_ID `Xv8o20dAi30A-1zazzXhp`；白色主题改动未提交（不动）。
- 铁律：不 commit、不 push、不部署；不引入新依赖；不碰第二批/第三组。
> 注（2026-11-19，batch5-cleanup W2）：本文提及的 `sidebar.tsx`、`agent-library.tsx`、`team-library.tsx`、`new-conversation-dialog.tsx`、`global-search-trigger.tsx`、`dir-picker-dialog.tsx` 已于 2026-11-18 batch4 §2 删除；现入口：侧栏→`app-workbench.tsx` 内联 `wb-sidebar`、Agent 库→`agent-workspace.tsx`、会话创建→新建任务视图。历史叙述保留原样。

## W1 — D2 经验库右侧栏小屏改抽屉（M）

- [ ] 读 `src/components/experience-library.tsx`（:221 搜索框、:401 侧栏渲染、页头/筛选栏结构）与 `src/components/experience/experience-sidebar.tsx:58`
- [ ] 复现：390/768 下量主列表可用宽度与搜索框溢出（截图 + 数值）
- [ ] `<lg` 时侧栏收进可开合抽屉（复用 Dialog 模式 + `use-media-query.ts` 思路，断点 `lg`；不引入新依赖）；`≥lg` 行为不变
- [ ] 自验：tsc + eslint（改动文件）+ 相关 vitest；`next build` + `next start -p 3141` 截图复核（390/768 抽屉开合、列表宽度；1366/1920 对照），服务用后停掉
- [ ] 证据进 `~/workspace/frontend-polish-evidence/batch1-responsive/w1-*`；汇报：改法、实测宽度数字、遗留

## W2 — D3 + D4 + D5 调试板头部三项（S×3，同文件）

- [ ] 读 `src/components/agent-run-debug-board.tsx`（:820-945 页头区）与 `src/components/workbench-primitives.tsx` 的 `PageHeader` actions 容器
- [ ] D3：复现 1024 重叠与 390 裁切（截图 + 数值）；按钮组换行或 `<lg` 收进更多菜单，主操作任何宽度可见可点
- [ ] D4：核实分享按钮（:937）确实无 onClick；补复制当前页链接 + 成功反馈（沿用站内已有复制反馈写法），或无合理链接可复制则删除并写明理由
- [ ] D5：查成本数据源；预期删掉 `Cost -`（:856），如真有现成数据源可接通须写明来源；不做 I2（Run label 重复属第二批）
- [ ] 自验：tsc + eslint（改动文件）+ 相关 vitest；`next build` + `next start -p 3142` 截图复核（1024/1280/1366 按钮组、390 可达性、分享复制、元信息行），服务用后停掉
- [ ] 证据进 `~/workspace/frontend-polish-evidence/batch1-responsive/w2-*`；汇报：三项各自的改法与实测数字、遗留

## W3 — H2 + C4-自动化（同文件 automation-workspace.tsx）

- [ ] H2：核实 `automation-workspace.tsx:2315` 的 `text-white/20`；改为 `text-white`（或按徽章规范，以实测可读为准）；浅/深截图复核计数可读
- [ ] C4-自动化：`automation-workspace.tsx:2114` 的删除 confirm 换 shadcn Dialog + `DIALOG_SIZE_CLASS.sm`，复用 Agent 库删除对话框写法（`agent-library.tsx:172`）；确认/取消语义与原 confirm 一致
- [ ] 自验：tsc + eslint（改动文件）+ 相关 vitest；`next build` + `next start -p 3143` 截图复核（徽章浅/深、删除确认 Dialog 1366×768 与 390 下 0 溢出、确认/取消行为），服务用后停掉
- [ ] 证据进 `~/workspace/frontend-polish-evidence/batch1-responsive/w3-*`；汇报：改法、实测数字、遗留

## W4 — C4-经验库 + C4-file-tab

- [ ] C4-经验库：`experience-library.tsx:161` 删除 confirm 换 Dialog + `DIALOG_SIZE_CLASS.sm`；确认/取消语义一致
- [ ] C4-file-tab：`file-tab.tsx:142` 放弃修改 confirm 换 Dialog + `DIALOG_SIZE_CLASS.sm`；取消关闭后编辑态与内容原样保留（重点测）
- [ ] 自验：tsc + eslint（改动文件）+ 相关 vitest；`next build` + `next start -p 3144` 截图复核（两处 Dialog 1366×768 与 390 下 0 溢出、确认/取消行为），服务用后停掉
- [ ] 证据进 `~/workspace/frontend-polish-evidence/batch1-responsive/w4-*`；汇报：改法、实测数字、遗留

## W5 — 集中验证 + 记录（W1–W4 全部收齐后）

- [ ] 树完整性：`git status --short`（只应有本轮改动 + 白色主题的 5 个未提交文件 + `openspec/changes/batch1-responsive/`）；HEAD 仍为 `c383a4a`
- [ ] 最终树状态下重跑：`npx tsc --noEmit`、`npx eslint`（全部改动文件）、全量 `npx vitest run`、干净生产构建（`rm -rf .next` 后构建，串行，记录新 BUILD_ID）
- [ ] Playwright 截图复核六项（390/768/1024/1280/1366/1920）：D2 抽屉与列表宽度、D3 按钮组、D4 分享、D5 元信息行、H2 徽章、C4 三处 Dialog；每项给实测数字
- [ ] 验证种子清理干净；证据汇总进 `~/workspace/frontend-polish-evidence/batch1-responsive/`（w5-* + 测量 json）
- [ ] 写 `openspec/changes/batch1-responsive/PROGRESS.md`（分工、每项改法、验证数字、遗留）；`openspec/changes/frontend-polish/PROGRESS.md` 末尾加指向一节
- [ ] 汇总汇报：六项逐项状态 + 验证数字 + 遗留
