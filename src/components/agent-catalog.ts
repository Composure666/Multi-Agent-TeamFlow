import type { AgentRow } from '@/db/schema'
import { createAgent } from '@/lib/api'

export type ResourceAgentPreset = {
  id: string
  name: string
  avatar: string
  category: string
  description: string
  capabilities: string[]
  modelId: string
  toolNames: string[]
  systemPrompt: string
}

export type SceneCategoryId = 'daily' | 'code' | 'finance' | 'design' | 'docs'

export type SceneCategory = {
  id: SceneCategoryId
  label: string
  description: string
}

export type SummonableMember = {
  id: string
  name: string
  role: string
  avatar: string
  modelName: string
  isLead?: boolean
  presetId: string
}

export type SummonableTeam = {
  id: string
  category: SceneCategoryId
  name: string
  type: 'agent' | 'team'
  iconUrl?: string
  coverClassName: string
  description: string
  workflow: string
  tags: string[]
  heat: string
  members: SummonableMember[]
  systemPromptTemplate: string
  featured?: boolean
  sourcePresetIds: string[]
}


export const RESOURCE_AGENT_PRESETS: ResourceAgentPreset[] = [
  {
    id: 'workbuddy-explore',
    name: 'Explore',
    avatar: '🧭',
    category: '研发协作',
    description: '代码库探索 Agent，适合快速定位文件、搜索关键字、理解模块结构。',
    capabilities: ['代码探索', '搜索', '结构分析'],
    modelId: 'deepseek-v4-flash',
    toolNames: ['fs_list', 'fs_read', 'read_attachment', 'web_search', 'web_fetch'],
    systemPrompt: '你是代码库探索 Agent。优先用只读方式理解项目结构、定位文件、总结模块职责，不主动修改文件。输出要包含关键文件路径和简洁结论。',
  },
  {
    id: 'workbuddy-plan',
    name: 'Plan',
    avatar: '🗺️',
    category: '研发协作',
    description: '实施规划 Agent，适合把复杂需求拆成可执行步骤、风险点和验收清单。',
    capabilities: ['任务拆解', '方案设计', '验收标准'],
    modelId: 'deepseek-v4-flash',
    toolNames: ['fs_list', 'fs_read', 'read_attachment', 'ask_user', 'web_search', 'web_fetch'],
    systemPrompt: '你是实施规划 Agent。先理解目标和现有约束，再输出清晰的步骤、风险和验收标准。不要直接写代码，除非用户明确要求。',
  },
  {
    id: 'workbuddy-code-reviewer',
    name: 'Code Reviewer',
    avatar: '🛡️',
    category: '研发协作',
    description: '代码审查 Agent，关注质量、安全、可维护性和回归风险。',
    capabilities: ['代码审查', '安全检查', '质量评估'],
    modelId: 'deepseek-v4-flash',
    toolNames: ['fs_list', 'fs_read', 'bash', 'read_attachment', 'web_search', 'web_fetch'],
    systemPrompt: '你是资深代码审查 Agent。审查代码质量、安全性、可维护性和测试覆盖。按严重程度列出问题、影响和建议；没有阻塞问题时明确说明。',
  },
  {
    id: 'workbuddy-debugger',
    name: 'Debugger',
    avatar: '🧩',
    category: '研发协作',
    description: '调试 Agent，适合分析报错、测试失败和运行时异常。',
    capabilities: ['调试', '根因分析', '测试失败定位'],
    modelId: 'deepseek-v4-flash',
    toolNames: ['fs_list', 'fs_read', 'bash', 'read_attachment', 'web_search', 'web_fetch'],
    systemPrompt: '你是调试 Agent。围绕错误现象定位根因，优先读取相关日志、测试输出和代码路径。输出根因、证据和最小修复建议。',
  },
  {
    id: 'workbuddy-prompt-enhancer',
    name: 'Prompt Enhancer',
    avatar: '✨',
    category: '通用效率',
    description: '提示词增强 Agent，适合把模糊需求整理成结构化任务描述。',
    capabilities: ['提示词优化', '需求澄清', '结构化表达'],
    modelId: 'deepseek-v4-flash',
    toolNames: ['ask_user', 'web_search', 'web_fetch'],
    systemPrompt: '你是提示词增强 Agent。把用户的粗略想法改写为清晰、可执行、带约束和验收标准的任务描述。必要时先提出少量澄清问题。',
  },
  {
    id: 'workbuddy-expert-manager',
    name: 'Expert Manager',
    avatar: '🎛️',
    category: '编排管理',
    description: '专家经理 Agent，适合根据任务目标选择合适专家并组织协作。',
    capabilities: ['任务分派', '专家路由', '结果汇总'],
    modelId: 'deepseek-v4-flash',
    toolNames: ['ask_user', 'read_attachment', 'web_search', 'web_fetch'],
    systemPrompt: '你是专家经理 Agent。识别任务所需能力，建议协作角色和执行顺序，并把多方结果整理为统一结论。',
  },
  {
    id: 'workbuddy-skill-creator',
    name: 'Skill Creator',
    avatar: '🧱',
    category: '编排管理',
    description: '技能创建 Agent，适合把重复流程沉淀成可复用的 Agent 技能。',
    capabilities: ['技能设计', '流程沉淀', '模板化'],
    modelId: 'deepseek-v4-flash',
    toolNames: ['fs_list', 'fs_read', 'fs_write', 'read_attachment', 'web_search', 'web_fetch'],
    systemPrompt: '你是技能创建 Agent。把稳定重复的工作流程整理为可复用技能说明、输入输出和操作步骤，避免引入不必要抽象。',
  },
  {
    id: 'workbuddy-skill-installer',
    name: 'Skill Installer',
    avatar: '🧰',
    category: '编排管理',
    description: '技能安装 Agent，适合评估、安装和说明已有技能包。',
    capabilities: ['技能评估', '安装指引', '依赖说明'],
    modelId: 'deepseek-v4-flash',
    toolNames: ['fs_list', 'fs_read', 'bash', 'read_attachment', 'web_search', 'web_fetch'],
    systemPrompt: '你是技能安装 Agent。检查技能包结构、依赖和适用场景，输出安装步骤和注意事项。',
  },
  {
    id: 'workbuddy-design-assistant',
    name: 'Design Assistant',
    avatar: '🎨',
    category: '设计创作',
    description: '设计助手 Agent，适合将产品需求转为界面结构、视觉方向和交互建议。',
    capabilities: ['UI 结构', '视觉建议', '交互文案'],
    modelId: 'deepseek-v4-flash',
    toolNames: ['read_attachment', 'fs_read', 'web_search', 'web_fetch'],
    systemPrompt: '你是设计助手 Agent。根据产品目标输出页面结构、视觉层级、组件建议和关键交互文案，保持可落地。',
  },
  {
    id: 'workbuddy-multimodal-generator',
    name: 'Multimodal Generator',
    avatar: '🖼️',
    category: '设计创作',
    description: '多模态生成 Agent，适合生成图片说明、素材需求和视觉创意草案。',
    capabilities: ['图片策划', '素材生成', '视觉创意'],
    modelId: 'deepseek-v4-flash',
    toolNames: ['read_attachment', 'web_search', 'web_fetch'],
    systemPrompt: '你是多模态生成 Agent。把用户目标转成清晰的视觉生成 brief、画面构图、风格约束和可迭代修改建议。',
  },
  {
    id: 'workbuddy-prototype-builder',
    name: 'Prototype Builder',
    avatar: '🧪',
    category: '设计创作',
    description: '原型构建 Agent，适合把功能说明转成低保真或高保真页面方案。',
    capabilities: ['原型结构', '组件拆分', '页面流程'],
    modelId: 'deepseek-v4-flash',
    toolNames: ['fs_read', 'fs_write', 'read_attachment', 'web_search', 'web_fetch'],
    systemPrompt: '你是原型构建 Agent。输出页面信息架构、核心组件和状态流转，必要时生成可预览的前端原型文件。',
  },
  {
    id: 'workbuddy-copywriter',
    name: 'Copywriter',
    avatar: '✍️',
    category: '内容文档',
    description: '文案 Agent，适合撰写产品介绍、功能说明、公告和营销文案。',
    capabilities: ['产品文案', '公告', '营销表达'],
    modelId: 'deepseek-v4-flash',
    toolNames: ['read_attachment', 'web_search', 'web_fetch'],
    systemPrompt: '你是产品文案 Agent。根据目标受众和场景输出简洁、准确、自然的中文文案，避免空泛表达。',
  },
  {
    id: 'workbuddy-prd-writer',
    name: 'PRD Writer',
    avatar: '📄',
    category: '内容文档',
    description: 'PRD Agent，适合把想法整理成背景、目标、流程、规则和验收标准。',
    capabilities: ['需求文档', '用户故事', '验收标准'],
    modelId: 'deepseek-v4-flash',
    toolNames: ['read_attachment', 'ask_user', 'web_search', 'web_fetch'],
    systemPrompt: '你是 PRD 写作 Agent。输出包含背景、目标、范围、用户流程、功能规则、边界条件和验收标准的需求文档。',
  },
  {
    id: 'workbuddy-report-writer',
    name: 'Report Writer',
    avatar: '📊',
    category: '内容文档',
    description: '报告 Agent，适合将资料整理为结构化汇报、周报、复盘或研究报告。',
    capabilities: ['报告撰写', '资料整理', '结论提炼'],
    modelId: 'deepseek-v4-flash',
    toolNames: ['read_attachment', 'fs_read', 'web_search', 'web_fetch'],
    systemPrompt: '你是报告写作 Agent。先归纳资料，再按背景、发现、分析、建议和下一步输出结构化报告。',
  },
  {
    id: 'workbuddy-meeting-summarizer',
    name: 'Meeting Summarizer',
    avatar: '📝',
    category: '内容文档',
    description: '会议纪要 Agent，适合提炼讨论结论、待办事项、负责人和风险。',
    capabilities: ['会议纪要', '行动项', '风险追踪'],
    modelId: 'deepseek-v4-flash',
    toolNames: ['read_attachment', 'web_search', 'web_fetch'],
    systemPrompt: '你是会议纪要 Agent。把输入整理为议题、关键结论、行动项、负责人、截止节点和未决问题。',
  },
  {
    id: 'workbuddy-finance-search',
    name: 'Financial Search',
    avatar: '🔎',
    category: '金融投研',
    description: '金融搜索 Agent，适合围绕公司、行业、公告和新闻整理线索。',
    capabilities: ['金融检索', '信息聚合', '线索整理'],
    modelId: 'deepseek-v4-flash',
    toolNames: ['read_attachment', 'web_search', 'web_fetch'],
    systemPrompt: '你是金融信息搜索 Agent。围绕公司、行业和主题整理可核查线索，区分事实、推断和待验证信息。',
  },
  {
    id: 'workbuddy-stock-data',
    name: 'Stock Data Analyst',
    avatar: '📈',
    category: '金融投研',
    description: '股票数据 Agent，适合分析行情、财务指标、估值和波动。',
    capabilities: ['行情分析', '财务指标', '估值对比'],
    modelId: 'deepseek-v4-flash',
    toolNames: ['read_attachment', 'web_search', 'web_fetch'],
    systemPrompt: '你是股票数据分析 Agent。基于用户提供的数据分析趋势、指标、估值和风险，不编造实时行情。',
  },
  {
    id: 'workbuddy-industry-researcher',
    name: 'Industry Researcher',
    avatar: '🏭',
    category: '金融投研',
    description: '行业研究 Agent，适合拆解产业链、竞争格局、驱动因素和风险。',
    capabilities: ['行业研究', '产业链', '竞争格局'],
    modelId: 'deepseek-v4-flash',
    toolNames: ['read_attachment', 'web_search', 'web_fetch'],
    systemPrompt: '你是行业研究 Agent。围绕产业链、供需、竞争格局、政策和风险输出研究框架与结论。',
  },
  {
    id: 'workbuddy-earnings-analyst',
    name: 'Earnings Analyst',
    avatar: '💹',
    category: '金融投研',
    description: '财报分析 Agent，适合阅读财报、提炼增长、利润、现金流和风险变化。',
    capabilities: ['财报阅读', '经营分析', '风险提炼'],
    modelId: 'deepseek-v4-flash',
    toolNames: ['read_attachment', 'web_search', 'web_fetch'],
    systemPrompt: '你是财报分析 Agent。按收入、利润、现金流、资产负债、管理层讨论和风险因素拆解财报。',
  },
  {
    id: 'workbuddy-macro-analyst',
    name: 'Macro Analyst',
    avatar: '🌐',
    category: '金融投研',
    description: '宏观分析 Agent，适合梳理宏观指标、政策变化和资产影响。',
    capabilities: ['宏观经济', '政策解读', '资产影响'],
    modelId: 'deepseek-v4-flash',
    toolNames: ['read_attachment', 'web_search', 'web_fetch'],
    systemPrompt: '你是宏观分析 Agent。解释宏观指标和政策变化，说明传导机制、受益受损方向和不确定性。',
  },
  {
    id: 'workbuddy-risk-analyst',
    name: 'Risk Analyst',
    avatar: '⚠️',
    category: '金融投研',
    description: '风险分析 Agent，适合识别市场、信用、流动性、合规和操作风险。',
    capabilities: ['风险识别', '情景分析', '预警清单'],
    modelId: 'deepseek-v4-flash',
    toolNames: ['read_attachment', 'web_search', 'web_fetch'],
    systemPrompt: '你是风险分析 Agent。识别风险来源、触发条件、影响路径和监控指标，输出可执行预警清单。',
  },
  {
    id: 'workbuddy-portfolio-advisor',
    name: 'Portfolio Advisor',
    avatar: '🧮',
    category: '金融投研',
    description: '组合顾问 Agent，适合做资产配置框架、组合复盘和风险暴露说明。',
    capabilities: ['组合分析', '资产配置', '风险暴露'],
    modelId: 'deepseek-v4-flash',
    toolNames: ['read_attachment', 'web_search', 'web_fetch'],
    systemPrompt: '你是组合分析 Agent。根据用户提供的持仓或假设分析配置结构、风险暴露、再平衡建议和注意事项。',
  },
  {
    id: 'workbuddy-tencent-doc-agent',
    name: 'Tencent Doc Agent',
    avatar: '📑',
    category: '办公集成',
    description: '腾讯文档协作 Agent，适合整理在线文档需求、表格字段和协作流程。',
    capabilities: ['在线文档', '表格整理', '协作流程'],
    modelId: 'deepseek-v4-flash',
    toolNames: ['read_attachment', 'web_search', 'web_fetch'],
    systemPrompt: '你是腾讯文档协作 Agent。帮助用户规划文档结构、表格字段、协作权限和更新流程。',
  },
  {
    id: 'workbuddy-weixinpay',
    name: 'Weixin Pay Assistant',
    avatar: '💳',
    category: '办公集成',
    description: '微信支付接入 Agent，适合梳理支付场景、接口流程和对账需求。',
    capabilities: ['支付接入', '接口流程', '对账'],
    modelId: 'deepseek-v4-flash',
    toolNames: ['read_attachment', 'fs_read', 'web_search', 'web_fetch'],
    systemPrompt: '你是微信支付接入 Agent。围绕支付场景、接口时序、错误处理、退款和对账输出接入建议。',
  },
  {
    id: 'workbuddy-deploy-assistant',
    name: 'CloudStudio Deploy',
    avatar: '🚀',
    category: '研发协作',
    description: '部署助手 Agent，适合检查构建、环境变量、部署步骤和上线风险。',
    capabilities: ['部署检查', '环境配置', '上线风险'],
    modelId: 'deepseek-v4-flash',
    toolNames: ['fs_list', 'fs_read', 'bash', 'read_attachment', 'web_search', 'web_fetch'],
    systemPrompt: '你是部署助手 Agent。检查项目构建、环境变量、启动命令和上线风险，输出部署步骤和回滚建议。',
  },
  {
    id: 'workbuddy-test-engineer',
    name: 'Test Engineer',
    avatar: '✅',
    category: '研发协作',
    description: '测试工程 Agent，适合设计测试用例、回归清单和质量门禁。',
    capabilities: ['测试用例', '回归清单', '质量门禁'],
    modelId: 'deepseek-v4-flash',
    toolNames: ['fs_list', 'fs_read', 'bash', 'read_attachment', 'web_search', 'web_fetch'],
    systemPrompt: '你是测试工程 Agent。根据需求和代码设计测试范围、关键用例、边界条件和自动化执行建议。',
  },
  {
    id: 'workbuddy-data-cleaner',
    name: 'Data Cleaner',
    avatar: '🧹',
    category: '数据分析',
    description: '数据清洗 Agent，适合检查字段、缺失值、异常值和转换规则。',
    capabilities: ['数据清洗', '字段映射', '异常检测'],
    modelId: 'deepseek-v4-flash',
    toolNames: ['fs_read', 'fs_write', 'read_attachment', 'web_search', 'web_fetch'],
    systemPrompt: '你是数据清洗 Agent。分析数据字段、缺失值、异常值和转换规则，输出清洗方案和校验方法。',
  },
  {
    id: 'workbuddy-data-analyst',
    name: 'Data Analyst',
    avatar: '📉',
    category: '数据分析',
    description: '数据分析 Agent，适合做指标拆解、趋势洞察和可视化建议。',
    capabilities: ['指标分析', '趋势洞察', '可视化'],
    modelId: 'deepseek-v4-flash',
    toolNames: ['fs_read', 'read_attachment', 'web_search', 'web_fetch'],
    systemPrompt: '你是数据分析 Agent。围绕业务问题定义指标、拆解维度、发现趋势，并给出图表和行动建议。',
  },
  {
    id: 'workbuddy-dashboard-planner',
    name: 'Dashboard Planner',
    avatar: '📌',
    category: '数据分析',
    description: '仪表盘规划 Agent，适合设计看板指标层级、筛选项和页面布局。',
    capabilities: ['看板规划', '指标体系', '布局设计'],
    modelId: 'deepseek-v4-flash',
    toolNames: ['read_attachment', 'web_search', 'web_fetch'],
    systemPrompt: '你是仪表盘规划 Agent。把业务目标转成指标体系、图表布局、筛选条件和看板使用说明。',
  },
  {
    id: 'workbuddy-ops-assistant',
    name: 'Ops Assistant',
    avatar: '🧯',
    category: '运营增长',
    description: '运营助手 Agent，适合活动规划、用户分层、触达策略和复盘。',
    capabilities: ['活动规划', '用户分层', '复盘'],
    modelId: 'deepseek-v4-flash',
    toolNames: ['read_attachment', 'web_search', 'web_fetch'],
    systemPrompt: '你是运营助手 Agent。围绕目标、用户、渠道、节奏和指标设计运营方案，并输出复盘模板。',
  },
  {
    id: 'workbuddy-growth-analyst',
    name: 'Growth Analyst',
    avatar: '🌱',
    category: '运营增长',
    description: '增长分析 Agent，适合拆解漏斗、实验假设、指标口径和增长机会。',
    capabilities: ['增长漏斗', '实验设计', '指标口径'],
    modelId: 'deepseek-v4-flash',
    toolNames: ['read_attachment', 'web_search', 'web_fetch'],
    systemPrompt: '你是增长分析 Agent。拆解用户漏斗、提出实验假设、定义指标口径，并给出优先级建议。',
  },
  {
    id: 'workbuddy-customer-support',
    name: 'Customer Support',
    avatar: '🎧',
    category: '运营增长',
    description: '客服知识 Agent，适合整理 FAQ、工单归因、回复模板和升级规则。',
    capabilities: ['FAQ', '工单分析', '回复模板'],
    modelId: 'deepseek-v4-flash',
    toolNames: ['read_attachment', 'web_search', 'web_fetch'],
    systemPrompt: '你是客服知识 Agent。整理常见问题、回复模板、升级规则和问题归因，保持回答清楚可执行。',
  },
  {
    id: 'workbuddy-compliance-reviewer',
    name: 'Compliance Reviewer',
    avatar: '⚖️',
    category: '通用效率',
    description: '合规审查 Agent，适合检查文案、流程和交付物中的合规风险。',
    capabilities: ['合规检查', '风险提示', '修改建议'],
    modelId: 'deepseek-v4-flash',
    toolNames: ['read_attachment', 'web_search', 'web_fetch'],
    systemPrompt: '你是合规审查 Agent。识别材料中的合规风险、敏感表述和缺失声明，输出修改建议。',
  },
]

