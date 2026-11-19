# README demo 链接 + 团队详情对话框溢出 — 实施记录

- 日期：2026-11-19
- 背景：用户 2026-11-19 10:19 明确下令：README 放最新 demo 链接；团队详情对话框溢出风险修掉；安装包更新等他测试完再说，不在本轮。
- 方案：`openspec/changes/readme-demo-link-team-dialog/proposal.md`；任务：同目录 `tasks.md`（八项全打勾）。
- 状态：**两项全部完成并通过验证**。未 commit、未 push、未部署（HEAD 仍为 `89a0ee7`，改动在工作树：README.md、README.zh-CN.md、src/components/team-detail-dialog.tsx）。
- 证据：`~/workspace/frontend-polish-evidence/readme-demo-link-team-dialog/`（seed.mjs、teamdialog-verify.mjs、teamdialog-edit-verify.mjs、teamdialog-results-before.json、teamdialog-results.json、截图 5 张）。

## 1. README 放最新 demo 链接 — 完成

- 最新 demo 链接：`http://121.40.240.236/demo`（部署 #7 已上线）。
- 改法：恢复 ecf4ed9 的写法，徽章行下方、语言切换行上方加居中加粗一行。英文原样 `🌐 Live demo — no login needed: http://121.40.240.236/demo`；中文原样 `🌐 在线演示，无需登录：http://121.40.240.236/demo`。两份 README 各 1 处，均在第 15 行。
- 第 79 行（现第 83 行）与新加的保持一致：URL 相同；引导语已过时所以改掉——英文 `Live demo once deployed:` → `Live demo:`，中文 `部署后访问：` → `在线演示：`。
- 除此之外未改 README 其他内容；未碰网站首页（/home hero 的“在线演示”按钮本来就有）。
- 核对：`grep 121.40.240.236/demo README.md README.zh-CN.md`——每份 2 处，URL 逐字一致。

## 2. 团队详情对话框溢出 — 完成

### 根因

与已修好的 create-team-dialog 相同：DialogContent 本身是 grid，但无显式 `grid-rows`，各行按内容自然高度排布；内容区 `flex-1` 不生效；DialogContent 被 `max-h-[90vh] overflow-hidden` 封顶后，多成员时底部按钮区被裁掉且无法滚动到达。第三轮复测“正常”是因为当时成员数少，未触及上限。

### 复现（修前，12 名成员种子团队「多成员验证团队」）

| 视口 | 对话框底边 | footer 底边 | 超出视口 | footer 可见 | 内容区滚动 |
|---|---|---|---|---|---|
| 1366×768 | 729.6（90vh 封顶） | 1230.7 | **462.7px** | 否 | 无（scroller null） |
| 1920×1080 | 1026（90vh 封顶） | 1246.3 | **166.3px** | 否 | 无（scroller null） |

- 滚到底重测数字完全相同——滚无可滚。截图目视：成员只看到第 6 行一半，底部四个按钮（删除团队/关闭/开始对话/编辑）全都不见，无滚动条。
- 数字来源：`teamdialog-results-before.json`（修前探针运行输出逐字转录；修前截图在修后重跑时被同名文件覆盖，以数字为准）。

### 改法（只动 `src/components/team-detail-dialog.tsx`，29 行 diff）

按 create-team-dialog 同款：DialogContent 改为 `grid max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden`（沿用 `DIALOG_SIZE_CLASS.lg`）；第一行包 DialogHeader + 错误提示；第二行包加载态/内容区（单个 `min-h-0 flex-1 overflow-y-auto` 容器，内容区内部不再另设滚动）；第三行 DialogFooter 固定可见。不改任何行为逻辑。

### 复测（修后，同一种子、同一探针）

| 视口 | 对话框底边 | footer 底边 | 超出视口 | footer 可见 | 内容区滚动 |
|---|---|---|---|---|---|
| 1366×768 | 751 | 751 | -17（框内） | 是 | clientH 567 / scrollH 1026，maxScrollTop 459 |
| 1920×1080 | 1063 | 1063 | -17（框内） | 是 | clientH 879 / scrollH 1026，maxScrollTop 147 |

- 截图目视：1366 下成员 1–5 + 第 6 行一半，底部四个按钮全部可见；滚到底后成员 5–12 全可达（第 12 行完整可见），底部按钮仍固定不动。
- 编辑态追加复核（1366×768，点「编辑」）：footer 可见（底边 751，-17），四个按钮为 删除团队/关闭/取消/保存，表单在位，内容区 clientH 567 / scrollH 1246。

### 验证方法

- 服务 `next start -p 3167`（127.0.0.1），隔离库 `AGENTHUB_DATA_DIR=/tmp/readme-teamdialog-data`（种子：12 个 Agent + 12 名成员团队；真实 `.agenthub-data` 未碰）；验证后服务已停（按端口 PID 停）、隔离目录已删除。
- 干净生产构建 exit 0，新 BUILD_ID `9C80MJP-HZ4E6lVPC8CTh`。首轮构建失败一次：Turbopack Noto Serif SC 字体远程拉取报错（白·主题轮同款冷缓存抖动），无代码改动直接重试即成功。

## 静态检查 + 测试

- `npx tsc --noEmit`：exit 0，错误 0。
- `npx eslint`（改动文件）：0 错误（2 条 warning 均为 .md 文件被配置忽略，与改动无关）。
- 全量 `npx vitest run`：104 文件，**894 通过 / 4 跳过 / 0 失败**（= 基线）。TeamDetailDialog 无专属测试文件。

## 遗留（非阻塞）

1. `team-detail-dialog.tsx:116` 与 `provider-config-dialog.tsx:151` 的删除确认用的是裸 `confirm()`——第一批 C4 只 grep 了 `window.confirm`，这两处同款漏网；如需换 Dialog 确认另立项（本轮只修溢出，未动）。
2. batch5 其余遗留不变（wine 深 hover 3.82:1 等，见 batch5-cleanup PROGRESS.md）。
3. 安装包更新（/home 与 GitHub/Gitee）等用户测试完这轮再说，不在本轮。
