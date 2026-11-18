# 第三批遗留小项（batch3-leftovers）— 实施记录

## 概览

- 用户 2026-11-18 ~18:07 拍板先做第三批（9 项遗留）；同日 ~18:36、~18:38、~18:50 又追加 3 项线上 bug（Agent 库边距、信息中心计数、调试板溢出与间距）+ 默认主题由水墨宣纸改石墨琥珀；共 **13 项**，全部完成并通过验证。
- OpenSpec：`openspec/changes/batch3-leftovers/proposal.md` + `tasks.md`（13 项已全部打勾）。
- 分工：W1 酒红、W2 新任务页（3/4/5/6）、W3 成员行 "text"、W4 文件库按钮、W5 终端代码块、W6 预览图重拍、W8 Agent 库边距、W9 信息中心计数、W10 默认主题、W11 /home 页脚副标题核查、W12 调试板、W7 集中验证 + 本记录。
- 铁律：未 commit、未 push、未部署、未 clean（除 `.next` 外）、未 checkout、未 reset；HEAD 仍为 9618684，工作树改动留在本地。

## 逐项结果

### 0a. Agent 库左右外边距太大（W8，线上 bug）✅

- 根因：Top 5 的 A 迁移把 Agent 库放进 `PageShell` 且未传 `contentClassName`，走了默认 `max-w-5xl`（实测计算值 1088px），卡片墙被锁死，宽屏下两侧大片空白。
- 改法：只改 `src/components/agent-workbench.tsx` 1 行——`PageShell` 调用加 `contentClassName="w-full max-w-none"`（与数据概览等 6 页同例；`PageShell` 默认值未动，其他页不受影响）。
- 实测（Playwright，侧栏恒 260px）：1920×1080 下内容宽 1088px → **1609px**，边距 286+286px → **26+26px**，卡片墙 4 → **6 列/行**，页高 1392 → 1131px；1440×900 内容 +41px；1366×768 改前改后像素一致，无回归。
- 验证：tsc 0 错误、eslint 0 错误、改后自建构建成功（BUILD_ID `cVKmyDryfeOSJmSBbsMwA`）；证据 `w8-measure.mjs`、`w8-measurements*.json`、前后截图各 3 张。
- 遗留：精选场景横向滚动条右缘卡片半切是既有行为（改前亦然）；`workbench-primitives.tsx` 的 `PageShell` 注释仍只列数据型页，Agent 库一句未补（W8 建议，未做）。

### 0b. 信息中心分类数字不一致（W9，线上 bug）✅

- 用户现象：选“未读”时六个数字全是 0；选“全部”时全部 15 / 异常 10 / 任务 5。
- 根因（代码实测，非猜测）：两层过滤叠加——`load()` 把当前 pill 当查询条件发给服务端并用返回子集**替换** store 整个列表；pills 计数又从这个已被过滤的列表算；且页面头部“未读 N 条”用的是服务端全局 `unreadCount`，与 pill 的计数来源不同。用户数据全是已读时，选“未读”服务端返回 0 条，六个数字全变 0。
- 改法：只改 `src/components/information-center-workspace.tsx` 三处——`load()` 改为始终拉全量（`fetchNotifications({ limit: 80 })`，不再传 status/category）；新增 `countableNotifications`（过滤掉已删除）作为计数唯一来源；pills 改用它计数。列表过滤行为、分类定义、已读/删除行为均未动。
- 验证：tsc 0 错误、eslint 0 错误；Playwright 逐个点六个分类，修复后六个分类下六处数字全部一致——**全部 15 / 未读 8 / 异常 10 / 任务 5 / 系统 0 / 配置 0**，列表条数与当前分类相符（15/8/10/5/0/0）；12 张前后截图。W9 未跑 `next build`（当时另一 worker 在构建，为避 `.next` 撞车跳过；tsc + eslint + dev 服务器实测已覆盖）。
- 验证数据只种在隔离复现副本库，验证后已删；真实库未写入。

### 0c. 默认主题由水墨宣纸改为石墨琥珀（W10）✅

