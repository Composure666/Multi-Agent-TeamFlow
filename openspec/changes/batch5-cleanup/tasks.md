# 第五批：零散遗留清理（batch5-cleanup）— 任务清单

- 提案：`openspec/changes/batch5-cleanup/proposal.md`
- 状态：已完成。未 commit、未 push、未部署（HEAD `c383a4a`）。
- 基线：全量 vitest 890 通过 / 4 跳过（batch4 终态）。
- 终态验证（W7，最终树状态重跑）：tsc 0 错误、eslint 0 错误、全量 vitest **894 通过 / 4 跳过 / 0 失败**、干净生产构建 exit 0（BUILD_ID `Uj1B6GQ8PoWepS2jgOBEo`）、Playwright 回归全过。详见 `openspec/changes/batch5-cleanup/PROGRESS.md` §W7。

## 分工

- [x] W1 — §1 调试板工具条内部滚动（`src/components/agent-run-debug-board.tsx` CanvasToolbar）— 六条件 scrollX 全归零（431 口径：展开态）
- [x] W2 — §2 历史文档与 skill 引用 + 孤儿 helper + 斜杠命令 no-op — 斜杠命令选 ① store 驱动，实测可用；`src` 内已删标识符/孤儿 helper/`open-settings|open-agents` 均为 0 处
- [x] W3 — §3 G 范围外深色 accent 白字全仓扫修 — 31 处 / 19 文件，静止态全部 ≥ 4.5:1（最低 terra 浅 4.70），深色实测 13.43:1
- [x] W4 — §4 搜索结果行 JSON 原文渲染 — LIKE 路径改 JS 生成纯文本 snippet，搜「渲染」/「bash」无 JSON、有 `<mark>`
- [x] W5 — §5 POST /api/automations 顺带建同名会话（核实预期与否）— 预期行为，0 改动（spec 08 §12 + spec 01 明文；W7 API 实测：201，会话 +1，同名会话与绑定一致）
- [x] W6 — §6 白·工程蓝浅 accentInk 裕量 + §7 /home 预览图重拍（白·石墨，3200×1600，两处）— accentInk 4.55 → 4.91:1（accent 未动），24 组全过；两图 md5 均为 `1e85f504a3a0db84651cebf5192b9ef6`
- [x] W7 — 集中验证 + 记录（W1–W6 收齐后，最终树状态下重跑全部验证）— 全部重跑通过，见 `openspec/changes/batch5-cleanup/PROGRESS.md` §W7
