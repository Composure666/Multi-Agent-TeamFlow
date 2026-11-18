## Implementation（分三路并行 + 集中验证）

文件归属（防冲突）：W1 只动 token 与 infra + 清扫（不含 app-workbench.tsx、settings-dialog.tsx、theme-toggle.tsx、home-header.tsx）；W2 只动 theme-toggle.tsx、settings-dialog.tsx、home-header.tsx；W3 只动 app-workbench.tsx。globals.css 归 W1 独占。

### Phase A — token 与基础设施（W1）

- [ ] `globals.css`：按 proposal A 节落 12 套 token（`:root` = ink 浅、`.dark` = ink 深、`[data-theme="<id>"]` / `[data-theme="<id>"].dark` 六套全量）；派生 token 用 `color-mix`（surface-muted/raised/sunken、accent-hover/soft/border、shadcn accent/secondary/muted、sidebar、标题栏）；pattern/soft/bgfx 原样接入；语义色按 D 节（wine 错误、警告橙、成功绿、图表）。
- [ ] `/home` 深色背景元素 token 化（网格走 `--agenthub-pattern`，光晕走 primary 的 color-mix 并按 bgfx 缩放；浅色不动）。
- [ ] 新增 `src/lib/themes.ts`（6 个 id、中文名、英文名、5 色卡片色、isValidThemeId、DEFAULT_THEME='ink'、THEME_STORAGE_KEY）与 `themes.test.ts`（id 合法、默认 ink、非法值回退）。
- [ ] `layout.tsx`：`<head>` 内联防闪脚本（读 localStorage `agenthub-theme`，非法/无值 → `ink`，写 `data-theme`）；`theme-provider.tsx` 或新增 hook 提供 `{ theme, setTheme }`（初值读 `dataset.theme`，set 时同步 attribute + localStorage + state）。
- [ ] 硬编码清扫（W1 文件范围）：`#2F5FD0`、`#3370FF`、`#C9A96A`、`#244FB3`、`#60A5FA` 全仓扫为 token；`demo-seed.ts` 的色值逐项判断（UI chrome 走 token，内容色保留并注明）；清扫后 grep 残留 0 处。
- [ ] 对比度实测：6 套 × 浅/深，ink/muted on bg、primaryInk on primary、accentInk on accent 逐项算，要求 ≥ 4.5:1；不达标只调 Ink/muted 一侧并记进 PROGRESS。
- [ ] 验证：`npx tsc --noEmit`、`npx eslint`（改动文件）、相关测试；`next start` 抽查两套主题浅/深截图。

### Phase B — 切换器 UI（W2）

- [ ] `settings-dialog.tsx`：`SETTINGS_SECTIONS` 新增「外观」分区放第一位——6 张主题卡（5 色色带 + 中文名 + 英文名 + 一行描述 + 适合场景一句，选中 ring）+ 明暗三段切换（浅色 / 深色 / 跟随系统）。
- [ ] `theme-toggle.tsx`：单按钮改下拉菜单（触发仍是 Sun/Moon 图标按钮；菜单分两段：6 主题 + 明暗三段）；复用 `ui/dropdown-menu`（如无则用现有 popover 模式，不新引依赖）。
- [ ] 首页与工作台用法不变（组件内扩展即生效）；移动端折叠菜单与工作台抽屉内均能切主题。
- [ ] 验证：`npx tsc --noEmit`、`npx eslint`（改动文件）；Playwright 点菜单切主题、刷新保持。

### Phase C — 新建任务页输入框改宽（W3，只动 app-workbench.tsx）

- [ ] 先量尺寸：(a) `git show HEAD:src/components/app-workbench.tsx` 原版输入框容器宽度、居中方式、与标题间距；(b) 证据截图 `phase5-round2/workbench-light-round2.png` 与 `before-after/workbench-newtask-compare.png` 改后侧，量 1366×768 下输入框实际像素宽与左右边距；(c) 现 A 版 660px 居中。目标以 (b) 为准，(a) 交叉核对；测量值写进 PROGRESS。
- [ ] composer 容器放宽到原版位置与尺寸（居中宽度、左右边距、与标题间距对齐原版）；A 视觉语言保留（衬线标题、金色描边、chips、示例 pills、最近团队行、lucide 图标）；不恢复截图 figure；不改输入框功能。
- [ ] 顺带把本文件的硬编码蓝/金 hex 扫为 token（与 W1 的清扫不重叠：W1 不碰此文件）。
- [ ] 验证：1366×768 与 1920×1080 浅/深截图，与原版截图并排核对位置与尺寸一致；`npx tsc --noEmit`、`npx eslint`（本文件）。

### Phase D — 集中验证（验证员，A–C 全部完成后）

- [ ] 全量 `npx tsc --noEmit` ✅；eslint（全部改动文件）0 错误；全量 `npx vitest run`（基线 869 通过 / 4 跳过，含新增 themes 测试）。
- [ ] 生产构建 `node node_modules/next/dist/bin/next build` ✅（`rm -rf .next` 后干净构建，如遇字体缓存问题同前处理）。
- [ ] `next start` + Playwright 截图：六套主题 × 浅/深 ×（首页 + 工作台新任务页 + 设置页）逐一截图；证据 `~/workspace/frontend-polish-evidence/theme-switcher/`。
- [ ] 默认与持久化：清 localStorage 后首次打开是水墨宣纸（明暗跟随系统）；切到 wine 深色后刷新保持；预置 localStorage 后首屏即对应主题色、无蓝白闪烁。
- [ ] 移动端 390px：切主题不断裂、无溢出；1366×768 与 1920×1080 对话框抽查 0 溢出（第三轮成果不回归）。
- [ ] TS 注册表与 CSS token 值逐项核对一致；全仓 grep 硬编码 hex 残留 0 处。
- [ ] 记录：`openspec/changes/theme-switcher/PROGRESS.md` 完整记录；`openspec/changes/frontend-polish/PROGRESS.md` 末尾加指向小节。

## Out of scope（另开 change）

- 功能逻辑、API、SSE 事件、DB schema、鉴权、沙箱、终端。
- 移动端 Capacitor 壳、logo、README、域名。
- 新增第七套主题、用户自定义主题（不在本轮）。
- 把主题偏好存进账号设置/DB（本轮只 localStorage）。
