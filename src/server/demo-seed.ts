/**
 * 演示模式种子数据 —— /demo 的全部展示内容。
 *
 * 纯静态数据，不读不写数据库，也不调任何真实模型：
 *  - 演示 Agent 直接复用内置 Agent 定义（BUILTIN_AGENTS），只补齐行字段；
 *  - 演示会话、用户消息、产物与回放脚本都在这里写死；
 *  - MockAdapter 的演示脚本与 /demo 的客户端回放共用同一份 turns。
 *
 * 本文件只 import 类型与纯数据（BUILTIN_AGENTS），不 import 任何 node 模块，
 * 因此客户端组件也可以直接 import（与 src/components 里已有的 `@/server/` 引用同理）。
 */
import type { AgentRow, ConversationWithMeta, MessageRow } from '@/db/schema'
import { BUILTIN_AGENTS } from '@/db/builtin-agents'
import type { ScriptStep } from '@/shared/scripted-stream'
import type { ArtifactRecord, DispatchPlanItem } from '@/shared/types'

/** 展示会话的固定时间锚点 —— 种子里的 createdAt 都由此派生。 */
export const DEMO_BASE_TIME = Date.parse('2026-11-07T09:00:00+08:00')

export const DEMO_CONVERSATION_ID = 'conv_demo_showcase'
export const DEMO_USER_MESSAGE_ID = 'msg_demo_user'

/** 演示用的 5 个内置 Agent（Orchestrator / PM 小灰 / UI 设计师 / 前端工程师 / Reviewer）。 */
export const DEMO_AGENTS: AgentRow[] = BUILTIN_AGENTS.map((a) => ({
  ...a,
  apiKey: null,
  apiBaseUrl: null,
  mcpServerIds: [],
  skillIds: [],
  modality: 'text',
  modelProvider: a.modelProvider ?? null,
  modelId: a.modelId ?? null,
  supportsVision: a.supportsVision ?? false,
  isBuiltin: a.isBuiltin ?? false,
  isOrchestrator: a.isOrchestrator ?? false,
  createdAt: DEMO_BASE_TIME,
}))

export const DEMO_CONVERSATION: ConversationWithMeta = {
  id: DEMO_CONVERSATION_ID,
  title: '「光影造像工坊」品牌落地页',
  mode: 'group',
  agentIds: DEMO_AGENTS.map((a) => a.id),
  pinnedMessageIds: [],
  bookmarkedMessageIds: [],
  archived: false,
  pinnedAt: null,
  fsWriteApprovalMode: 'review',
  createdAt: DEMO_BASE_TIME,
  updatedAt: DEMO_BASE_TIME,
  workspaceMode: 'sandbox',
  workspaceBoundPath: null,
}

/** 触发整场演示的用户需求。 */
export const DEMO_USER_MESSAGE: MessageRow = {
  id: DEMO_USER_MESSAGE_ID,
  conversationId: DEMO_CONVERSATION_ID,
  role: 'user',
  agentId: null,
  parts: [
    {
      type: 'text',
      content:
        '我们要给「光影造像工坊」做一个品牌落地页，定位是高端人像摄影工作室，要高级、有电影感，明天就要给客户看。先出 PRD、设计稿，再做一版可预览的网页，最后评审一遍。',
    },
  ],
  status: 'complete',
  parentMessageId: null,
  mentionedAgentIds: [],
  runId: null,
  usage: null,
  createdAt: DEMO_BASE_TIME,
}

// ─── 产物链：PRD → 设计指南 → 网页 → 评审 ──────────────────

