# 进展 — 大检查后续两项（R1 + R2）

- 日期：2026-11-20（用户 23:19 批准“按你说的全修”后实施）
- 实施方式：主代理直接实施（改动小：2 个源文件 + 2 个测试文件 + 首页数字同步）
- 状态：**2 项全部已修**。未 commit、未 push、未部署。
- 最终门禁：`tsc --noEmit` **0 错误**；`eslint`（改动文件）**0 错误**（仅 1 处 pre-existing warning：`app-workbench.tsx` 的 `<img>`，HEAD 已有）；全量 vitest **978 通过 / 4 跳过**（基线 975/4，新增 3，0 回归）；生产构建 BUILD_ID `cGD3oaOcYE0TOwsGU0tB9`；验证服务器已停，better-sqlite3 已切回 node ABI。
- 证据目录：`~/workspace/frontend-polish-evidence/audit-followup-fixes/`（种子 `seed.mjs`、探针 `verify.mjs`、结果 `verify-results.json`、截图 `after-info-center-1366.png` / `after-new-task-1366.png`）

## R1 信息中心未知 source 单行降级

- 改法：`information-center-workspace.tsx` 抽出 `resolveNotificationSourceIcon` / `resolveNotificationSourceLabel` / `resolveNotificationSourceIconLabel` / `resolveNotificationCategoryLabel`——未知值兜底为 `Bell` / 「其他」；`resolveLevel` 未知分类兜底 `"info"`；`CategoryTag` 未知分类显示「其他」；`NotificationRow` 的图标与来源文案改用 helper。
- 出入（与提案不同）：`getSearchText` 未改——该处 `undefined` 已被 `.filter(Boolean)` 滤掉，且原始 source 字符串已在搜索文本中，未知 source 仍可按原值搜到。
- lint 插曲：第一版把 `const SourceIcon = resolveNotificationSourceIcon(...)` 写在 `NotificationRow` 内，`react-hooks/static-components` 报错（函数调用返回值不能当 JSX 组件用）。改为模块级包装组件 `NotificationSourceIcon`（把解析出的图标当 prop 传进去），eslint 0 错误。
- 回归测试：`information-center-workspace.test.ts` 新增 3 个（未知 source → 与 system 相同图标 + 「其他」；已知映射不动；未知分类 → `info` / 「其他」）。
- 生产验证（种子含 `source='verify'` 与 `category='mystery'` 各一条 + 对照行）：探针 4/4 通过；截图确认——未知来源行正常渲染，铃铛图标 + 分类「系统」+ 元信息「其他 · 6 分钟前」；未知分类行标签「其他」；对照行正常。

## R2 「新建团队」按钮补 aria-label

- 改法：`app-workbench.tsx:1707` 补 `aria-label="新建团队"`，`title="去 Agent 库新建团队"` 保留。
- 回归测试：`workbench-failure-feedback.test.ts` 的 F14 用例加源码锁。
- 生产验证：探针确认 `button[aria-label="新建团队"]` 唯一且可见，`title` 保留（5/5 通过）。

## 首页数字同步（C7 漂移）

- 本轮新增 3 个测试，全量由 975 → **978**。按 C7 规则同步：`home-data.ts:221` 的 `975` → **`978`**，随后全量复跑确认 978 通过 / 4 跳过（数字与实测一致）。
- 漂移风险仍在：下次增删测试时需再同步；未做构建时自动生成。

## 验证总账

- **tsc**：`./node_modules/.bin/tsc --noEmit` 0 错误（最终全量前最后一次：2026-11-20 23:31）。
- **eslint**：改动文件 0 错误；唯一 warning 为 pre-existing（`app-workbench.tsx` 的 `<img>`）。
- **vitest 全量**：**978 通过 / 4 跳过**（113 个文件，基线 975/4 → 新增 3，0 回归）。
- **生产验证**：构建 BUILD_ID `cGD3oaOcYE0TOwsGU0tB9`；`next start -p 3101`，`AGENTHUB_DATA_DIR=/tmp/r1-followup-data`（`~/workspace/ab-verify-data` 的副本 + R1 种子 3 条；本地库未动）。Playwright 探针（localhost，`timezoneId: 'Asia/Shanghai'`）5/5 通过。探针事故 1 起：首版探针从 `/home` 直接找工作台侧栏超时（侧栏只在 `/` 出现），按 C–F 探针的进入流程（先 `/` 再导航）修正；新建任务按钮不在 `nav` 内（侧栏 ② 区独立按钮），探针改单独定位。
