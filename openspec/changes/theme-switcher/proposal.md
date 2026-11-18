# 主题切换器：六套主题全都要，默认水墨宣纸（theme-switcher）

## Why

2026-11-18 下午用户在看预览时说：想要点其他的风格主题，不要蓝白。效果图（artifact `qian-duan-zhu-ti-feng-ge-fang-an`，已 inspect 核验）给了六套非蓝白主题；用户随即拍板：**六套全都要，做成可切换的主题，默认水墨宣纸**。

现状是单主题：工程蓝主色（亮 `#2F5FD0` / 暗 `#60A5FA`）+ 金 `#C9A96A` 四处点缀，明暗只靠 next-themes 的 `.dark` class 一档切换。六套主题要求两件事同时成立：

1. **主题轴**（6 套：水墨宣纸 / 松柏深绿 / 陶土暖阳 / 石墨琥珀 / 勃艮第酒红 / 曜石黑金）× **明暗轴**（浅 / 深）= 12 套 token，全部落地，色值严格按效果图。
2. **默认水墨宣纸、无闪烁**：无已存偏好时首次打开就是水墨宣纸，不能先闪一下蓝白再切。

## 已确认的决策（2026-11-18，用户已定）

1. 六套主题全都要，可切换；默认水墨宣纸。
2. 不再保留工程蓝单主题——frontend-polish 提案“工程蓝为主、金四处点缀”的决定**被本主题体系取代**（蓝只在旧版里存在，新版六套里没有蓝主色）。“点缀色四处”的机制保留，点缀色改按每套主题的 accent 走。
3. Noto Serif SC 标题保持。
4. 切换入口：设置页完整选择 + 首页/工作台快捷入口（不登录也能在首页试主题）。
5. 选择持久化，刷新、重进都保持。
6. 本轮主线是主题切换器；新建任务页输入框改宽（用户 2026-11-18 ~14:58 追加）同轮做，不让主题工作停下。

## What Changes

### A. Token 体系：12 套 token（`globals.css`）

效果图 THEMES 数组逐字抄录（hex 小写与源码一致；`pattern` / `soft` / `bgfx` 三字段原样保留，不可只取 5 色卡片色）。

机制：明暗继续走 next-themes 的 `.dark` class；主题走 `data-theme` 属性（值 `ink | pine | terra | graphite | wine | obsidian`）。`:root`（无属性时）= ink 浅色、`.dark`（无属性时）= ink 深色——即默认水墨宣纸，不依赖 JS 也能首屏正确。各主题块为 `:root[data-theme="<id>"]`（浅）与 `:root[data-theme="<id>"].dark`（深）。

字段映射（效果图 12 字段 → 产品 token）：

| 效果图字段 | 产品 token |
|---|---|
| `bg` | `--background` |
| `surface` | `--card`、`--popover`、`--agenthub-surface`、`--secondary` |
| `ink` | `--foreground`、`--card-foreground`、`--popover-foreground`、`--agenthub-text`、`--secondary-foreground`、`--sidebar-foreground` |
| `muted` | `--muted-foreground`、图表 `--chart-5` |
| `primary` | `--primary`、`--agenthub-accent`、`--ring`、`--sidebar-primary`、`--sidebar-ring`、图表 `--chart-1` |
| `primaryInk` | `--primary-foreground`、`--sidebar-primary-foreground` |
| `accent` | `--agenthub-gold`（点缀色角色：沿用旧变量名、旧四处位置，值按主题走）、`--agenthub-gold-soft`（accent 12% alpha）、`--agenthub-gold-border`（accent 40% alpha） |
| `accentInk` | accent 做底色时的文字色（按需使用） |
| `line` | `--border`、`--input`、`--agenthub-border`、`--sidebar-border` |
| `pattern` | `--agenthub-pattern`（hero 网格/圆点背景图，见 D 节） |
| `soft` | `--agenthub-soft`（柔和渐变底，数字证明条等） |
| `bgfx` | 效果图层不透明度系数（浅 .5 / 深 .8 / 石墨·曜石深 .85），pattern 与光晕按此缩放 |

其余 token 按规则派生（不新发明 hex，用 `color-mix`）：

