# 主题切换器实施记录（theme-switcher）

> 用户 2026-11-18 ~14:43 拍板：六套主题全都要，做成可切换的主题，默认水墨宣纸。写完 OpenSpec 直接实施。
> 唯一事实来源：`proposal.md`（决策、12 套 token 表、映射规则）与 `tasks.md`。
> 铁律：不 commit、不 push、不部署；只改工作树。
> 注（2026-11-19，batch5-cleanup W2）：本文提及的 `sidebar.tsx`、`agent-library.tsx`、`team-library.tsx`、`new-conversation-dialog.tsx`、`global-search-trigger.tsx`、`dir-picker-dialog.tsx` 已于 2026-11-18 batch4 §2 删除；现入口：侧栏→`app-workbench.tsx` 内联 `wb-sidebar`、Agent 库→`agent-workspace.tsx`、会话创建→新建任务视图。历史叙述保留原样。

## 基线

- HEAD：`9618684`（master）；开始前工作树 85 个文件改动（+3293/−2660，frontend-polish 五期 + 第二轮 + 第三轮），未 commit、未 push。
- 第四次预览部署已完成（2026-11-18 ~14:56，BUILD_ID QgynDmUxmIBD0cDhFCUQT，第三轮内容已上线）；工作树可动。
- 工具链：`npx tsc` / `npx eslint` / `npx vitest`（pnpm 不在 PATH）；生产构建 `node node_modules/next/dist/bin/next build`；验证用 `next start`（standalone 有既有 ali-oss `debug` 缺失问题致 /home 500，与改动无关）。
- 效果图 source：artifact `qian-duan-zhu-ti-feng-ge-fang-an`，THEMES 数组已两次 inspect 核验逐字提取（六套 × 浅/深 × 12 字段，见 proposal A 节）。

## 实施分工（文件归属防冲突）

- W1 token 与基础设施：`globals.css`（独占）、`layout.tsx`、新增 `src/lib/themes.ts` + `themes.test.ts`、`theme-provider.tsx`/hook、硬编码清扫（除 app-workbench.tsx、settings-dialog.tsx、theme-toggle.tsx、home-header.tsx 之外的文件）。
- W2 切换器 UI：`theme-toggle.tsx`、`settings-dialog.tsx`、`home-header.tsx`。
- W3 输入框改宽：只动 `app-workbench.tsx`（含本文件硬编码色清扫）。
- W4 集中验证：A–C 全部完成后，全量验证 + 截图。

## 进度

- 2026-11-18 ~14:59：proposal.md + tasks.md 写完，W1/W2/W3 并行启动。

## W3 — 新建任务页输入框改宽（已完成，2026-11-18 ~15:10）

- 只动 `src/components/app-workbench.tsx` 一个文件。
- 测量（根字号 17px）：原版（HEAD 9618684）composer 1366×768 宽 1010px（x=322，主区内左右边距各 34px）、1920×1080 宽 1338px（x=435，边距各 147px），hero 底→composer `mt-7`=29.75px；证据截图换算值与原版一致（round2 1440×900 换算 1010px；before-after 改后侧换算 1010px）；A 版改前 660px 居中、composer 宽 609px。
- 改后实测（Playwright `getBoundingClientRect`）：1366 浅/深 composer x=322、宽 1010、边距 34/34；1920 浅/深 x=435、宽 1338、边距 147/147；副文案底→composer 29.8px；与原版逐像素一致。
- 改动：外层容器 660px → 原版 `max-w-[1280px] px-8 2xl:max-w-[1440px] 2xl:px-12`；composer `mt-8` → `mt-7`；本文件五值 hex（`#2F5FD0`/`#3370FF`/`#C9A96A`/`#244FB3`/`#60A5FA`）残留 0 处（18 处 accent fallback、标题蓝、CTA 蓝底/hover、ring、RECENT_TEAM_COLORS、composer 阴影、金色渐变全部改走 token 变量）。A 视觉语言保留；截图 figure 未恢复；输入框功能未动。
- 验证：`npx tsc --noEmit` ✅ 0 错误；eslint 本文件 0 错误、1 warning（既存 `:865 <img>`）；生产构建 ✅ exit 0（BUILD_ID `8-T5K0XoiQ8huQRmRehfE`）。截图与测量：`~/workspace/frontend-polish-evidence/theme-switcher/`（`w3-newtask-*-*.png`、`w3-compare-vs-original-1366.png`、`w3-compare-vs-round2-1366.png`、`w3-measurements.json`、`shot-w3.mjs`）。截图时 W1 的 12 套 token 尚未落地，图中 accent 仍是旧蓝值，待 W1 落地后随主题走，本文件无需再改。
- 遗留：① `RECENT_TEAM_COLORS` 仍剩 1 处 `#3E7CB1`（钢蓝头像色，五值清单外，无对应 token；内容色、非 UI chrome，留待 W4 定是否换 token）；② h1 底→composer 改后 88.4px vs 原版约 188px——A 标题块本身无场景 Tabs/快捷胶囊两行，属 A 设计固有差异，对齐的是副文案底→composer 的 `mt-7`；③ 副文案与「需求到原型团队」折两行是 A 版既存，第三轮已记录，本次未动；④ 纵向锚定未改（原版垂直居中，A 版顶部锚定，任务只要求宽度/边距/标题间距对齐）。

## Phase A — token 与基础设施（W1，2026-11-18 ~15:02–15:45）

### 改动文件（11 个，不含 W2/W3 的文件）

