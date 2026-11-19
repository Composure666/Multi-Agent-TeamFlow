# 白色主题（white-themes）— 实施记录

## 概览

- 用户 2026-11-18 ~20:48 提出加一套白色主题并设为默认，~20:58 在三套白色效果图里选了 1、2、3（白·石墨 / 白·工程蓝 / 白·水墨），删除石墨琥珀 / 松柏深绿 / 曜石黑金，默认改为白·石墨。
- OpenSpec：`openspec/changes/white-themes/proposal.md` + `tasks.md`（13 项已全部打勾）。
- 分工：W1 注册表 + CSS token + 默认 + 回落 + 测试 + 对比度；W2 切换器 UI + 全仓清理；W3 最终统一验证 + 本记录。
- 铁律：未 commit、未 push、未部署；只改工作树；HEAD 仍为 `c383a4a`（deploy #6 上线内容）。

## W1 — 注册表 + CSS token + 默认 + 回落 + 测试 + 对比度（已完成）

### 注册表（`src/lib/themes.ts`）

- `THEME_IDS` 改为 `['ink', 'terra', 'wine', 'white-graphite', 'white-blue', 'white-ink']`（保留三套在前，新三套在后）；`DEFAULT_THEME` 改为 `'white-graphite'`（注释同步）；`THEME_STORAGE_KEY` 仍为 `'agenthub-theme'`，不动。
- 三套新卡片 5 色（浅色版，提案 B 节逐字）：白·石墨 `#ffffff / #fafafa / #33312d / #b97a14 / #232220`；白·工程蓝 `#ffffff / #f7f9fd / #2f5fd0 / #a37f22 / #17181c`；白·水墨 `#ffffff / #fbfaf7 / #2c2822 / #b03a26 / #26221b`。
- `isValidThemeId('graphite' | 'pine' | 'obsidian')` 为 false（注册表移除即满足），`resolveThemeId` 非法值一律回落到新默认。

### CSS（`src/app/globals.css`）

- 删 graphite / pine / obsidian 浅/深 6 个块；新增 white-graphite / white-blue / white-ink 浅/深 6 个块（`:root[data-theme="…"]` + `.dark` 各 6 个，行 517–909）。
- 12 字段按提案 A 节照搬；派生 token 一律 color-mix，不新发明 hex；语义色按提案 D 节（错误浅 `#DC2626` / 深 `#F87171`，警告橙浅 `#EA580C` / 深 `#FB923C`，成功翡翠绿浅 `#059669` / 深 `#34D399`）；`--agenthub-gold` = 各主题 accent，`--agenthub-gold-ink` = accentInk（修后值）。
- 图表 `--chart-1..5`：1 = primary；2 = `#34D399`；3 = accent，但金系改青色 `#2DD4BF`——白·石墨浅/深与白·工程蓝浅/深均为 `#2DD4BF`，白·水墨保留朱砂 accent（浅 `#b03a26` / 深 `#cf5a3c`）；4 = 错误红；5 = muted。
- 顶部主题体系注释已同步（6 套 × 2 档、id 列表、默认白·石墨、对比度调整逐项）；`:root` 无 JS 兜底仍为 ink 浅色（已知遗留，不动）。

### 默认与防闪（`src/app/layout.tsx`）

- 防闪内联脚本白名单改为新六套 id，两处 fallback `"graphite"` → `"white-graphite"`（合法值白名单 + catch），注释同步（无 JS 时 `:root` 仍为 ink、有 JS 时脚本在首次绘制前已写白·石墨）。

### 测试（`src/lib/themes.test.ts`，11 个）

- THEME_IDS 断言、默认断言、非法回落断言全部改为新默认；非法值表显式覆盖被删三套（`isValidThemeId` 均为 false 且回落到 white-graphite）；`'blue'` 继续非法；三套新卡片色逐值断言（white-graphite / white-blue / white-ink 各一套 `toEqual`）。
- W1 自验：`npx tsc --noEmit` 0 错误；eslint（改动文件）0 错误；`npx vitest run src/lib/themes.test.ts` 通过。

