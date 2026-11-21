# 侧栏品牌区拥挤 + 能力中心时间戳/假数字 — 提案

- 日期：2026-11-20
- 背景：用户 2026-11-20 20:21 截图反馈两处瑕疵——(1) 侧栏顶部品牌区拥挤、不美观；(2) 能力中心明明没改过能力，却全部显示“最近更新：刚刚”，问是不是死数字。20:22 用户确认“两处都按上面方案修”。20:23 用户又要求给前端页面做一次大检查；大检查报告（`~/workspace/frontend-polish-evidence/big-frontend-audit-2026-11-20/REPORT.md`，新发现 67 条）把本轮两处记为在途 B1 + K1–K4，不重复立项，修补批次 A–F 等用户另定。
- 范围：只修 B1 + K1–K4。审计报告的批次 A–F（D-P0-1 趋势算式、D-P0-2 调用量卡、D-P0-3/D-P0-4 趋势徽章、D-P1-5 时区 bug 等）**不在本轮**，等用户定批次后再立项。

## 根因（已查实）

### B1 品牌区拥挤

`src/components/app-workbench.tsx:862-887`。宽度账（根字号 17px，`text-sm≈14.9px`）：非对话视图侧栏宽 260px，减两侧 `px-3`（24px）与品牌区 `px-2`（16px）、32px logo、`gap-2`（8px）、右侧 3 个 32px 图标 + 间隙（约 104px），品牌文字只剩约 **76px**。14.9px 的 `Multi-Agent` 约需 90px，于是在连字符处断成 `Multi- / Agent / TeamFlow` 三行；英文副标题 `Multi-Agent Collaboration & Workflow` 在同样宽度下又断成 5 行，8 行字堆在一起。代码内 Q15 注释称“可用宽约 104px”是算错了（104px 是右侧图标组本身的宽度，不是文字可用宽）。

### K1 全部显示“刚刚”——不是死数字，是每次读取都重写时间戳

`formatRelative()`（`capability-center-workspace.tsx:1611`）本身是真算式（`Date.now() - updatedAt < 1 分钟` → “刚刚”）。根因在服务端：`listSkills()` 每次都先调 `refreshSkillsFromDisk()`（`skill-service.ts:41`），而后者对已存在的 skill 无条件 `.set({ ..., updatedAt: now })`（`:191`），不比对内容、hash、mtime。能力中心每次打开 → `fetchSkills()` → `GET /api/skills` → `listSkills()` → 9 个 skill 的 `updatedAt` 全被改成此刻。磁盘文件其实很老：8 个为 2026-11-06，`add-experience.md` 为 2026-11-19 01:08，正确显示应为“14 天前 / 1 天前”左右。MCP Server 不走这条路，不受影响。

### K2 “最近更新”未排序，动作是现编的

`recentUpdates`（`capability-center-workspace.tsx:353-361`）取 `rows.slice(0, 5)`，而 `rows` 是 name 升序（`listSkills` 按 name 排序），根本没按 `updatedAt` 排；动作 `row.enabled ? '启用了能力' : '停用了能力'` 是按当前状态现编的，仓库里没有任何变更记录。“查看全部”弹窗（`:908-937`）`rows.slice(0, 50)` 却自称“按更新时间倒序”，同样是错的。

### K3 热门能力“x.xk 引用”是包装出来的

`hotCapabilities`（`:335-345`）：`calls = bindingCount + (5 - idx) * 0.1`，再渲染为 `${calls.toFixed(1)}k 引用`（`:1574`）。1 次绑定排第 1 就显示“1.5k 引用”。仓库内无调用次数数据源，只有绑定 Agent 数。

### K4 KPI 火花线是 sin() 合成的

`buildUsageSparkline()`（`:1656-1680`）按累计值 + `Math.sin()` 生成 7 个点。能力中心没有按天/按周的真实序列数据（usage 只有 today/week/allTime 三个总量），画不出真线。

## 变更

### 1. Skill 时间戳语义改为“文件内容最后修改时间”（`src/server/skill-service.ts`）