export const DEMO_ARTIFACT_PRD: ArtifactRecord = {
  id: 'art_demo_prd',
  conversationId: DEMO_CONVERSATION_ID,
  type: 'document',
  title: '「光影造像工坊」品牌落地页 PRD',
  content: {
    type: 'document',
    format: 'markdown',
    content: [
      '# 「光影造像工坊」品牌落地页 PRD',
      '',
      '## 1. 背景与目标',
      '',
      '光影造像工坊是一家高端人像摄影工作室，客单价高、靠口碑获客。落地页的目标只有一个：让访客在 30 秒内相信「这里能拍出电影感的人像」，并留下预约意向。',
      '',
      '## 2. 目标用户',
      '',
      '- 准备拍婚纱、写真、形象照的个人客户',
      '- 需要品牌形象照的中小企业主',
      '- 对「高级感」敏感、愿意为审美付费的人群',
      '',
      '## 3. 页面结构（自上而下）',
      '',
      '| 区块 | 内容 | 优先级 |',
      '| --- | --- | --- |',
      '| 首屏 | 工作室名 + 一句话价值主张 + 预约按钮 | P0 |',
      '| 作品墙 | 6 张代表作，大图、少字 | P0 |',
      '| 服务与价格 | 三档套餐，价格区间明示 | P0 |',
      '| 拍摄流程 | 咨询 → 拍摄 → 选片 → 成片，四步 | P1 |',
      '| 客户评价 | 2–3 条真实评价 | P1 |',
      '| 预约 | 表单占位 + 联系方式 | P0 |',
      '',
      '## 4. 视觉要求',
      '',
      '- 整体暗色、电影感；暖金点缀，克制使用',
      '- 大图 + 大留白，少字，拒绝信息堆砌',
      '- 移动端优先：首屏一屏讲清价值主张',
      '',
      '## 5. 非目标',
      '',
      '- 不做在线支付、不做会员系统、不做多语言',
      '',
      '## 6. 验收标准',
      '',
      '- 首屏 3 秒内讲清「高端人像摄影 + 电影感」',
      '- 全部 6 个区块齐全，预约入口在首屏与页尾各出现一次',
      '- 移动端无横向滚动，图片加载不阻塞首屏',
    ].join('\n'),
  },
  version: 1,
  createdByAgentId: 'ag_pm',
  createdAt: DEMO_BASE_TIME + 60_000,
}

export const DEMO_ARTIFACT_DESIGN_GUIDE: ArtifactRecord = {
  id: 'art_demo_design_guide',
  conversationId: DEMO_CONVERSATION_ID,
  type: 'document',
  title: '「光影造像工坊」UI 风格指南',
  content: {
    type: 'document',
    format: 'markdown',
    content: [
      '# 「光影造像工坊」UI 风格指南',
      '',
      '## 1. 整体气质',
      '',
      '暗色电影感：大面积暖黑打底，暖金只做点缀，靠留白和细线分区，不用大阴影、不堆圆角。',
      '',
      '## 2. 配色系统',
      '',
      '- 底色：#0E0D0B（暖黑），用于页面背景',
      '- 面板：#171512，用于卡片与区块底',
      '- 主色：#C9A96A（暖金），用于标题点缀、按钮与分割线',
      '- 正文：#E8E4DC（暖白），用于正文',
      '- 次要文字：#8A8378，用于说明与标注',
      '',
      '## 3. 字体与字号层级',
      '',
      '- 标题：衬线体（Georgia / 宋体 fallback），首屏 56px、区块标题 32px',
      '- 正文：无衬线体，16px、行高 1.8',
      '- 标注：12px、字间距 0.15em、大写英文作装饰',
      '',
      '## 4. 关键组件视觉规范',
      '',
      '### 按钮',
      '',
      '- 主按钮：暖金底、黑字、圆角 2px，hover 加深一档',
      '- 次按钮：透明底、1px 暖金描边、暖金字',
      '',
      '### 卡片',
      '',
      '- 圆角 2px、描边 1px #2A2620、无阴影；图片区与文字区 3:2',
      '',
      '### 分割线',
      '',
      '- 1px #2A2620，区块之间留 96px 间距',
      '',
      '## 5. 间距 / 圆角 / 阴影',
      '',
      '- 区块间距 96px、卡片内边距 24px；圆角统一 2px；阴影基本不用',
      '',
      '## 6. 交互与状态',
      '',
      '- 图片 hover 轻微放大（1.03 倍、0.4s 缓动）',
      '- 按钮 hover 有明确反馈；表单聚焦时描边变暖金',
    ].join('\n'),
  },
  version: 1,
  createdByAgentId: 'ag_designer',
  createdAt: DEMO_BASE_TIME + 120_000,
}

