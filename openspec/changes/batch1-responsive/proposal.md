# 第一批：响应式与可达性收尾（batch1-responsive）

> 注（2026-11-19，batch5-cleanup W2）：本文提及的 `sidebar.tsx`、`agent-library.tsx`、`team-library.tsx`、`new-conversation-dialog.tsx`、`global-search-trigger.tsx`、`dir-picker-dialog.tsx` 已于 2026-11-18 batch4 §2 删除；现入口：侧栏→`app-workbench.tsx` 内联 `wb-sidebar`、Agent 库→`agent-workspace.tsx`、会话创建→新建任务视图。历史叙述保留原样。

## 背景

- 来源：`~/workspace/frontend-polish-evidence/module-audit-2026-11-18.md`（2026-11-18 下午只读审计，A–J 共 10 组问题）。
- Top 5（D1、H1、A1+A2+A3、F1+F2+F3、E1+E2）已在 `openspec/changes/module-audit-top5/` 做完并通过验证（vitest 882/4，构建 BUILD `3zEsCSB4UDSgVxrlXxaBG`）。
- 其后第三批（batch3-leftovers，13 项）与白色主题（white-themes，6 套主题、默认白·石墨）已做完；当前基线：**vitest 886 通过 / 4 跳过**，干净构建 BUILD_ID `Xv8o20dAi30A-1zazzXhp`，HEAD `c383a4a`，白色主题改动未提交。
- 用户 2026-11-18 ~20:22 拍板「三批按顺序都做」：第一批 → 第二批 → 第三组。本 change 只做第一批（D2、D3、D4、D5、H2、C4），不碰第二批（G/B/C1–C3/E3/E4/I/J/F4/D6/D7）与第三组（经验资产吸顶、F1 死代码、ArtifactWorkspace hover-only、390 Tab 折行、「0 次」换行、调试板空态边界）。
- 审计结论均为源码静态核对（审计时本地服务未跑）；本轮每项都要**实测复现后再修**，修完截图/数值复核。

## 目标

六项全部落地并通过集中验证；只改工作树，不 commit、不 push、不部署。

## 改动

### D2 — 经验库右侧栏小屏改抽屉（M）

- 现状（审计 D2，已复核行号）：`src/components/experience/experience-sidebar.tsx:58` 的 `<aside>` 是 `w-64 shrink-0`、无任何响应式隐藏类；`src/components/experience-library.tsx:401` 无条件渲染；390px 下主列表只剩约 134px，搜索框 `min-w-[220px]`（`:221`）本身已溢出。
- 改法：`<lg` 时右侧栏不占位，收进可开合的抽屉（复用 Top 5 D1 的 Dialog 模式 + `src/lib/use-media-query.ts` 的 `useIsBelowXl` 思路，断点取 `lg`；或 shadcn Sheet/Drawer——**不引入新依赖**，用已有 Dialog）。入口放在标题栏/筛选栏附近，文案与图标与现有语言一致。`≥lg` 行为不变。
- 验收：390/768 下列表可用宽度实测（截图量主列表宽度与搜索框是否溢出）；抽屉打开/关闭可用；1366/1920 对照无变化。

### D3 — 调试板头部按钮组换行/收进更多（S）

- 现状（审计 D3，Top 5 W5 遗留已复核）：`src/components/agent-run-debug-board.tsx` 头部操作区（`PageHeader` 的 `actions`，约 `:864-945`）共 7–8 个按钮（沉淀经验 / 回到会话 / 重新运行 / 暂停（条件）/ 刷新 / 复制 Run ID / 分享 / 全屏）排在一行不换行；1024 下重叠，390 下被根容器 `overflow-hidden` 裁掉。
- 改法：二选一并写进记录——① 操作区加 `flex-wrap`（先看 `PageHeader` 的 actions 容器是否允许换行）；② `<lg` 时把次要按钮（复制 Run ID、分享、全屏）收进「更多」菜单。主操作（重新运行 / 沉淀经验 / 回到会话）任何宽度下保持可见可点。
- 验收：1024/1280/1366 下逐一量按钮组有无重叠与裁切；390 下全部操作可达（直接可见或在更多菜单里）。

### D4 — 调试板「分享」死按钮（S）

- 现状（审计 D4，已复核行号）：`src/components/agent-run-debug-board.tsx:937` 的分享按钮**没有 `onClick`**，同排刷新/复制/全屏都有处理函数；点它什么都不发生。
- 改法：先核实它确实无任何处理（包括全局委托）。补实现：复制当前调试板链接（`navigator.clipboard.writeText`，同文件 `:934` 复制 Run ID 的写法、`:2268` 终端复制的写法）+ 复制成功反馈（与站内已有的复制反馈一致；若站内无统一 toast 反馈，用按钮态/临时文案，不要新造一套）。如确认「分享」无合理链接可复制（例如该页无稳定可分享 URL），则删掉按钮并在记录里写明理由。
- 验收：点分享后剪贴板内容为当前页 URL（或按钮已删除）；反馈可见。

