# 手机工作台清理 + 用户指南移入设置 — PROPOSAL

> 只调查、只写方案，不改代码。背景：用户 2026-11-19 16:24 反馈手机 web 工作台难用（拥挤、东西多、图标大、头标题占空间），16:27 补充 bug（对话页点进去点不出来）；11:14 指示用户指南从侧栏移到设置里，至今未做。
>
> 实施窗口：等 rc.2 安装包构建问题解决后再动手。构建读同一工作树；当前构建因 Linux makensis 512MB 限制卡住（bc095da 已上 Gitee，待用户定 PC 构建）。本地改动须等构建路径定下来再开始，避免污染构建输入。
>
> 口径：视口 390×844（iPhone 级），根字号 17px（`globals.css:933`，`font-size: 106.25%`）。以下 px 数按 17px 根字号换算（`size-10` = 42.5px，`size-7` = 29.75px，`size-5` = 21.25px，`size-4` = 17px，`text-2xl` = 25.5px，`text-sm` = 14.9px，`text-xs` = 12.75px）。实测数字来源：代码静态量取 + 既有 390 截图（见各条），未重新截图、未起新构建。

## 1. 实测问题清单

### B0（P0 bug）：对话页有进无出——汉堡被工具栏挤出可视区

**进出路径。** 进：新任务提交 / 抽屉会话列表点会话 → `setView('conversations')` + `setActiveConversation`。退：唯一出口是聊天区 header 里的汉堡（`src/components/chat-panel.tsx:119-130`，`title="打开会话列表"`，点后 `setMobileSidebarOpen(true)` 开抽屉）；移动顶栏在有活跃会话时不渲染（`src/components/app-workbench.tsx` 顶栏条件 `(view !== 'conversations' || !hasActiveConversation)`）。SPA 无路由，浏览器返回即出站，无第二条出路。

**宽度账（390 下，header `chat-panel.tsx:116`，`px-5 py-3` + `overflow-hidden`）：**

| 段 | 宽度 |
|---|---|
| header 左右 padding（`px-5`） | 42.5px |
| header 内 gap | 12.75px |
| 右侧工具栏（`chat-toolbar.tsx:31`，`shrink-0`，不参与压缩） | 见下 |
| 左容器（汉堡 + 头像 + 标题，`flex-1 min-w-0 overflow-hidden`）剩 | **约 9px** |

工具栏逐项（`chat-toolbar.tsx`）：3 键组（工作区/产物库/文件库，`icon-sm` 29.75px ×3 + 边框/padding）≈ 104px；大纲 `size="icon"` 34px（`conversation-outline.tsx:83-84`）；「更多」29.75px；分隔线 5.25px；Workspace Memory 29.75px；运行展板 29.75px；用量徽章约 55px；6 处 `gap-1.5` 约 38px。**合计约 326px**。

左容器只剩约 9px，汉堡（29.75px）被 `overflow-hidden` 裁成一条约 9px 的细边——**看不见、点不到**；标题与头像全程缺失（种子态截图里也没有标题）。

**用量徽章是压垮骆驼的稻草。** `src/components/usage-badge.tsx:27`：`runCount === 0` 时不渲染（注释自述"没用量时不渲染"）。batch-4 用种子会话验证（无用量，工具栏约 270px，左容器约 65px，汉堡刚好露出，标题仍被裁），所以验证通过；真实会话跑过一次就出现徽章（+55px），汉堡被挤掉。这就是"验证时能出、用户用时出不去"的根因。

**证据：**
- `~/workspace/frontend-polish-evidence/batch4-leftovers/w5-after-8b-chat-active-390.png`：header 只有汉堡 + 7 枚工具图标，标题、头像、用量徽章全无（徽章在该种子态未出现）。
- `w5-after-8b-chat-hamburger-390.png` 与上图 **sha256 完全相同**——所谓"汉堡打开抽屉"的验证截图里根本没有抽屉。该轮对抽屉打开的验证不可信，需按 A1 重新实测。
- batch-4 PROGRESS §8b 的文字记录（汉堡开抽屉、点会话收抽屉）只在种子态成立；§8a 抽屉导航关闭逻辑本身（`changeViewFromMobile`）无问题，故障点不在抽屉，在汉堡进不去。

**附带同 header bug：**「更多」下拉菜单（`chat-toolbar.tsx:64`，`absolute right-0 top-full`）挂在带 `overflow-hidden` 的 header 内，出框即被裁——全视口都点不开，应随 B0 一起移出 header（改挂 body 或收进抽屉）。

**修复方向（P0，先做）：** 移动端工具栏瘦身 + 汉堡保底。工具栏只留 3 键组 + 「更多」（大纲、添加 Agent 已在更多里；记忆、展板、用量徽章收进更多或只留图标）；汉堡设 `shrink-0`、定最小宽、与标题行脱钩（或移出 header、顶栏常驻）；验收以 A1 为准。备选：对话页加显式返回入口（标题行左箭头回新任务页）——与汉堡二选一，实施时定。