export const DEMO_ARTIFACT_WEB_APP: ArtifactRecord = {
  id: 'art_demo_web_app',
  conversationId: DEMO_CONVERSATION_ID,
  type: 'web_app',
  title: '「光影造像工坊」品牌落地页',
  content: {
    type: 'web_app',
    entry: 'index.html',
    files: {
      'index.html': [
        '<!doctype html>',
        '<html lang="zh-CN">',
        '<head>',
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        '<title>光影造像工坊 · 电影感人像摄影</title>',
        '<style>',
        '  * { margin: 0; padding: 0; box-sizing: border-box; }',
        '  body { background: #0e0d0b; color: #e8e4dc; font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; }',
        '  .wrap { max-width: 1080px; margin: 0 auto; padding: 0 24px; }',
        '  nav { display: flex; justify-content: space-between; align-items: center; padding: 28px 0; }',
        '  .logo { font-family: Georgia, serif; font-size: 20px; letter-spacing: .12em; }',
        '  .logo span { color: #c9a96a; }',
        '  nav a { color: #8a8378; text-decoration: none; font-size: 14px; margin-left: 28px; }',
        '  .hero { text-align: center; padding: 96px 0 80px; }',
        '  .kicker { color: #c9a96a; font-size: 12px; letter-spacing: .35em; }',
        '  h1 { font-family: Georgia, "Songti SC", serif; font-size: 56px; line-height: 1.25; margin: 20px 0; font-weight: 400; }',
        '  .hero p { color: #8a8378; font-size: 17px; line-height: 1.8; }',
        '  .cta { display: inline-block; margin-top: 36px; background: #c9a96a; color: #0e0d0b; padding: 14px 36px; border-radius: 2px; text-decoration: none; font-weight: 600; }',
        '  .ghost { display: inline-block; margin-top: 36px; margin-left: 12px; border: 1px solid #c9a96a; color: #c9a96a; padding: 13px 32px; border-radius: 2px; text-decoration: none; }',
        '  section { padding: 64px 0; border-top: 1px solid #2a2620; }',
        '  h2 { font-family: Georgia, "Songti SC", serif; font-size: 32px; font-weight: 400; margin-bottom: 8px; }',
        '  .sub { color: #8a8378; font-size: 14px; margin-bottom: 32px; }',
        '  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }',
        '  .shot { aspect-ratio: 3 / 4; border-radius: 2px; display: flex; align-items: flex-end; padding: 16px; font-size: 14px; letter-spacing: .08em; }',
        '  .s1 { background: linear-gradient(160deg, #3a2f22, #171512); }',
        '  .s2 { background: linear-gradient(160deg, #4a3a28, #1d1913); }',
        '  .s3 { background: linear-gradient(160deg, #2c2620, #12100d); }',
        '  .s4 { background: linear-gradient(160deg, #54432c, #1a1512); }',
        '  .s5 { background: linear-gradient(160deg, #33291d, #141210); }',
        '  .s6 { background: linear-gradient(160deg, #41351f, #191612); }',
        '  .plans { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }',
        '  .plan { border: 1px solid #2a2620; border-radius: 2px; padding: 28px 24px; background: #171512; }',
        '  .plan.hot { border-color: #c9a96a; }',
        '  .plan h3 { font-size: 18px; margin-bottom: 8px; }',
        '  .price { color: #c9a96a; font-size: 26px; font-family: Georgia, serif; margin: 12px 0; }',
        '  .plan p { color: #8a8378; font-size: 14px; line-height: 1.8; }',
        '  .steps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; }',
        '  .step b { display: block; color: #c9a96a; font-family: Georgia, serif; font-size: 28px; margin-bottom: 10px; }',
        '  .step p { color: #8a8378; font-size: 14px; line-height: 1.8; }',
        '  footer { text-align: center; padding: 48px 0 64px; color: #8a8378; font-size: 13px; border-top: 1px solid #2a2620; }',
        '  @media (max-width: 720px) { h1 { font-size: 36px; } .grid, .plans, .steps { grid-template-columns: 1fr; } }',
        '</style>',
        '</head>',
        '<body>',
        '<div class="wrap">',
        '<nav><div class="logo">光影<span>造像</span>工坊</div><div><a href="#works">作品</a><a href="#plans">套餐</a><a href="#flow">流程</a></div></nav>',
        '<header class="hero">',
        '<div class="kicker">CINEMATIC PORTRAIT STUDIO</div>',
        '<h1>把你拍成<br>电影里的人</h1>',
        '<p>高端人像摄影工作室 · 暗色电影感 · 每一张都值得挂在墙上</p>',
        '<a class="cta" href="#booking">预约拍摄</a><a class="ghost" href="#works">看看作品</a>',
        '</header>',
        '<section id="works"><h2>作品</h2><p class="sub">最近的六组客人，每一组都是一部短片</p><div class="grid">',
        '<div class="shot s1">婚纱 · 雾山</div><div class="shot s2">写真 · 暮色</div><div class="shot s3">形象照 · 窗光</div>',
        '<div class="shot s4">家庭 · 暖阳</div><div class="shot s5">写真 · 雨夜</div><div class="shot s6">婚纱 · 海岛</div>',
        '</div></section>',
        '<section id="plans"><h2>套餐</h2><p class="sub">价格透明，成片数量写进合同</p><div class="plans">',
        '<div class="plan"><h3>轻写真</h3><div class="price">¥1,980 起</div><p>1 小时拍摄 · 10 张精修 · 全部底片赠送</p></div>',
        '<div class="plan hot"><h3>电影人像</h3><div class="price">¥4,980 起</div><p>半日拍摄 · 30 张精修 · 剧情短片一条</p></div>',
        '<div class="plan"><h3>婚纱电影</h3><div class="price">¥9,800 起</div><p>全日跟拍 · 60 张精修 · 婚礼电影成片</p></div>',
        '</div></section>',
        '<section id="flow"><h2>拍摄流程</h2><p class="sub">四步，从咨询到成片</p><div class="steps">',
        '<div class="step"><b>01</b><p>咨询沟通，确定风格与档期</p></div>',
        '<div class="step"><b>02</b><p>拍摄当天，造型与灯光一次到位</p></div>',
        '<div class="step"><b>03</b><p>三日内选片，修图师精修</p></div>',
        '<div class="step"><b>04</b><p>成片交付，底片全部赠送</p></div>',
        '</div></section>',
        '<section id="booking"><h2>预约拍摄</h2><p class="sub">留下联系方式，工作室会在 24 小时内回复档期</p>',
        '<a class="cta" href="#">立即预约</a></section>',
        '<footer>光影造像工坊 · 每周二休息 · 电话 010-8888 6666</footer>',
        '</div>',
        '</body>',
        '</html>',
      ].join('\n'),
    },
  },
  version: 1,
  createdByAgentId: 'ag_frontend',
  createdAt: DEMO_BASE_TIME + 180_000,
}