- `src/app/globals.css`（独占）：12 套 token + 语义色/图表 + /home 深色背景元素 token 化 + 蓝系残留清扫（见下）。
- `src/app/layout.tsx`：防闪内联脚本（见下“防闪脚本两次返工”）。
- 新增 `src/lib/themes.ts`（注册表：6 id、中文名、英文名、5 色卡片色浅色版、`isValidThemeId`、`resolveThemeId`、`DEFAULT_THEME='ink'`、`THEME_STORAGE_KEY='agenthub-theme'`）与 `src/lib/themes.test.ts`（7 个测试）。
- `src/components/theme-provider.tsx`：新增 `useThemeChoice()`（`{ theme, setTheme }`，初值读 `dataset.theme`，set 时同步 attribute + localStorage + state）；明暗仍走 next-themes（`defaultTheme="system"` 不动）。
- 硬编码清扫：`agent-workspace.tsx`（12 处 accent fallback + 2 处 hover fallback 的 `#2F5FD0/#244FB3` 去掉）、`analytics-workspace.tsx`（CHART_COLORS/STATUS_COLORS/sparkColor/TrendChart/Sparkline 走 `--chart-*` 与语义 token；SVG 的 `fill/stroke/stopColor` presentation attribute 不解析 `var()`，一律改 `style` 传 token；Sparkline 渐变 id 改 id-safe）、`capability-center-workspace.tsx`（blue spark → `var(--primary)`，同上 Sparkline 改法）、`pending-write-diff-tab.tsx`、`selection-popover.tsx`（`#3370FF` → accent token）、`usage-badge.tsx`（ctx 渐变首色 `#3370FF` → accent token；琥珀/红两档是语义色，保留）、`home-sections.tsx`（页脚 logo 底 `#EAF2FF` → accent-soft）。
- `demo-seed.ts` 未动：9 处 `#C9A96A` 全部是内容色——设计指南文档（L151）、web_app 产物内联 HTML（L213–233）、回放对话（L433）——按 proposal E 节保留并注明。
- `home-download.tsx` / `demo-showcase.tsx`：五 hex 零命中，未动（download 的 `#0F1115/#121418` 终端 mock 底与 macOS 三色点是内容色，保留）。

### Token 落法（globals.css）

- `:root, :root[data-theme="ink"]` = ink 浅、`.dark, :root[data-theme="ink"].dark` = ink 深；其余五套各两块。144 个字段（6 套 × 浅/深 × 12 字段）用脚本 `/tmp/gen-tokens.py` 生成，并用 `/tmp/verify-tokens.py` 对 proposal.md A1–A6 逐项核对：133 个逐字一致，11 个为对比度调整（只动 Ink/muted 一侧，见下）。
- 派生全部 color-mix：surface-muted（浅 bg 向 ink 混 4%，深 = bg）、raised（浅 = surface，深 surface 向 ink 混 8%）、sunken（浅 bg 向 ink 混 4%，深 bg 向 ink 混 6%）、accent-hover（浅 primary 向 black 混 12%，深向 white 混 18%）、accent-soft 12% / accent-border 24%、shadcn accent = primary 10%、sidebar-accent = primary 12%、标题栏 surface/ink/line 同规则；阴影三档沿用现行中性定义。
- `--agenthub-gold` 变量名保留，值按每套 accent 走；新增 `--agenthub-gold-ink`（accentInk）、`--agenthub-warning`、`--agenthub-success`（D 节色值）；`--agenthub-pattern/--agenthub-soft/--agenthub-bgfx` 原样接入。
- 语义色按 D 节：错误默认浅 `#DC2626`/深 `#F87171`，wine 浅 `#E5484D`/深 `#FF6B6B`；警告全主题橙浅 `#EA580C`/深 `#FB923C`；成功翡翠绿浅 `#059669`/深 `#34D399`；图表 chart-1=primary、chart-2 `#34D399`、chart-3=accent（pine/graphite/obsidian 琥珀/金系改 `#2DD4BF`）、chart-4=错误红、chart-5=muted。
- 顺带把 globals.css 里的同系蓝色全部 token 化（与五 hex 同源）：浅色滚动条 thumb `rgba(47,95,208,…)`、深色 `::selection`、深色 blue-50/100/border/ring/hover/from 映射、`.dark :where(.bg-white/.bg-slate-50…)` 暖黑底 → `var(--card)/--agenthub-surface-raised`、`.dark pre/code` → sunken、`message-glow` 关键帧 `rgba(51,112,255,…)`、标题栏 logo 底 `#EAF2FF`；`.text-[#3370ff]` 的深色映射选择器随清扫删除。状态徽章背景改语义 token（文字色保留，与新 token 同系）。

### /home 深色背景元素 token 化（globals.css 约 1549–1600 行）

- Hero 网格走 `var(--agenthub-pattern)`；光晕走 primary 的 color-mix，按 bgfx 缩放：Hero 光晕基准 11% @ bgfx .8（`13.75% × bgfx`，石墨/曜石深 .85 时约 11.7%）、workflow/features 光晕基准 5%（`6.25% × bgfx`）、proof 上下框线基准 14%（`17.5% × bgfx`）；preview/architecture/download 沉底改 `var(--agenthub-surface-sunken)` + 前景色 5% 分隔线。浅色零改动。

### 防闪脚本两次返工（layout.tsx，教训）

1. 字面 `<head>` + 原生 `<script>`：App Router 直接丢弃字面 `<head>`，served HTML 里完全没有脚本。
2. `next/script strategy="beforeInteractive"`：脚本进了 HTML，但被 React 19 序列化成 `__next_s` 载荷、由客户端运行时再插入，执行时机晚于解析期。
3. 最终形态：`<body>` 首位的原生 `<script dangerouslySetInnerHTML>`。curl 验证：served HTML 里 `<body>` 起始处就是同步执行的内联脚本（`localStorage.getItem("agenthub-theme")` → 非法/无值 → `ink`），先于 next-themes 自身的防闪脚本执行。

### 对比度实测（WCAG，脚本 /tmp/theme-contrast-verify.mjs，直接读生成后的 globals.css）

提案值初测 48 项里 11 项不达标，全部只调 Ink/muted 一侧；调后 48 项全部 ≥ 4.5:1：

| 主题/明暗 | ink/bg | muted/bg | primaryInk/primary | accentInk/accent |
|---|---|---|---|---|
| ink 浅 | 13.68 | **4.84**（#756c5c→#6f6757） | 12.76 | 5.65 |
| ink 深 | 14.53 | 6.43 | 11.59 | **4.66**（#fff3e6→#1d0d06） |
| pine 浅 | 13.14 | 4.54 | 7.34 | **5.61**（#fff8e8→#221806） |
| pine 深 | 15.10 | 7.20 | 5.36 | 7.38 |
| terra 浅 | 12.88 | **4.80**（#84705f→#776556） | 4.70 | 4.73 |
| terra 深 | 14.79 | 6.50 | 5.28 | 8.69 |
| graphite 浅 | 13.23 | **4.84**（#6d6a63→#68655e） | 11.60 | **4.89**（#fff8e6→#241703） |
| graphite 深 | 15.52 | 6.65 | 13.43 | 7.43 |
| wine 浅 | 13.23 | **4.83**（#7d6871→#77636b） | 9.00 | **4.67**（#fff9ec→#171006） |
| wine 深 | 14.86 | 6.77 | **4.58**（#fff2ea→#050203） | 6.90 |
| obsidian 浅 | 14.60 | **4.74**（#776e5b→#716956） | 13.33 | **4.81**（#fffaf0→#1d1603） |
| obsidian 深 | 15.46 | 6.65 | 7.95 | 10.54 |

