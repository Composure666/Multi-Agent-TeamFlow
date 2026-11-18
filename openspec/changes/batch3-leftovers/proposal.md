# 第三批遗留小项（batch3-leftovers）

## Why

前端 polish 五期 + 第二轮 + 第三轮、主题切换器、模块页 Top 5 三轮做完后，仍有 9 项小遗留分散在三份 PROGRESS.md 与审计报告的「已知遗留」一节。用户 2026-11-18 ~18:07 拍板先做第三批（即这 9 项），其余两批（响应式收尾、一致性收尾）另行安排。

来源：
- `openspec/changes/frontend-polish/PROGRESS.md`「第三轮遗留/小观察」：副文案、品牌副标题截断、团队 chip 折行（注：chip 折行不在本次 9 项内）、/home 预览图、终端代码块、成员行 "text"、文件库按钮。
- `openspec/changes/theme-switcher/PROGRESS.md`：wine 深 primaryInk 4.58:1（W1 遗留）、/home 预览图（W1/W4 遗留）、顶格态团队行（W5 遗留）、柔光被遮（W6 遗留）。
- `openspec/changes/module-audit-top5/PROGRESS.md`：本轮遗留与审计已知遗留（F1 死代码等不在本次范围）。

## 已确认的决策

- 酒红：动 wine 深色 primary 本身（浅色 `#7c2233` 核对后不动或一并处理），按钮文字对比度 ≥4.5:1 且仍是酒红色；报旧值/新值/实测对比度 + 浅/深截图给用户看。
- 顶格态：压下方间距或调低自动增高上限，二选一。
- 其余 7 项按任务书的改法做，不再另行确认。

## What Changes

1. **酒红深色对比度**：wine 深 `--primary #c0526a` 上 `--primary-foreground #050203`（W1 已由 `#fff2ea` 改为最深暖黑）对比度仅 4.58:1，余量最薄。调整深色 primary（往深/暗方向），使 primaryInk 对比度 ≥4.5:1 且有余量（目标 ≥5:1，若仍是酒红色可接受），仍是酒红色；浅色 `#7c2233` 核对对比度后不动或一并处理。同步更新 `src/lib/themes.ts` 注册表与 `globals.css` 注释。
2. **/home 预览图重拍**：`public/images/app-screenshot.png` 与 `docs/images/teamflow-preview.png` 仍是旧蓝白工作台。用当前树（默认水墨宣纸 + Top 5 + W7）重拍新版工作台新任务页：生产构建 + `next start` + Playwright，首启指南弹窗关掉；alt 文案如需改同步。重拍在新任务页改动（3/4/5/6 项）落地后进行。
3. **柔光被白卡片遮住**：新建任务页柔光椭圆加宽到 composer（1010px）之外或上移光心，让光晕可见但克制；浅/深截图验证。
4. **副文案实时匹配承诺**：新任务页副文案「系统在你打字时就帮你配好」承诺了不存在的实时匹配。改成不承诺实时匹配的文案（如创建后配好）；截图确认。`app-workbench.tsx:1341`。
5. **品牌副标题截断**：侧栏品牌副标题在 1366/1440/1920 下截断（Q15 只修了品牌名行）。换行或缩短副标题。`app-workbench.tsx:870-890` 一带。
6. **1200 字顶格团队行**：1366×768 下输入 1200 字到顶时，团队行需滚约 100px 才可见。压下方间距或调低自动增高上限（40vh → 更小），二选一并验证；500 字态 +10px 基线溢出不引入新回归。
7. **创建团队成员行 literal "text"**：手动创建成员行右侧直出 `{a.modality}` 字段值 "text"。映射成可读标签或隐藏该字段。`create-team-dialog.tsx:506`。
8. **文件库按钮折叠线下 11px**：file-library 对话框 1366×768 下内部上传按钮在折叠线下 11px。调整对话框内部布局，使按钮无需滚动即可见。`file-library-dialog.tsx`。
9. **/home 终端代码块右缘被裁**：桌面端 `git clone …` 行右缘被裁（可横向滚动）。换行/缩短命令，或让滚动提示可见。

## Capabilities

### Modified `frontend`

- wine 深色主题 primary 调整后，按钮文字对比度 SHALL ≥ 4.5:1（实测报值），且色相仍在酒红区间。
- /home「界面预览」配图 SHALL 与当前默认主题 + 新任务页一致（重拍）。
- 新建任务页柔光 SHALL 在浅/深下可见且克制，不抢内容、不影响对比度。
- 新任务页副文案 SHALL 不承诺实时匹配。
- 侧栏品牌副标题 SHALL 在 1366/1440/1920 下完整显示。
- 1200 字顶格态 SHALL 在 1366×768 下团队行无需滚动即可见（或压间距后可见），500 字态不回归。
- 创建团队成员行 SHALL 不显示字面 "text"。
- 文件库对话框 1366×768 下上传按钮 SHALL 无需滚动即可见。
- /home 终端代码块 SHALL 不在右缘被视觉截断（换行或滚动提示可见）。

## Impact

- 改动文件（预期）：`src/app/globals.css`、`src/lib/themes.ts`（+ 测试如有）、`src/components/app-workbench.tsx`（3/4/5/6 项）、`src/components/create-team-dialog.tsx`、`src/components/file-library-dialog.tsx`、`/home` 终端代码块所在文件（`home-download.tsx` 或 `home-sections.tsx`，以实际为准）、图片资产 `public/images/app-screenshot.png`、`docs/images/teamflow-preview.png`。
- 不碰：功能逻辑、API、SSE、DB、鉴权、终端、主题 token 结构（只改 wine 深色 primary 值）、其余主题。
- 验证：tsc / eslint / 全量 vitest（基线 882）/ 干净生产构建 + Playwright 截图（证据 `~/workspace/frontend-polish-evidence/batch3-leftovers/`）。

## Non-goals

- 第一批（D2/D3/D4/D5/H2/C4）与第二批（B/C/E3–E4/G/I/J）不在本次范围。
- F1 死代码清理、经验资产页头吸顶、调试板头部按钮、390 Tab 折行不在本次范围。
- 不 commit、不 push、不部署。