- `--agenthub-surface-muted`：浅色 = bg 向 ink 混 4%；深色 = bg 本身（与现行深色一致）。
- `--agenthub-surface-raised`：浅色 = surface；深色 = surface 向 ink 混 8%。
- `--agenthub-surface-sunken`：浅色 = bg 向 ink 混 4%；深色 = bg 向 ink 混 6%。
- `--agenthub-accent-hover`：浅色 = primary 向 black 混 12%；深色 = primary 向 white 混 18%。
- `--agenthub-accent-soft` = primary 12% alpha；`--agenthub-accent-border` = primary 24% alpha（沿用现行 alpha）。
- shadcn `--accent` = primary 10% alpha，`--accent-foreground` = ink；`--muted` = surface-muted。
- `--sidebar` = surface；`--sidebar-accent` = accent-soft；标题栏 token（`--agenthub-titlebar-*`）按 surface / ink / line 同规则映射。
- 阴影三档沿用现行中性定义，不随主题改。

#### A1. 水墨宣纸 `ink`（INK & RICE PAPER；默认；tag：与答辩 PPT 同源；气质：东方文人 · 宣纸底 · 朱砂印）

- 浅：bg `#f4eee0`、surface `#fbf8ef`、ink `#26221b`、muted `#756c5c`、primary `#2c2822`、primaryInk `#f5efdf`、accent `#b03a26`、accentInk `#fff6ec`、line `#ddd2ba`、pattern `radial-gradient(circle at 1px 1px, rgba(60,50,30,.16) 1px, transparent 0)`、soft `linear-gradient(135deg,#e9dfc6,#f4eee0)`、bgfx `.5`
- 深：bg `#16140f`、surface `#201d17`、ink `#ece4d0`、muted `#a2987f`、primary `#e6dcc2`、primaryInk `#26221b`、accent `#cf5a3c`、accentInk `#fff3e6`、line `#3a352a`、pattern `linear-gradient(rgba(236,228,208,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(236,228,208,.05) 1px, transparent 1px)`、soft `linear-gradient(135deg,#2a251c,#1c1a14)`、bgfx `.8`
- 适合：答辩现场投屏、工作台、官网成套出现时，评委一眼能把产品和你的 PPT 对上号。
- 注意：宣纸黄底要控制饱和，太黄会显旧；图表配色需单独定一套，不能直接套朱砂。

#### A2. 松柏深绿 `pine`（PINE & JADE；气质：沉稳 · 护眼 · 玉色点缀）

- 浅：bg `#eef2e8`、surface `#fafcf5`、ink `#1e2a21`、muted `#5f7263`、primary `#1e5c3a`、primaryInk `#f2f8ee`、accent `#b98a2e`、accentInk `#fff8e8`、line `#d3ddc9`、pattern `radial-gradient(circle at 1px 1px, rgba(30,80,50,.13) 1px, transparent 0)`、soft `linear-gradient(135deg,#d8e5cd,#eef2e8)`、bgfx `.5`
- 深：bg `#10160f`、surface `#182117`、ink `#e2ecdc`、muted `#93a88f`、primary `#3f9e66`、primaryInk `#0e1a10`、accent `#cfa14e`、accentInk `#221806`、line `#2b3a2a`、pattern `linear-gradient(rgba(226,236,220,.045) 1px, transparent 1px), linear-gradient(90deg, rgba(226,236,220,.045) 1px, transparent 1px)`、soft `linear-gradient(135deg,#22301f,#141c12)`、bgfx `.8`
- 适合：日常高频使用的工作台、需要显得专业可靠的简历项目截图。
- 注意：绿用深了容易显「政务系统」，卡片底要留够白、玉色要透气。

#### A3. 陶土暖阳 `terra`（TERRACOTTA；气质：暖 · 手作感 · 内容气息）

- 浅：bg `#f6ede2`、surface `#fdf8f1`、ink `#33241a`、muted `#84705f`、primary `#b5502a`、primaryInk `#fff5ea`、accent `#8a6d1f`、accentInk `#fffbef`、line `#e7d6c2`、pattern `radial-gradient(circle at 1px 1px, rgba(150,80,40,.13) 1px, transparent 0)`、soft `linear-gradient(135deg,#f0dcc4,#f6ede2)`、bgfx `.5`
- 深：bg `#1a120c`、surface `#251a11`、ink `#f2e4d2`、muted `#b0947d`、primary `#d0713f`、primaryInk `#241105`、accent `#d9b45c`、accentInk `#241a02`、line `#40301f`、pattern `linear-gradient(rgba(242,228,210,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(242,228,210,.05) 1px, transparent 1px)`、soft `linear-gradient(135deg,#33220f,#20150b)`、bgfx `.8`
- 适合：官网首页、演示案例页、对外分享的截图——温度最高的一套。
- 注意：暖橙面积大了会显「餐饮风」，主按钮之外的橙要收着用；深色版要压暗避免荧光感。