- 改法：`src/lib/themes.ts:18` `DEFAULT_THEME: 'ink'` → `'graphite'`（注释同步）；`src/app/layout.tsx` 防闪脚本两处 fallback `"ink"` → `"graphite"`（合法值白名单不变）；`src/components/settings-dialog.tsx:679` 外观区文案「默认水墨宣纸」→「默认石墨琥珀」；`src/lib/themes.test.ts` 默认断言 ink → graphite。未动六套主题 token、持久化逻辑（`agenthub-theme` 键不变，已保存的选择仍按保存值进）。
- 与 W1 串行：W1 完成前 W10 只读未写；W1 的酒红改动只动了 `globals.css`，`themes.ts` 干净后 W10 才动手；`themes.ts` 与 `themes.test.ts` 在 git 里是 untracked，串行核对改用文件内容核对（grep + 行数/条目检查）。
- 验证：tsc 0 错误、eslint（4 文件）0 错误、vitest `themes.test.ts` **7/7 通过**（第一阶段中间态 2 failed / 5 passed，失败的恰好是 2 个默认断言，证明测试与常量已接线）；构建成功（BUILD_ID `q3ygNE8GA_LkY4AYHZX7k`）；Playwright 四项全过——清 localStorage 首开即 graphite（浅/深）、非法值回落 graphite、预置 wine 仍为 wine、设置页默认标识在 graphite 卡。
- 遗留：无 JS 时 `globals.css` 的 `:root` 仍为 ink 浅色（ink 主题本身的 token 定义，按“不动六套主题 token”未改）；有 JS 时防闪脚本在首次绘制前已写 graphite，首屏不受影响。

### 0d. 调试板文字溢出 + 间距偏大（W12，线上 bug）✅

- 范围：只改 `src/components/agent-run-debug-board.tsx` 一个文件；未动检查器 Dialog/D1、节点交互、头部 8 按钮（D3）、功能逻辑、`PageHeader`/`PageShell`。
- 复现（Playwright 路由拦截伪造 API 响应造长文本，零 DB 写入）：改前溢出 4 项——工具栏视图按钮被压到 34px 宽折成 2 行；工具栏横向溢出 441px，右侧整组按钮不可见不可达；会话栏选中行第 3 行词内断行（三行 51px）；**任务图节点重叠（真根因）**：Run 节点与消息节点 transform 完全相同 `(640px, 0px)`，消息卡片被盖住点不到。节点标签/描述、面包屑/元信息、阶段条、检查器实测 0 溢出（truncate 设计）。
- 改法：节点重叠——位置同步只保留用户拖过的位置（`dragged.get(id) ?? node.position`，原先 `previousPositions` 保留全部旧位置，数据晚到时 Run 节点按孤儿位置落位后一直被保留）；工具栏根加 `overflow-x-auto`、按钮 `shrink-0 whitespace-nowrap`、提示语 `lg:inline` → `2xl:inline`、gap 收紧；会话栏第 3 行加 `flex-wrap`、三项加 `whitespace-nowrap`（Run 标签加 `title` 悬停看全 id）；画布 wrapper `p-3 pb-2` → `p-2`（实测 12.75px → 8.5px）。
- 验证：tsc 0 错误、eslint 0 错误、vitest `agent-run-debug-board.test.ts` **50 passed**；Playwright 同一脚本同一批造数跑 before/after，`failures: []`，除滚动收容外溢出全部归零；1024 下节点检查器 Dialog 仍能打开（D1 行为）；拖拽持久性回归 before/after 一致（拖过的位置保持不变）。
- 遗留（超出本文件范围，未动，需另派）：图内节点行距（`src/lib/agent-run-debug-board.ts` 里的 `rowGap 340`、`runRowOffsetY 260` 等）决定节点纵向间距与 fitView 缩小后的大面积留白——用户说的「间距偏大」如指图内节点间距，改动在该 lib 文件；`fitView` 一屏看全（minZoom 0.1）是既有行为，未动。

### 1. 酒红深色对比度（W1）✅

- 改法：wine 深 `--primary #c0526a` → **`#b03b52`**（加深，仍是酒红）；`--primary-foreground` 由 `#050203`（W1 之前由 `#fff2ea` 改的最深暖黑）**翻回暖白 `#fdf3ec`**——加深后 `#050203` 仅 3.54:1，翻回暖白才达标。浅色 `#7c2233` 核对后未动（与暖白 9.0:1）。同步更新 `globals.css` 注释。
- 对比度（W7 用 WCAG 公式独立重算，与 W1 上报一致）：新 `#b03b52` vs `#fdf3ec` = **5.35:1**（目标 ≥4.5:1，余量 0.85）；旧 `#c0526a` vs `#050203` = 4.58:1（基线）；旧 `#c0526a` vs `#fff2ea` = 4.11:1。
- 验证：W1 截图 `w1-wine-dark-newtask.png`（W7 目视：深色酒红底，创建任务按钮暖白字清晰可读）、`w1-wine-light/dark-settings*.png`；`globals.css` 深色块实测 `--primary: #b03b52; --primary-foreground: #fdf3ec;`。

