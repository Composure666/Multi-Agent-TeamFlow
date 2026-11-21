# 任务清单 — 大检查后续两项

- [x] R1 信息中心未知 source 单行降级：`resolveSourceIcon`/`resolveSourceLabel`/`resolveSourceIconLabel`（未知 → `Bell` / 「其他」），三处查表点改用 helper；`resolveLevel` 未知分类 → `"info"`；`CategoryTag` 未知分类 → 「其他」
- [x] R2 「新建团队」按钮补 `aria-label="新建团队"`（`app-workbench.tsx:1707`，`title` 保留）
- [x] T1 回归测试：helper 单元锁（未知 source → `Bell` / 「其他」；未知分类 → `"info"` / 「其他」）；新建团队按钮 aria-label 源码锁
- [x] V1 `./node_modules/.bin/tsc --noEmit` 0 错误；`eslint`（改动文件）0 错误
- [x] V2 全量 vitest（基线 975/4，只接受新增）
- [x] V3 生产模式验证：种子含一条未知 source 通知，信息中心正常渲染、该行显示「其他」；新建团队按钮 aria-label 存在；证据进 `~/workspace/frontend-polish-evidence/audit-followup-fixes/`
- [x] V4 写 PROGRESS.md；tasks 全打勾
