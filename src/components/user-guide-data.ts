import {
  Activity,
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  Boxes,
  Layers,
  MessageSquare,
  Rocket,
  Settings as SettingsIcon,
  Workflow,
  type LucideIcon,
} from 'lucide-react'

import type { AppWorkbenchView, SettingsSection } from '@/stores/app-store'

/**
 * 使用指南的**唯一真源**。
 *
 * 同一份内容有两个消费方，所以必须抽出来，不能各写一套：
 *  1. 工作台里的首启弹窗 `user-guide-dialog.tsx`（带实时配置状态与跳转按钮）；
 *  2. 项目主页 `/home` 的「使用指南」分区 `home/home-guide.tsx`（静态介绍 + 引流到工作台）。
 *
 * 两条消费路径的措辞必须对两边都成立，所以：
 *  - 不写「点下面的某个按钮」这类带位置指代的话，只写「在「设置 → 供应商」里填…」；
 *  - `view` / `settings` 只作为**语义标注**（这条讲的是哪个模块、该去哪个设置分区），
 *    由各自的消费方决定怎么用 —— 弹窗拿它做跳转，落地页拿它做文案与深链。
 */

export interface GuideItem {
  id: string
  label: string
  icon: LucideIcon
  group: string
  summary: string
  steps: string[]
  tips?: string[]
  /** 对应的「使用须知」说明块标题 */
  notesTitle?: string
  notes?: string[]
  /** 该条目对应的工作台视图（弹窗用于跳转；落地页用于深链） */
  view?: AppWorkbenchView
  /** 该条目对应的设置分区 */
  settings?: SettingsSection
}

export const START_ID = 'start'