export const DEMO_ARTIFACT_REVIEW: ArtifactRecord = {
  id: 'art_demo_review',
  conversationId: DEMO_CONVERSATION_ID,
  type: 'document',
  title: '「光影造像工坊」落地页评审意见',
  content: {
    type: 'document',
    format: 'markdown',
    content: [
      '# 「光影造像工坊」落地页评审意见',
      '',
      '## 结论：通过，小修后可交付',
      '',
      '整体符合 PRD 定位：暗色电影感成立，六个区块齐全，预约入口首屏与页尾各有一次。',
      '',
      '## 逐项核对',
      '',
      '| 检查项 | 结果 |',
      '| --- | --- |',
      '| 首屏 3 秒讲清价值主张 | 通过，「把你拍成电影里的人」够直接 |',
      '| 六个区块齐全 | 通过 |',
      '| 配色 / 字体按风格指南 | 通过，暖金点缀克制 |',
      '| 移动端无横向滚动 | 通过，720px 以下单列 |',
      '| 预约入口出现两次 | 通过 |',
      '',
      '## 待改清单',
      '',
      '1. 首屏标题字号再大一级，移动端 36px 略小，提到 40px',
      '2. 预约按钮在移动端要更显眼：首屏主按钮加宽 8px',
      '3. 作品墙 6 张图目前是占位色块，交付前替换为真实成片',
      '',
      '## 风险提示',
      '',
      '- 客户如果要求在线支付，本页不在范围，需另排期',
    ].join('\n'),
  },
  version: 1,
  createdByAgentId: 'ag_reviewer',
  createdAt: DEMO_BASE_TIME + 240_000,
}