- `refreshSkillsFromDisk()`：对每个磁盘文件取 `stat.mtimeMs`。新文件：`createdAt = updatedAt = mtimeMs`；已存在且解析后字段（name、description、content、sourcePath、tags）与库里一致：不再无条件写库，只在 `updatedAt !== mtimeMs` 时把 `updatedAt` 回填为 `mtimeMs`（一次性修复此前被 bug 写坏的值，此后幂等）；内容变了：更新字段并 `updatedAt = mtimeMs`。不再用 `Date.now()` 写 `updatedAt`。
- `updateSkill()`：只改 `enabled`，不再碰 `updatedAt`（启用/停用是状态变化，不是内容更新；否则下一次 refresh 又会把它覆写回 mtime，语义来回打架）。`SkillPatch` 只有 `enabled` 一个字段，此改动无其他调用方受影响。
- `discoverWorkspaceSkills()` 返回的临时条目不动（不落库、不在能力中心展示时间戳，查过调用方才动——若核查发现它参与展示则同规则处理）。
- 不加 DB 列、不做 migration；`createdAt` 同样取 mtime（顺带修审计 D-P2-11“本周新增按入库时间算”的同源问题）。

### 2. 能力中心最近更新按时间倒序、动作改状态（`src/components/capability-center-workspace.tsx`）

- `recentUpdates` 改为 `sortRows(rows, 'updated').slice(0, 5)`（复用已有 `sortRows`，不另写排序）；动作改为状态词“已启用 / 已停用”，不再冒充一次变更事件。
- “查看全部”弹窗同样先 `sortRows(rows, 'updated')` 再 `slice(0, 50)`，文案“按更新时间倒序”才成立。

### 3. 热门能力去掉“k 引用”（同文件）

- `hotCapabilities` 的 `calls` 改为真实 `bindings = row.bindingCount`；卡片渲染为“`N` 个 Agent 绑定”（与“查看全部”弹窗里已有的 `{row.bindingCount} 个 Agent 绑定` 同口径）；条形图宽度按 `bindings / maxBindings` 算。删掉 `+ (5 - idx) * 0.1` 的排名加成。

### 4. 能力中心 KPI 去掉合成火花线（同文件）

- `KpiCard` 不再渲染 `Sparkline`（无按天真实序列，画什么都是编的）；卡片改为纯文本布局，数值加 `truncate` 防溢出。`buildUsageSparkline` 随之删除（确认无其他调用方才删）。
- 注意：D-P0-2（调用量卡 Token÷100）、D-P0-3/D-P0-4（趋势徽章）、D-P1-1（Skills 启用率徽章）是批次 A 的内容，**本轮不动**，只删火花线。

### 5. 侧栏品牌区（`src/components/app-workbench.tsx`）

- 删掉桌面侧栏品牌区的英文副标题行（`:887` 的 `BRAND_TAGLINE_EN` div）及 Q15 注释中已过时的宽度说法；英文副标题保留在 /home（`home-header.tsx`、`home-sections.tsx`、`app/home/page.tsx` 的用法不动）。
- 侧栏非 compact 宽度统一为 288px（原来对话/新任务视图已是 288px，其他视图 260px）：文字可用宽变为约 104px，`Multi-Agent` 一行放得下，名字保持两行（`Multi-Agent` / `TeamFlow`）不断词。compact 72px 窄轨不动。`BRAND_TAGLINE_EN` 在本文件若因此无引用则同步从 import 里去掉（以 lint 为准）。
- 移动抽屉品牌区（中文副标题 + `truncate`，320px 宽）与移动顶栏（单行 `truncate`）经核算无截断，不动。

## 验证

- `pnpm typecheck` 0 错误；`pnpm lint`（改动文件）0 错误。
- 新增/扩展回归测试：`skill-service.test.ts`——refresh 两次 `updatedAt` 不变（幂等）；改文件内容后 refresh，`updatedAt` 跟到新 mtime；`updateSkill` 切换 enabled 不动 `updatedAt`。`capability-center-workspace.test.ts`——`sortRows(rows, 'updated')` 按 `updatedAt` 倒序。相关测试 + 全量 vitest。
- 本地验证：生产模式起服务（不走 `pnpm dev`），打开能力中心两次，9 个 skill 的“最近更新”不再回“刚刚”，且与文件 mtime 一致（应为 14 天前 / 1 天前左右）；侧栏 1366 下品牌名两行不断词、无副标题；390 下复核侧栏/抽屉无新增截断。

## 不做

- 不 commit、不 push、不部署；批次 A–F 不在本轮。
- 不改 MCP 的 `recordMcpServerHealth` 写 `updatedAt`（审计 D-P2-12，批次 A 顺带项，等批次定夺）。
- 不改 `formatRelative()` 本身（算式是对的）与信息中心的相对时间函数（D-P0-5 是批次 A 的内容）。