### 对比度（W1 实测，WCAG 公式；W3 独立重算逐项一致，见下）

提案值初测 24 组里 3 组不达标，全部只调 accentInk 一侧（改暖深棕）；调后 24 组全部 ≥ 4.5:1：

| 主题/明暗 | ink/bg | muted/bg | primaryInk/primary | accentInk/accent |
|---|---|---|---|---|
| 白·石墨 浅 | 15.90 | 5.40 | 11.60 | **4.89**（#fff8e6→#241703） |
| 白·石墨 深 | 15.52 | 6.65 | 13.43 | 7.43 |
| 白·工程蓝 浅 | 17.74 | 5.81 | 5.72 | **4.55**（#fffaf0→#241b04） |
| 白·工程蓝 深 | 15.71 | 7.19 | 7.19 | 7.59 |
| 白·水墨 浅 | 15.82 | 5.18 | 12.76 | 5.65 |
| 白·水墨 深 | 14.53 | 6.43 | 11.59 | **4.66**（#fff3e6→#1d0d06） |

修复表（旧值 → 新值，W3 用同一 WCAG 公式重算旧值核对无误）：

| 位置 | 旧值（实测） | 新值（实测） | 说明 |
|---|---|---|---|
| 白·石墨浅 accentInk | `#fff8e6` / `#b97a14` = 3.38:1 | `#241703` = **4.89:1** | 金底暖白字不达标，改暖深棕（沿用石墨深色版 accentInk） |
| 白·工程蓝浅 accentInk | `#fffaf0` / `#a37f22` = 3.59:1 | `#241b04` = **4.55:1** | 同上，改暖深棕；裕量仅 0.05，见遗留 |
| 白·水墨深 accentInk | `#fff3e6` / `#cf5a3c` = 3.71:1 | `#1d0d06` = **4.66:1** | 朱砂底白字不达标，改暖黑（沿用水墨深色版已修值） |

- muted 六组均直接达标，未动：浅色 5.40 / 5.81 / 5.18，深色 6.65 / 7.19 / 6.43。
- 其余 21 组均 ≥ 4.5:1 不动。调整值均记入 `globals.css` 顶部注释。

## W2 — 切换器 UI + 全仓清理（已完成）

### 设置外观（`src/components/settings-dialog.tsx`，仅此一处 UI 改动）

- 外观区删 graphite / pine / obsidian 描述条目，新增三套（取效果图 fit 行缩写）：
  - 白·石墨：`纯白底 · 石墨黑 · 琥珀点缀` / `适合：日常工作台、答辩投屏、简历截图`
  - 白·工程蓝：`纯白底 · 工程蓝 · 品牌金` / `适合：对外演示、给不熟悉产品的评委看`
  - 白·水墨：`纯白底 · 墨色 · 朱砂印` / `适合：答辩现场、和 PPT 同框出现`
- 「默认」文案「默认石墨琥珀」→「默认白·石墨」（`六套主题随点随换，刷新后保持；默认白·石墨。`）。

### 头栏下拉（`src/components/theme-toggle.tsx`）

- 核实为注册表驱动（`THEMES.map` + `useThemeChoice`），**0 改动**；W3 截图复核确认下拉列出新六套（见下）。

### 全仓清理（`graphite | pine | obsidian`）

- W2 结论：`src/` 内文案/注释/硬编码列表已清；`deployment-service.ts` 的 `pine` 是 `nginx:1.27-alpine` 子串误报；历史 openspec 记录文字不动。
- W3 独立复核（精确匹配，不含 `white-graphite` 子串）：裸 `graphite` / `obsidian` 只剩 `src/lib/themes.test.ts` 三处——注释 1 行 + 显式非法断言 2 行，均为有意保留的测试；`pine` 只剩 `deployment-service.ts:667` 的 `alpine` 与 `demo-seed.ts:249–250` 的两处 base64 串内偶然子串，均非主题引用。结论：**非测试/非误报的残留 0 处**。
- W2 自验：`npx tsc --noEmit` 0 错误；eslint（改动文件）0 错误。
- W2 中途做过一次 `git stash` + `pop`；W3 树完整性检查确认无残留（见下）。

