import {
  Activity,
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  Boxes,
  ClipboardList,
  Code,
  Globe,
  HardDrive,
  Layers,
  MessageSquare,
  Palette,
  SearchCheck,
  ShieldCheck,
  Target,
  Workflow,
  type LucideIcon,
} from 'lucide-react'

/**
 * 项目主页（/home）的内容真源。
 *
 * 文案口径与 `README.zh-CN.md`、`src/components/workbench-navigation.ts` 保持同步：
 * 功能模块的 label 与 description 直接对齐工作台里真实的模块，不另造一套说法。
 * 本文件只放「数据」，不放 JSX —— 便于逐条校对，也便于以后接 CMS。
 */

/** 仓库地址 —— 与 package.json#repository 保持一致。 */
export const REPO_URL = 'https://github.com/Composure666/Multi-Agent-TeamFlow'

/** 版本号 —— 与仓库根 `VERSION`、`package.json#version` 保持三处一致，改版本时同步。 */
export const APP_VERSION = 'v0.2.0-rc.2'

export const HOME_NAV: { href: string; label: string }[] = [
  { href: '#preview', label: '界面预览' },
  { href: '#workflow', label: '工作流' },
  { href: '#architecture', label: '架构' },
  { href: '#features', label: '功能模块' },
  { href: '#proof', label: '数字证明' },
  { href: '#download', label: '桌面端' },
]

/** 首屏「一句话承诺」——四条最容易被追问的事实。 */
export const TRUST_MARKERS: { label: string; icon: LucideIcon }[] = [
  { label: '本地优先，数据不出本机', icon: HardDrive },
  { label: '无需注册账号', icon: ShieldCheck },
  { label: 'AGPL-3.0 开源', icon: BookOpen },
  { label: 'Web · 桌面 · 移动', icon: Globe },
]

/** 产物是一等公民：这些类型都能就地预览。 */
export const ARTIFACT_TYPES = [
  'web_app',
  'document',
  'image',
  'ppt',
  'diagram',
  'code_file',
  'diff',
  'project',
]

export const WORKFLOW_STEPS: { title: string; description: string }[] = [
  {
    title: '提出目标',
    description: '新建会话，用自然语言说清你要什么 —— 不需要预先想好这件事该拆成几步。',
  },
  {
    title: 'Orchestrator 判断与派单',
    description:
      '它先判断是否真的需要多个角色，再用 plan_tasks 写清责任 Agent、预期产物与依赖关系。简单问题直接回答。',
  },
  {
    title: '专长 Agent 并行产出',
    description:
      '每个 Agent 只做自己擅长的一段，产出的是带类型的产物，而不是又一段需要人复述的自然语言。',
  },
  {
    title: '产物依赖链传递上下文',
    description:
      '下游 Agent 直接读前序产物，不必从对话里重新猜上下文；一次运行产出的多张图片会自动归入同一相册。',
  },
  {
    title: '收拢、评审与交付',
    description:
      'Reviewer 对照原始需求验收；你在产物库里就地预览、导出，或把单个产物 / 整个工作区发布成可分享的 URL。',
  },
]

/** 一条端到端链路的示意图（PRD → 设计规范 → web_app → 评审）。 */
export const PIPELINE: { owner: string; detail: string }[] = [
  { owner: '你的目标', detail: '自然语言描述' },
  { owner: 'Orchestrator', detail: 'plan_tasks 拆解派单' },
  { owner: 'PM 小灰', detail: '产出 PRD' },
  { owner: 'UI 设计师', detail: '产出设计规范' },
  { owner: '前端工程师', detail: '产出 web_app' },
  { owner: 'Reviewer', detail: '对照需求评审' },
]

export type FeatureItem = {
  /** 与 workbench-navigation 的 view id 对应，方便日后深链到工作台。 */
  id: string
  label: string
  icon: LucideIcon
  tagline: string
  description: string
}