调整原因（11 处，粗体为调后值）：
- 浅色 muted 五套（ink/terra/graphite/wine/obsidian）：提案值 4.06–4.49，略低于 4.5；向 black 混 5%（terra 混 10%，原值最低 4.06），新值 4.74–4.84。pine 浅 muted #5f7263 原值 4.54 已达标，未动。
- 浅色 accentInk 四套（pine/graphite/wine/obsidian）：金底配暖白字仅 2.95–3.85；改暖深棕（pine 沿用其深色版 accentInk #221806；其余取同系深棕），新值 4.67–5.61。ink 浅（朱砂底 5.65）与 terra 浅（4.73）原值达标，未动。
- ink 深 accentInk #fff3e6→#1d0d06：朱砂 `#cf5a3c` 上白字仅 3.71，改暖黑 4.66。
- wine 深 primaryInk #fff2ea→#050203：酒红主色 `#c0526a` 偏亮，白字仅 4.11；该色上纯黑也只有 4.66，取最深的暖黑 #050203 得 4.58（余量最薄的一处，见遗留问题）。
- 任务点名的四处原值即达标，未动：obsidian 深 muted #a39677/#0e0d0b 6.65、wine 深 muted #b0949c/#180f13 6.77、terra 深 primary #d0713f/#241105 5.28、pine 深 primary #3f9e66/#0e1a10 5.36。

### 硬编码残留 grep（全仓，`#2F5FD0|#3370FF|#C9A96A|#244FB3|#60A5FA`）

- `#2F5FD0` / `#3370FF` / `#244FB3` / `#60A5FA`：0 处。
- `#C9A96A`：15 处，全部有据可查，非残留——① globals.css 6 处是曜石黑金**深色 primary 本身**（proposal A6：obsidian 深 primary `#c9a96a`，`--primary/--ring/--chart-1/--sidebar-primary/--sidebar-ring/--agenthub-accent`）；② demo-seed.ts 9 处是内容色（见上，保留）。即“0 处”按字面 grep 对 `#C9A96A` 不成立，因为提案本身把该值定为 obsidian 深 primary；验证员应按“非 token/非内容色用法 0 处”核对。
- 注：`app-workbench.tsx` 的 19 处在本次 grep 时已为 0——W3 并行清扫中（不归 W1）。

### 验证结果

- `npx tsc --noEmit` ✅（三次：清扫后、防闪返工后、最终）。
- `npx eslint`（11 个改动文件）0 错误 ✅。
- `npx vitest run` 全量：103 文件通过，**876 通过 / 4 跳过**（基线 869 + 新增 themes 7 个；4 跳过不变）✅。
- 生产构建 `node node_modules/next/dist/bin/next build` ✅（两次：初版与防闪返工后；exit 0）。
- `next start -p 3102` + Playwright 抽查（脚本 `~/workspace/frontend-polish-evidence/theme-switcher/shot-w1.mjs`）：ink + wine × 浅/深 × /home（fullPage）+ 工作台，共 8 张；`data-theme` 全部正确，body 背景色与提案逐字一致（ink 浅 `rgb(244,238,224)`、ink 深 `rgb(22,20,15)`、wine 浅 `rgb(245,238,231)`、wine 深 `rgb(24,15,19)`）；肉眼确认 6 张（home-ink-light、home-wine-light、home-wine-dark、workbench-ink-light、workbench-wine-light、workbench-wine-dark）：宣纸底/朱砂点缀、酒红主色/古铜点缀、深色 hero 网格与分区光晕均与提案一致，无蓝白残留。截图路径 `~/workspace/frontend-polish-evidence/theme-switcher/home-{ink,wine}-{light,dark}.png`、`workbench-{ink,wine}-{light,dark}.png`。
- 未做：六套全量截图、移动端 390px、持久化刷新验证——属 W4 集中验证范围。

### 遗留问题

- wine 深 primaryInk #050203 对比度 4.58:1，余量最薄（该主色上任何文字色最高只有 4.66:1）；如用户觉得酒红按钮黑字显生硬，只能动 primary 本身（需用户定夺，W1 未动）。
- `/home` 界面预览区的静态截图 `public/images/app-screenshot.png` 仍是旧蓝白工作台（第三轮遗留待重拍），与新主题不一致；属图片资产重拍，不在 W1 文件范围。
- `shot-w1.mjs` 首次执行中途遇到一次服务重启，只存下 1 张；重启 `next start` 后重跑 8 张全齐。
- globals.css 里仍有 Tailwind `blue-*` 工具类（如 `bg-blue-50`）在浅色下渲染淡蓝——提案 E 节只要求清五 hex，未要求扫工具类；深色已由 remap 走 primary，浅色是否要扫由 W4/用户定夺。


（以下由实施与验证员续写）

## W2 — 切换器 UI（已完成，2026-11-18 ~15:02–15:45；协调员据 W2 汇报补记，W2 未自写本节）