#### A4. 石墨琥珀 `graphite`（GRAPHITE & AMBER；气质：深色优先 · 工程师气质 · 高对比）

- 浅：bg `#eceae6`、surface `#f7f6f3`、ink `#232220`、muted `#6d6a63`、primary `#33312d`、primaryInk `#f5f2ea`、accent `#b97a14`、accentInk `#fff8e6`、line `#d8d4cc`、pattern `radial-gradient(circle at 1px 1px, rgba(40,38,34,.14) 1px, transparent 0)`、soft `linear-gradient(135deg,#ddd9d0,#eceae6)`、bgfx `.5`
- 深：bg `#121211`、surface `#1c1c1a`、ink `#eceade`、muted `#9d9a8e`、primary `#e8e4d8`、primaryInk `#1c1c1a`、accent `#e39a1e`、accentInk `#241703`、line `#33322e`、pattern `linear-gradient(rgba(236,234,222,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(236,234,222,.05) 1px, transparent 1px)`、soft `linear-gradient(135deg,#26261f,#171714)`、bgfx `.85`
- 适合：深色模式主场、答辩投屏演示、偏技术向的受众。
- 注意：浅色版个性会弱一截，接近普通灰；琥珀和「警告黄」接近，报错色要另选红（见 D 节）。

#### A5. 勃艮第酒红 `wine`（BURGUNDY；气质：高级感 · 象牙白 · 古铜）

- 浅：bg `#f5eee7`、surface `#fcf8f3`、ink `#33202a`、muted `#7d6871`、primary `#7c2233`、primaryInk `#fdf3ec`、accent `#a4762a`、accentInk `#fff9ec`、line `#e5d5cc`、pattern `radial-gradient(circle at 1px 1px, rgba(124,34,51,.11) 1px, transparent 0)`、soft `linear-gradient(135deg,#eed9d2,#f5eee7)`、bgfx `.5`
- 深：bg `#180f13`、surface `#231419`、ink `#f0e2da`、muted `#b0949c`、primary `#c0526a`、primaryInk `#fff2ea`、accent `#c99b4a`、accentInk `#241703`、line `#3d2730`、pattern `linear-gradient(rgba(240,226,218,.045) 1px, transparent 1px), linear-gradient(90deg, rgba(240,226,218,.045) 1px, transparent 1px)`、soft `linear-gradient(135deg,#30181f,#1d1015)`、bgfx `.8`
- 适合：官网和作品集展示页——当它是个「作品」而不是「工具」时最出彩。
- 注意：工作台长时间使用容易腻；酒红和错误红接近，状态色体系要重做（见 D 节）。

#### A6. 曜石黑金 `obsidian`（OBSIDIAN & GOLD；气质：黑金 · 发布会气质 · 冲击力）

- 浅：bg `#f3efe6`、surface `#fbf9f3`、ink `#221d13`、muted `#776e5b`、primary `#262019`、primaryInk `#f3e9cf`、accent `#a37f22`、accentInk `#fffaf0`、line `#e0d7bf`、pattern `radial-gradient(circle at 1px 1px, rgba(120,95,30,.14) 1px, transparent 0)`、soft `linear-gradient(135deg,#e9dfc2,#f3efe6)`、bgfx `.5`
- 深：bg `#0e0d0b`、surface `#171512`、ink `#ede5cf`、muted `#a39677`、primary `#c9a96a`、primaryInk `#1d1708`、accent `#e3c98c`、accentInk `#241b04`、line `#35301f`、pattern `linear-gradient(rgba(237,229,207,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(237,229,207,.05) 1px, transparent 1px)`、soft `linear-gradient(135deg,#2b2413,#161310)`、bgfx `.85`
- 适合：答辩开场页、官网首屏、演示高潮段——需要「镇住场子」的场合。
- 注意：浅色版只能做成米白＋金，黑金感会打折；金色用多立刻显土，必须严控面积。

### B. 防闪烁与持久化