/** 主要功能模块 —— 与侧边栏的 9 个模块一一对应。 */
export const FEATURES: FeatureItem[] = [
  {
    id: 'conversations',
    label: '对话',
    icon: MessageSquare,
    tagline: '群聊式多 Agent 会话',
    description:
      '一个会话里可以放任意多个 Agent：既可以用 @ 精确点名，也可以交给 Orchestrator 自动路由。',
  },
  {
    id: 'agents',
    label: 'Agent 库',
    icon: Bot,
    tagline: '5 个内置 Agent + 无限自建',
    description:
      '内置 Orchestrator、PM 小灰、UI 设计师、前端工程师与 Reviewer；也可用构建器自定义适配器、模型、工具与提示词。',
  },
  {
    id: 'artifacts',
    label: '产物库',
    icon: Layers,
    tagline: '产物是一等公民',
    description:
      'web_app、document、image、ppt、diagram、code_file、diff、project 都能就地预览与导出，并记录生成它的 prompt、模型与参数，结果可复现。',
  },
  {
    id: 'capability-center',
    label: '能力中心',
    icon: Boxes,
    tagline: 'Skills 与 MCP 统一治理',
    description:
      '集中管理 Skills、MCP server 以及二者的绑定关系，明确每个 Agent 到底被允许调用什么。',
  },
  {
    id: 'information-center',
    label: '信息中心',
    icon: Bell,
    tagline: '通知、审批与待办',
    description:
      '高风险 shell 命令与越界文件写入执行前会先弹审批提示 —— 在你批准之前，什么都不会真的执行。',
  },
  {
    id: 'experiences',
    label: '经验资产',
    icon: BookOpen,
    tagline: '越用越懂你的项目',
    description:
      '平台会从已完成的运行里提炼可复用教训并沉淀成条目，再注入到后续提示词中。',
  },
  {
    id: 'automation',
    label: '自动化',
    icon: Workflow,
    tagline: '计划任务与运行历史',
    description: '按时间表触发任务，运行结果以通知形式回到会话里，不必盯着页面等。',
  },
  {
    id: 'run-board',
    label: '运行展板',
    icon: Activity,
    tagline: '单个 Run 的全过程',
    description:
      '以流程图展开每个 Agent 的命令、工具调用与产物产出，出问题时能直接落到具体那一步。',
  },
  {
    id: 'analytics',
    label: '数据概览',
    icon: BarChart3,
    tagline: '所有 Run 的统计表现',
    description: '聚合成功率、耗时与模型用量，用一眼可读的方式观察整体运行健康度。',
  },
]

/** 内置 Agent —— 全部走 claude-code 适配器，职责描述与 README 表格一致。 */
export const BUILTIN_AGENTS: { name: string; role: string; icon: LucideIcon; duty: string }[] = [
  {
    name: 'Orchestrator',
    role: '调度',
    icon: Target,
    duty: '理解意图、拆解任务、派单，并把各 Agent 的成品聚合成一份交付。',
  },
  {
    name: 'PM 小灰',
    role: '需求',
    icon: ClipboardList,
    duty: '需求分析与用户故事，产出 PRD 文档。',
  },
  {
    name: 'UI 设计师',
    role: '设计',
    icon: Palette,
    duty: '制定 UI 风格指南与设计规范，为下游实现提供依据。',
  },
  {
    name: '前端工程师',
    role: '实现',
    icon: Code,
    duty: '按规范完成前端实现，产出可预览的 web_app 产物。',
  },
  {
    name: 'Reviewer',
    role: '评审',
    icon: SearchCheck,
    duty: '对照原始需求评审交付物，指出没做到的地方而不是泛泛夸奖。',
  },
]

/** 数字证明：全部是真实值，不写没验证过的数字。 */
export const PROOF_STATS: { value: string; label: string }[] = [
  { value: '987', label: '测试通过' },
  { value: '5', label: '个内置 Agent' },
  { value: '8', label: '种产物类型' },
  { value: '3', label: '端：Web · 桌面 · 移动' },
]

export const QUICKSTART_COMMANDS = [
  'git clone https://github.com/Composure666/Multi-Agent-TeamFlow.git',
  'cd multi-agent-teamflow',
  '',
  'pnpm install',
  '',
  'cp .env.example .env.local   # 至少填入一个 provider 的 API key',
  '',
  'pnpm dev                     # 打开 http://localhost:3000',
]

export const FOOTER_LINKS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: '产品',
    links: [
      { label: '工作流', href: '#workflow' },
      { label: '界面预览', href: '#preview' },
      { label: '架构与流程', href: '#architecture' },
      { label: '功能模块', href: '#features' },
      { label: '数字证明', href: '#proof' },
      { label: '桌面端下载', href: '#download' },
    ],
  },
  {
    title: '文档',
    links: [
      { label: 'README', href: `${REPO_URL}/blob/master/README.zh-CN.md` },
      { label: '安装指南', href: `${REPO_URL}/blob/master/INSTALL.md` },
      { label: '代码地图', href: `${REPO_URL}/blob/master/OVERVIEW.md` },
      { label: '变更记录', href: `${REPO_URL}/blob/master/CHANGELOG.md` },
    ],
  },
  {
    title: '开源与联系',
    links: [
      { label: '源码仓库（Gitee）', href: REPO_URL },
      { label: '问题反馈', href: `${REPO_URL}/issues` },
      { label: '许可与来源声明（NOTICE）', href: `${REPO_URL}/blob/master/NOTICE.md` },
    ],
  },
]