- 改动（仅自己范围）：`theme-toggle.tsx` 单按钮改下拉菜单（触发仍是 Sun/Moon 图标按钮，保留 mounted 防 mismatch 与 hover 动效；菜单分两段：6 个主题色点 + 中文名 + 当前打勾，与明暗浅色/深色/跟随系统）；复用现有 `src/components/ui/dropdown-menu.tsx`（Base UI Menu），无新依赖；实测修 1 处 bug：Base UI `MenuRadioItem` 默认 `closeOnClick = false`，点主题后菜单不关，已在两组 `DropdownMenuRadioItem` 上加 `closeOnClick`。`settings-dialog.tsx`：`SETTINGS_SECTIONS` 首位新增「外观」分区（Palette 图标），新增 `AppearanceSettings`：6 张主题卡（5 色色带 + 中文名 + 英文名 + 一行描述 + 适合场景一句，选中态 ring +「✓ 当前主题」）+ 明暗三段切换；文案放本地 `THEME_COPY`（proposal A 节原文）。`home-header.tsx` 未动（ThemeToggle 在常驻顶栏内，组件内扩展即全站生效）。`theme-choice.tsx` 新建后又删除：W1 中途落地 `themes.ts` 与 `useThemeChoice` 后，两个消费者改从 W1 的 canonical 实现 import（`THEMES`/`ThemeId` ← `@/lib/themes`，`useThemeChoice` ← `@/components/theme-provider`）；临时常量里的 6 套 5 色 hex 与 W1 注册表逐字一致。唯一缺口：W1 的 `ThemeMeta` 没有 description/suitable 字段，卡片文案放 settings-dialog 本地，未碰 W1 文件。
- 验证：`npx tsc --noEmit` ✅；eslint（2 个改动文件）0 错误；生产构建 ✅（BUILD_ID `anKuZxDpztJ2VBa75SvWX`）。Playwright 9/9 PASS（脚本 `shot-w2.mjs`，私有端口 3103）：菜单列出 6 主题 + 3 明暗；点 wine → `data-theme=wine` + localStorage `agenthub-theme=wine`；切深色 → `.dark`；刷新后保持 wine 深色；切回 ink 浅色；设置页「外观」在导航首位、6 张卡；设置页点卡切 wine 生效；390px 移动端菜单可开、可切 pine、无溢出。截图 6 张（`w2-*` 前缀）。结构确认：首页窄屏靠常驻顶栏按钮可达；工作台三处 `ThemeToggle`（sidebar.tsx:178、app-workbench.tsx:484/892，含移动端抽屉内）均随组件扩展生效；`/demo` 无单独入口、跟随主题走。
- 遗留：并行构建冲突——验证期间其他 worker 重建 `.next` 共用 3102 端口，第一次构建 ENOENT 失败，3102 服务一度 chunk 500；绕法为单独构建 + 私有端口 3103。未跑全量 vitest（属 Phase D 范围）。

## W5 — 新建任务页输入框改高 + 自动增高（已完成，2026-11-18 ~15:50–16:05）

### 更正说明（用户 2026-11-18 ~15:50 澄清，上一版任务作废）
- 原任务“边距收到 16px 再加宽”**取消**：W5 动手时尚未改宽，故无须恢复；宽度保持 W3 值不变，实测核对：1366 浅/深 composer x=322、宽 1010；1920 浅/深 x=435、宽 1338，与 W3 逐像素一致。
- 改为**改高**：textarea min-height 78px → 150px（约 5 行正文，行高 24.75px，内容区约 129px），composer 总高相应增加；标题、副文案、示例 pills、最近团队行未动，1366×768 下 pills/团队行仍在视口内，无须压缩标题区留白。

### 改动（只动 `src/components/app-workbench.tsx` 一个文件，一行）
- 新建任务页 composer 内 Textarea：`min-h-[78px] max-h-[280px]` → `min-h-[150px] max-h-[min(320px,40vh)]`（其余 class 不动：`resize-none overflow-y-auto` 已在）。
- 自动增高方案：**CSS `field-sizing: content`，不写 JS**。理由：① 共享组件 `src/components/ui/textarea.tsx` 第 10 行已带 `field-sizing-content`，是项目既有选择，本文件沿用即可，无新增代码；② 实测在 Playwright Chromium 中随内容增高、删字回缩均正常；③ 目标运行环境均支持：Electron 33.4.11（Chromium 130，field-sizing 自 Chrome 123 起支持）、Chrome/Edge 123+、Firefox 132+、Safari 18.4+；④ 极老浏览器降级为固定 min-height + 框内滚动，仍可用。`contentOverflow`（“已省略 · 框内滑动查看”）逻辑未动，顶格时正常出现。
- 顺带清扫：本文件 `blue-*` 工具类 grep（不区分大小写）0 处，无须改；`#3E7CB1`（RECENT_TEAM_COLORS 钢蓝头像色）按任务要求未动，仍留 W4 定夺。

### 改前/改后实测（Playwright `getBoundingClientRect`，脚本 `shot-w5.mjs`；基线跑在 W4 的 3104 服务，改后跑在 W5 自建 3105 服务，BUILD_ID `vno9w12av__cvaQ8y7nIc`）
| 状态 | 视口 | textarea 高 | composer 总高 | chips 底 | CTA 底 | pills 底 | 团队行底 | 页面滚动 |
|---|---|---|---|---|---|---|---|---|
| 空态改前 | 1366×768 浅/深 | 78 | 172.3 | 374.7 | 370.5 | 490 | 587.8 | 768/768 无 |
| 空态改后 | 1366×768 浅/深 | **150** | **244.3** | 446.7 | 442.5 | 562 | **659.8** | 768/768 无 |
| 空态改后 | 1920×1080 浅/深 | **150** | **244.3** | 446.7 | 442.5 | 562 | 659.8 | 1080/1080 无 |
| 500 字改前 | 1366 浅/深 | 217.5 | 311.8 | 514.2 | 510 | 629.5 | 727.3 | 778/768（+10） |
| 500 字改后 | 1366 浅/深 | 217.5 | 311.8 | 514.2 | 510 | 629.5 | 727.3 | 778/768（+10，与改前一致） |
| 500 字改后 | 1920 浅/深 | 168.4 | 262.7 | 465.2 | 460.9 | 580.4 | 678.3 | 1080/1080 无 |
| 1200 字顶格 | 1366 浅/深 | **307.2**（=40vh，取较小者） | 401.4 | 603.9 | 599.7 | 719.1 | 817 | 868/768，框内 scrollHeight 487，badge 出现 |
| 1200 字顶格 | 1920 浅/深 | **320**（320<40vh=432） | 414.3 | 616.7 | 612.5 | 732 | 829.8 | 1080/1080 无，框内 scrollHeight 365，badge 出现 |
| 删字回缩 | 四组 | **150**（精确回落） | 244.3 | — | — | — | — | 无 |

- 500 字长文四组（1366/1920 × 浅/深）全部通过：chips 与创建按钮可见、无变形；页面溢出仅 1366 组 +10px（改前基线即有，非本次引入，内容全部可见，只是底部留白被压 10px）。
- 顶格态：textarea 封顶后框内滚动（scrollHeight > clientHeight，“已省略” badge 出现），chips/CTA 始终可见；1366 下团队行在折叠线下（底 817 > 768），页面需滚约 100px 才可见——768 高视口 + 307px 输入框 + 下方内容的固有空间账，不是 cap 失效，见遗留问题。