### 2. /home 预览图重拍（W6，最后做）✅

- 拍摄：当前完整工作树（默认 graphite + Top 5 + W7 + 本轮新任务页改动），生产构建（BUILD_ID `vA2_EBomXXSkeJF_T6zGd`）+ `next start`（127.0.0.1:3119）+ Playwright，1600×800 @2x，fresh context，首启指南弹窗未出现。
- 断言全部 PASS：`data-theme=graphite`、A 版标题、新副文案、工具栏「增强提示词」chip（107×33）、品牌名两行无截断、品牌副标题三行完整、无横向溢出、建议行在 800 高视口内、PNG 3200×1600。
- 替换：`public/images/app-screenshot.png` 与 `docs/images/teamflow-preview.png` 两处 md5 一致，旧 `178cc727bb293efa48717eab96a05358` → 新 **`2a4828f0681f0a28ff444969081955ed`**；/home 预览区实测 img `naturalWidth=3200`、`naturalHeight=1600`，正常渲染；新旧并排对比 `w6-compare-old-vs-new.png`。
- 代码改动（仅 alt/描述文案）：`home-screenshot.tsx:38`、`home-sections.tsx:202`——旧文案含“场景切换”（旧截图确有场景 pill），新任务页 A 版已无，改为“建议入口”。
- 注意：alt 文案的两行字符串改动发生在构建拍摄之后，只改字符串，不影响工作台渲染像素；W7 全量构建已重新构建（像素无影响）。`pnpm build` 在本机坏掉（Electron `dist/` 缺失），W6 与 W7 均改走系统 Node 直接构建，与本次改动无关。
- 遗留观察（未做）：`README.md:64` / `README.zh-CN.md:64` 的 alt 对旧图、新图同样不准确，是重拍前就存在的问题，留待定夺。

### 3. 柔光被白卡片遮住（W2）✅

- 改法：`app-workbench.tsx`——柔光椭圆加宽到 **1500px**（`max-w-full` 兜底，1366 下取容器宽 1078、仍比 composer 宽 68px；1920 下 1500 比 composer 宽 156px），光心上移到 310px、柔光上沿 130px。
- 实测：1366 下柔光 1078×360、上沿露出 90.5px、两侧各溢出 34px；1920 下柔光 1500×360、两侧各溢出 81px；浅/深均可见且克制（W7 目视新截图：composer 左上角一角淡金暖晕，网格底可见，不抢内容）。
- 证据：`w2-glow-{light,dark}-{1366,1920}.png`、`w2-measurements.json`。

### 4. 副文案实时匹配承诺（W2）✅

- 改法：`app-workbench.tsx:1350` 副文案由「把目标说清楚就行——选谁、怎么分工、产出什么，系统在你打字时就帮你配好。」改为「……**创建后系统帮你把人和分工配好**。」不再承诺不存在的实时匹配。
- 验证：新文案在浅/深、1366/1920 截图中均可见；旧文案 `oldSubcopyPresent: false`（`w2-measurements.json`）。

### 5. 品牌副标题截断（W2）✅

- 改法：`app-workbench.tsx` 侧栏品牌副标题 "Multi-Agent Collaboration & Workflow" 换行显示（三行完整）。
- 验证：1366/1440/1920 下 `truncated: false`（`scrollW == clientW == 83`，`w2-measurements.json`）；W7 目视三张新任务页截图，副标题三行完整无截断。
- 注意：W2 截图里「需求到原型团队」chip 标签仍折成两行——那是 round-3 已知遗留（composer 固定 660px 下长队名折行），本项未动，见遗留清单。

### 6. 1200 字顶格团队行（W2）✅（余量偏紧，见遗留）

- 改法：选了**调低自动增高上限**（而非压间距）：`max-h-[min(320px,32vh)]`（原 40vh），空态与 500 字态不动。
- 实测：1366×768 下 1200 字到顶时团队行底边 **755.6px**，视口 768px——**可见，无需滚动**（原先需滚约 100px）；500 字态团队行底边 727.3px，+10px 基线溢出未变（无回归）；1920 下团队行底边 829.8px，余量充足。
- ⚠️ 余量仅 **12.4px**，偏紧：1366×768 下再多一行或浏览器 chrome 稍高就可能顶出视口。W7 复核截图确认团队行四枚头像与名称均完整可见，判为完成、记遗留（见遗留清单）。

