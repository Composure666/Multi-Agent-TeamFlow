# 白色主题（white-themes）—— 加入白·石墨 / 白·工程蓝 / 白·水墨，删除石墨琥珀 / 松柏深绿 / 曜石黑金，默认改为白·石墨

## Why

用户在白色方案效果图（`~/workspace/ts-spaces/bai-se-zhu-ti-fang-an/index.html`）里选了 1、2、3 三套白色方向，要求加入产品并把默认主题改为第 1 套白·石墨。现有六套里石墨琥珀、松柏深绿、曜石黑金三套随之删除，主题总数仍为 6 套。

## 已确认的决策

- 加入：白·石墨、白·工程蓝、白·水墨；删除：石墨琥珀（graphite）、松柏深绿（pine）、曜石黑金（obsidian）。
- 保留：水墨宣纸（ink）、陶土暖阳（terra）、勃艮第酒红（wine）。
- 默认主题：白·石墨（`white-graphite`），只影响无偏好首访；已保存的选择不受影响，**除非**存的是被删三套——那三套的旧值必须优雅回落到新默认。
- 新主题 id 定为 `white-graphite` / `white-blue` / `white-ink`。效果图 artifact 里复用了 `graphite` / `blue` / `ink` 做 id，与产品现有 id 冲突（`ink` 是保留的水墨宣纸，`graphite` / `pine` 是被删项）：复用会让旧存值语义错乱，也会让"被删 id 非法→回落默认"的路径失效。所以新 id 与旧 id 严格区分，被删 id 从注册表移除后 `isValidThemeId` 返回 false，走 `resolveThemeId` 回落到默认。
- 12 字段 token 严格按效果图照搬（hex 一字不改）；深色沿用所配主题的深色 token（白·石墨=石墨深色、白·水墨=水墨深色、白·工程蓝=产品原深色蓝黑，效果图里已注明）。
- 对比度：白色浅色逐项实测（ink/bg、muted/bg、primaryInk/primary、accentInk/accent），低于 4.5:1 的按 theme-switcher 轮先例修（同色系加深 muted、accentInk 改暖深棕），修了的偏离要在 PROGRESS.md 里逐项记录。

## What Changes

### A. 三套新主题 token（效果图逐字抄录，hex 小写）

#### A1. 白·石墨 `white-graphite`（WHITE GRAPHITE；气质：黑白极简 · 推荐首选）

浅色：bg #ffffff, surface #fafafa, ink #232220, muted #6d6a63, primary #33312d, primaryInk #f5f2ea, accent #b97a14, accentInk #fff8e6, line #e5e3de, pattern `radial-gradient(circle at 1px 1px, rgba(40,38,34,.10) 1px, transparent 0)`, soft `linear-gradient(135deg,#f2f0eb,#ffffff)`, bgfx .45。

深色（= 石墨琥珀深色）：bg #121211, surface #1c1c1a, ink #eceade, muted #9d9a8e, primary #e8e4d8, primaryInk #1c1c1a, accent #e39a1e, accentInk #241703, line #33322e, pattern `linear-gradient(rgba(236,234,222,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(236,234,222,.05) 1px, transparent 1px)`, soft `linear-gradient(135deg,#26261f,#171714)`, bgfx .85。

#### A2. 白·工程蓝 `white-blue`（WHITE BLUE；气质：蓝白经典）

浅色：bg #ffffff, surface #f7f9fd, ink #17181c, muted #5d6673, primary #2f5fd0, primaryInk #ffffff, accent #a37f22, accentInk #fffaf0, line #e3e8f0, pattern `radial-gradient(circle at 1px 1px, rgba(47,95,208,.10) 1px, transparent 0)`, soft `linear-gradient(135deg,#e8eefc,#ffffff)`, bgfx .45。

深色（= 产品原深色蓝黑）：bg #0f1115, surface #1b1f2a, ink #e8eaf0, muted #98a0b0, primary #60a5fa, primaryInk #0b1526, accent #c9a96a, accentInk #241b04, line #2a2f3a, pattern `linear-gradient(rgba(232,234,240,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(232,234,240,.05) 1px, transparent 1px)`, soft `linear-gradient(135deg,#1a2130,#0f1115)`, bgfx .8。

注意：浅色 accent 已由品牌金 #c9a96a 加深到 #a37f22（品牌金在纯白上只有 2.2:1，数字看不清），品牌金只留在深色。

#### A3. 白·水墨 `white-ink`（WHITE INK；气质：与答辩 PPT 同源）

浅色：bg #ffffff, surface #fbfaf7, ink #26221b, muted #756c5c, primary #2c2822, primaryInk #f5efdf, accent #b03a26, accentInk #fff6ec, line #e8e2d4, pattern `radial-gradient(circle at 1px 1px, rgba(60,50,30,.12) 1px, transparent 0)`, soft `linear-gradient(135deg,#f2ecdd,#ffffff)`, bgfx .45。

深色（= 水墨宣纸深色）：bg #16140f, surface #201d17, ink #ece4d0, muted #a2987f, primary #e6dcc2, primaryInk #26221b, accent #cf5a3c, accentInk #fff3e6, line #3a352a, pattern `linear-gradient(rgba(236,228,208,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(236,228,208,.05) 1px, transparent 1px)`, soft `linear-gradient(135deg,#2a251c,#1c1a14)`, bgfx .8。

### B. 注册表与默认（`src/lib/themes.ts`）