export const GUIDE_ITEMS: GuideItem[] = [
  {
    id: START_ID,
    label: '开始之前（必读）',
    icon: Rocket,
    group: '先做这两件事',
    summary: `两个外部依赖要在派活之前配好：一个 AI 模型供应商，以及（建议）一个对象存储。`,
    steps: [
      '在「设置 → 供应商」里填一家供应商的 API Key（DeepSeek / OpenAI / Anthropic / 火山方舟任选其一）。',
      '在「设置 → 对象存储」里填阿里云 OSS 的 Bucket / Endpoint / AccessKey。',
      '回到「对话」页新建任务，把需求说清楚，剩下的交给调度 Agent。',
    ],
    notesTitle: '为什么顺序不能反',
    notes: [
      'Agent 的每一次思考、规划、写代码都要调用模型 —— 没配 Key 就一步都跑不动，任务会直接报「未配置」。',
      'OSS 决定图片产物存在哪。不配也能用，但图片只留在本机，换机器或重装后拿不到；要做对外演示建议配上。',
      '这两项随时能在设置里改，本指南也能从「使用指南」入口再次打开。',
    ],
  },
  {
    id: 'conversations',
    label: '对话与派活',
    icon: MessageSquare,
    group: '协作',
    view: 'conversations',
    summary: 'Agent 协作的主战场：发任务、审计划、批写入、拿产物。',
    steps: [
      '左侧「新建任务」：选一个 Agent 是单聊，选一个小队是群聊；也可以直接点场景胶囊。',
      '把需求说清楚后发送。多 Agent 任务会先给出一份「任务拆分计划」，你确认后才会执行。',
      '群聊里用 @ 指定某个成员发言；输入 / 可以唤起命令（/deploy、/compact、/export、/help）。',
      'Agent 要写文件或跑命令时会弹审批卡片，能看 diff 再决定「应用」还是「拒绝」。',
      '右侧工作区面板可以预览产物、浏览这次会话目录里的文件。',
    ],
    tips: [
      '顶部的 Review / Auto 控制写入是否要审批：想省事切 Auto，想看得紧切 Review。',
      'Ctrl+K（macOS 是 ⌘K）全局搜索历史消息，回车直接跳到那一条并高亮。',
    ],
  },
  {
    id: 'information-center',
    label: '信息中心',
    icon: Bell,
    group: '协作',
    view: 'information-center',
    summary: '所有需要你点头或留意的事情，集中在这里处理。',
    steps: [
      '顶部按「全部 / 未读 / 异常 / 任务 / 系统 / 配置」筛选，右侧可搜索。',
      '列表分「待处理」「异常」「普通通知」三组；未读和紧急的排在前面。',
      '每条通知都带直达按钮，比如「去设置」「查看结果」「查看产物」，点完自动标已读。',
    ],
    tips: [
      '「去设置」这类按钮基本就是你第一次上手时会用到的入口 —— 配置不全时会在这里收到提醒。',
    ],
  },
  {
    id: 'agents',
    label: 'Agent 库',
    icon: Bot,
    group: '工作区',
    view: 'agents',
    summary: '管理 Agent 与团队：改模型、绑工具、编提示词。',
    steps: [
      '分「精选 Agent」和「我的 Agent」两个视图；内置 Agent 可以改但不能删。',
      '点「创建」新建：对话式描述意图让 AI 生成草稿，或走表单三页精调。',
      '每个 Agent 可以单独指定 provider、模型、API Key，勾选工具与 Skills / MCP，并写自己的 System Prompt。',
      '点「创建团队」：用一句话描述目标让 AI 设计团队结构，也可以手选成员搭。',
      '召唤即建会话；团队会自动补入 Orchestrator 负责调度与拆分。',
    ],
    tips: [
      'Agent 自己那行的 API Key 优先级最高，会盖过设置里的全局配置 —— 排查「明明配了 Key 还报错」时先看这里。',
    ],
  },
  {
    id: 'capability-center',
    label: '能力中心',
    icon: Boxes,
    group: '工作区',
    view: 'capability-center',
    summary: '管理 Skills、MCP 服务器，以及它们和 Agent 的绑定关系。',
    steps: [
      '先看顶部四张卡：Skills 数、MCP Servers 数、已绑定 Agent 数、能力调用量。',
      '用「全部 / Skills / MCP Servers / 资源」切换看不同类别。',
      '改了 skills 目录后点「刷新索引」重新扫描。',
      '「新增 MCP」需要填名称、启动命令、参数、环境变量和信任策略（每次询问 / 总是允许）。',
      '「从商店添加」会联网检索 GitHub 上的 Skill / MCP，评估兼容性后「导入并绑定」到指定 Agent。',
    ],
    tips: [
      'MCP 默认作为本地进程启动，导入后通常还要按对方的说明改一遍 command 与环境变量。',
    ],
  },
  {
    id: 'artifacts',
    label: '产物库',
    icon: Layers,
    group: '工作区',
    view: 'artifacts',
    summary: 'Agent 做出来的东西都落在这里：预览、改、对比版本、导出。',
    steps: [
      '按类型筛选，或打开「按会话」分组看某次任务产出了什么。',
      '点开预览抽屉：切换历史版本、两版分栏对比、导出（按类型给 zip / md / mmd / pptx）。',
      'Web 原型可以在预览和源码之间切换，改完「提交为新版本」而不覆盖旧的。',
      '不需要的直接在卡片上删除，也可以进「批量管理」多选后一次清掉。',
    ],
    tips: [
      '产物库本身没有部署按钮。要发布到外部目录，得在会话里用 /deploy 命令或点部署候选卡片。',
    ],
  },
  {
    id: 'experiences',
    label: '经验资产',
    icon: BookOpen,
    group: '工作区',
    view: 'experiences',
    summary: '让 Agent 把踩过的坑记下来，下次同类任务自动带上。',
    steps: [
      '任务跑完后会自动反思沉淀（在「设置 → 通知」里可以关掉），也可以手动「新建经验」。',
      '分三类：经验（怎么做）、反思（做错了什么）、画像（关于你的偏好）。',
      '作用域可选全局或绑定到某个 Agent。',
      '服务端按触发关键词自动注入后续任务的上下文，页面只展示「被用过几次」。',
      '每次人工编辑都会留一版修订快照，改坏了可以回滚。',
    ],
  },
  {
    id: 'automation',
    label: '自动化',
    icon: Workflow,
    group: '工作区',
    view: 'automation',
    summary: '把重复的活交给定时任务：定好节奏，Agent 自己跑。',
    steps: [
      '「新建自动化」填标题、提示词、目标 Agent（不选则自动指派）和触发计划。',
      '触发方式支持手动、间隔分钟、每日、每周。',
      '新建出来默认是暂停的 —— 确认无误再点「启用」。',
      '本地调度器每 30 秒扫描一次到期任务；跑完的结果会进信息中心提醒你。',
    ],
    tips: ['顶部 KPI 直接看启用任务数、今日运行次数、成功率和异常任务数。'],
  },
  {
    id: 'run-board',
    label: '运行展板',
    icon: Activity,
    group: '分析',
    view: 'run-board',
    summary: '想搞清楚「Agent 刚才到底做了什么」，就来这里。',
    steps: [
      '中间画布有三种视图：任务图（DAG）、时间线、事件流。',
      '右侧有 6 个 Tab：概览、终端、日志、工具、变量、产物。',
      '发现跑歪了可以「中止」，会连同子任务一起停掉。',
      '跑得好的可以在这里「沉淀经验」，或对未运行中的任务「重新运行」。',
    ],
  },
  {
    id: 'analytics',
    label: '数据概览',
    icon: BarChart3,
    group: '分析',
    view: 'analytics',
    summary: '从整体看跑了多少、花了多少 Token、成功率和卡在哪。',
    steps: [
      '先选时间范围（最近 7 / 30 / 90 天、全部、或自定义）。',
      '四张 KPI 看总量与环比；下方趋势图、Agent 分布环图、最近运行动态。',
      '任务列表可以按 Agent 和状态筛选，点「查看」直接跳到运行展板。',
      '需要留档时可以把 KPI 与任务列表导出成 JSON。',
    ],
  },
  {
    id: 'settings',
    label: '设置面板',
    icon: SettingsIcon,
    group: '配置',
    settings: 'api-keys',
    summary: '所有外部依赖与全局策略都在这里，一共七个分区。',
    steps: [
      '供应商：填各家的 API Key / Base URL / 模型，可以测试连接。',
      '模型与分配：按能力档位（文本 / 视觉 / 生图 / 音频 / 代码 / 多模态）指定用哪个模型。',
      '故障转移：配余额、鉴权、限流等触发条件，以及重试次数与冷却时间。',
      '对象存储：填 OSS，让图片产物上传到云端。',
      '移动端：开启 Companion 模式，让手机连上这个工作台。',
      '发布 / 通知：外部静态发布目录，以及经验自动沉淀、通知分类与展示方式。',
    ],
  },
]

/** 分组顺序按数组里首次出现的次序，避免再维护一张顺序表。 */
export const GUIDE_GROUPS: string[] = Array.from(new Set(GUIDE_ITEMS.map((item) => item.group)))

/** 按 id 取条目，取不到则回退到第一条（「开始之前」）。 */
export function findGuideItem(id: string | null | undefined): GuideItem {
  return GUIDE_ITEMS.find((item) => item.id === id) ?? GUIDE_ITEMS[0]
}