- `localStorage` 键 `agenthub-theme`，值 6 个 id 之一；非法值 → `ink`。
- `layout.tsx` 的 `<head>` 里放一段内联脚本（绘制前执行）：读 `localStorage`，把 `data-theme` 写到 `<html>`；无值或非法 → `ink`。无 JS 时 `:root` 本身就是 ink 浅色，首屏仍正确。
- React 侧：新增 `useThemeChoice`（或并入 `theme-provider.tsx`）——`{ theme, setTheme }`：读 `document.documentElement.dataset.theme` 作初始值（与内联脚本一致，防 hydration mismatch），`setTheme` 同时写 attribute + localStorage + state。明暗仍走 next-themes（`useTheme`，`defaultTheme="system"` 不动）。
- 主题注册表 `src/lib/themes.ts`（单一事实来源）：6 个 id、中文名、英文名、5 色卡片色（bg / surface / primary / accent / ink，浅色版）、`isValidThemeId`、`DEFAULT_THEME = 'ink'`、`THEME_STORAGE_KEY`。CSS 与 TS 注册表互相核对（验证员逐项对值）。
- 切换即时生效（整站 CSS 变量切换，无需刷新）；刷新、重进保持。

### C. 切换器 UI

- 设置页：`settings-dialog.tsx` 的 `SETTINGS_SECTIONS` 新增「外观」分区，放第一位。内容：6 张主题卡（5 色色带 + 中文名 + 英文名 + 一行描述 + 适合场景一句），选中态 ring；下方明暗三段切换（浅色 / 深色 / 跟随系统，走 next-themes）。
- 快捷入口：`ThemeToggle`（`theme-toggle.tsx`）由单按钮改成下拉菜单——触发仍是 Sun/Moon 图标按钮；菜单分两段：6 个主题（色点 + 名 + 当前打勾）与明暗（浅色 / 深色 / 跟随系统）。复用 `ui/dropdown-menu`（如无则用现有 popover 模式，不新引依赖）。首页（`home-header.tsx`）与工作台的现有 `ThemeToggle` 用法不变，组件内部扩展即全站生效；移动端折叠菜单里同样放得下（首页窄屏与工作台抽屉均验证）。
- `/demo` 无单独入口，跟随主题走（同站 token）。

### D. 语义色、图表与 /home 背景元素

- 错误色：默认浅 `#DC2626` / 深 `#F87171`；`wine` 例外——浅 `#E5484D` / 深 `#FF6B6B`（更亮，与酒红主色拉开）。`graphite` 的错误保持红色（不用琥珀，见 A4 注意点）。
- 警告色：全主题统一橙色系——浅 `#EA580C` / 深 `#FB923C`（与各主题 accent 拉开：琥珀、金、古铜都是黄/金系，橙才能分清）。
- 成功色：全主题翡翠绿——浅 `#059669` / 深 `#34D399`。
- 信息色：走 primary。
- 图表 `--chart-1..5`：1 = primary；2 = `#34D399`；3 = accent，但 accent 为琥珀/金系时（pine、graphite、obsidian）改青色 `#2DD4BF`；4 = 错误红；5 = muted 灰。
- 对比度：每套主题逐项实测 ink/muted on bg、primaryInk on primary、accentInk on accent，要求正文 ≥ 4.5:1。重点盯：obsidian 深 muted `#a39677` on `#0e0d0b`、wine 深 muted `#b0949c` on `#180f13`、terra 深 primary `#d0713f` 配 primaryInk `#241105`、pine 深 primary `#3f9e66` 配 primaryInk `#0e1a10`。不达标只调 Ink/muted 一侧，调完记进 PROGRESS。
- /home 深色背景元素（第三轮 globals.css 约 861–914 行，写死的 `rgba(96,165,250,…)` 蓝光晕/网格）全部改走 token：网格用 `var(--agenthub-pattern)`，光晕用 `color-mix(in srgb, var(--primary) …, transparent)` 并按 `bgfx` 缩放；浅色零改动（第三轮结论不变）。
- 点缀色四处（hero「一场群聊」、关键数字、/demo 产物链点亮、结尾 CTA 标记）继续用 `--agenthub-gold`，值随主题走；不新增第五处。

### E. 硬编码清扫

- 现存硬编码蓝/金 hex 全仓扫为 token：`#2F5FD0` 39 处、`#3370FF` 4 处、`#C9A96A` 3 处、`#244FB3` 2 处、`#60A5FA` 1 处（2026-11-18 实测数）。涉及文件：`demo-showcase.tsx`、`agent-workspace.tsx`、`analytics-workspace.tsx`、`capability-center-workspace.tsx`、`home-download.tsx`、`home-sections.tsx`、`pending-write-diff-tab.tsx`、`selection-popover.tsx`、`usage-badge.tsx`、`app-workbench.tsx`、`demo-seed.ts`。其中 `demo-seed.ts` 的色值如属回放数据内容色（产物封面等）则逐项判断——UI  chrome 走 token，内容色保留并注明。
- 清扫后全仓 grep 上述 hex 残留 0 处；第三轮刚清掉的 19 处冷色 fallback 不得复发。

