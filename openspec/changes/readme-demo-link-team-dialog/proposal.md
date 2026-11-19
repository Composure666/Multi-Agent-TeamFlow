# README demo 链接 + 团队详情对话框溢出 — 提案

- 日期：2026-11-19
- 背景：用户 2026-11-19 10:19 明确下令：README 放最新 demo 链接；团队详情对话框溢出风险修掉；安装包更新等他测试完再说，不在本轮。
- 前情：
  - demo 链接：2026-11-07 用户决定 demo 链接只放网站首页、不放 README（提交 9618684 撤掉了 ecf4ed9 加在两份 README 顶部的链接）；2026-11-19 用户改主意了，README 里要放最新的 demo 链接。
  - 团队详情对话框：审计 `module-audit-2026-11-18.md:303` 记为“`team-detail-dialog.tsx:205` 同样是 `max-h-[90vh] + overflow-hidden` 无 grid-rows，第三轮已复测正常 + 强制错误态均 0 溢出，未改（对话框溢出修复遗留④）”。根因与已修好的 create-team-dialog 相同：DialogContent 本身是 grid，但无显式 `grid-rows`，各行按内容自然高度排布；内容区 `flex-1` 不生效；DialogContent 被 `max-h-[90vh] overflow-hidden` 封顶后，多成员时底部按钮区被裁掉且无法滚动到达。第三轮复测“正常”是因为当时成员数少，未触及上限。

## 变更

### 1. README 放最新 demo 链接（README.md、README.zh-CN.md）

- 最新 demo 链接：`http://121.40.240.236/demo`（部署 #7 已上线）。
- 恢复 ecf4ed9 的写法：徽章行下方、语言切换行上方，加居中加粗一行。英文原样：
  `<b>🌐 Live demo — no login needed: <a href="http://121.40.240.236/demo">http://121.40.240.236/demo</a></b>`；
  中文原样：`<b>🌐 在线演示，无需登录：<a href="http://121.40.240.236/demo">http://121.40.240.236/demo</a></b>`。
- 第 79 行已有的一行与新加的保持一致：URL 相同；把已过时的引导语改掉——英文 `Live demo once deployed:` → `Live demo:`，中文 `部署后访问：` → `在线演示：`（部署 #7 已上线，“once deployed / 部署后”已不准确）。
- 除此之外不改 README 其他内容；不碰网站首页（/home hero 的“在线演示”按钮本来就有）。

### 2. 团队详情对话框溢出修掉（src/components/team-detail-dialog.tsx）

- 先复现：在 1366×768 与 1920×1080 下打开一个成员足够多的团队详情，实测底部是否被裁。
- 按 create-team-dialog 同款修法：DialogContent 改为 `grid max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden`（沿用 `DIALOG_SIZE_CLASS.lg`）；第一行包 DialogHeader + 错误提示；第二行包加载态/内容区（单个 `min-h-0 overflow-y-auto` 容器，内容区内部不再另设滚动）；第三行 DialogFooter 固定可见。
- 只动这一个文件；不改任何行为逻辑。
- 观察到的既存问题（不在本轮范围，记入遗留）：`team-detail-dialog.tsx:116` 删除确认用的是裸 `confirm()`，第一批 C4 只 grep 了 `window.confirm`，这处与 `provider-config-dialog.tsx:151` 同款漏网；如需换 Dialog 确认另立项。

## 验证

- `npx tsc --noEmit` 0 错误；eslint（改动文件）0 错误；相关测试 + 全量 vitest。
- Playwright：复现前后各测一次（1366×768、1920×1080，成员足够多的团队），修后两档视口 0 溢出、底部按钮全部可见可点；截图存证。
- README 两处顶部链接与第 79 行逐字核对（URL 一致、引导语一致）。

## 不做

- 不 commit、不 push、不部署；安装包更新等用户测试完再说。