### 7. 创建团队成员行 "text"（W3）✅

- 改法：`create-team-dialog.tsx`——成员行右侧 `{a.modality}` 直出改为 `modalityLabel(a.modality)`，映射 code→代码 / text→文本 / vision→视觉 / image→生图（与 `agent-config-form` 的 `MODALITY_OPTIONS` 同一真相源；`normalizeModality` 把历史值 audio→text、multimodal→vision 与任意未知值归并到四类，fallback 为「文本」）。
- 验证：W7 目视 `w3-create-team-manual-1366x768.png`——四名成员行右侧均显示「文本」，无字面 "text"；对话框 footer 完整在视口内。

### 8. 文件库按钮折叠线下 11px（W4）✅

- 改法：`file-library-dialog.tsx`——对话框内部布局调整，上传按钮固定底部。
- 实测（1366×768，正常态与强制错误态）：最低上传按钮 `belowDialogBottom` 由 **+11px → −17px**（框内 17px），`visibleWithoutScroll: true`，对话框 `needsScroll: false`；1920 下同样可见。
- 证据：`w4-measurements-after.json`、`w4-after-{1366x768,1920x1080}-{normal,error}.png`；W7 目视正常态截图，底部「上传文件 / 图片」按钮完整在框内。

### 9. /home 终端代码块右缘被裁（W5）✅

- 改法：`home-download.tsx:264` 终端 `<pre>` 加 `whitespace-pre-wrap break-words`，长命令换行显示。
- 验证：W7 目视 `w5-terminal-{light,dark}-{1366,1920,390}.png`——`git clone https://github.com/Composure666/Multi-Agent-TeamFlow.git` 折成两行完整显示，`cp .env.example .env.local …` 同样换行；1366/1920/390 均不裁。

### 10. /home 页脚副标题核查（W11）✅ 0 改动

- W11 实测 /home 页脚品牌区（`home-sections.tsx:673-676`）：品牌名 "Multi-Agent TeamFlow" 与副标题 "Multi-Agent Collaboration & Workflow" 在 1366×768、1920×1080、390×844 下 `truncated: false`（`scrollWidth == clientWidth == 224`），无横向溢出。
- 结论：页脚副标题本来就不截断，**0 改动**；证据 `w11-measurements.json`、`w11-before-footer-{1366x768,1920x1080,390x844}.png`。

## W7 集中验证（最终统一验证）

> 状态：进行中——静态检查 + 全量测试 + 干净生产构建由验证 worker 执行（tsc / eslint / 全量 vitest / `rm -rf .next` 后 `node next build`），截图复核见下；本节数字待 worker 回报后填入。

- 各 worker 自带验证（均在其改动落地后跑过，但跑在最终树状态之前，不能替代本次统一验证）：W1 tsc/eslint、W2 构建 + Playwright 11 组实测、W3 截图、W4 构建 + 实测、W5 截图、W6 tsc + 构建 + 拍摄、W8 tsc/eslint + 构建 + 实测、W9 tsc/eslint + dev 实测（未跑 next build，见 0b）、W10 tsc/eslint + vitest 7/7 + 构建 + Playwright 四项、W12 tsc/eslint + vitest 50 + Playwright before/after。
- W7 独立复核（不抄 worker 数字）：酒红对比度用 WCAG 公式重算（5.35:1，与 W1 一致）；W2/W4/W9/W11 的 measurements.json 逐项核对（见上文各节）；10 张关键截图亲自目视（w1-wine-dark-newtask、w2-newtask-1200-light-1366、w6-newtask-1600x800、w8-after-1920x1080、w9-after-unread、w12-after-1366x768-board、w4-after-1366x768-normal、w5-terminal-light-1366、w3-create-team-manual-1366x768、w10-first-open-light），均与上报一致。

### 最终统一验证结果

静态部分（验证 worker 执行，最终树状态，日志在 `final/`）：