### 验证结果
- `npx tsc --noEmit` ✅ 0 错误；`npx eslint src/components/app-workbench.tsx` 0 错误、1 warning（既存 `:865 <img>`）✅。
- 生产构建 `node node_modules/next/dist/bin/next build` ✅ exit 0（构建前确认无其他构建在跑；W4 的 3104 服务未碰，W5 自建 3105 服务验证后已停）。
- 截图与测量：`~/workspace/frontend-polish-evidence/theme-switcher/`（`w5-{light,dark}-{1366,1920}-{empty,long,cap,shrunk}.png` 共 16 张、`w5-measurements.json`、`w5-baseline-measurements.json`、`w5-baseline-*.png` 12 张、`shot-w5.mjs`）。肉眼核对 `w5-light-1366-empty.png`（加高后布局协调）与 `w5-light-1366-cap.png`（顶格框内滚动 + badge + CTA 可见）。

### 遗留问题
- 顶格态（1200 字）1366×768 下页面内容总高 868px，团队行需滚约 100px 才可见；500 字态仅 +10px。如用户要求顶格时团队行也不出视口，需另行压缩下方间距或降低上限（40vh → 更小），由用户定夺，本次未动。
- 背景加元素（三选一：淡网格 + 柔光 / 宣纸墨晕 / 极简光斑）仍不做——用户要先看三张风格效果图再选方向。

## Phase D — 集中验证（W4，2026-11-18 ~15:35–16:10）

验证环境：私有端口 3104（W2 的 3103 服务已停），`rm -rf .next` 后干净构建。验证用构建 BUILD_ID `3ejKmeUKrl3zzdQA96bpr`；收尾 blue 清扫后重建 BUILD_ID `IbBWO2FmOnqIC6tMRi0Um`（构建时 `app-workbench.tsx` 自 07:52 起未变，W5 未在改动中）。中途 runtime 重启一次（36 组拍摄拍到 obsidian 时中断），obsidian 深色 3 张与 obsidian 浅色工作台/设置 2 张已补拍，状态检查用全量复核补回（见下）。

### D1. 全量 tsc / eslint / vitest / 构建

- `npx tsc --noEmit` ✅ 0 错误（验证前与 blue 清扫后各一次，第二次含 W5 进行中的 `app-workbench.tsx`，同样 0 错误）。
- `npx eslint`（主题切换器 15 个改动文件）0 错误、1 warning（既存 `app-workbench.tsx:865 <img>`）；blue 清扫后 14 个文件 0 错误 0 警告 ✅。
- `npx vitest run` 全量：103 文件通过，**876 通过 / 4 跳过**（基线 869 + themes 7 个；4 跳过不变）✅。
- 生产构建 `node node_modules/next/dist/bin/next build` ✅ exit 0（两次：验证用 `3ejKmeUKrl3zzdQA96bpr`；清扫后 `IbBWO2FmOnqIC6tMRi0Um`）。

### D2. 36 组截图（六套 × 浅/深 × 首页 + 工作台新任务页 + 设置页）

- 拍摄脚本 `~/workspace/frontend-polish-evidence/theme-switcher/shot-w4.mjs`（+ 补拍 `/tmp/w4-resume.mjs`、`/tmp/w4-retake-obsidian-light.mjs`）；证据同目录 `w4-{home,workbench,settings}-{ink,pine,terra,graphite,wine,obsidian}-{light,dark}.png` 共 36 张，另有三张总览 `w4-sheet-{home,workbench,settings}.png` 与状态记录 `w4-36shots.json`。
- 数值核对：12 组 ×（首页 + 工作台）共 24 项 `data-theme` / `.dark` / body 背景色与 proposal A 节逐字一致，全部 PASS（记录于 `w4-36shots.json`；如 ink 浅 `rgb(244,238,224)`、wine 深 `rgb(24,15,19)`、obsidian 深 primary `#c9a96a`、gold `#e3c98c`）。
- 肉眼核对：36 张逐张看过（总览图 + 全尺寸抽查：工作台 ink 浅 / obsidian 深、首页 wine 深、设置总览、新任务标题裁切 ×3）。背景、主按钮、点缀色、卡片、文字均与 A 节一致：hero「一场群聊」点缀词按主题 accent 走（ink 朱砂、pine/terra/graphite/wine/obsidian 金系）；主按钮按 primary 走（wine 深粉红、obsidian 深金）；设置页外观分区 6 张卡片色带 + 选中 ring + 打勾与预置主题一一对应；深色 hero 网格与分区光晕可见，无蓝白闪烁。**36/36 通过。**
- 两点说明：① ink 浅新任务标题「组一支队」呈深色不是 bug——该 span 走 `text-[var(--agenthub-accent)]`，而 `--agenthub-accent` = primary（proposal 映射表），ink 浅 primary `#2c2822` 本就是深色；wine 浅同位置呈酒红、obsidian 深呈金色，均与 token 一致。② **新任务页 12 组已过期**：W5 同轮改了 `app-workbench.tsx`（输入框改宽到 16px 边距 + textarea 自动增高），W4 的 `w4-workbench-*.png` 仅作改前基线；**新任务页验证证据见 W5（`w5-*.png`、`shot-w5.mjs`）**。首页与设置页 24 组不受影响，仍有效。

### D3. 默认与持久化、无闪烁

- 默认：清 localStorage 后首次打开，浅色系统 → ink 浅（`rgb(244,238,224)`，`stored: null`）；深色系统 → ink 深（`rgb(22,20,15)`），均 PASS；截图 `w4-default-{light,dark}.png`。
- 持久化：首页下拉菜单切 wine + 深色 → `data-theme=wine`、`stored=wine`、`.dark`；刷新后保持，PASS（W2 在 3103 上同法验证过，本轮在新构建上重验）。
- 无闪烁：预置 `agenthub-theme=wine` + 深色系统。served HTML 里确认有同步内联脚本 `<script id="agenthub-theme-init">`（读 localStorage，非法/无值 → `ink`，先于 next-themes 脚本执行）。rAF 逐帧采样（`addInitScript` 在首帧前装采样器，76 帧）：**唯一绘制状态就是 wine 深色 `rgb(24,15,19)`**，从第一帧起即是，无任何浅色/蓝白帧；`domcontentloaded` 时截图 `w4-noflash-early.png` 同为酒红深色。结论：无闪烁。
- 测量教训（记下以免后人误判）：① `waitUntil: 'commit'` 后立即读到的 `data-theme: null`、透明背景是解析尚未开始，不是闪烁；② `domcontentloaded` 后立即 `evaluate` 读到的 body 背景曾为 wine 浅色而 `--background` 已是深色值——同一 evaluate 内 custom property 与 body 背景不一致，是该慢速 VM 上 headless 样式重算滞后造成的测量伪影，rAF 帧采样（即实际绘制内容）为准。

