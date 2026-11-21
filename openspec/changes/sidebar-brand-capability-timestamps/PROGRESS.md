# 侧栏品牌区 + 能力中心时间戳/假数字 — 实施记录

- 日期：2026-11-20
- 背景：用户 2026-11-20 20:21 截图反馈侧栏品牌区拥挤、能力中心全部显示“刚刚”；20:22 确认“两处都按上面方案修”。同日大检查报告把本轮记为在途 B1 + K1–K4（`~/workspace/frontend-polish-evidence/big-frontend-audit-2026-11-20/REPORT.md`）。
- 方案：同目录 `proposal.md`；任务：同目录 `tasks.md`（8 项全打勾）。
- 状态：**全部完成并通过验证**。未 commit、未 push、未部署（HEAD 仍为 `5fb2598`，改动在工作树 6 个文件 + 本目录）。
- 证据：`~/workspace/frontend-polish-evidence/sidebar-brand-capability-timestamps/`（verify.mjs、verify-results.json、v-brand-1366.png、v-capability-1366.png、v-brand-390.png）。

## 改动

### K1 `src/server/skill-service.ts` — 时间戳取文件 mtime

- `refreshSkillsFromDisk()`：每文件取 `statSync().mtimeMs`。新文件 `createdAt = updatedAt = mtimeMs`；内容变了：更新字段，`updatedAt = mtimeMs`；内容不变：不写库，只在 `updatedAt`/`createdAt` 与 mtime 不一致时一次性回填为 mtime（修复此前被旧实现写坏的值，此后幂等）。不再用 `Date.now()` 写 `updatedAt`。
- `updateSkill()`：只改 `enabled`，不再碰 `updatedAt`（启用/停用是状态，不是内容更新；否则下一次 refresh 又会覆写回 mtime）。
- `discoverWorkspaceSkills()` 不动（只用于 Agent 运行时注入，不展示时间戳）。

### K2/K3/K4 `src/components/capability-center-workspace.tsx`

- `recentUpdates` 与“查看全部”弹窗改用 `sortRows(rows, 'updated')`；动作由“启用了能力/停用了能力”改为状态词“已启用/已停用”。
- 热门能力：`calls` 改为真实 `bindings = row.bindingCount`，渲染“`N` 个 Agent 绑定”，条形图按绑定数占比；空态副标题“调用频次 TOP 5”改为“绑定 Agent 数 TOP 5”。
- KPI 卡去掉合成火花线：删 `buildUsageSparkline()` 与 `Sparkline` 组件、`KpiDescriptor.sparkline` 字段；数值加 `truncate`。

### B1 `src/components/app-workbench.tsx`

- 删桌面侧栏英文副标题行及 Q15 注释（算错的 104px 说法已按新宽度账重写）；`BRAND_TAGLINE_EN` 从 import 移除。英文副标题仍在 /home 使用。
- 非 compact 侧栏统一 288px（原来对话/新任务视图已是 288px，其他视图 260px）。宽度账：288 − 24 − 16 − 32 − 8 − 约 104 ＝ 文字约 104px，`Multi-Agent` 一行放得下。

### 测试

- `skill-service.test.ts` +3：refresh 两次 `updatedAt` 不变；`updatedAt`/`createdAt` 跟文件 mtime；toggle enabled 不动 `updatedAt`。
- `capability-center-workspace.test.ts` +4：`sortRows(rows, 'updated')` 倒序（`sortRows` 与 `CapabilityRow` 为此导出）；文本锁——无“启用了能力/停用了能力”、无“k 引用”、无 `buildUsageSparkline`/`Sparkline`。
- `sidebar-layout.test.ts` +1：文本锁——侧栏无 `w-[260px]`、统一 `w-[288px]`、无 `BRAND_TAGLINE_EN`、品牌名两行。

## 验证

- `tsc --noEmit` 0 错误（注：`pnpm typecheck` 在本机 VM 会先跑 `pnpm install` 预检并失败，见下“环境备注”；直接跑 `tsc` 即脚本本体）；`eslint` 改动文件 0 错误（仅 1 条 logo `<img>` 既有警告，与本轮无关）。
- 全量 vitest：**104 文件，904 通过、4 跳过**（基线 896 + 本轮新增 8 个）。
- 生产模式验证（`next build` + `next start`，数据用 `/tmp/verify-data` 副本，未动本地库）：
  - `GET /api/skills` 连调 3 次：第 1 次回填（8 个 skill 的 `updatedAt` 从 11-18 17:53 回到文件 mtime 11-06 23:12，`add-experience` 回到 11-19 01:08），第 2 次 = 第 3 次，完全稳定。
  - 注意：`add-experience` 的 `createdAt` 是两次收敛的——第 1 次调用走了“内容变了”分支（文件 11-19 改过，库里是 11-18 的旧内容），只更新 `updatedAt`；第 2 次内容已一致才回填 `createdAt`。此后稳定，无需处理。
  - Playwright 探针（1366×768、390×844）：侧栏宽 288px，`Multi-Agent` 实测 81.5px、单行高 18.6px，副标题 0 处，`docScrollW` = 视口宽；能力中心相对时间只剩“14 天前”×12、“2 天前”×2，无“刚刚”；无“k 引用”、无假动作；热门卡显示“3 个 Agent 绑定”（验证副本里给 3 个 Agent 绑了 skill，仅验证用）；火花线 svg 0 个；手机 390 无横向溢出。
  - 截图目视：品牌区两行干净、无副标题；能力中心 KPI 卡无火花线、表格“最近更新”列为 2 天前/14 天前。

## 未修（等用户定批次 A–F 后另立项）

- 截图里仍可见的审计项：Skills 卡“+100%”（D-P1-1，启用率冒充趋势）、已绑定 Agent“+200%”（D-P0-3）、能力调用量 Token÷100（D-P0-2）、MCP“-N%”（D-P0-4）——均属批次 A。
- MCP 健康检查写 `updatedAt`（D-P2-12）、信息中心“0 个月前”（D-P0-5）、“今日”时区 bug（D-P1-5）等，见审计报告 §8。

## 环境备注（供下次参考）

- 本机 `pnpm` 在 `~/.local/bin/pnpm`，exec 默认 PATH 里没有；跑 `pnpm`/ensure 脚本前先 `export PATH="/home/hatch/.local/bin:$PATH"`。
- better-sqlite3 双 ABI：测试跑在系统 Node 24（ABI 137），构建/启动跑在 Electron Node（ABI 130）。切 ABI 用仓库自带脚本 `scripts/ensure-node-sqlite.mjs` / `scripts/ensure-electron-sqlite.mjs`（它们内部调 `pnpm rebuild`，需要上面那条 PATH）。
- `pnpm typecheck` 在本机 VM 失败：pnpm 先做依赖状态检查并跑 `pnpm install`（exit 255），与代码无关；直接跑 `./node_modules/.bin/tsc --noEmit` 即可（就是 typecheck 脚本本体）。
- 构建时若跳过 ensure-electron 会静默失败（无 `.next/BUILD_ID`，退出码仍为 0——不要只看退出码，要查 BUILD_ID）；正确顺序是 ensure-electron → `run-electron-node.mjs next build`。
- 验证服务器起在 3100、数据副本 `/tmp/verify-data`，已停；本地 `.agenthub-data` 未动。