### D5 — 调试板 "Cost -" 占位（S）

- 现状（审计 D5，已复核行号）：`src/components/agent-run-debug-board.tsx:856` 元信息行里 `<span>Cost -</span>`，成本从未计算，永远显示横杠；并列的时长、Tokens、模型、Agents 都是真实值。
- 改法：先查有无成本数据源（按模型计价/用量表）。**预期是删掉 Cost 一项**（无数据源，不为它新建计价体系——那是另一个功能）；如真有现成数据源可接通，写明来源再接。本轮不做 I2（面包屑与元信息行 Run label 重复，属第二批）。
- 验收：元信息行无 "Cost -"（或显示真实成本值并注明来源）。

### H2 — 自动化激活态计数徽章疑似笔误（S）

- 现状（审计 H2，已复核行号）：`src/components/automation-workspace.tsx:2315`，激活态计数徽章 `active ? 'bg-white/20 text-white/20 dark:text-slate-900' : …`。浅色下激活 pill 是 `bg-slate-900 text-white`，徽章白字 20% 透明度印在白底 20% 上，数字基本看不见；信息中心同类徽章只写底色不写文字色（继承 pill 白字，正确），故极可能是把 `text-white` 误写成 `text-white/20`。
- 改法：核实后 `text-white/20` 改为 `text-white`（或按徽章规范改，以实测可读为准）。
- 验收：浅/深两种模式下激活态计数数字实测可读（截图 + 对比度估算）。

### C4 — 三处原生 `window.confirm` 换 Dialog 确认（S）

- 现状（审计 C4，行号已复核，均仍为原生 confirm）：
  1. `src/components/automation-workspace.tsx:2114` — `window.confirm('确认删除自动化任务「${task.title}」？')`
  2. `src/components/experience-library.tsx:161` — `window.confirm('确定要删除这条经验吗？删除后无法恢复。')`
  3. `src/components/file-tab.tsx:142` — `window.confirm('放弃未保存的修改？')`（在 Tab 关闭处理里）
- 改法：三处都换成 shadcn Dialog + `DIALOG_SIZE_CLASS.sm`（`src/components/dialog-sizes.ts`），复用 Agent 库删除对话框的写法（`agent-library.tsx:172`）。确认/取消文案与原 confirm 语义一致；取消后状态不变（尤其 file-tab：取消关闭 Tab 后编辑态与内容原样保留）。
- 验收：三处触发后均出现统一样式的确认 Dialog；点确认执行原操作，点取消/关闭不执行；对话框 1366×768 与 390 下 0 溢出。

## 不做

- 第二批（G/B1/B2/B3/B4/C1/C2/C3/E3/E4/I1/I2/J1/F4/D6/D7）与第三组（经验资产页头吸顶、F1 死代码、ArtifactWorkspace hover-only、390 DetailsPanel Tab 折行、「0 次」换行、调试板空态边界）一律不动。
- 白色主题的未提交改动不动（`themes.ts` / `globals.css` / `layout.tsx` / `settings-dialog.tsx` / `themes.test.ts`），也不把它混进本轮的改动描述。
- 不引入新依赖；不改 spec 定义的接口/数据结构；不碰安全约束。

## 验证（集中验证 W5 统一重跑，不沿用 worker 旧数字）

- `npx tsc --noEmit` 0 错误；eslint（改动文件）0 错误。
- 全量 `npx vitest run`（基线 886 通过 / 4 跳过，0 失败）。
- 干净生产构建 exit 0（`rm -rf .next` 后构建；注意 `.next` 共用——构建串行，worker 各自构建时如遇并发冲突重试一次；验证服务用 `next start`，端口各 worker 错开 3141–3144，验证后停服）。
- Playwright 截图复核：390/768/1024/1280/1366/1920，重点 D2 抽屉、D3 按钮组、D4/D5/C4 行为；每项给实测数字（宽度/溢出/可达性），不只给「通过」。
- 验证种子（本地开发库）用完清理，计数归零；证据进 `~/workspace/frontend-polish-evidence/batch1-responsive/`。
- 记录：`openspec/changes/batch1-responsive/PROGRESS.md` + `openspec/changes/frontend-polish/PROGRESS.md` 末尾加指向一节。

## 遗留（已知，不属本轮）

- 调试板 390 下 DetailsPanel Tab 折行（Top 5 W6 复核，第三组）。
- 经验资产第 5 统计卡值「0 次」换行（第三组）。
- 调试板空 run / 无节点边界态（第三组）。