### B1：移动顶栏 64px，两行标题占一半

`MobileWorkbenchTopBar`（`src/components/app-workbench.tsx:447`，`md:hidden`）：`py-2.5`（21.25px）+ `size-10` 菜单键（42.5px）→ **高约 64px，占 844 的 7.6%**。内含 42.5px 菜单键 + 34px 品牌方块 + 两行文字（14.9px 品牌名 + 12.75px 当前页）+ 34px 铃铛 + 34px 主题切换。390 下品牌名截断（截图 `theme-switcher/w4-mobile-390-workbench-pine.png` 显示 "Multi-Agent TeamFl…"）。对话页有活跃会话时顶栏不渲染，问题集中在新任务页与各工作区页。

### B2：新任务页首屏塞了约 10 组东西，团队行掉出首屏 27.3px

默认落地页 `NewTaskView`（`src/components/app-workbench.tsx:1138`）。已有实测（`openspec/changes/newtask-title-hierarchy/PROGRESS.md:35,42`）：**390×844 空输入下团队行底 871.3 vs 视口 844，差 27.3px**（该轮已改善 17px，未根治；根治注明要动顶部栏/pills 布局，另立项——就是本轮）。

首屏自上而下：顶栏 64 + 容器 `pt-6` 25.5 + eyebrow 11px + H1 32px 折两行约 74 + 副文案 13.5px 折两行约 46 + composer（textarea `min-h-[150px]` + 5 枚 chips + CTA，约 330）+ H2 17px ×2（各带 `mt-9` 38px）+ 示例 pills 折两行 + 团队行。容器 `px-8`（左右各 34px）→ 内容宽仅 322px；composer `p-4`。

截图佐证（`theme-switcher/w4-mobile-390-workbench-pine.png`，390 新任务页）：团队圆圈在底部被切一半；队名 11px 在 72px 列内折两行（"需来刻型团队"折成两行）。

### B3：图标偏大

- 抽屉导航图标 `size-5` = **21.25px** 配 14.9px 文字（`app-workbench.tsx:493` 起的 `MobileWorkbenchDrawer`）。
- 顶栏菜单图标 21.25px / 42.5px 键；`PageHeader` 图标 21.25px / 42.5px 盒（`workbench-primitives.tsx:61`）。
- 新任务团队圆圈 38px（`size-[38px]`），示例 pills 图标 14.9px（尚可）。
- 对话 header：7 枚 29.75px 键 + 17px 图标（见 B0）。
- 收敛方向：移动端图标视觉尺寸降一档（16–18px），触击区保持 40px 左右（只降视觉、不降触击区）。

### B4：各工作区 PageHeader 卡在移动端占约 140px

`PageShell`（`workbench-primitives.tsx:26`）：`p-4`（17px）+ 内容 `gap-4`；`PageHeader`（同文件 :61）：`PageCard p-4` + 42.5px 图标盒 + 25.5px 标题 + 描述 1–2 行 + actions 在移动端 `flex-col` 折到标题下方。合计顶栏 64 + 17 + 页头卡约 140 ≈ **220px（26% 视口）才到正文**。适用面：Agent 库 / 能力中心 / 产物库 / 经验资产 / 自动化 / 信息中心 / 数据概览 / 运行展板（运行展板已有 `compact` 档，P0 已收紧，可直接复用模式）。

### B5：抽屉内容多，导航被会话列表顶到需滚动

`MobileWorkbenchDrawer`（`app-workbench.tsx:493`）：宽 `min(86vw,320px)` = 320px。内容：品牌头约 72 + 「个人工作区」卡约 70 + 新建任务 42.5 + 导航 9 项 ×42.5（`workbench-navigation.ts`：协作 2 + 工作区 7）+ 2 分组标题 + 使用指南 42.5 + Workspace 账户 51 ≈ **700px+**；对话页时顶部再加会话列表（`ConversationListPanel` embedded，可滚），导航被顶到需滚动才可见——退出路径变长（与 B0 叠加）。

### B6：对话页底部输入区约 100px

`message-input.tsx:864`：`px-4 pb-2 pt-3` + textarea `min-h-[44px]` + 工具行 ≈ **100–110px**；加上 header 约 62px，消息区剩约 670px。附带：截图里输入框 placeholder 在窄框内折 3 行（"输入消息，Enter 发送，Shift+Enter 换行"），可缩短。

### B7：已知遗留（batch-1 / 标题轮，未修）

- 390 下运行展板 DetailsPanel 6 个 Tab 折成两行，能点但拥挤。
- 390×844 团队名标签在折叠线之下（即 B2 的一部分，见上）。

