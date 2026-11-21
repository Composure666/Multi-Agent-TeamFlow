# 大检查后续两项 — 提案

- 日期：2026-11-20
- 背景：C–F 验收后用户 2026-11-20 23:19 说“按你说的全修”。本次修 C–F 报告末节留下的两项：信息中心未知 `source` 整页崩溃的健壮性缺口（单独立项），与 F14 漏掉的「新建团队」圆形加号按钮 aria-label。C1 的 `week` 口径变化（滚动 7×24h → 今天 + 前 6 个日历日）用户此次一并确认，维持现状，不另改。

## R1 信息中心：未知通知 `source` 让整页崩溃，改为单行降级

`src/components/information-center-workspace.tsx:525, 554`：`SOURCE_ICON[notification.source]` 在未知 source（如种子误写的 `'verify'`，或未来服务端新增的 source 值）时为 `undefined`，`<SourceIcon />` 抛 React #130，整页白屏。终验时由非法种子触发并复现，改为合法值后恢复。

修法：图标与文案查表全部加兜底，行级降级、页级不崩——
- 抽 `resolveSourceIcon(source)`：未知时返回 `Bell`（`system` 的通用图标）；
- 抽 `resolveSourceLabel(source)` / `resolveSourceIconLabel(source)`：未知时返回「其他」；
- 三处查表点改用这三个 helper：`NotificationRow` 的图标（:525）与元信息行来源文案（:587）、`getSearchText`（:758-759，搜索仍能按原始 source 字符串命中）；
- 同类隐患顺手兜底（同一文件、同一类“库里没登记的值从 DB 过来”）：`resolveLevel` 未知分类时返回 `"info"`（否则整行丢颜色条）；`CategoryTag` 未知分类时文案显示「其他」。
- 不改服务端写入校验、不改 `AppNotificationSource` 类型（运行时仍可能收到类型外的值，兜底就是为它准备的）。

验证：导出 helper 做单元锁（未知 source → `Bell` / 「其他」）；生产模式探针：种子里放一条 `source='verify'` 的通知，信息中心整页正常渲染，该行显示「其他」图标与文案，其余行不受影响。

## R2 「新建团队」圆形加号按钮补 aria-label

`src/components/app-workbench.tsx:1707`（新建任务页“最近团队”区最后一个格子）：按钮只有 `title="去 Agent 库新建团队"`，无 `aria-label`；可见文案「新建团队」在按钮外的 span 里，读屏器读不到按钮用途。

修法：按钮补 `aria-label="新建团队"`，`title` 保留。源码锁进 `workbench-failure-feedback.test.ts`（F14 用例同文件）。

## 验证

- `./node_modules/.bin/tsc --noEmit` 0 错误；`eslint`（改动文件）0 错误。
- 全量 vitest：基线 975 通过 / 4 跳过，只接受新增。
- 生产模式验证：`ensure-electron` → `next build`（查 BUILD_ID）→ `next start`（数据副本，种子含一条未知 source 通知）→ Playwright 探针 + 截图：信息中心正常渲染、未知行显示「其他」；新建团队按钮 `aria-label` 存在。证据进 `~/workspace/frontend-polish-evidence/audit-followup-fixes/`。
- 验证完 better-sqlite3 切回 node ABI，验证服务器停掉。

## 不做

- 不 commit、不 push、不部署（提交节奏用户另定）。
- 不改服务端 source 写入校验；不改 `week` 口径（已确认维持现状）。
- 不动 C–F 已修的其他部分。