### D4. 移动端 390px 与对话框抽查

- 移动端 390px：首页与工作台各切到 pine（下拉菜单），`scrollWidth 390 = innerWidth`，无横向溢出，不断裂；截图 `w4-mobile-390-{home,workbench}-pine.png`。
- 对话框 0 溢出（第三轮成果不回归）：设置（1366×768：top 17 / bottom 751；1920×1080：166 / 914）、创建团队（1366：182 / 586；1920：338 / 742）、创建团队→手动详细创建（第三轮曾溢出的变体；1366：28 / 740，之前 footer 被切 4px，现已贴合；1920：184 / 896）、创建 Agent（1366：225 / 543；1920：381 / 699）。6 项全部 PASS，截图 `w4-dialog-{createteam,createteam-manual,createagent}-{1366,1920}.png`。
- 探查插曲：导航文案是「Agent 库」（带空格），统一创建弹窗的选择项是「单个 Agent」/「Agent 团队」（非「创建团队」）；正确路径：Agent 库 → 创建 → 统一弹窗 → Agent 团队 / 单个 Agent。

### D5. 注册表与 CSS token 逐项核对（独立复核，脚本 `/tmp/w4-verify-tokens.mjs`）

- 144 字段：**133 个与 proposal A1–A6 逐字一致，11 个为对比度调整且与 PROGRESS 表格逐项一致，0 问题。**
- 11 处调整复核：浅色 muted 五套（ink `#756c5c→#6f6757`、terra `#84705f→#776556`、graphite `#6d6a63→#68655e`、wine `#7d6871→#77636b`、obsidian `#776e5b→#716956`）均为同色系加深，未跳色；浅色 accentInk 四套（pine `#fff8e8→#221806`、graphite `#fff8e6→#241703`、wine `#fff9ec→#171006`、obsidian `#fffaf0→#1d1603`）均为同系暖深棕；ink 深 accentInk `#fff3e6→#1d0d06` 暖黑；wine 深 primaryInk `#fff2ea→#050203` 最深暖黑。调整值均在各自主题色系内。
- 对比度重算（调整后值）：48 项全部 ≥ 4.5:1，最薄两处为 pine 浅 muted/bg 4.54 与 wine 深 primaryInk/primary 4.58（与 W1 表一致）；任务点名的四处原值即达标未动（obsidian 深 muted 6.65、wine 深 muted 6.77、terra 深 primary 5.28、pine 深 primary 5.36）。
- `src/lib/themes.ts` 卡片 5 色 × 6 套与 proposal 浅色版逐项一致（6/6 OK）。

### D6. 全仓五值 hex grep 核对

- `src/` 内（大小写不敏感）：`#2F5FD0` / `#3370FF` / `#244FB3` / `#60A5FA` 均为 0 处；`#C9A96A` 15 处，全部有据可查——① `globals.css` 6 处是曜石黑金**深色 primary 本身**（proposal A6 定值：`--primary/--ring/--chart-1/--sidebar-primary/--sidebar-ring/--agenthub-accent`）；② `demo-seed.ts` 9 处是内容色（设计指南文档 2 处、web_app 产物内联 HTML 6 处、回放对话 1 处）。结论：**非 token / 非内容色用法 0 处**。
- 全仓（除 `node_modules/.next/.git`）另有三处非 `src/` 命中，未动，记为发现而非残留：① `docs/images/architecture.svg` 多处 `#2F5FD0`（静态架构图资产，非运行时 UI）；② `specs/09-frontend-architecture.md:318`  prose 提及 `--primary`（字节蓝 `#3370FF`，文档描述已过时）；③ `apps/mobile/index.html` 的 `theme-color #3370FF` 与 `apps/mobile/src/styles/tokens.css:30 --accent: #3370ff`（Capacitor 壳，proposal 明确不改移动端壳）。

### D7. 收尾小改 1 — 浅色 blue-*/sky-* 清扫（`app-workbench.tsx` 除外，归 W5）

- 清扫前全仓（除 `app-workbench.tsx`，该文件 W3 已清完、grep 0 处）共 133 处。逐处按语义定去留，脚本 `/tmp/w4-blue-sweep.mjs`（逐项断言命中数）执行 **57 处替换、14 个文件**：
  - `agent-run-debug-board.tsx`（17）：筛选器 active、run 节点边框、info tone 边框/光晕、运行中脉冲环、当前步骤高亮与「当前」徽章、工具盒、info/running 状态徽章、自动滚动开态、两处 hover、序号圆、两处卡片边框 → 全部走 accent 系（info 按 proposal D 节「信息色走 primary」；`shadow-[0_0_0_4px_color-mix(in_srgb,var(--agenthub-accent)_10%,transparent)]` 与 `hover:bg-[color-mix(..._20%...)]` 两个新 arbitrary 值已在构建产物 CSS 中验到生成）。
  - `automation-workspace.tsx`（14 + 补 1 个保存按钮）：任务详情弹窗边框/图标块/两处 chips、立即运行 CTA、保存 CTA（两处 sky-600 主按钮均改 `bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--agenthub-accent-hover)]`）、运行行 dot/chip/文字、最新徽章、enabled 状态 dot/text/ring/chip、两处文字链接。
  - `analytics-workspace.tsx`（2）：运行中徽章、运行动态连接线（圆点本身 W1 已是 accent，线改 accent-border 对齐）。
  - `message-parts.tsx`（5）：部署就绪卡片 ×2（ready 态走 accent，失败红态不动）+ 火箭图标 ×2 + 预览链接。
  - `information-center-workspace.tsx`（3）：info 级 tint、未读行高亮、info 级 chip。
  - `experience-*`（9）：StatCard 默认 iconBg 与 sparkline 颜色、卡片/详情/侧栏的 experience 徽章与 iconBg、详情 Run 徽章、经验库 StatCard 调用处。
  - `workspace-memory-button.tsx`（2）：active 卡片边框/底、Pin 图标；`create-team-dialog.tsx`（1）：modality 徽章；`workbench-detail-primitives.tsx`（1）：highlight 卡片；`sidebar.tsx`（1）：归档按钮 hover 色。