## 2. 用户指南现状与迁移落点

### 2.1 现状：两个侧栏入口 + 弹窗本体 + 首启自动弹

| 挂载点 | 文件：行 | 说明 |
|---|---|---|
| 桌面侧栏底部按钮 | `app-workbench.tsx:1029-1045` | `CircleHelp size-4` + text-xs「使用指南」，`emitUiCommand('open-user-guide')` |
| 移动抽屉底部按钮 | `app-workbench.tsx:623-636` | `min-h-10`，`CircleHelp size-5`，同一命令 |
| 弹窗本体（首启自动弹） | `src/app/page.tsx:19` 挂载；`src/components/user-guide-dialog.tsx` | `user_guide_dismissed_at` 存服务端；订阅 `open-user-guide`；关过一次后只从入口打开 |
| /home 页脚一句话指引 | `src/components/home/home-sections.tsx:684` | 纯文本（"在「设置」里先配一个模型 API Key"），不动 |

注意：`experience-sidebar.tsx:65,172` 的「快速使用指南」是经验资产自己的指南（`经验资产使用指南` Dialog），不是同一个，别动。

**内容真源** `src/components/user-guide-data.ts`：11 条、5 组（先做这两件事 1 / 协作 2 / 工作区 5 / 分析 2 / 配置 1），`GUIDE_ITEMS` / `GUIDE_GROUPS`，弹窗与 /home 共用，**不动**。

**弹窗结构**（`user-guide-dialog.tsx:148`）：`DialogContent h-[calc(100vh-2rem)] w-[calc(100vw-1rem)]`，左导航 11 项（移动端横向滚动）+ 右栏滚动 + footer 两按钮；内含状态卡（"去配置"跳设置分区）与"打开「X」"视图跳转（`goSettings` / `goView`）。

### 2.2 迁移落点（推荐）：设置新增第 10 个 Tab「使用指南」

`SETTINGS_SECTIONS`（`src/components/settings-dialog.tsx:61-71`）现有 9 个：外观 / 供应商 / 对象存储 / 模型与分配 / 故障转移 / 移动端 / 发布 / 官网 / 通知。末尾加 `{ value: 'guide', label: '使用指南', icon: BookOpen }`（`BookOpen` 已在该文件 import）。

- **内容：** 从 `user-guide-dialog.tsx` 抽出 `UserGuideContent` 共享组件（`StartSection` / `ModuleSection`，参数化 `onGoSettings` / `onGoView`），设置 Tab 内单列滚动通读 11 节（移动端不再套一层横向导航）；弹窗保留首启自动弹与左导航，复用同一组件。
- **行为映射：** Tab 内"去配置"→切 Tab；"打开「X」"→关设置 + `setView`。弹窗原有 `goSettings` / `goView` 逻辑复用。
- **删除：** 两侧栏入口按钮（`app-workbench.tsx:1029-1045`、`:623-636`）及相关注释；`open-user-guide` 命令保留（首启弹窗仍用）。
- **移动端注意：** 设置导航在小屏已是横向滚动（9 Tab + Key 说明固定项 = 10 枚芯片），加指南成 11 枚；Key 说明合并（§3）后回到 10 枚。

**备选（不推荐）：** 设置里只放一个"打开使用指南"按钮，点后关设置再弹原弹窗——多一次往返，且弹窗与设置叠层正是 `user-guide-dialog.tsx:77-80` 注释里明确要避开的"两个模态抢焦点"问题。

## 3. 关联项：设置里两个「供应商 Key 说明」入口

- **现状：** ① 供应商 Tab（`SETTINGS_SECTIONS` 的 `'keys'`，`settings-dialog.tsx:66`）；② 固定导航项「Key 说明」（`settings-dialog.tsx:475-507`，`Info` 图标，点后 `setTab('keys')`，说明文字只在 Tooltip 里）。
- Tooltip 原文："填写常用供应商的 API Key。填写后将覆盖系统环境变量；留空则继续使用环境变量（如有）。Agent 设置中单独配置的 Key 仍然优先级最高。"
- **建议顺手一起做：** 删固定项，把 Tooltip 文字原样落成供应商 Tab 顶部的一行提示（`ProvidersPanel` 上方，muted 小字，`settings-dialog.tsx:509` 起的 `keys` 内容区）。理由：同一文件、相邻行数、零风险；删后移动端设置导航少一枚芯片，正好抵消指南 Tab 的新增；11:14 至今用户没回，但改动可逆且只减重复。
- **若用户不同意：** 单独 revert 该处即可，不影响指南迁移与工作台清理。实施时把它放单独 commit。

## 4. 具体改动列表（按文件）

