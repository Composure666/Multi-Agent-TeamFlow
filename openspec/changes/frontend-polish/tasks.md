## Implementation（分四期，每期独立验证）

### Phase 1 — token 与字体

- [x] `globals.css`：新增 gold token（gold / soft / border），卡片三档、阴影三档、圆角统一；恢复可见滚动条（浅色补 thumb 样式）。
- [x] `layout.tsx` 接入 Noto Serif SC（600/700），标题 class 接入；验证构建时字体下载与 Electron standalone 离线可用。
- [x] 全仓扫一遍硬编码色值（`border-slate-200` / `bg-white` / `neutral-900`），列出清单，不改逻辑。
- [x] 验证：`pnpm typecheck`、`pnpm lint`；亮/暗两主题截图对比。

### Phase 2 — `/home` + `/demo`

- [x] `/home` 按 proposal C 节重组为 8 分区，改 `SectionHead` 用法、hero 拼贴、文案收紧。
- [x] `/demo` 回放编排、进度条、结束态、产物链点亮。
- [x] 验证：本地 standalone 构建，`/home` 与 `/demo` 截图，移动端 390px 检查。

### Phase 3 — 工作台

- [x] token 对齐、卡片档位、三态（预览/空态/加载）、审批与错误态、新任务页去装饰。
- [x] 验证：`pnpm typecheck`、`pnpm lint`、相关测试；工作台截图。

### Phase 4 — 动效收尾

- [x] 接入 `motion`（如用户确认），三类动效落地；reduced-motion 验证。
- [x] 验证：`pnpm typecheck`、`pnpm lint`、测试；构建体积对比（motion 只进客户端包）。

### Phase 5 — 次要界面结构重设计（主界面之后）

- [x] 设置、Agent 创建器与 Agent 库、产物库与代码编辑器、分析、自动化、能力中心、信息中心、团队库、全部对话框、全局搜索、通知中心、调试面板、经验库、`/deployments`：按新 token 与卡片档位重做布局结构，统一空态 / 加载态 / 错误态与对话框尺寸档位。
- [x] 验证：`pnpm typecheck`、`pnpm lint`、相关测试；各界面截图。

## Out of scope（另开 change）

- 功能逻辑、API、SSE 事件、DB schema、鉴权、沙箱、终端。
- 移动端 Capacitor 壳、logo、README、域名。
- 性能优化（虚拟滚动、包体积拆分）。