## W3 — 最终统一验证（本轮）

> 状态：已完成。以下数字全部在最终树状态下重跑，不沿用 W1/W2 的旧数字。

### W3.1 树完整性（stash 残留排查）

- `git status --short`：**5 个修改文件**（`src/lib/themes.ts`、`src/lib/themes.test.ts`、`src/app/globals.css`、`src/app/layout.tsx`、`src/components/settings-dialog.tsx`）+ untracked 的 `openspec/changes/white-themes/`；无其他改动。
- `git stash list`：**空**。HEAD `c383a4a`。
- 抽查关键内容都在位：新 THEME_IDS、DEFAULT_THEME、`white-*` 六个 CSS 块（行 517–909）、防闪脚本白名单 + 两处 `white-graphite` fallback、设置页三套新文案 +「默认白·石墨」；旧 CSS 块 0 处。`git diff --stat`：5 files changed, 420 insertions(+), 356 deletions(-)。

### W3.2 静态检查 + 全量测试 + 干净生产构建

- `npx tsc --noEmit`：**exit 0，错误 0**。
- `npx eslint`（5 个改动文件）：**0 错误**（`globals.css` 1 条 warning 仅为“文件被配置忽略”，非代码问题）。
- 全量 `npx vitest run`：**104 个测试文件全部通过；886 通过、4 跳过、0 失败**。基线说明：batch3 轮为 882，+4 恰好是 `themes.test.ts` 由 7 个增至 11 个；4 跳过不变。
- 干净生产构建：`rm -rf .next` 后 `node node_modules/next/dist/bin/next build`，**exit 0**，新 BUILD_ID **`Xv8o20dAi30A-1zazzXhp`**，日志中 `error` 0 次。
  - 过程插曲：第一次干净构建失败（exit 1，Turbopack 202 个 `Can't resolve '@vercel/turbopack-next/internal/font/google/font'`，Noto Serif SC 字体加载问题）；未改任何代码，直接重试后编译成功（75s）+ TypeScript 通过 + exit 0。判定为冷缓存下字体远端拉取的一过性失败，与本轮改动无关（layout 字体引用未动；此前各轮干净构建均成功）。
- 构建产物：`/home` 200、`/demo` 200；served HTML 含同步内联脚本 `<script id="agenthub-theme-init">`。验证用 `next start -p 3130`（127.0.0.1），不用 standalone（已知 ali-oss `debug` 依赖缺失致 /home 500 的旧问题）；验证完已停服，3130 端口已释放。

### W3.3 Playwright 截图复核（18 组 + 切换器界面）

脚本 `~/workspace/frontend-polish-evidence/white-themes/w3-verify.mjs`，服务 3130，视口 1366×768：

- **18 组**（三套新白主题 × 浅/深 × 首页 / 新任务页 / 设置）：每组断言 `data-theme`、`.dark`、body 背景色、`--primary` 与提案逐字一致——
  - 白·石墨：浅 bg `rgb(255,255,255)` / primary `#33312d`；深 bg `rgb(18,18,17)` / primary `#e8e4d8`；
  - 白·工程蓝：浅 bg `rgb(255,255,255)` / primary `#2f5fd0`；深 bg `rgb(15,17,21)` / primary `#60a5fa`；
  - 白·水墨：浅 bg `rgb(255,255,255)` / primary `#2c2822`；深 bg `rgb(22,20,15)` / primary `#e6dcc2`。
  - 18 组 × 每组 2–3 项断言，数值核对全部 PASS。
- **切换器界面**：
  - 头栏下拉（预置 white-blue 浅色）：列出 6 套中文名（水墨宣纸 / 陶土暖阳 / 勃艮第酒红 / 白·石墨 / 白·工程蓝 / 白·水墨），无石墨琥珀 / 松柏深绿 / 曜石黑金；当前白·工程蓝打勾；点选白·水墨后 `data-theme=white-ink` + localStorage `agenthub-theme=white-ink`，即时生效。
  - 设置外观卡：6 张卡片 + 色带与注册表一致；白·石墨卡选中态 ring +「✓ 当前主题」；「默认白·石墨」文案在位；三套新文案逐项在位，无被删三套。