export const DEMO_ARTIFACTS: ArtifactRecord[] = [
  DEMO_ARTIFACT_PRD,
  DEMO_ARTIFACT_DESIGN_GUIDE,
  DEMO_ARTIFACT_WEB_APP,
  DEMO_ARTIFACT_REVIEW,
]

// ─── 调度计划与回放脚本 ────────────────────────────────────

/** Orchestrator 拆出的四步计划：PRD → 设计 → 实现 → 评审。 */
export const DEMO_DISPATCH_PLAN: DispatchPlanItem[] = [
  {
    id: 'task-1',
    agentId: 'ag_pm',
    task: '写品牌落地页 PRD：定位、结构、视觉要求、验收标准',
    taskKind: 'doc',
    expectedOutputs: [{ id: 'out-prd', type: 'document', description: '品牌落地页 PRD' }],
  },
  {
    id: 'task-2',
    agentId: 'ag_designer',
    task: '按 PRD 出 UI 风格指南：配色、字体、组件规范',
    taskKind: 'design',
    dependsOn: ['task-1'],
    expectedOutputs: [{ id: 'out-design-guide', type: 'document', description: 'UI 风格指南' }],
  },
  {
    id: 'task-3',
    agentId: 'ag_frontend',
    task: '按风格指南实现一版可预览的品牌落地页',
    taskKind: 'code',
    dependsOn: ['task-2'],
    expectedOutputs: [{ id: 'out-web-app', type: 'web_app', description: '品牌落地页' }],
  },
  {
    id: 'task-4',
    agentId: 'ag_reviewer',
    task: '对照 PRD 评审：逐项核对，给出结论与待改清单',
    taskKind: 'review',
    dependsOn: ['task-3'],
    expectedOutputs: [{ id: 'out-review', type: 'document', description: '评审意见' }],
  },
]

export interface DemoTurn {
  agentId: string
  messageId: string
  runId: string
  steps: ScriptStep[]
}

/**
 * 五轮 agent 回复，按产物链顺序播放。
 * 与 MockAdapter 的演示脚本是同一份数据 —— 改这里，两边一起变。
 */
