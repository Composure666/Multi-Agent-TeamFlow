# 第五批：零散遗留清理（batch5-cleanup）— OpenSpec 提案

- 日期：2026-11-19
- 背景：白色主题 + 第一批 + 第二批 + 第四组四轮改动均已做完并验证通过、未提交（HEAD `c383a4a`），用户问“还有未完成的优化任务吗”后批准顺手修掉剩下的小项、再各方面测试一下。这是清理批，不是新一轮大改。
- 前置状态：工作树 45 行（41 个已跟踪改动文件 + 4 个未追踪 openspec 目录）；本轮只动本轮范围内的文件，不动前四轮已落地的改动，不 commit、不 push、不部署。
- 证据源：`openspec/changes/batch4-leftovers/PROGRESS.md`（遗留 1、2、7）；`openspec/changes/batch2-consistency/PROGRESS.md`（遗留 3、6）；`openspec/changes/batch1-responsive/PROGRESS.md`（遗留 6）；`openspec/changes/white-themes/PROGRESS.md`（遗留 1）；`openspec/changes/frontend-polish/PROGRESS.md`。

## 1. 调试板工具条内部滚动

- 现状：batch4 §7h 只收了 2~4px 内边距，inspector 终端 Tab + 侧栏收起时 1366 下仍有 431px 内部滚动（工具条内部可滚动、卡内不溢出、页面级无溢出）。
- 任务：重排工具条分组或收按钮尺寸，目标 scrollX 归零或接近零；实测 1366 与 390 下工具条表现，页面级无溢出。
- 验收：1366 下 scrollX 实测值写进记录；若彻底消除需大改，就做到合理程度并如实报告剩余值与原因。

## 2. 历史文档与 skill 里的已删文件引用 + 孤儿 helper + 斜杠命令 no-op

- 现状（batch4 遗留 2）：openspec 历史记录、`specs/04-artifacts.md:309`、`specs/11-platform.md:238`、`specs/16-message-search.md:364` 仍提及已删的 6 个文件（`sidebar.tsx`、`agent-library.tsx`、`team-library.tsx`、`new-conversation-dialog.tsx`、`global-search-trigger.tsx`、`dir-picker-dialog.tsx`）；`skills/add-experience.md:25,162` 的“加经验”步骤仍 instruct 后人改 `sidebar.tsx`，现已失效；`src/lib/api.ts` 两个孤儿 helper（`listDirectory`、`getServerPlatform`）现无调用方；`/agents` 与 `/settings` 斜杠命令仍 `emitUiCommand('open-settings' / 'open-agents')`，其唯一订阅方随删除已不存在（删除前就已是 no-op）；`UiCommand` 的 `'open-agents'` 变体随之残留。
- 任务：
  - 历史记录与 spec 文本：按事实改写——历史记录注明文件已删（不要伪造历史，把过去写成现在没发生过）；spec 里的引用改指当前真实入口（Agent 库 → `agent-workspace.tsx` 自写列表，见 batch4 的 OVERVIEW.md 地图更新）。
  - `skills/add-experience.md`：把改 `sidebar.tsx` 的步骤改成正确路径（按当前代码实测核对）。
  - 两个孤儿 helper：全仓 grep（含测试文件、动态引用）确认无人调用就删；有任何调用方就只报告不删。
  - 斜杠命令：二选一并给出理由——① 改走 store 驱动打开（与设置弹窗同款 `settingsOpen` 驱动方式，Agent 库入口同理找当前真实视图切换方式）；② 删掉命令 + `UiCommand` 的 `'open-agents'` 变体。选 ① 须实测命令可用；选 ② 须说明为何不恢复（例如入口已有别处）。
- 验收：全仓 grep 已删文件标识符在 `src` 内仍为 0 处；skill 步骤按当前代码可走通；孤儿 helper 删除与否有 grep 依据；斜杠命令二选一有实测或理由；tsc + eslint + 全量测试通过。

## 3. G 范围外深色 accent 上的白字

