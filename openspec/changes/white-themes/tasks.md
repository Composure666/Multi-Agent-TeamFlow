# 白色主题 tasks

## W1 — 注册表 + CSS token + 默认 + 回落 + 测试 + 对比度

- [x] `src/lib/themes.ts`：THEME_IDS 改为 `['ink', 'terra', 'wine', 'white-graphite', 'white-blue', 'white-ink']`；DEFAULT_THEME 改为 `'white-graphite'`（注释同步）；新增三套卡片 5 色（提案 B 节）；删除 graphite / pine / obsidian 条目
- [x] `src/app/globals.css`：删 graphite / pine / obsidian 浅/深 6 个块；新增 white-graphite / white-blue / white-ink 浅/深 6 个块（12 字段照搬提案 A 节，派生 token 按提案 D 节）；顶部主题体系注释同步；`:root` 无 JS 兜底保持 ink 不动
- [x] `src/app/layout.tsx`：防闪脚本白名单改为新六套，两处 fallback `"graphite"` → `"white-graphite"`，注释同步
- [x] `src/lib/themes.test.ts`：THEME_IDS 断言、默认断言、非法回落断言全部改为新默认；非法值表显式覆盖被删三套 `graphite / pine / obsidian`（三者 `isValidThemeId` 均为 false 且回落到 white-graphite）；新增三套卡片色断言（至少 white-graphite 一套逐值比对）
- [x] 对比度：WCAG 公式实测三套新主题浅/深四组（ink/bg、muted/bg、primaryInk/primary、accentInk/accent）；低于 4.5:1 的按先例修（muted 同色系加深、accentInk 改暖深棕），修后重测；PROGRESS.md 逐项记旧值/新值/实测比值
- [x] 自验：`npx tsc --noEmit`、`npx eslint`（改动文件）、`npx vitest run src/lib/themes.test.ts`

## W2 — 切换器 UI + 全仓清理

- [x] `src/components/settings-dialog.tsx`：外观区删 graphite / pine / obsidian 描述条目，新增 white-graphite / white-blue / white-ink 描述+适用文案（取效果图 fit 行缩写）；"默认"文案「默认石墨琥珀」→「默认白·石墨」
- [x] `src/components/theme-toggle.tsx`：核实下拉是否注册表驱动；如有硬编码 id 列表则同步为新六套
- [x] 全仓 grep：`graphite|pine|obsidian` 在 `src/`（ts/tsx/css）中的残留全部核实——文案/注释/硬编码列表要清；`deployment-service.ts` 的 `pine` 核实是否为 `alpine` 子串误报；历史 openspec 记录文字不动；逐项说明处理结果
- [x] 自验：`npx tsc --noEmit`、`npx eslint`（改动文件）

## W3 — 最终统一验证 + 记录

- [x] 全量验证（最终树状态下重跑，不沿用 W1/W2 的旧数字）：`npx tsc --noEmit`、`npx eslint`（改动文件）、全量 `npx vitest run`、干净生产构建（`rm -rf .next` 先）
- [x] Playwright 截图复核进 `~/workspace/frontend-polish-evidence/white-themes/`：三套新白主题 × 浅/深 × 首页/新任务页/设置 + 切换器界面（设置外观卡、头栏下拉）
- [x] 默认/持久化/无闪烁验证：清 localStorage 首开即白·石墨（浅/深）；非法值回落白·石墨；预置旧值 `graphite` / `pine` / `obsidian` 三者均回落到白·石墨；预置 wine 仍为 wine；设置页默认标识在白·石墨卡
- [x] 记录：`openspec/changes/white-themes/PROGRESS.md`（分工、每项改法、验证数字、遗留）；本 tasks.md 全部打勾；`openspec/changes/frontend-polish/PROGRESS.md` 末尾加指向 white-themes 的一节
- [x] 汇报：按主题逐项给状态（白·石墨 / 白·工程蓝 / 白·水墨 / 默认切换 / 旧值回落 / 清理）