export const DEMO_TURNS: DemoTurn[] = [
  {
    agentId: 'ag_orchestrator',
    messageId: 'msg_demo_orchestrator',
    runId: 'run_demo_orchestrator',
    steps: [
      {
        kind: 'thinking',
        content: '客户要的是品牌落地页，时间紧。拆成四步：PRD → 设计 → 实现 → 评审，前后依赖，串行走。',
      },
      { kind: 'text', content: '收到，目标很明确：高端人像摄影工作室的品牌落地页，电影感，明天交付。我把任务拆成四步——' },
      { kind: 'dispatch', plan: DEMO_DISPATCH_PLAN },
      {
        kind: 'text',
        content: '小灰先出 PRD，设计师按 PRD 出风格指南，前端照着做一版可预览的网页，最后 Reviewer 过一遍再交付。开始。',
      },
    ],
  },
  {
    agentId: 'ag_pm',
    messageId: 'msg_demo_pm',
    runId: 'run_demo_pm',
    steps: [
      {
        kind: 'thinking',
        content: '先把定位、受众、页面结构定下来，电影感要落到具体的视觉语言上，不能只写形容词。',
      },
      {
        kind: 'artifact',
        toolName: 'write_artifact',
        args: { type: 'document', title: '「光影造像工坊」品牌落地页 PRD' },
        result: { ok: true, artifactId: DEMO_ARTIFACT_PRD.id },
        artifact: DEMO_ARTIFACT_PRD,
      },
      {
        kind: 'text',
        content:
          'PRD 写好了，核心就三点：定位高端人像摄影，电影感靠大面积暗色 + 暖金点缀 + 宽幅留白来表达；首屏一句话讲清价值主张，往下依次是作品、服务、流程、预约。',
      },
    ],
  },
  {
    agentId: 'ag_designer',
    messageId: 'msg_demo_designer',
    runId: 'run_demo_designer',
    steps: [
      {
        kind: 'thinking',
        content: '按 PRD 的定位走暗色电影感路线，配色、字体、间距一次定死，前端直接照着用。',
      },
      {
        kind: 'artifact',
        toolName: 'write_artifact',
        args: { type: 'document', title: '「光影造像工坊」UI 风格指南' },
        result: { ok: true, artifactId: DEMO_ARTIFACT_DESIGN_GUIDE.id },
        artifact: DEMO_ARTIFACT_DESIGN_GUIDE,
      },
      {
        kind: 'text',
        content:
          '风格指南好了：底色 #0E0D0B 暖黑，主色暖金 #C9A96A，标题用衬线体、正文用无衬线，卡片圆角 2px、几乎不用阴影，靠留白和细线分区。前端按这个来，味道不会跑偏。',
      },
    ],
  },
  {
    agentId: 'ag_frontend',
    messageId: 'msg_demo_frontend',
    runId: 'run_demo_frontend',
    steps: [
      {
        kind: 'thinking',
        content: '按风格指南实现，首屏大标题 + 作品墙 + 套餐与预约区块，先保证可预览，再抠细节。',
      },
      {
        kind: 'artifact',
        toolName: 'write_artifact',
        args: { type: 'web_app', title: '「光影造像工坊」品牌落地页' },
        result: { ok: true, artifactId: DEMO_ARTIFACT_WEB_APP.id },
        artifact: DEMO_ARTIFACT_WEB_APP,
      },
      {
        kind: 'text',
        content:
          '网页做好了，可以直接预览：首屏大标题 + 作品墙 + 套餐与预约区块，配色和字体都按风格指南来的。点消息里的产物卡片就能看效果。',
      },
    ],
  },
  {
    agentId: 'ag_reviewer',
    messageId: 'msg_demo_reviewer',
    runId: 'run_demo_reviewer',
    steps: [
      {
        kind: 'thinking',
        content: '对照 PRD 一项项核：定位、结构、视觉、交付物，挑出问题再给结论。',
      },
      {
        kind: 'artifact',
        toolName: 'write_artifact',
        args: { type: 'document', title: '「光影造像工坊」落地页评审意见' },
        result: { ok: true, artifactId: DEMO_ARTIFACT_REVIEW.id },
        artifact: DEMO_ARTIFACT_REVIEW,
      },
      {
        kind: 'text',
        content:
          '评审完了，结论是通过，小修两处：首屏标题字号再大一级，预约按钮在移动端要更显眼。清单都在评审意见里，按这个改就能交付。',
      },
    ],
  },
]

/** MockAdapter 触发演示脚本的关键词 —— 与现有脚本的关键词分发走同一路。 */
export const DEMO_SCRIPT_TRIGGER = '光影造像工坊'
