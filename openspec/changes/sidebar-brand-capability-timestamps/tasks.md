# 任务清单 — 侧栏品牌区 + 能力中心时间戳/假数字

- [x] K1 `skill-service.ts`：refresh 取文件 mtime，内容不变不写库（只回填 mtime），内容变了 `updatedAt = mtime`；新文件 `createdAt = updatedAt = mtime`；`updateSkill` 不再碰 `updatedAt`
- [x] K2 `capability-center-workspace.tsx`：`recentUpdates` 与“查看全部”弹窗改用 `sortRows(rows, 'updated')`；动作改为“已启用 / 已停用”
- [x] K3 同文件：热门能力 `calls` 改为真实 `bindings`，渲染“`N` 个 Agent 绑定”，条形图按绑定数占比
- [x] K4 同文件：`KpiCard` 去掉合成火花线，删 `buildUsageSparkline`（确认无其他调用方），数值加 `truncate`
- [x] B1 `app-workbench.tsx`：删桌面侧栏英文副标题行，侧栏非 compact 宽度统一 288px，更新 Q15 注释；无用的 `BRAND_TAGLINE_EN` import 随 lint 清理
- [x] T1 回归测试：`skill-service.test.ts`（refresh 幂等、内容变跟 mtime、toggle 不动 updatedAt）；`capability-center-workspace.test.ts`（`sortRows` 按 updatedAt 倒序）
- [x] V1 `pnpm typecheck` 0 错误；`pnpm lint`（改动文件）0 错误；相关测试 + 全量 vitest
- [x] V2 本地生产模式验证：能力中心打开两次时间戳稳定且与 mtime 一致；1366 侧栏品牌两行不断词；390 复核无新增截断；写 PROGRESS.md