- `npx tsc --noEmit`：**exit 0，错误 0**（`final-tsc.log` 为空）。
- `npx eslint`（93 个文件，batch3 清单 + `git status` 核对补齐）：**exit 0，错误 0，警告 3**——`app-workbench.tsx:865` `<img>` 建议改用 `next/image`、`model-assignment-panel.tsx:26` `assignments` 未使用、`provider-config-dialog.tsx:98` `handleTest` 未使用（均为既存警告，非本轮引入）。
- 全量 `npx vitest run`：**104 个测试文件全部通过；882 通过、4 跳过、0 失败**。新增测试均在内：`themes.test.ts` 7 个、`use-media-query.test.ts` 6 个，全部通过。通过数 882 与 Top 5 轮的基线 882 相同——新增测试已包含在这个总数里（869 + 7 + 6 = 882），不是基线之外的增量；batch3 本轮未新增测试。
- 干净生产构建：`rm -rf .next` 后 `node node_modules/next/dist/bin/next build`，**exit 0，耗时 2m2.7s，新 BUILD_ID `sRfxgc8IwfRk0D319U6bP`**，日志中 "error" 出现 0 次。`.next` 留在原地供截图复核使用。
- 工作树：`git status --short` 共 **105 行**（92 个已跟踪改动文件 + 13 个未跟踪项，含 openspec/changes 下 4 个目录、wechat-qr.png 等）；`git diff --stat` 尾行：**92 files changed, 5114 insertions(+), 3352 deletions(-)**（相对 HEAD 9618684 的整棵树，含前几轮对同一文件的改动，不是 batch3 净增量）。
- Playwright 截图复核：**14 项全部 PASS，无 FAIL**（证据 `~/workspace/frontend-polish-evidence/batch3-leftovers/final/`：61 张截图、`final-measurements.json`、`final-verify.log`）。服务 `next start -p 3122`（BUILD_ID `sRfxgc8IwfRk0D319U6bP` 已核对，未重建），复核完已停服、3122 端口已释放。
  - 酒红深色按钮对比度实测 **5.35:1**（浅色 9.00:1），与 W1 一致；两处预览图 md5 均为 `2a4828f0…`，预览区 img 3200×1600；柔光 1366 宽 1078/两侧各 34px、1920 宽 1500/两侧各 81px；副文案新在旧不在（11 次测量）；品牌副标题 1366/1440/1920 `truncated=false`；1200 字团队行底边 **755.6px**（余量 12.4px，与 W2 相同）、500 字基线 727.3px；创建团队 6 成员行全为「文本」、对话框内无字面 "text"、footer 在视口内；文件库最低上传按钮 −17px、无需滚动；终端 6 组合（1366/1920/390 × 浅/深）无横向溢出；Agent 库 1920 内容 1609px、6 列、边距各 26px；信息中心真实库 0 条通知下六分类切换前后全 0 一致（有数验证以 W9 隔离实测为准）；默认 graphite 首开/非法回落/预置 wine 均通过；调试板复用 w12 fixtures 逐项测量 `failures: []`（1024 对话框与拖拽持久化回归均通过）；/home 页脚副标题 1366/1920/390 `truncated=false`。
  - 如实说明：调试板 inspector 态工具条 1366 下内部横向滚动 488px、1920 下 57px——与 W12 自己的 after 实测逐值相同，属工具条内部可滚动、卡内不溢出（`spillVsCard=0`，页面级 `pageOverflowX=0`），不是本次复核的新回归。首轮出现的 FAIL 是复核脚本自身的 bug（连到旧端口 3120、终端选择器未考虑语法高亮 token span、侧边栏按钮无 title 属性），修正重跑后 exit 0，过程记在 `final-verify.log` 末尾。

## 遗留清单（非阻塞，留待用户定夺或下一批）