- **目视抽查**（5 张亲自看过）：`w3-home-white-graphite-light`（纯白底、石墨黑主按钮、琥珀金「一场群聊」点缀）、`w3-workbench-white-ink-light`（白底 + 淡网格、新任务页「增强提示词」chip 在位、副文案为 batch3 已修版）、`w3-toggle-dropdown`（下拉 6 套 + 明暗三段）、`w3-settings-white-graphite-light`（6 张卡、白·石墨选中）、`w3-noflash-early`（酒红深色首屏，见下）。
- 主跑 72 项断言中 70 PASS、2 FAIL，2 项均已定位并补测通过（见 W3.4/W3.5）：① 设置默认卡探针是脚本 bug（「当前主题」span 内含 Check svg，非叶子节点）；② 无闪烁严格 rAF 计算样式采样是慢速 VM 测量伪影（见下）。

### W3.4 默认 / 持久化 / 旧值回落

| 场景 | 结果 |
|---|---|
| 清 localStorage 首开，浅色系统 | `data-theme=white-graphite`，`stored: null`，bg `rgb(255,255,255)` ✅ |
| 清 localStorage 首开，深色系统 | `data-theme=white-graphite` + `.dark`，bg `rgb(18,18,17)` ✅ |
| 预置非法值 `not-a-theme` | 回落白·石墨 ✅ |
| 预置旧值 `graphite` | 回落白·石墨（`stored` 仍为 `graphite`，显示按回落走）✅ |
| 预置旧值 `pine` | 回落白·石墨 ✅ |
| 预置旧值 `obsidian` | 回落白·石墨 ✅ |
| 预置 `wine` | 仍为 wine（浅 `rgb(245,238,231)`），不被新默认覆盖 ✅ |
| 设置页默认标识（清 localStorage 首开进设置外观） | 「当前主题」徽标在白·石墨卡上（卡片文案「纯白底 · 石墨黑 · 琥珀点缀」），「默认白·石墨」文案在位 ✅ |

### W3.5 无闪烁验证（结论：无闪烁；严格采样读数是测量伪影）

- 机制：served HTML 里防闪脚本是 `<body>` 首位的同步内联脚本，先于 next-themes 自身脚本执行；`globals.css:1315` 注释 + 规则确认 provider 开了 `disableTransitionOnChange`，切主题那帧会抹掉所有 transition（无 300ms 渐变可言）。
- 时序（预置 wine + 深色系统，PerformanceObserver + rAF 采样）：防闪脚本在首个采样帧（t=181ms）已写好 `data-theme=wine`；first-paint 260ms、first-contentful-paint 684ms；`--background` 自定义属性自 t=262ms 起即为酒红深色 `#180f13`。
- **决定性证据是实际绘制帧，不是计算样式**：commit 后连续截图循环——唯一浅色帧是无任何内容的空白底色面（单色、无文字无 UI），首个带内容的帧（1279ms）已是酒红深色 `rgb(24,15,19)`，之后全部稳定深色；`domcontentloaded` 时截图同样是完整酒红深色首屏。
- 严格 rAF 计算样式采样曾报 7 种 body 背景值（含浅色与中间灰），与 W4（theme-switcher PROGRESS.md D3）记录的慢速 VM 样式重算滞后伪影同一现象：同一回调内 `--background` 已是深色值而 body 背景仍读浅色/中间值，且 body 无 transition、provider 已禁 transition，不可能真实渐变。按 W4 同一标准判定：**无闪烁**。严格单态 rAF 计算样式检查在该 VM 上不可作为闪烁判据，记为测量遗留。

### W3.6 对比度独立重测（WCAG 公式，直接读落地后的 `globals.css`）

