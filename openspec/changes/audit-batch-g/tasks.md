# 任务清单 — 大检查 G 批（剩余可修项）

- [x] G1 调试板 4 项遗留：先探针复核现状（390×844 + 1366），只修仍存在的问题（队名标签首屏外 / D4 重叠 / 图太宽 / 边擦工具卡）；不动默认视图决定 — 队名标签复核已无问题（390 标签底部 702px）；D4 已修（92px 滚动上限）；图太宽、边擦卡两项按红线未修（修法即改默认视图，待用户拍板），见 PROGRESS.md
- [x] G2 通知 cursor 改 `createdAt:id` 复合形式 + id tiebreak；兼容旧数字 cursor；回归测试：同毫秒跨页不丢 — `notification-service.test.ts:128/152`；生产 API 全走 45 页 90 条无重复
- [x] G3 新增 `scripts/sync-home-test-count.mjs`（vitest JSON → home-data.ts）；本批结束时跑一次 — 最后一次运行“已是最新：987”，`home-data.ts:221` = 987
- [x] G4 成功率分母与 avg 同口径（已结束且 finishedAt 非 null）；回归测试：脏行口径一致 — `analytics-service-success-rate.test.ts`
- [x] G5 全部已读标全部未读（服务端不传 ids 语义）；回归测试：未加载页也被标已读 — `notification-service.test.ts:171`；生产验证未读 90 → 0
- [x] G6 §7 可修四项：U-P2-3 改名「经验使用说明」；D-P2-3 最大余数法；L-P2-2 工具名两行；L-P2-3 模型格 col-span-2（或移副行） — 全部完成，模型格取 col-span-2，390 验证 deepseek-v4-flash 无截断
- [x] G7 补浏览器验证：E2（拦截 DELETE 500 弹窗不关）、D8（55+ 条截断 50）、E4（空产物库空态按钮）、F8（MCP 同步 >24h）、F15（设置对话框「关闭」） — E2/D8/E4/F15 全部通过；F8 修法正确、单元测试覆盖，但浏览器验收前提不成立（MCP lastCheckedAt 全站无渲染，唯一调用点喂 Date.now()），见 PROGRESS.md
- [x] V1 `./node_modules/.bin/tsc --noEmit` 0 错误；`eslint`（改动文件）0 错误 — 另有 2 条已存在警告（来自 HEAD）
- [x] V2 回归测试（G2/G4/G5）+ 全量 vitest（基线 978/4，只接受新增） — 987 通过 / 4 跳过，0 失败
- [x] V3 生产模式验证：`ensure-electron` → `next build`（查 BUILD_ID）→ `next start`（数据副本）→ Playwright 390 + 1366 探针 + 截图逐项核对；证据进 `~/workspace/frontend-polish-evidence/audit-batch-g/` — BUILD_ID `8shurloC_VVt6EdJKQWE3`，探针脚本与结果 JSON、截图齐全
- [x] V4 G3 同步脚本最后跑一次，首页数字以最终全量为准 — 987，已是最新
- [x] V5 写 PROGRESS.md；tasks 全打勾