| 文件 | 改动 |
|---|---|
| `src/components/app-workbench.tsx` | ① `MobileWorkbenchTopBar`（:447）瘦身：单行标题、去副标题、品牌方块 34→28px、目标高 ≤48px；② `MobileWorkbenchDrawer`（:493）：删使用指南按钮（:623-636），导航图标 21.25→17px，对话页会话列表默认折叠或导航置顶（实施时二选一）；③ `NewTaskView`（:1138）移动端：容器 `px-8`→`px-4`，H1 32→28px，副文案收至 1–2 行，composer textarea `min-h` 150→120，pills/团队行收紧；④ 删桌面侧栏使用指南按钮（:1029-1045） |
| `src/components/workbench-primitives.tsx` | `PageHeader`（:61）加移动端收紧形态：图标盒 42.5→32px、标题 25.5→20px、描述收 1 行、actions 横排收进「更多」（或复用运行展板 `compact` 档） |
| `src/components/chat-panel.tsx` | header（:116）P0：汉堡 `shrink-0` 定最小宽、保证不被工具栏挤压；标题行恢复可见（头像组可隐藏，标题不可） |
| `src/components/chat-toolbar.tsx` | 工具栏移动端瘦身（P0）：用量徽章只留图标或收进「更多」；记忆/展板按钮收进「更多」；「更多」下拉（:64）移出 `overflow-hidden` 的 header（改挂 body 或收进抽屉） |
| `src/components/message-input.tsx` | 移动端 placeholder 缩短、工具行收紧（P2，可选） |
| `src/components/settings-dialog.tsx` | `SETTINGS_SECTIONS` 加指南 Tab；Tab 内容区渲染 `UserGuideContent`；删 Key 说明固定项（:475-507），供应商 Tab 顶加提示行（:509） |
| `src/components/user-guide-dialog.tsx` | 抽出 `UserGuideContent`（`StartSection` / `ModuleSection`）供弹窗与设置 Tab 共用；弹窗本体保留（首启自动弹） |
| `src/components/user-guide-data.ts` | 不动 |
| `src/stores/app-store.ts` | 不动（`tab` 是 string state；`SettingsSection` 深链不含 guide，如需深链再加） |

## 5. 分工与验收标准

**分工：** P0 对话页出口（B0）先做、单独验证；P1 顶栏 + 新任务首屏（B1/B2）+ 指南迁移；P2 各页 PageHeader 与图标降档（B3/B4）；P3 抽屉与输入区（B5/B6）；Key 说明合并随 P1 同批（两个 commit：先指南迁移，后 Key 说明合并，便于单独 revert）。

**验收（390×844，本地构建实测 + 截图）：**
- A1 对话页：汉堡可见且可点（点开抽屉）；标题可见；跑过一次任务（用量徽章出现）后汉堡仍可见可点；抽屉内点导航可退出到任意视图；「更多」菜单可点开且不被裁。
- A2 新任务页：团队行（含 11px 队名）整行在首屏内（行底 ≤844）；顶栏 ≤48px；H1 不超过两行。
- A3 各工作区页：顶栏 + PageHeader 卡合计 ≤150px；首屏见正文第一卡。
- A4 设置：10 个 Tab，指南 Tab 内 11 节可读、跳转可用；两侧栏无「使用指南」按钮；供应商 Tab 顶有提示行、导航无「Key 说明」重复项。
- A5 回归：`tsc 0`、`eslint 0`、vitest 通过；桌面 1366/1920 布局不变（抽查截图）；首启指南仍自动弹一次。

**实施窗口：** 待 rc.2 构建问题解决后再动手；动工前确认构建方已取走 `bc095da`（或构建已放弃本机）。

## 6. 明确不做范围

- 不做真机/线上测试（本地 390 模拟验证；上线后用户在手机上复核）。
- 不动桌面端（`md+`）布局、不改主题配色、不改导航分组与文案（Key 说明提示行落位除外）。
- 不重构对话页为独立路由（SPA 视图状态不变；浏览器返回仍出站——如用户要，再立项）。
- 不动 `/home`、`/demo`、移动伴随 App（`apps/mobile`）、经验资产自己的快速使用指南。
- 不碰安装包构建与 makensis 问题（另案；本方案只约定实施窗口）。

## 7. 参考

- 既有 390 证据：`~/workspace/frontend-polish-evidence/theme-switcher/w4-mobile-390-workbench-pine.png`（新任务页）、`batch4-leftovers/w5-after-8b-chat-active-390.png`（对话页 header 缺标题）、`batch4-leftovers/w5-after-8b-chat-hamburger-390.png`（与上图 sha256 相同，抽屉未出现）。
- 既有记录：`openspec/changes/batch1-responsive/PROGRESS.md`（390 抽屉/对话框）、`openspec/changes/batch4-leftovers/PROGRESS.md`（§8a/§8b）、`openspec/changes/newtask-title-hierarchy/PROGRESS.md`（390 团队行 871.3px）。