脚本 `w3-contrast.mjs`：24 组**全部 ≥ 4.5:1，0 失败**，与 W1 表逐项一致（见 W1 表格）；最低 **4.55:1**（白·工程蓝浅 accentInk）。修复前旧值用同一公式重算核对：3.38 / 3.59 / 3.71，与 W1 上报一致。

## 逐项状态（汇报用）

| 主题 / 维度 | 状态 |
|---|---|
| 白·石墨 | ✅ 浅/深 token 落地，卡片色逐值断言通过，对比度 4.89–15.90，首页/新任务页/设置截图通过 |
| 白·工程蓝 | ✅ 同上；浅 accentInk 4.55:1 达标但裕量仅 0.05，记遗留 |
| 白·水墨 | ✅ 同上；深 accentInk 修后 4.66:1 |
| 默认切换 | ✅ 清存首开即白·石墨（浅/深），非法值回落白·石墨，设置页默认标识在白·石墨卡 |
| 旧值回落 | ✅ 预置 graphite / pine / obsidian 三者均回落白·石墨；预置 wine 仍为 wine |
| 清理 | ✅ 被删三套无残留（测试中断言与 `alpine`/base64 误报除外）；头栏下拉 0 改动、注册表驱动 |

## 遗留清单（非阻塞，留待用户定夺或下一批）

1. **白·工程蓝浅 accentInk 对比度 4.55:1，裕量仅 0.05**：`#241b04` 已是同系最深暖棕，再想加余量只能动 accent `#a37f22` 本身（需用户定夺，W1 未动；W3 复测确认 4.55 不变）。
2. **无 JS 时 `:root` 仍为 ink 浅色**：与 theme-switcher / batch3 轮同一决定不改；有 JS 时防闪脚本在首次绘制前已写白·石墨，首屏不受影响。
3. **严格 rAF 计算样式采样在慢速 VM 上不可作闪烁判据**：body 背景计算样式读数滞后于实际绘制（W4 已记录）；本轮以实际绘制帧（截图循环 + 首屏截图）判定无闪烁。
4. **干净构建首次失败为冷缓存字体拉取一过性问题**：未改代码重试即成功；如后续干净构建再现，可查 Turbopack 的 `next/font/google` 远端拉取。
5. **`/home` 预览图 `public/images/app-screenshot.png` 仍是 graphite 主题旧图**（batch3 重拍版）：与新默认白·石墨不一致；是否重拍等用户定（本轮任务不含重拍）。

## 证据目录

`~/workspace/frontend-polish-evidence/white-themes/`（51 个文件）：

- `w3-verify.mjs`、`w3-verify.log`、`w3-measurements.json`（主跑 72 项断言：70 PASS + 2 项脚本/测量问题，补测已解决）
- `w3-noflash-reprobe.mjs`、`w3-reprobe.json`（设置默认卡补测 PASS；无闪烁重测：时序 + `--background` 对照）
- `w3-contrast.mjs`、`w3-contrast.json`（24 组对比度重算）
- `w3-build.log`（首次失败，字体拉取）、`w3-build2.log`（成功，BUILD_ID `Xv8o20dAi30A-1zazzXhp`）、`w3-server.log`（3130 服务，已停）
- 截图 41 张：`w3-home-{white-graphite,white-blue,white-ink}-{light,dark}.png`（6）、`w3-workbench-*.png`（6）、`w3-settings-*.png`（6）、`w3-toggle-dropdown.png`、`w3-settings-appearance.png`、`w3-settings-default-white-graphite.png`、`w3-default-{light,dark}.png`、`w3-invalid-fallback-light.png`、`w3-preset-{graphite,pine,obsidian}-fallback.png`、`w3-preset-wine-light.png`、`w3-noflash-early.png`、`w3-firstpaint-commit.png`、`w3-firstpaint-settled.png`、`w3-loop-{0..9}.png`（无闪烁帧循环；仅 `w3-loop-0` 为空白浅色面，其余均为酒红深色带内容）

> 未 commit、未 push、未部署；HEAD 仍为 `c383a4a`。