- 保留 71 处（均已逐项定性，理由如下，改动它们会破坏既有设计而非去蓝白残留）：
  - 多色调色板里的一员（单改蓝色会撞色/失辨识）：文件类型图标色 `file-explorer-panel.tsx` 22 处；能力中心 kind 色（skill 紫 / mcp_server 蓝 / resource 琥珀）7 处；分析页 KPI tone 蓝 1 处；自动化 stat tone / 图标 tone / 分类 chip 哈希色 / 触发器 tone 8 处；Agent 库 daily/docs 分类色 4 处；通知 task 分类色 3 处；产物类型色板（sky/emerald/amber/violet 四套同构）与封面渐变/代码高亮/骨架 11 处；信息中心 task 分类点与 info 级 severity 条 2 处；调试板终端路径/READ 语法色 2 处；agent-avatar / agent-catalog 各 1 处。
  - 深色专用：`globals.css` 9 处 `.dark :where(...)` remap（深色已走 primary，不动）。
- 清扫后重验：`npx tsc --noEmit` ✅ 0 错误；eslint 14 文件 0 错误 0 警告；生产构建 ✅ exit 0（BUILD_ID `IbBWO2FmOnqIC6tMRi0Um`）；构建产物 CSS 含两处新 color-mix 规则 ✅；淡蓝审计（探针元素取参考色再比对，Chromium 以 lab() 序列化，勿用 rgb 字面量比）：信息中心 0 处；自动化 2 处，均为保留项（启用任务 stat tile `bg-sky-50`、newspaper 图标块 `bg-sky-100`）。截图 `w4-postsweep-automation-ink-light.png`、`w4-postsweep-infocenter-ink-light.png`（肉眼确认：新建自动化按钮已是 primary 深色，无淡蓝底残留）。

### D8. 收尾小改 2 — `#3E7CB1`（只写建议，未动手）

- 现状：`src/components/app-workbench.tsx:1096` `RECENT_TEAM_COLORS = ['var(--agenthub-accent)', '#3E7CB1', 'var(--agenthub-gold)']`，按团队下标轮换，三色分别是 accent、钢蓝、金。W5 已确认本文件 `blue-*` grep 0 处、`#3E7CB1` 未动、留 W4 定夺；按最新协调本文件冻结，W4 未动手。
- **建议：留作内容色例外，不换。**理由：① 它是「团队身份色」（按团队轮换，与头像字同组的区分色），不是 UI chrome——同数组另两项恰好是主题的两套身份色（accent/gold），钢蓝是第三个身份色；② 无可用 token：不新造 token 的前提下，候选只有语义色（success/warning/error/chart），挪用会错标语义，且会在部分主题撞 accent（pine 的绿、terra 的橙）；③ 与清扫中保留的多色身份色板同理（文件类型色、kind 色、产物类型色）。工作台截图上它表现为最近团队行里一个蓝色头像圆，与另两枚 accent/gold 头像并列，读作「三个团队各一色」，不是蓝白主题残留。
- 若用户日后仍觉得刺眼，可选方案（需用户定，不在本次做）：把三色数组收敛为两色轮换（accent/gold 交替），或新增一个主题无关的中性身份色（需开 token，不建议为一枚头像做）。

### 遗留问题（W4）

- `public/images/app-screenshot.png` 仍是旧蓝白工作台（第三轮遗留，任务明确不要重拍，等用户定）。
- wine 深 primaryInk `#050203` 对比度 4.58:1，余量最薄（W1 遗留；该主色上任何文字色最高只有 4.66:1，动 primary 需用户定夺）。
- 新任务页 12 组截图因 W5 改动过期，验证证据以 W5 为准（见 D2②）。
- 全仓 grep 的三处非 `src/` 命中（docs 架构图、specs prose、apps/mobile）未动，见 D6。
- 3104 验证服务已停；工作树仍未提交、未推送、未部署（HEAD 9618684）。

## W6 — 新建任务页背景（方案一：淡网格 + 柔光）（已完成，2026-11-18 ~16:05–16:35）

### 方案选择：网格用 38px color-mix 直线网格，不用 `--agenthub-pattern`
- 原因：六套主题浅色版的 `--agenthub-pattern` 是**圆点阵**（`radial-gradient(circle at 1px 1px, …)`），不是 mock 的直线网格；深色版虽是 1px 直线但仅约 5% alpha 且无固定格距（/home 处配 48px）。38px 直线网格按每主题 `--primary` 走，与 mock 几何（38px × 38px、1px 线）逐字一致，切主题时背景跟着换。决定以截图效果定：浅/深 × ink/wine 六张实拍均见清晰直线网格、向外渐隐。
- **7%/9% 的决定**：落地按 mock 代码值——**浅色 7%、深色 9%**，不取说明卡文字的“各主题主色 7%”（与 /home 深色网格更清楚的结论一致）。两个值各由一个 `dark:` 切换的独立层承载（浅 `dark:hidden`、深 `hidden dark:block`），非条件样式。

### 柔光实测定位
- 实测（Playwright，1366 与 1920 一致，顶部锚定布局）：composer 顶 220.5px、高 244.3px，中心约 342.6px；h1 顶 93px、副文案底 190.7px。640×340 椭圆 `top: 173px`，光心落在输入框中心（173 + 170 = 343）。mock 的 top:120px 是相对其 mock 容器，未采用。
- 柔光：`radial-gradient(closest-side, color-mix(in srgb, var(--agenthub-gold) 28%, transparent), color-mix(in srgb, var(--primary) 12%, transparent) 55%, transparent)`，`filter: blur(28px)`，水平居中（`left-1/2 -translate-x-1/2`），**深浅共用同一团**（与 mock 一致）。

### 改动（只动 `src/components/app-workbench.tsx` 一个文件；`globals.css` 未动）
- 外层滚动容器加 `relative`；首部加三个 `aria-hidden` 背景层（`absolute inset-0 z-0`，网格两层；柔光层 `h-[340px] w-[640px] max-w-full`，窄屏下封顶不横溢），全部 `pointer-events: none`；网格层配 spec 遮罩 `radial-gradient(ellipse 90% 75% at 50% 38%, #000 30%, transparent 78%)`（`maskImage` + `WebkitMaskImage`）。
- 内容容器只加 `relative`、**不设 z-index**：靠 DOM 顺序盖在背景层之上，避免新建 stacking context 困住 composer 内的 fixed 菜单遮罩（团队/产出/更多下拉）。
- 常量就近放在 `RECENT_TEAM_COLORS` 下（`NEWTASK_GRID_MASK` / `NEWTASK_GRID_IMAGE(alpha)` / `NEWTASK_GLOW_TOP = 173` / `NEWTASK_GLOW_BACKGROUND`），附选型与 7%/9% 决定注释；无新依赖、无 `any`。