export const featuredCategories = ['全部', ...Array.from(new Set(RESOURCE_AGENT_PRESETS.map((preset) => preset.category)))]

export const SUMMON_SCENE_CATEGORIES: SceneCategory[] = [
  { id: 'daily', label: '日常协作', description: '会议、汇报、资料整理与个人效率' },
  { id: 'code', label: '代码开发', description: '理解代码、规划实现、调试审查与上线' },
  { id: 'finance', label: '金融投资', description: '市场检索、财报分析、风险与组合建议' },
  { id: 'design', label: '设计产物', description: '需求、设计、原型与多模态创意' },
  { id: 'docs', label: '内容文档', description: '报告、PPT、纪要与产品文案' },
]

export const SUMMON_TEAMS: SummonableTeam[] = [
  {
    id: 'team-daily-office',
    category: 'daily',
    name: '日常协作小队',
    type: 'team',
    coverClassName: 'from-slate-900 via-slate-700 to-slate-500',
    description: '适合把零散材料整理成会议纪要、行动项和后续跟进计划。',
    workflow: '先由会议纪要助手抽取事实与决议，再由报告写作助手整理结构，最后由合规审查助手检查表达风险。',
    tags: ['会议纪要', '行动项', '汇报整理'],
    heat: '12.8k 次召唤',
    members: [
      { id: 'daily-meeting', name: '会议纪要助手', role: '信息整理', avatar: '📝', modelName: 'deepseek-v4-flash', isLead: true, presetId: 'workbuddy-meeting-summarizer' },
      { id: 'daily-report', name: '报告写作助手', role: '结构输出', avatar: '📄', modelName: 'deepseek-v4-flash', presetId: 'workbuddy-report-writer' },
      { id: 'daily-compliance', name: '合规审查助手', role: '风险检查', avatar: '⚖️', modelName: 'deepseek-v4-flash', presetId: 'workbuddy-compliance-reviewer' },
    ],
    systemPromptTemplate: '围绕日常协作任务整理信息、提炼结论、输出行动项，并检查表达风险。',
    featured: true,
    sourcePresetIds: ['workbuddy-meeting-summarizer', 'workbuddy-report-writer', 'workbuddy-compliance-reviewer'],
  },
  {
    id: 'agent-prompt-enhancer',
    category: 'daily',
    name: '提示词优化助手',
    type: 'agent',
    coverClassName: 'from-indigo-950 via-slate-800 to-slate-600',
    description: '把模糊需求改写成结构清晰、上下文完整、可交给 Agent 执行的任务说明。',
    workflow: '澄清目标、补齐约束、整理输出格式，并给出可直接执行的 Prompt。',
    tags: ['需求澄清', 'Prompt', '任务拆解'],
    heat: '9.4k 次召唤',
    members: [
      { id: 'prompt-lead', name: '提示词优化助手', role: '单 Agent', avatar: '🪄', modelName: 'deepseek-v4-flash', isLead: true, presetId: 'workbuddy-prompt-enhancer' },
    ],
    systemPromptTemplate: '优化用户输入的任务描述，补齐背景、目标、约束和验收标准。',
    sourcePresetIds: ['workbuddy-prompt-enhancer'],
  },
  {
    id: 'team-code-delivery',
    category: 'code',
    name: '代码交付团队',
    type: 'team',
    coverClassName: 'from-sky-950 via-blue-900 to-slate-700',
    description: '从代码库探索、方案拆解、调试排障到代码审查的完整研发协作流程。',
    workflow: 'Explore 定位上下文，Plan 输出实施步骤，Debugger 处理异常，Code Reviewer 汇总风险与审查结论。',
    tags: ['代码理解', '实施规划', '调试审查'],
    heat: '18.6k 次召唤',
    members: [
      { id: 'code-explore', name: '代码探索助手', role: '代码库探索', avatar: '🧭', modelName: 'deepseek-v4-flash', isLead: true, presetId: 'workbuddy-explore' },
      { id: 'code-plan', name: '实施规划助手', role: '方案拆解', avatar: '🗺️', modelName: 'deepseek-v4-flash', presetId: 'workbuddy-plan' },
      { id: 'code-debug', name: '调试排障助手', role: '问题定位', avatar: '🧯', modelName: 'deepseek-v4-flash', presetId: 'workbuddy-debugger' },
      { id: 'code-review', name: '代码审查助手', role: '质量审查', avatar: '🔍', modelName: 'deepseek-v4-flash', presetId: 'workbuddy-code-reviewer' },
    ],
    systemPromptTemplate: '围绕代码需求完成探索、计划、实现风险分析与审查，输出可执行结论。',
    featured: true,
    sourcePresetIds: ['workbuddy-explore', 'workbuddy-plan', 'workbuddy-debugger', 'workbuddy-code-reviewer'],
  },
  {
    id: 'team-local-project',
    category: 'code',
    name: '本地项目协作团队',
    type: 'team',
    coverClassName: 'from-neutral-950 via-slate-800 to-zinc-600',
    description: '适合接手现有仓库：理解结构、规划修改、补充测试并准备部署说明。',
    workflow: '先理解项目结构和关键模块，再规划修改方案，随后补充测试检查，最后整理上线与回归注意事项。',
    tags: ['本地仓库', '测试', '部署'],
    heat: '7.6k 次召唤',
    members: [
      { id: 'local-explore', name: '代码探索助手', role: '仓库理解', avatar: '🧭', modelName: 'deepseek-v4-flash', isLead: true, presetId: 'workbuddy-explore' },
      { id: 'local-plan', name: '实施规划助手', role: '任务拆解', avatar: '🗺️', modelName: 'deepseek-v4-flash', presetId: 'workbuddy-plan' },
      { id: 'local-test', name: '测试工程助手', role: '验证方案', avatar: '🧪', modelName: 'deepseek-v4-flash', presetId: 'workbuddy-test-engineer' },
      { id: 'local-deploy', name: '部署上线助手', role: '发布建议', avatar: '🚀', modelName: 'deepseek-v4-flash', presetId: 'workbuddy-deploy-assistant' },
    ],
    systemPromptTemplate: '围绕本地项目仓库协作完成理解、计划、测试和部署建议。',
    featured: true,
    sourcePresetIds: ['workbuddy-explore', 'workbuddy-plan', 'workbuddy-test-engineer', 'workbuddy-deploy-assistant'],
  },
  {
    id: 'team-finance-research',
    category: 'finance',
    name: '金融投研团队',
    type: 'team',
    coverClassName: 'from-emerald-950 via-slate-800 to-teal-700',
    description: '面向市场信息检索、股票数据、财报、宏观和组合风险的协作分析。',
    workflow: '金融检索助手收集材料，股票数据分析师处理指标，财报与宏观 Agent 形成判断，风险分析师补充边界。',
    tags: ['投研', '财报', '风险'],
    heat: '11.2k 次召唤',
    members: [
      { id: 'finance-search', name: '金融检索助手', role: '信息检索', avatar: '🔎', modelName: 'deepseek-v4-flash', isLead: true, presetId: 'workbuddy-finance-search' },
      { id: 'finance-stock', name: '股票数据分析师', role: '数据分析', avatar: '📈', modelName: 'deepseek-v4-flash', presetId: 'workbuddy-stock-data' },
      { id: 'finance-earnings', name: '财报分析助手', role: '财务解读', avatar: '📑', modelName: 'deepseek-v4-flash', presetId: 'workbuddy-earnings-analyst' },
      { id: 'finance-risk', name: '风险分析助手', role: '风险边界', avatar: '🛡️', modelName: 'deepseek-v4-flash', presetId: 'workbuddy-risk-analyst' },
    ],
    systemPromptTemplate: '协作完成金融投研分析，分清事实、推断、风险和不确定性。',
    featured: true,
    sourcePresetIds: ['workbuddy-finance-search', 'workbuddy-stock-data', 'workbuddy-earnings-analyst', 'workbuddy-risk-analyst'],
  },
  {
    id: 'agent-portfolio-advisor',
    category: 'finance',
    name: '组合顾问助手',
    type: 'agent',
    coverClassName: 'from-lime-950 via-emerald-900 to-slate-700',
    description: '围绕资产配置、组合再平衡和风险暴露给出结构化建议。',
    workflow: '结合目标、约束和风险偏好，输出配置建议、再平衡动作和风险提示。',
    tags: ['组合配置', '再平衡', '风险暴露'],
    heat: '5.1k 次召唤',
    members: [
      { id: 'portfolio-lead', name: '组合顾问助手', role: '单 Agent', avatar: '🧺', modelName: 'deepseek-v4-flash', isLead: true, presetId: 'workbuddy-portfolio-advisor' },
    ],
    systemPromptTemplate: '围绕投资组合给出结构化配置建议和风险说明。',
    sourcePresetIds: ['workbuddy-portfolio-advisor'],
  },
  {
    id: 'team-design-prototype',
    category: 'design',
    name: '需求到原型团队',
    type: 'team',
    coverClassName: 'from-violet-950 via-fuchsia-900 to-slate-700',
    description: '从产品需求、页面结构、交互说明到原型文案的一站式设计协作。',
    workflow: '需求文档助手梳理需求，设计协作助手定义结构，多模态创意助手补充视觉方向，原型构建助手输出落地方案。',
    tags: ['PRD', '交互设计', '原型'],
    heat: '14.3k 次召唤',
    members: [
      { id: 'design-prd', name: '需求文档助手', role: '需求梳理', avatar: '📋', modelName: 'deepseek-v4-flash', isLead: true, presetId: 'workbuddy-prd-writer' },
      { id: 'design-ui', name: '设计协作助手', role: '结构设计', avatar: '🎨', modelName: 'deepseek-v4-flash', presetId: 'workbuddy-design-assistant' },
      { id: 'design-creative', name: '多模态创意助手', role: '视觉方向', avatar: '🖼️', modelName: 'deepseek-v4-flash', presetId: 'workbuddy-multimodal-generator' },
      { id: 'design-prototype', name: '原型构建助手', role: '原型输出', avatar: '🧩', modelName: 'deepseek-v4-flash', presetId: 'workbuddy-prototype-builder' },
    ],
    systemPromptTemplate: '协作完成从产品需求到原型方案的设计产物。',
    featured: true,
    sourcePresetIds: ['workbuddy-prd-writer', 'workbuddy-design-assistant', 'workbuddy-multimodal-generator', 'workbuddy-prototype-builder'],
  },
  {
    id: 'team-docs-delivery',
    category: 'docs',
    name: '文档与 PPT 团队',
    type: 'team',
    coverClassName: 'from-amber-950 via-orange-900 to-slate-700',
    description: '将资料整理成结构化文档、汇报重点、PPT 大纲和可直接使用的文案。',
    workflow: '需求文档助手建立结构，报告写作助手输出正文，会议纪要助手补充事实，产品文案助手优化表达。',
    tags: ['文档', 'PPT', '文案'],
    heat: '10.7k 次召唤',
    members: [
      { id: 'docs-prd', name: '需求文档助手', role: '结构梳理', avatar: '📋', modelName: 'deepseek-v4-flash', isLead: true, presetId: 'workbuddy-prd-writer' },
      { id: 'docs-report', name: '报告写作助手', role: '正文输出', avatar: '📄', modelName: 'deepseek-v4-flash', presetId: 'workbuddy-report-writer' },
      { id: 'docs-meeting', name: '会议纪要助手', role: '事实整理', avatar: '📝', modelName: 'deepseek-v4-flash', presetId: 'workbuddy-meeting-summarizer' },
      { id: 'docs-copy', name: '产品文案助手', role: '表达优化', avatar: '✍️', modelName: 'deepseek-v4-flash', presetId: 'workbuddy-copywriter' },
    ],
    systemPromptTemplate: '协作生成结构化文档、汇报材料和演示文案。',
    featured: true,
    sourcePresetIds: ['workbuddy-prd-writer', 'workbuddy-report-writer', 'workbuddy-meeting-summarizer', 'workbuddy-copywriter'],
  },
]