### F. 新建任务页输入框改宽（用户 2026-11-18 ~14:58 追加，同轮做）

- 先量尺寸再改，不凭感觉：(a) `git show HEAD:src/components/app-workbench.tsx`（9618684 原版）里输入框容器的宽度、居中方式、与标题的间距；(b) A 改版前最近的单列版——证据截图 `~/workspace/frontend-polish-evidence/phase5-round2/workbench-light-round2.png` 与 `~/workspace/frontend-polish-evidence/before-after/workbench-newtask-compare.png` 的改后侧，量输入框在 1366×768 下的实际像素宽与左右边距；(c) 现 A 版是 660px 居中。改的目标以 (b) 为准（用户今天上午一直在看的就是那版），(a) 作交叉核对。
- 改法：把 composer 容器放宽到原版的位置与尺寸（居中宽度、左右边距、与标题的间距都对齐原版）；A 方案的视觉语言保留（衬线标题、金色描边、chips、示例 pills、最近团队行、lucide 图标）；不要恢复已删的截图 figure；不要动输入框本身的功能（粘贴上传、提示词增强、附件、审批模式、最近对话列表）。
- 与主题 token 改动同文件（`app-workbench.tsx`）时串行做，不互相覆盖。
- 验证：1366×768 与 1920×1080 浅/深截图，与原版截图并排核对输入框位置与尺寸一致；tsc/eslint/构建照常。

### G. 验收标准

- 六套 × 浅/深 ×（首页 + 工作台新任务页 + 设置页）逐一截图，配色与 A 节表逐项一致。
- 默认：清掉 localStorage 后首次打开是水墨宣纸（浅/深跟随系统）；切主题后刷新保持；无蓝白闪烁（Playwright 预置 localStorage 后首屏即对应主题色）。
- 移动端（390px）能切主题、不断裂、无溢出。
- 全量 tsc / eslint（改动文件）/ vitest（基线 869 通过 / 4 跳过）/ 生产构建全绿；新增 `themes.test.ts`（注册表：id 合法、默认 ink、非法值回退）。
- 不改功能、API、SSE、DB、鉴权、终端、沙箱；不破坏第三轮成果（对话框溢出修复、新任务页 A 方案、深色 /home 背景元素）。

## Capabilities

### Modified Capabilities

- `frontend`: 六套主题 SHALL 全部可用，每套含浅色与深色两档；默认主题 SHALL 是水墨宣纸；无已存偏好时首次打开 SHALL 直接是水墨宣纸，不闪蓝白。
- `frontend`: 主题选择 SHALL 持久化（localStorage），刷新与重进 SHALL 保持。
- `frontend`: 设置页 SHALL 有完整主题选择（六套卡片 + 浅/深切换）；首页与工作台 SHALL 有主题快捷入口。
- `frontend`: 全站 SHALL 跟随主题走（/home、/demo、工作台、次要界面），不得残留硬编码蓝/金 hex。
- `frontend`: 点缀色 SHALL 只出现在约定的四处，值随主题 accent 走；Noto Serif SC 标题 SHALL 保持。
- `frontend`: 每套主题的正文对比度 SHALL ≥ 4.5:1。

## Impact

- `src/app/globals.css`：12 套 token、pattern/soft/bgfx、/home 背景元素 token 化。
- `src/app/layout.tsx`：内联防闪脚本。
- 新增 `src/lib/themes.ts`（注册表）与 `themes.test.ts`；`src/components/theme-provider.tsx`（或新增 hook）管主题状态。
- `src/components/theme-toggle.tsx`：下拉菜单；`src/components/settings-dialog.tsx`：新增「外观」分区；`home-header.tsx` 用法不变（组件内扩展）。
- `src/components/app-workbench.tsx`：输入框改宽（F 节）+ 其硬编码色扫 token。
- 其余硬编码色文件（见 E 节）。
- 不改：任何功能逻辑、API、SSE 事件、DB schema、鉴权、沙箱、终端；不改移动端 Capacitor 壳；不改 logo。

## 已确认（2026-11-18，用户决定）

1. 六套主题全都要，做成可切换的主题，默认水墨宣纸。
2. 工程蓝单主题被主题体系取代；点缀四处机制保留，值随主题走。
3. 切换入口：设置页完整选择 + 首页/工作台快捷入口。
4. 选择持久化（localStorage）。
5. 实施前置：先写本 OpenSpec（用户已确认方向，写完直接实施，不用再批一次）。