### 计算样式核验（Chromium 序列化值，与源码逐项一致）
- 浅网格：`color(srgb 0.1725 0.1568 0.1333 / 0.07)`（= ink primary `#2c2822` 7%），`background-size 38px 38px`；深网格同一色值 `/ 0.09`；遮罩 `radial-gradient(90% 75% at 50% 38%, black 30%, transparent 78%)`。
- 柔光：`color(srgb 0.690 0.227 0.149 / 0.28)`（= ink accent `#b03a26` 28%）+ primary 12% @ 55%。注：首次探针的 `grid:false` 是误报——计算样式把 `color-mix` 序列化为 `color(srgb …)`，字面量匹配不到；渲染以截图为准。

### 验证结果（与 W5 的增高/自动增高一起验；私有端口 3106，验证后已停，W4 的 3104 服务未碰）
- `npx tsc --noEmit` ✅ 0 错误；`npx eslint src/components/app-workbench.tsx` 0 错误、1 warning（既存 `:865 <img>`）✅。
- 生产构建 `node node_modules/next/dist/bin/next build` ✅ exit 0（BUILD_ID `1eUnjPcOmJpitzhokMoIS`；构建前确认无其他 `next build` 在跑）。
- Playwright（脚本 `shot-w6.mjs`，测量 `w6-measurements.json`）：空态 + 500 字长文 × 1366×768 / 1920×1080 × 浅/深共 8 张，另加 wine 浅/深 1366 空态 2 张（验证网格跟主题走）。
- 布局与 W5 逐值一致，背景未动布局：空态 textarea 150 / composer 244.3（顶 220.5）/ chips 底 446.7 / CTA 底 442.5 / 团队行底 659.8；500 字 1366 textarea 217.5 / composer 311.8 / chips 底 514.2 / 团队行底 727.3，页面 778/768（+10px，与 W5 基线一致，非本次引入）；1920 长文 textarea 168.4 / composer 262.7，无溢出。**横向溢出 0 处**（六组 `scrollWidth == clientWidth`）。
- 图层切换正确：浅色 7% 层 `display:block`、9% 层 `none`；深色反之；柔光两档均为 `block`、`blur(28px)`、`top:173px`、`z-index:0`、`pointer-events:none`。
- 对比度/喧宾结论：标题、副文案、chips、pills、团队名颜色与字号均未动；网格 7%/9% 与柔光只改变底色约 3–5 个 RGB 级——像素取样：浅色光区 (231,225,211) vs 对照 (236,230,216)；深色光区 (26,23,18) vs 对照 (22,20,15)。肉眼核对 6 张（ink 浅/深空+长、wine 浅/深空、1920 长）：标题/副文案/chips/pills/团队名清晰无损，背景只衬托、不抢内容、不溢出。
- 跟主题走：wine 浅色网格呈酒红 primary、CTA/点缀酒红；wine 深色网格呈亮酒红 primary 9%，与 ink 的墨色网格肉眼可辨不同。
- 截图：`~/workspace/frontend-polish-evidence/theme-switcher/`（`w6-{light,dark}-{1366,1920}-{empty,long}.png` 8 张、`w6-wine-{light,dark}-1366-empty.png` 2 张、`w6-measurements.json`、`shot-w6.mjs`）。

### 遗留问题
- 柔光大部分被不透明的 composer 白卡片遮住，仅上下边缘透出淡淡暖晕——与 mock 一致（光心在输入框中心），本轮按 spec 落地未改。如用户想要更明显的光晕，需把椭圆加宽到 composer（1010px）之外或上移光心，需用户定夺，不在本轮擅自改尺寸。
- 未提交、未推送、未部署（HEAD 9618684）。


## W7：提示词增强移回工具栏（2026-11-18 16:26 后，用户点选）

### 原因
- 原版（HEAD 9618684）工具栏上有直接可见的「增强提示词」按钮；A 方案重构时被收进「更多」菜单，用户在新版里找不到，要求放回工具栏直接可见。

### 改动（只动 `src/components/app-workbench.tsx` 一个文件）
- 工具栏 chips 行新增「增强提示词」chip，位置在「参考图」之后、「更多」之前；顺序实测：Orchestrator / 产出：图文 / 参考图 / 增强提示词 / 更多 / 创建任务。
- chip 样式与其他 toolbar chip 一致（圆角胶囊，Sparkles 图标，文字「增强提示词」，增强中显示「增强中…」+ Spinner）；复用现成 `enhancePrompt` 与 `enhancingPrompt` 状态，disabled 条件不变（`enhancingPrompt || sending || uploading`），title 不变；`PromptEnhanceModal` 接线（`visible={enhanceOpen}`、`onUseEnhanced`）一处不动。
- 「更多」菜单删掉「增强提示词」那一项，只剩「写入审批」；菜单结构未动，照常工作。
- 输入框高度、自动增高、背景、主题切换器等其它东西均未动；未碰其它文件。

### 验证结果（私有端口 3107，验证后已停）
- `npx tsc --noEmit` ✅ 0 错误；`npx eslint src/components/app-workbench.tsx` 0 错误、1 warning（既存 `:865 <img>`）✅。
- 生产构建 `rm -rf .next && npx next build` ✅ exit 0（BUILD_ID `pL958ihKUsbQGCLRImDZD`）。
- Playwright（脚本 `shot-w7.mjs`，测量 `w7-measurements.json`）：1366×768 浅/深各一组。chip 实测 `x=707, y=405.8, 107×33`，visible 且在视口内，未 disabled；点开「更多」后菜单只剩一项「写入审批 Review」。
- 截图：`~/workspace/frontend-polish-evidence/theme-switcher/`（`w7-enhance-toolbar-{light,dark}-1366.png`、`w7-more-menu-{light,dark}-1366.png`、`w7-measurements.json`、`shot-w7.mjs`）。
- 未提交、未推送、未部署（HEAD 9618684）。