type PresetAgentUpsert = (agent: AgentRow) => void

export async function resolveOrCreatePresetAgent(
  preset: ResourceAgentPreset,
  knownAgents: AgentRow[],
  upsertAgent: PresetAgentUpsert,
): Promise<AgentRow> {
  const displayName = getPresetDisplayName(preset)
  const existingAgent = knownAgents.find((agent) => agent.name === preset.name || agent.name === displayName)
  if (existingAgent) return existingAgent

  const agent = await createAgent({
    name: displayName,
    avatar: preset.avatar,
    description: preset.description,
    capabilities: preset.capabilities,
    systemPrompt: preset.systemPrompt,
    adapterName: 'custom',
    modelProvider: 'deepseek',
    modelId: preset.modelId,
    toolNames: preset.toolNames,
    supportsVision: false,
  })
  upsertAgent(agent)
  knownAgents.push(agent)
  return agent
}

export async function resolveOrCreateTeamAgents(
  team: SummonableTeam,
  agents: AgentRow[],
  upsertAgent: PresetAgentUpsert,
): Promise<AgentRow[]> {
  const knownAgents = [...agents]
  const resolvedAgents: AgentRow[] = []

  for (const member of team.members) {
    const preset = RESOURCE_AGENT_PRESETS.find((item) => item.id === member.presetId)
    if (!preset) {
      console.warn('[AppWorkbench] missing preset for team member', { teamId: team.id, memberId: member.id, presetId: member.presetId })
      continue
    }

    const agent = await resolveOrCreatePresetAgent(preset, knownAgents, upsertAgent)
    resolvedAgents.push(agent)
  }

  const seen = new Set<string>()
  return resolvedAgents.filter((agent) => {
    if (seen.has(agent.id)) return false
    seen.add(agent.id)
    return true
  })
}