- 现状（batch2 遗留 3，W1 已列清单，非切换控件）：`agent-config-form.tsx:895`、`agent-create-wizard.tsx:206`、`agent-workspace.tsx:1128,1193`、`capability-center-workspace.tsx:1345`、`analytics-workspace.tsx:896`、`agent-run-debug-board.tsx:882`、`ask-user-question-dialog.tsx:298` 等深色 `text-white` on accent。
- 任务：全仓扫一遍深色 `text-white` on accent（不只清单上的行号，行号可能已漂移），逐处修对比度到 4.5:1 以上（参照 batch1 H2 与 batch2 G 的修法：`text-[var(--primary-foreground)]` 或同类 token）。
- 验收：清单逐处复测 ≥ 4.5:1；全仓扫后无新增遗漏（有就列入遗留）；深色截图复核。

## 4. 搜索结果行 JSON 原文渲染

- 现状（batch2 遗留 6，既有问题）：全局搜索结果里消息 `parts` 以 JSON 原文显示。
- 任务：定位渲染处（`global-search.tsx` 及消息渲染链），按 CLAUDE.md §3.4（Message = parts 数组）把 parts 渲染成正常文本/结构化内容，不新造样式，复用现有消息渲染写法。
- 验收：搜索出含 parts 的消息时行内显示正常文本、无 JSON 原文；1366/390 截图复核；回归：普通搜索仍可用。

## 5. POST /api/automations 建任务顺带建同名会话

- 现状（batch1 遗留 6）：验证种子清理时发现建自动化会连带建一个同名会话，是否合乎预期待确认。
- 任务：读 `src/app/api/automations` 相关路由与 service 代码、读 spec（自动化相关章节）与调用方，核实同名会话的创建是不是预期行为（例如自动化依赖会话作为执行载体）。
- 验收：是预期 → 只写进 PROGRESS.md（说明依据：代码位置 + spec 章节），不要改代码；是 bug → 修掉并实测建任务后不再多建会话、原有自动化功能回归通过。无论哪种结论，依据都要写清。

## 6. 白·工程蓝浅 accentInk 4.55:1 裕量 0.05

- 现状（white-themes 遗留 1）：`#241b04` 已是同系最深暖棕，再想加余量只能动 accent `#a37f22` 本身（W1 未动；W3 复测确认 4.55 不变）。
- 任务：在不改 accent 主色本身的前提下想办法提裕量（例如 accentInk 再深一档但仍属同系、或调整浅色档 accent 底色的明度）；WCAG 公式重算。
- 验收：对比度提升且 accent 主色未动，24 组全量重算仍 ≥ 4.5:1；若必须动 accent 主色才能提，就不要动，留待用户定夺并写进遗留（写明已试过的方案与算出的数值）。

## 7. /home 预览图重拍

- 现状：`public/images/app-screenshot.png` 与 `docs/images/teamflow-preview.png` 仍是 batch3 在 graphite 主题下重拍的旧图（md5 均为 `2a4828f0…`），当前默认主题已是白·石墨。
- 任务：用新默认白·石墨重拍 3200×1600（batch3 同款尺寸与流程），两处都要换，核对 md5 变化；只换图，不动引用它的文案（README alt 已在 batch4 按实拍图改准）。
- 验收：两处 md5 均与旧值不同且彼此一致；/home 截图复核新图在位。

## 不在范围

- 白色主题 / 第一批 / 第二批 / 第四组已落地的改动（只读不碰）。
- 团队详情对话框溢出风险（用户未定夺）。
- GitHub 的 3 张 PNG 与 2 处删除补推（用户定夺，方法未定；本轮只换本地图文件，不推）。
- 提交、推送、部署（用户看完再定）。

## 验证计划

- 每项 worker 自验：`npx tsc --noEmit`、eslint（改动文件）、相关 vitest、Playwright 实测截图。
- W7 集中验证：最终树状态下重跑 tsc / eslint（改动文件）/ 全量 `npx vitest run` / 干净生产构建（`rm -rf .next` 后串行构建，单次，新 BUILD_ID 记下来）/ Playwright 回归（调试板工具条 1366/390、设置与斜杠命令、全局搜索、自动化创建、主题切换白·工程蓝对比度重测、/home 新预览图、390/1366/1920 三档；隔离库验证，真实 `.agenthub-data` 不碰，验证后停服清库）。
- 证据：`~/workspace/frontend-polish-evidence/batch5-cleanup/`（`w1-*`～`w7-*`）。
- 记录：`openspec/changes/batch5-cleanup/PROGRESS.md` + `openspec/changes/frontend-polish/PROGRESS.md` 末尾加指向。