- `THEME_IDS` 改为 `['ink', 'terra', 'wine', 'white-graphite', 'white-blue', 'white-ink']`（顺序：保留的三套在前，新三套在后；设置页按此顺序出卡）。
- `DEFAULT_THEME` 改为 `'white-graphite'`；`resolveThemeId` 注释同步。
- 三套新卡片 5 色（bg / surface / primary / accent / ink，浅色版）：白·石墨 `#ffffff / #fafafa / #33312d / #b97a14 / #232220`；白·工程蓝 `#ffffff / #f7f9fd / #2f5fd0 / #a37f22 / #17181c`；白·水墨 `#ffffff / #fbfaf7 / #2c2822 / #b03a26 / #26221b`。
- `isValidThemeId('graphite' | 'pine' | 'obsidian')` 必须为 false（注册表移除即自动满足，测试要显式覆盖三者）。

### C. 机制

- 明暗继续走 next-themes 的 `.dark` class；主题走 `data-theme` 属性。`layout.tsx` 内联防闪脚本：白名单改为新六套 id，两处 fallback `"graphite"` → `"white-graphite"`（合法值白名单 + catch），注释同步。
- 无 JS 时 `:root` 仍为 ink 浅色（不改——与 batch3 轮同一决定；有 JS 时防闪脚本在首次绘制前已写新默认，首屏不受影响）。记为已知遗留。
- Noto Serif SC 标题保持不变。
- 设置外观选择器与头栏主题下拉：两者都读注册表 `THEMES`，注册表一改即同步；只补三套新主题的描述/适用文案（取效果图 fit 行缩写），删被删三套的条目；设置页"默认"文案「默认石墨琥珀」→「默认白·石墨」。
- 全仓 grep 清掉被删三套的一切引用（文案、注释、测试、硬编码 id 列表）；`deployment-service.ts` 里的 `pine` 疑似 `alpine` 子串，核实后说明；历史 PROGRESS.md / proposal.md 里的记录文字不动（那是历史记录，不是引用）。

### D. 派生 token 规则（沿用 theme-switcher 提案 D 节）

- 每个新主题在 `globals.css` 各写浅/深两个块（`:root[data-theme="<id>"]` 与 `:root[data-theme="<id>"].dark`），字段结构照抄相邻主题块：shadcn 变量 + `--agenthub-*` + `--agenthub-pattern/soft/bgfx`；派生 token 一律 color-mix，不新发明 hex。
- `--agenthub-gold` = 该主题 accent；`--agenthub-gold-ink` = 该主题 accentInk（修过对比度的取修后值）。
- 语义色：错误默认浅 `#DC2626` / 深 `#F87171`（wine 例外不变）；警告全主题橙浅 `#EA580C` / 深 `#FB923C`；成功翡翠绿浅 `#059669` / 深 `#34D399`。
- 图表 `--chart-1..5`：1 = primary；2 = `#34D399`；3 = accent，但 accent 为琥珀/金系时（白·石墨、白·工程蓝深色）改青色 `#2DD4BF`；4 = 错误红；5 = muted。
- `globals.css` 顶部主题体系注释同步：6 套 × 2 档、id 列表、默认白·石墨。

### E. 对比度

- 实测四组（每套浅色 + 深色）：ink/bg、muted/bg、primaryInk/primary、accentInk/accent，WCAG 公式。
- 低于 4.5:1 的按先例修：muted 同色系加深、accentInk 改暖深棕；修后重测，PROGRESS.md 逐项记旧值/新值/实测比值。
- 已知高危（先验判断，实测为准）：白·石墨浅 accentInk `#fff8e6` 配 `#b97a14`（theme-switcher 轮金底白字 2.95–3.85，大概率不达标，预期修到 `#241703` 一线）；白·工程蓝浅 accentInk `#fffaf0` 配 `#a37f22`；白·石墨浅 muted `#6d6a63`、白·水墨浅 muted `#756c5c`（theme-switcher 轮在米黄底上需加深，纯白底上可能直接达标）。

## Capabilities

- `frontend` SHALL 提供 6 套主题（水墨宣纸、陶土暖阳、勃艮第酒红、白·石墨、白·工程蓝、白·水墨），每套浅/深两档，token 与本提案 A 节一致。
- `frontend` SHALL 默认主题为白·石墨：无偏好首访、非法存值、无 JS 回退之外的全部路径都落到白·石墨。
- `frontend` SHALL 将已保存的被删主题（graphite / pine / obsidian）回落到默认白·石墨，不出现无样式或旧主题残留。
- `frontend` SHALL 在设置外观与头栏下拉中只展示现存 6 套，不出现被删主题。
- `frontend` SHALL 保证新白色浅色四组对比度均 ≥ 4.5:1。

## Impact

- `src/lib/themes.ts`、`src/lib/themes.test.ts`（注册表、默认、回落、卡片色）
- `src/app/globals.css`（删 graphite / pine / obsidian 两档共 6 个块；新增 white-graphite / white-blue / white-ink 两档共 6 个块；顶部注释同步）
- `src/app/layout.tsx`（防闪脚本白名单 + 两处 fallback + 注释）
- `src/components/settings-dialog.tsx`（外观区三套新文案、删三套旧文案、"默认"文案）
- `src/components/theme-toggle.tsx`（如下拉是注册表驱动则 0 改动；如有硬编码 id 列表则同步）
- 其余：全仓 grep 命中的被删三套引用（按核实结果处理）

## Non-goals

- 不动保留三套（ink / terra / wine）的 token；不动 `agenthub-theme` 存储键；不动明暗切换机制；不改 Noto Serif SC；不 commit / push / 部署。