1. **1200 字顶格团队行余量仅 12.4px（偏紧）**：1366×768 下团队行底边 755.6px，视口 768px；再多一行或浏览器 chrome 稍高就可能顶出。已完成（无需滚动可见），但余量薄——如用户觉得紧，可再压间距或降上限。
2. **「需求到原型团队」chip 标签折两行**：round-3 已知遗留，composer 固定 660px 下长队名折行；batch3 未动。
3. **调试板图内节点间距**：`src/lib/agent-run-debug-board.ts` 的 `rowGap 340`、`runRowOffsetY 260` 等决定节点纵向间距与 fitView 缩小后的大面积留白；`fitView` minZoom 0.1 一屏看全是既有行为。W12 未动，需另派。
4. **PageShell 注释未补 Agent 库一句**：`workbench-primitives.tsx` 注释仍只列数据型页；W8 建议顺手补，未做。
5. **README alt 文案不准确**：`README.md:64` / `README.zh-CN.md:64` 的 alt 对旧图、新图同样不准确，重拍前就存在的问题；W6 未动。
6. **无 JS 时 `:root` 仍为 ink 浅色**：`globals.css` 的无属性兜底是 ink 主题本身的 token，按“不动六套主题 token”未改；有 JS 时防闪脚本首屏已写 graphite。
7. **500 字态 +10px 基线溢出**：既有基线，batch3 未引入新回归。
8. **W6 alt 文案改动在构建拍摄之后**：只改两个字符串，像素无影响；W7 全量构建已重新构建。
9. **W9 未跑 next build**：当时另一 worker 在构建，为避 `.next` 撞车跳过；W7 统一验证的干净构建已覆盖最终树。
10. **精选场景横向滚动右缘卡片半切**：Agent 库既有行为，与 max-w-none 改动无关。

## 文件改动（batch3 本轮净增量，相对各 worker 接手时的树）

| Worker | 文件 |
|---|---|
| W1 | `src/app/globals.css`（wine 深 primary/foreground + 注释） |
| W2 | `src/components/app-workbench.tsx`（柔光、副文案、品牌副标题、1200 上限） |
| W3 | `src/components/create-team-dialog.tsx`（modalityLabel） |
| W4 | `src/components/file-library-dialog.tsx`（按钮固定底部） |
| W5 | `src/components/home/home-download.tsx`（终端 pre 换行） |
| W6 | `public/images/app-screenshot.png`、`docs/images/teamflow-preview.png`（重拍替换）、`src/components/home/home-screenshot.tsx`、`src/components/home/home-sections.tsx`（alt/描述两行字符串） |
| W8 | `src/components/agent-workspace.tsx`（PageShell 调用加 `contentClassName="w-full max-w-none"`，1 行） |
| W9 | `src/components/information-center-workspace.tsx`（计数派生三处） |
| W10 | `src/lib/themes.ts`、`src/lib/themes.test.ts`、`src/app/layout.tsx`、`src/components/settings-dialog.tsx` |
| W11 | 无（0 改动） |
| W12 | `src/components/agent-run-debug-board.tsx` |

> 相对 HEAD 9618684 的整棵工作树数字（含前端 polish 五期、主题轮、Top 5 对同一文件的改动）不是 batch3 的净增量，不在此列；全工作树当前 105 个文件改动（W7 统一验证时以 `git status` 实测为准，见上节）。

## 证据目录

`~/workspace/frontend-polish-evidence/batch3-leftovers/`（132 个文件）：

- W1：`w1-*.png`（酒红浅/深新任务页与设置页）、`w1-shot*.mjs`、`w1-build.log`
- W2：`w2-newtask-*.png`（空/500/1200 字 × 浅/深 × 1366/1920/1440）、`w2-glow-*.png`、`w2-brand-*.png`、`w2-measurements.json`、`w2-verify.mjs`
- W3：`w3-create-team-manual-{1366x768,1920x1080}.png`、`w3-shot.mjs`
- W4：`w4-{before,after}-*.png`、`w4-measurements*.json`、`w4-measure.mjs`
- W5：`w5-terminal-{light,dark}-{1366,1920,390}.png`
- W6：`w6-newtask-1600x800.png`（新图）、`w6-old-screenshot.png`（旧图备份）、`w6-compare-old-vs-new.png`、`w6-home-preview-check.png`、`w6-{shot,verify}.mjs`、`w6-{build,server,tsc}.log`
- W8：`w8-{before,after}-{1366x768,1440x900,1920x1080}.png`、`w8-measurements*.json`、`w8-measure.mjs`、`w8-report.md`
- W9：`w9-{before,after}-{all,unread,error,task,system,configuration}.png`、`w9-measurements*.json`、`w9-report.md`
- W10：`w10-first-open-{light,dark}.png`、`w10-invalid-fallback-light.png`、`w10-preset-wine-light.png`、`w10-settings-default-graphite.png`、`w10-verify.mjs`、`w10-report.md`
- W11：`w11-before-footer-{1366x768,1920x1080,390x844}.png`、`w11-measurements*.json`、`w11-measure.mjs`
- W12：`w12-{before,after}-*.png`、`w12-measurements*.json`、`w12-measure.mjs`、`w12-report.md`
- W7（本轮）：`final/`（统一验证日志与截图复核，见上节）