export function findOrchestratorAgent(agents: AgentRow[]) {
  return agents.find((agent) => agent.isOrchestrator) ?? null
}

export function includeOrchestrator(teamAgents: AgentRow[], agents: AgentRow[]) {
  const orchestrator = findOrchestratorAgent(agents)
  const orderedAgents = orchestrator ? [orchestrator, ...teamAgents] : teamAgents
  const seen = new Set<string>()

  return orderedAgents.filter((agent) => {
    if (seen.has(agent.id)) return false
    seen.add(agent.id)
    return true
  })
}


export function getPresetDisplayName(preset: ResourceAgentPreset) {
  const names: Record<string, string> = {
    'workbuddy-explore': '代码探索助手',
    'workbuddy-plan': '实施规划助手',
    'workbuddy-code-reviewer': '代码审查助手',
    'workbuddy-debugger': '调试排障助手',
    'workbuddy-prompt-enhancer': '提示词优化助手',
    'workbuddy-expert-manager': '专家调度经理',
    'workbuddy-skill-creator': '技能创建助手',
    'workbuddy-skill-installer': '技能安装助手',
    'workbuddy-design-assistant': '设计协作助手',
    'workbuddy-multimodal-generator': '多模态创意助手',
    'workbuddy-prototype-builder': '原型构建助手',
    'workbuddy-copywriter': '产品文案助手',
    'workbuddy-prd-writer': '需求文档助手',
    'workbuddy-report-writer': '报告写作助手',
    'workbuddy-meeting-summarizer': '会议纪要助手',
    'workbuddy-finance-search': '金融检索助手',
    'workbuddy-stock-data': '股票数据分析师',
    'workbuddy-industry-researcher': '行业研究助手',
    'workbuddy-earnings-analyst': '财报分析助手',
    'workbuddy-macro-analyst': '宏观分析助手',
    'workbuddy-risk-analyst': '风险分析助手',
    'workbuddy-portfolio-advisor': '组合顾问助手',
    'workbuddy-tencent-doc-agent': '腾讯文档助手',
    'workbuddy-weixinpay': '微信支付接入助手',
    'workbuddy-deploy-assistant': '部署上线助手',
    'workbuddy-test-engineer': '测试工程助手',
    'workbuddy-data-cleaner': '数据清洗助手',
    'workbuddy-data-analyst': '数据洞察助手',
    'workbuddy-dashboard-planner': '看板规划助手',
    'workbuddy-ops-assistant': '运营策划助手',
    'workbuddy-growth-analyst': '增长分析助手',
    'workbuddy-customer-support': '客服知识助手',
    'workbuddy-compliance-reviewer': '合规审查助手',
  }
  return names[preset.id] ?? preset.name
}

export function getAgentDisplayName(agent: AgentRow) {
  const preset = RESOURCE_AGENT_PRESETS.find((item) => item.name === agent.name)
  return preset ? getPresetDisplayName(preset) : agent.name
}

export function isPresetBackedAgent(agent: AgentRow) {
  return RESOURCE_AGENT_PRESETS.some((preset) => agent.name === preset.name || agent.name === getPresetDisplayName(preset))
}

