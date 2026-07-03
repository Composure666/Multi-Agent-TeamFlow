'use client'

import {
  BarChart3,
  Bot,
  Boxes,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock3,
  Coins,
  FileCode2,
  FileText,
  Grid2X2,
  History,
  Languages,
  Layers,
  Menu,
  MessageCircle,
  MessageSquare,
  Mic,
  MoreHorizontal,
  Newspaper,
  Palette,
  Paperclip,
  PlayCircle,
  Plus,
  Search,
  Send,
  Settings,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  Video,
  Workflow,
  Wrench,
  X
} from 'lucide-react'
import { nanoid } from 'nanoid'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { AgentAvatar } from '@/components/agent-avatar'
import { ArtifactPreviewPanel } from '@/components/artifact-preview-panel'
import { ChatPanel } from '@/components/chat-panel'
import { CreateAgentDialog } from '@/components/create-agent-dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { FileExplorerPanel } from '@/components/file-explorer-panel'
import { MessageHighlightLayer } from '@/components/message-highlight-layer'
import { SelectionPopover } from '@/components/selection-popover'
import { SettingsDialog } from '@/components/settings-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import type { AgentRow } from '@/db/schema'
import {
  createConversation,
  createAgent,
  fetchAgents,
  fetchArtifact,
  fetchArtifacts,
  fetchConversations,
  fetchUsageSummary,
  sendMessage,
  setFsWriteApprovalMode,
  uploadAttachment,
  type ArtifactListItem,
  type UsageSummary,
} from '@/lib/api'
import { groupArtifactVersions } from '@/lib/artifact-groups'
import { cn } from '@/lib/utils'
import { useAgentList, useAppStore, useConversationList } from '@/stores/app-store'

type WorkbenchView = 'new-task' | 'conversations' | 'agents' | 'artifacts' | 'automation' | 'analytics'

const THEME_ACCENTS = {
  blue: {
    primary: '#3370ff',
    hover: '#2563eb',
    soft: '#eff6ff',
    border: '#bfdbfe',
  },
  violet: {
    primary: '#7c3aed',
    hover: '#6d28d9',
    soft: '#f5f3ff',
    border: '#ddd6fe',
  },
} as const

const navItems: Array<{ id: WorkbenchView; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'new-task', label: '新建任务', icon: Plus },
  { id: 'conversations', label: '对话', icon: MessageSquare },
  { id: 'agents', label: 'Agent 库', icon: Bot },
  { id: 'artifacts', label: '产物库', icon: Layers },
  { id: 'automation', label: '自动化', icon: Workflow },
  { id: 'analytics', label: '分析', icon: BarChart3 },
]

const artifactTabs = ['全部', '文档', 'Web 原型', 'PPT', '图片', '项目', '代码']
const scenarioTabs = ['日常协作', '代码开发', '设计产物']
const quickTasks = ['文档处理', '代码开发', '设计原型', '项目交付']

type ResourceAgentPreset = {
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

type FeaturedScenario = {
  id: string
  title: string
  category: string
  description: string
  agentPresetIds: string[]
  prompt: string
  icon: React.ComponentType<{ className?: string }>
  iconWrapClassName: string
  iconClassName: string
}

type DraftTask = {
  agentPresetIds: string[]
  prompt: string
  sourceScenarioTitle: string
}

type AutomationTaskPreset = {
  id: string
  title: string
  description: string
  cadence: string
  latestRun: string
  status: '运行中' | '已启用' | '待配置'
  icon: React.ComponentType<{ className?: string }>
  iconWrapClassName: string
  iconClassName: string
}

type AnalyticsKpi = {
  label: string
  value: string
  caption: string
  icon: React.ComponentType<{ className?: string }>
  toneClassName: string
}

type AnalyticsTrendPoint = {
  label: string
  value: number
}

type AnalyticsRunRecord = {
  id: string
  title: string
  category: string
  status: '成功' | '失败' | '运行中'
  duration: string
  time: string
}

type AnalyticsDistributionItem = {
  label: string
  value: number
  className: string
}

const AUTOMATION_TASK_PRESETS: AutomationTaskPreset[] = [
  {
    id: 'daily-ai-news',
    title: '每日 AI 新闻推送',
    description: '关注当天 AI 领域的重要动态，自动整理并推送摘要。',
    cadence: '每天 08:30',
    latestRun: '今日 08:30',
    status: '已启用',
    icon: Newspaper,
    iconWrapClassName: 'bg-blue-50',
    iconClassName: 'text-[#3370ff]',
  },
  {
    id: 'daily-english-words',
    title: '每日 5 个英语单词',
    description: '每天推荐 5 个高频实用英语单词，包含释义与例句。',
    cadence: '每天 07:45',
    latestRun: '今日 07:45',
    status: '运行中',
    icon: Languages,
    iconWrapClassName: 'bg-emerald-50',
    iconClassName: 'text-emerald-600',
  },
  {
    id: 'weekly-work-report',
    title: '每周工作周报',
    description: '每周五汇总仓库 PR、Issue 与任务进展，生成工作周报。',
    cadence: '周五 18:00',
    latestRun: '上周五 18:00',
    status: '已启用',
    icon: CalendarClock,
    iconWrapClassName: 'bg-violet-50',
    iconClassName: 'text-violet-600',
  },
  {
    id: 'classic-movie',
    title: '经典电影推荐',
    description: '推荐一部高分经典电影，并附带简短推荐理由。',
    cadence: '每天 20:00',
    latestRun: '昨日 20:00',
    status: '已启用',
    icon: Video,
    iconWrapClassName: 'bg-orange-50',
    iconClassName: 'text-orange-600',
  },
  {
    id: 'today-history',
    title: '历史上的今天',
    description: '从科技、电影、文化等领域挑选一件历史事件进行介绍。',
    cadence: '每天 09:00',
    latestRun: '今日 09:00',
    status: '待配置',
    icon: History,
    iconWrapClassName: 'bg-cyan-50',
    iconClassName: 'text-cyan-600',
  },
]

const ANALYTICS_KPIS: AnalyticsKpi[] = [
  { label: '任务总数', value: '5', caption: '已配置自动化任务', icon: Workflow, toneClassName: 'bg-blue-50 text-[#3370ff]' },
  { label: '今日运行次数', value: '18', caption: '较昨日 +4 次', icon: PlayCircle, toneClassName: 'bg-emerald-50 text-emerald-600' },
  { label: '成功率', value: '96.8%', caption: '近 7 天稳定运行', icon: CheckCircle2, toneClassName: 'bg-violet-50 text-violet-600' },
  { label: '失败次数', value: '2', caption: '需复查输入源', icon: CircleAlert, toneClassName: 'bg-rose-50 text-rose-600' },
]

const ANALYTICS_TREND: AnalyticsTrendPoint[] = [
  { label: '周一', value: 12 },
  { label: '周二', value: 18 },
  { label: '周三', value: 15 },
  { label: '周四', value: 22 },
  { label: '周五', value: 28 },
  { label: '周六', value: 10 },
  { label: '周日', value: 14 },
]

const ANALYTICS_DISTRIBUTION: AnalyticsDistributionItem[] = [
  { label: '内容推送', value: 42, className: 'bg-blue-500' },
  { label: '学习提醒', value: 24, className: 'bg-emerald-500' },
  { label: '项目报告', value: 20, className: 'bg-violet-500' },
  { label: '兴趣推荐', value: 14, className: 'bg-orange-500' },
]

const ANALYTICS_RECENT_RUNS: AnalyticsRunRecord[] = [
  { id: 'run-ai-news', title: '每日 AI 新闻推送', category: '内容推送', status: '成功', duration: '36s', time: '08:30' },
  { id: 'run-english', title: '每日 5 个英语单词', category: '学习提醒', status: '运行中', duration: '12s', time: '07:45' },
  { id: 'run-report', title: '每周工作周报', category: '项目报告', status: '成功', duration: '2m 18s', time: '上周五' },
  { id: 'run-movie', title: '经典电影推荐', category: '兴趣推荐', status: '失败', duration: '8s', time: '昨日' },
  { id: 'run-history', title: '历史上的今天', category: '内容推送', status: '成功', duration: '24s', time: '今日' },
]

const RESOURCE_AGENT_PRESETS: ResourceAgentPreset[] = [
  {
    id: 'workbuddy-explore',
    name: 'Explore',
    avatar: '🧭',
    category: '研发协作',
    description: '代码库探索 Agent，适合快速定位文件、搜索关键字、理解模块结构。',
    capabilities: ['代码探索', '搜索', '结构分析'],
    modelId: 'deepseek-v4-flash',
    toolNames: ['fs_list', 'fs_read', 'read_attachment'],
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
    toolNames: ['fs_list', 'fs_read', 'read_attachment', 'ask_user'],
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
    toolNames: ['fs_list', 'fs_read', 'bash', 'read_attachment'],
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
    toolNames: ['fs_list', 'fs_read', 'bash', 'read_attachment'],
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
    toolNames: ['ask_user'],
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
    toolNames: ['ask_user', 'read_attachment'],
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
    toolNames: ['fs_list', 'fs_read', 'fs_write', 'read_attachment'],
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
    toolNames: ['fs_list', 'fs_read', 'bash', 'read_attachment'],
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
    toolNames: ['read_attachment', 'fs_read'],
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
    toolNames: ['read_attachment'],
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
    toolNames: ['fs_read', 'fs_write', 'read_attachment'],
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
    toolNames: ['read_attachment'],
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
    toolNames: ['read_attachment', 'ask_user'],
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
    toolNames: ['read_attachment', 'fs_read'],
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
    toolNames: ['read_attachment'],
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
    toolNames: ['read_attachment'],
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
    toolNames: ['read_attachment'],
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
    toolNames: ['read_attachment'],
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
    toolNames: ['read_attachment'],
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
    toolNames: ['read_attachment'],
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
    toolNames: ['read_attachment'],
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
    toolNames: ['read_attachment'],
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
    toolNames: ['read_attachment'],
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
    toolNames: ['read_attachment', 'fs_read'],
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
    toolNames: ['fs_list', 'fs_read', 'bash', 'read_attachment'],
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
    toolNames: ['fs_list', 'fs_read', 'bash', 'read_attachment'],
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
    toolNames: ['fs_read', 'fs_write', 'read_attachment'],
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
    toolNames: ['fs_read', 'read_attachment'],
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
    toolNames: ['read_attachment'],
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
    toolNames: ['read_attachment'],
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
    toolNames: ['read_attachment'],
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
    toolNames: ['read_attachment'],
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
    toolNames: ['read_attachment'],
    systemPrompt: '你是合规审查 Agent。识别材料中的合规风险、敏感表述和缺失声明，输出修改建议。',
  },
]

const FEATURED_SCENARIOS: FeaturedScenario[] = [
  {
    id: 'scenario-product-prototype',
    title: '产品需求到原型',
    category: '设计创作',
    description: '从需求收集到原型设计',
    agentPresetIds: ['workbuddy-prd-writer', 'workbuddy-design-assistant', 'workbuddy-prototype-builder', 'workbuddy-copywriter'],
    prompt: '请围绕一个新产品功能协作：先收集并整理产品需求，再设计页面结构和交互流程，最后输出可落地的原型方案与关键文案。',
    icon: Sparkles,
    iconWrapClassName: 'bg-violet-50',
    iconClassName: 'text-violet-600',
  },
  {
    id: 'scenario-code-review',
    title: '代码实现与审查',
    category: '研发协作',
    description: '实现功能并保障质量',
    agentPresetIds: ['workbuddy-explore', 'workbuddy-plan', 'workbuddy-debugger', 'workbuddy-code-reviewer'],
    prompt: '请协作完成一个代码需求：先理解现有实现和影响范围，再拆解实施步骤，完成后定位潜在问题并给出审查结论。',
    icon: CheckCircle2,
    iconWrapClassName: 'bg-emerald-50',
    iconClassName: 'text-emerald-600',
  },
  {
    id: 'scenario-docs-ppt',
    title: '文档与 PPT',
    category: '内容文档',
    description: '生成文档与演示材料',
    agentPresetIds: ['workbuddy-prd-writer', 'workbuddy-report-writer', 'workbuddy-meeting-summarizer', 'workbuddy-copywriter'],
    prompt: '请根据资料协作生成一套交付材料：先整理结构化文档，再提炼汇报重点，最后形成适合演示的 PPT 大纲和页面文案。',
    icon: FileText,
    iconWrapClassName: 'bg-orange-50',
    iconClassName: 'text-orange-600',
  },
  {
    id: 'scenario-agent-orchestration',
    title: '多 Agent 编排',
    category: '编排管理',
    description: '协调多个 Agent 完成任务',
    agentPresetIds: ['workbuddy-expert-manager', 'workbuddy-plan', 'workbuddy-prompt-enhancer', 'workbuddy-skill-creator'],
    prompt: '请为一个复杂任务设计多 Agent 协作流程：选择合适角色、拆解执行顺序、定义交付物，并汇总每个 Agent 的职责边界。',
    icon: Workflow,
    iconWrapClassName: 'bg-blue-50',
    iconClassName: 'text-blue-600',
  },
  {
    id: 'scenario-local-project',
    title: '本地项目协作',
    category: '研发协作',
    description: '理解并协作本地项目仓库',
    agentPresetIds: ['workbuddy-explore', 'workbuddy-plan', 'workbuddy-test-engineer', 'workbuddy-deploy-assistant'],
    prompt: '请围绕当前本地项目仓库协作：先理解项目结构和关键模块，再规划修改方案，补充测试检查，并给出部署或回归注意事项。',
    icon: Boxes,
    iconWrapClassName: 'bg-cyan-50',
    iconClassName: 'text-cyan-600',
  },
]

const featuredCategories = ['全部', ...Array.from(new Set(RESOURCE_AGENT_PRESETS.map((preset) => preset.category)))]

export function AppWorkbench() {
  const [view, setView] = useState<WorkbenchView>('new-task')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [draftTask, setDraftTask] = useState<DraftTask | null>(null)
  const setConversations = useAppStore((s) => s.setConversations)
  const setAgents = useAppStore((s) => s.setAgents)
  const mobileSidebarOpen = useAppStore((s) => s.mobileSidebarOpen)
  const setMobileSidebarOpen = useAppStore((s) => s.setMobileSidebarOpen)

  useEffect(() => {
    fetchConversations().then(setConversations).catch(console.error)
    fetchAgents().then(setAgents).catch(console.error)
  }, [setAgents, setConversations])

  const startScenario = (draft: DraftTask) => {
    setDraftTask(draft)
    setView('new-task')
  }

  const currentViewLabel = navItems.find((item) => item.id === view)?.label ?? 'AgentHub'
  const openMobileSidebar = () => setMobileSidebarOpen(true)
  const closeMobileSidebar = () => setMobileSidebarOpen(false)
  const changeViewFromMobile = (nextView: WorkbenchView) => {
    setView(nextView)
    setMobileSidebarOpen(false)
  }
  const openSettingsFromMobile = () => {
    setSettingsOpen(true)
    setMobileSidebarOpen(false)
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 text-slate-950">
      <WorkbenchNav view={view} onViewChange={setView} onOpenSettings={() => setSettingsOpen(true)} />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {view !== 'conversations' && <MobileWorkbenchTopBar currentLabel={currentViewLabel} onOpen={openMobileSidebar} />}
        <div className="min-h-0 flex-1 overflow-hidden">
          {view === 'new-task' && <NewTaskView draftTask={draftTask} onDraftConsumed={() => setDraftTask(null)} onOpenConversations={() => setView('conversations')} />}
          {view === 'conversations' && <ConversationWorkspace />}
          {view === 'agents' && <AgentWorkspace onOpenConversations={() => setView('conversations')} onStartScenario={startScenario} />}
          {view === 'artifacts' && <ArtifactWorkspace onOpenConversations={() => setView('conversations')} />}
          {view === 'automation' && <AutomationWorkspace />}
          {view === 'analytics' && <AnalyticsWorkspace />}
        </div>
      </main>
      <MobileWorkbenchDrawer open={mobileSidebarOpen} view={view} onClose={closeMobileSidebar} onViewChange={changeViewFromMobile} onOpenSettings={openSettingsFromMobile} />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <SelectionPopover />
      <MessageHighlightLayer />
    </div>
  )
}

function MobileWorkbenchTopBar({ currentLabel, onOpen }: { currentLabel: string; onOpen: () => void }) {
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-slate-100 bg-white px-4 py-3 md:hidden">
      <button
        type="button"
        onClick={onOpen}
        className="flex size-10 items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-100 active:bg-slate-200"
        title="打开菜单"
      >
        <Menu className="size-5 stroke-[2.2]" />
      </button>
      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--agenthub-accent,#3370ff)] text-white shadow-sm shadow-blue-200">
        <Sparkles className="size-4" />
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-slate-900">AgentHub</div>
        <div className="truncate text-xs text-slate-500">{currentLabel}</div>
      </div>
    </div>
  )
}

function MobileWorkbenchDrawer({
  open,
  view,
  onClose,
  onViewChange,
  onOpenSettings,
}: {
  open: boolean
  view: WorkbenchView
  onClose: () => void
  onViewChange: (view: WorkbenchView) => void
  onOpenSettings: () => void
}) {
  const [accountOpen, setAccountOpen] = useState(false)
  const usage = useUsageSummary(open && accountOpen)

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="关闭菜单"
          className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-[1px] md:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[min(86vw,320px)] flex-col bg-white shadow-2xl transition-transform duration-200 md:hidden',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4">
          <button type="button" onClick={() => onViewChange('new-task')} className="flex min-w-0 items-center gap-3 text-left">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--agenthub-accent,#3370ff)] text-white shadow-sm shadow-blue-200">
              <Sparkles className="size-4" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-950">AgentHub</div>
              <div className="truncate text-xs text-slate-500">个人多 Agent 工作区</div>
            </div>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex size-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 active:bg-slate-200"
            title="关闭菜单"
          >
            <X className="size-4 stroke-[2.2]" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
          <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-900">
              <CheckCircle2 className="size-3.5 text-emerald-500" />
              个人工作区
            </div>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">管理本地会话、Agent、产物与自动化任务。</p>
          </div>

          <button
            type="button"
            onClick={() => onViewChange('new-task')}
            className={cn(
              'mb-3 flex min-h-11 w-full items-center gap-3 rounded-2xl px-3 text-left text-sm font-medium transition active:scale-[0.99]',
              view === 'new-task'
                ? 'bg-[var(--agenthub-accent-soft,#eff6ff)] text-[var(--agenthub-accent,#3370ff)]'
                : 'border border-[var(--agenthub-accent-border,#bfdbfe)] bg-[var(--agenthub-accent-soft,#eff6ff)] text-[var(--agenthub-accent,#3370ff)] hover:border-[var(--agenthub-accent,#3370ff)]',
            )}
          >
            <Plus className="size-5" />
            <span className="min-w-0 flex-1 truncate">新建任务</span>
          </button>

          <nav className="space-y-1.5">
            {navItems.filter((item) => item.id !== 'new-task').map((item) => {
              const Icon = item.icon
              const active = view === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onViewChange(item.id)}
                  className={cn(
                    'flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm transition active:scale-[0.99]',
                    active
                      ? 'bg-[var(--agenthub-accent-soft,#eff6ff)] font-semibold text-[var(--agenthub-accent,#3370ff)]'
                      : 'text-slate-600 hover:bg-slate-100 active:bg-slate-200',
                  )}
                >
                  <Icon className="size-5 stroke-[2.1]" />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {active && <span className="size-1.5 rounded-full bg-[var(--agenthub-accent,#3370ff)]" />}
                </button>
              )
            })}
          </nav>
        </div>

        <div className="space-y-2 border-t border-slate-100 p-3">
          {accountOpen && (
            <UserAccountOverview usage={usage} onReload={usage.reload} onOpenSettings={onOpenSettings} />
          )}

          <button
            type="button"
            onClick={() => setAccountOpen((expanded) => !expanded)}
            aria-expanded={accountOpen}
            className="flex min-h-12 w-full items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-2.5 text-left transition hover:border-blue-200 hover:bg-blue-50/60 active:bg-blue-100"
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">A</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-xs font-medium text-slate-900">Agenter</span>
                <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-[#3370ff]">个人</span>
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                本地模式
              </div>
            </div>
            <ChevronDown className={cn('size-4 shrink-0 text-slate-400 transition-transform', accountOpen && 'rotate-180')} />
          </button>
        </div>
      </aside>
    </>
  )
}

function useUsageSummary(enabled: boolean) {
  const [data, setData] = useState<UsageSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const summary = await fetchUsageSummary()
      setData(summary)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!enabled || data || loading) return
    void reload()
  }, [data, enabled, loading, reload])

  return { data, loading, error, reload }
}

function UserAccountOverview({
  usage,
  onReload,
  onOpenSettings,
}: {
  usage: { data: UsageSummary | null; loading: boolean; error: string | null }
  onReload: () => void
  onOpenSettings: () => void
}) {
  const setActiveConversation = useAppStore((s) => s.setActiveConversation)
  const topModels = usage.data?.byModel.slice(0, 2) ?? []
  const topConversations = usage.data?.topConversations.slice(0, 3) ?? []

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm shadow-slate-200/70">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-slate-900">个人账户</div>
          <div className="mt-0.5 truncate text-[11px] text-slate-500">本地单用户 · 用量概览</div>
        </div>
        <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-600">已连接</span>
      </div>

      {usage.loading && !usage.data ? (
        <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-5 text-center text-xs text-slate-500">加载用量数据...</div>
      ) : usage.error ? (
        <div className="mt-3 rounded-2xl border border-rose-100 bg-rose-50 p-3 text-xs text-rose-600">
          <div className="line-clamp-2">{usage.error}</div>
          <button type="button" onClick={onReload} className="mt-2 font-medium text-rose-700 hover:text-rose-900">重试</button>
        </div>
      ) : usage.data ? (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Meta label="今日 Token" value={formatTok(usage.data.today.totalTokens)} />
            <Meta label="今日运行" value={`${usage.data.today.runs} 次`} />
            <Meta label="本周 Token" value={formatTok(usage.data.week.totalTokens)} />
            <Meta label="全部运行" value={`${usage.data.allTime.runs} 次`} />
          </div>

          {topModels.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400">常用模型</div>
              {topModels.map((model) => (
                <UsageBarRow key={model.model} label={model.model} value={model.totalTokens} runs={model.runs} max={topModels[0].totalTokens} />
              ))}
            </div>
          )}

          {topConversations.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400">高频会话</div>
              {topConversations.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => setActiveConversation(conversation.id)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-1.5 py-1 text-left text-xs transition hover:bg-blue-50 hover:text-[#3370ff]"
                  title={`更新时间 ${new Date(conversation.updatedAt).toLocaleString('zh-CN')}`}
                >
                  <span className="min-w-0 flex-1 truncate">{conversation.title}</span>
                  <span className="shrink-0 font-mono text-[11px] text-slate-400">
                    <Coins className="mr-1 inline size-3" />
                    {formatTok(conversation.totalTokens)}
                  </span>
                </button>
              ))}
            </div>
          )}

          {usage.data.allTime.runs === 0 && (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">还没有用量数据，和 Agent 对话后会显示在这里。</div>
          )}
        </div>
      ) : null}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onReload}
          disabled={usage.loading}
          className="flex h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-[#3370ff] disabled:opacity-50"
        >
          <BarChart3 className="size-3.5" />
          {usage.loading ? '刷新中' : '刷新'}
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-[#3370ff]"
        >
          <Settings className="size-3.5" />
          设置
        </button>
      </div>
    </div>
  )
}

function UsageBarRow({ label, value, runs, max }: { label: string; value: number; runs: number; max: number }) {
  const pct = max > 0 ? (value * 100) / max : 0

  return (
    <div className="space-y-1 rounded-xl bg-slate-50 px-2.5 py-2">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="min-w-0 flex-1 truncate font-mono text-slate-600">{label}</span>
        <span className="shrink-0 font-mono text-[11px] text-slate-400">{formatTok(value)} · {runs}</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-[#3370ff]/70 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function formatTok(n: number): string {
  if (n < 1000) return `${n}`
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`
  return `${(n / 1_000_000).toFixed(2)}M`
}

function WorkbenchNav({
  view,
  onViewChange,
  onOpenSettings,
}: {
  view: WorkbenchView
  onViewChange: (view: WorkbenchView) => void
  onOpenSettings: () => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [themeAccent, setThemeAccent] = useState<'blue' | 'violet'>('blue')
  const [accountOpen, setAccountOpen] = useState(false)
  const usage = useUsageSummary(accountOpen && !collapsed)

  const applyThemeAccent = (accent: keyof typeof THEME_ACCENTS) => {
    const theme = THEME_ACCENTS[accent]
    document.documentElement.style.setProperty('--agenthub-accent', theme.primary)
    document.documentElement.style.setProperty('--agenthub-accent-hover', theme.hover)
    document.documentElement.style.setProperty('--agenthub-accent-soft', theme.soft)
    document.documentElement.style.setProperty('--agenthub-accent-border', theme.border)
  }

  useEffect(() => {
    applyThemeAccent(themeAccent)
  }, [themeAccent])

  const toggleThemeAccent = () => {
    setThemeAccent((accent) => (accent === 'blue' ? 'violet' : 'blue'))
  }

  return (
    <aside className={cn('hidden shrink-0 flex-col border-r border-slate-200 bg-white/95 px-3 py-4 shadow-sm transition-[width] duration-200 md:flex', collapsed ? 'w-[96px]' : view === 'conversations' ? 'w-[300px]' : 'w-[248px]')}>
      <div className={cn('mb-3 flex items-center gap-2 px-2', collapsed && 'flex-col px-0')}>
        <button
          type="button"
          onClick={() => onViewChange('new-task')}
          className={cn('flex min-w-0 items-center gap-2 text-left', collapsed ? 'w-full flex-col justify-center' : 'flex-1')}
          title={collapsed ? 'AgentHub' : undefined}
        >
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--agenthub-accent,#3370ff)] text-white shadow-sm shadow-blue-200">
            <Sparkles className="size-4" />
          </div>
          {collapsed && <span className="truncate text-[11px] font-semibold tracking-tight text-slate-900">AgentHub</span>}
          {!collapsed && (
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold tracking-tight">AgentHub</div>
              <div className="truncate text-[11px] text-slate-500">Multi-Agent Workspace</div>
            </div>
          )}
        </button>
        {!collapsed && (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={onOpenSettings}
              className="flex size-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              title="设置"
            >
              <Settings className="size-4 stroke-[2.2]" />
            </button>
            <button
              type="button"
              onClick={toggleThemeAccent}
              className={cn(
                'flex size-8 items-center justify-center rounded-lg transition',
                themeAccent === 'violet'
                  ? 'bg-[var(--agenthub-accent-soft)] text-[var(--agenthub-accent)]'
                  : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700',
              )}
              title={themeAccent === 'blue' ? '切换为紫色主题' : '切换为蓝色主题'}
            >
              <Palette className="size-4 stroke-[2.2]" />
            </button>
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              className="flex size-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              title="收起侧边栏"
            >
              <Menu className="size-4 stroke-[2.2]" />
            </button>
          </div>
        )}
        {collapsed && (
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            className="flex size-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            title="展开侧边栏"
          >
            <Menu className="size-4 stroke-[2.2]" />
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => onViewChange('new-task')}
        className={cn(
          'mb-2 flex h-10 items-center justify-center gap-2 rounded-xl border border-[var(--agenthub-accent-border,#bfdbfe)] bg-[var(--agenthub-accent-soft,#eff6ff)] px-3 text-sm font-medium text-[var(--agenthub-accent,#3370ff)] transition hover:border-[var(--agenthub-accent)] hover:bg-[var(--agenthub-accent-soft,#eff6ff)]',
          collapsed && 'px-0',
        )}
      >
        <Plus className="size-4" />
        {!collapsed && <span className="min-w-0 flex-1 text-left">新建任务</span>}
        {!collapsed && <span className="ml-auto text-[10px] font-normal text-[color:var(--agenthub-accent,#3370ff)] opacity-70">Ctrl + N</span>}
      </button>

      <nav className="space-y-1">
        {navItems.filter((item) => item.id !== 'new-task').map((item) => {
          const Icon = item.icon
          const active = view === item.id || (item.id === 'conversations' && view === 'new-task')
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onViewChange(item.id)}
              title={collapsed ? item.label : undefined}
              className={cn(
                'relative flex h-10 w-full items-center gap-2 rounded-lg px-3 text-sm transition',
                collapsed && 'justify-center px-0',
                active
                  ? 'bg-[var(--agenthub-accent-soft,#eff6ff)] font-semibold text-[var(--agenthub-accent,#3370ff)] shadow-sm shadow-blue-100/60 before:absolute before:left-0 before:top-2 before:h-6 before:w-[3px] before:rounded-r-full before:bg-[var(--agenthub-accent,#3370ff)]'
                  : 'font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900',
              )}
            >
              <Icon className={cn('size-4 shrink-0 stroke-[2.2]', active && 'stroke-[2.5]')} />
              {!collapsed && item.label}
            </button>
          )
        })}
      </nav>

      {!collapsed && view === 'conversations' && (
        <div className="mt-2 min-h-0 flex-1 overflow-hidden border-t border-slate-100 pt-3">
          <ConversationListPanel variant="embedded" />
        </div>
      )}

      <div className={cn('mt-auto space-y-2', !collapsed && view === 'conversations' && 'mt-4')}>
        {accountOpen && !collapsed && (
          <UserAccountOverview usage={usage} onReload={usage.reload} onOpenSettings={onOpenSettings} />
        )}

        <button
          type="button"
          onClick={() => collapsed ? setCollapsed(false) : setAccountOpen((open) => !open)}
          aria-expanded={accountOpen && !collapsed}
          className={cn('w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-blue-200 hover:bg-blue-50/50 hover:shadow-sm', collapsed && 'px-2')}
          title={collapsed ? '展开账户概览' : accountOpen ? '收起账户概览' : '展开账户概览'}
        >
          <div className={cn('flex items-center gap-2', collapsed && 'justify-center')}>
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">A</div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <div className="truncate text-xs font-medium">Agenter</div>
                  <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-[#3370ff]">个人</span>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  本地模式
                </div>
              </div>
            )}
            {!collapsed && <ChevronDown className={cn('size-4 shrink-0 text-slate-400 transition-transform', accountOpen && 'rotate-180')} />}
          </div>
        </button>
      </div>
    </aside>
  )
}

function NewTaskView({
  draftTask,
  onDraftConsumed,
  onOpenConversations,
}: {
  draftTask: DraftTask | null
  onDraftConsumed: () => void
  onOpenConversations: () => void
}) {
  const agents = useAgentList()
  const defaultAgent = agents[0]
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([])
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const [approvalMode, setApprovalMode] = useState<'auto' | 'review'>('review')
  const [uploading, setUploading] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [scenarioTab, setScenarioTab] = useState(scenarioTabs[0])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const upsertConversation = useAppStore((s) => s.upsertConversation)
  const setActiveConversation = useAppStore((s) => s.setActiveConversation)
  const addLocalUserMessage = useAppStore((s) => s.addLocalUserMessage)
  const replaceLocalMessageId = useAppStore((s) => s.replaceLocalMessageId)
  const upsertMessage = useAppStore((s) => s.upsertMessage)

  const activeAgentIds = selectedAgentIds.length > 0 ? selectedAgentIds : defaultAgent ? [defaultAgent.id] : []
  const activeAgents = activeAgentIds.map((id) => agents.find((agent) => agent.id === id)).filter((agent): agent is AgentRow => Boolean(agent))

  useEffect(() => {
    if (!draftTask) return
    setContent(draftTask.prompt)
    const matchedAgentIds = draftTask.agentPresetIds
      .map((presetId) => {
        const preset = RESOURCE_AGENT_PRESETS.find((item) => item.id === presetId)
        if (!preset) return null
        return agents.find((agent) => agent.name === preset.name || agent.name === getPresetDisplayName(preset))?.id ?? null
      })
      .filter((id): id is string => Boolean(id))
    if (matchedAgentIds.length > 0) setSelectedAgentIds(matchedAgentIds)
    onDraftConsumed()
  }, [agents, draftTask, onDraftConsumed])

  const uploadFiles = async (conversationId: string) => {
    if (pendingFiles.length === 0) return []
    setUploading(true)
    try {
      return await Promise.all(pendingFiles.map((file) => uploadAttachment(conversationId, file)))
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const submit = async () => {
    const text = content.trim()
    if (!text || activeAgentIds.length === 0 || sending) return
    setSending(true)
    try {
      const conv = await createConversation({
        title: text.length > 24 ? `${text.slice(0, 24)}…` : text,
        mode: activeAgentIds.length > 1 ? 'group' : 'single',
        agentIds: activeAgentIds,
      })
      upsertConversation(conv)
      if (approvalMode !== conv.fsWriteApprovalMode) {
        const updated = await setFsWriteApprovalMode(conv.id, approvalMode)
        upsertConversation(updated)
      }
      const uploadedAttachments = await uploadFiles(conv.id)
      setActiveConversation(conv.id)
      onOpenConversations()

      const tempId = `temp_${nanoid()}`
      addLocalUserMessage({
        tempId,
        conversationId: conv.id,
        content: text,
        mentionedAgentIds: activeAgentIds,
        attachments: uploadedAttachments,
      })
      setContent('')
      setPendingFiles([])
      const result = await sendMessage(conv.id, {
        content: text,
        mentionedAgentIds: activeAgentIds,
        attachmentIds: uploadedAttachments.map((attachment) => attachment.id),
      })
      replaceLocalMessageId(tempId, result.messageId)
      for (const message of result.messages ?? []) upsertMessage(message)
    } catch (err) {
      console.error('[AppWorkbench] create task failed', err)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden bg-gray-50">
      {/* 顶部激励栏 */}
      <header className="flex shrink-0 items-center justify-end px-8 py-4">
        <button type="button" className="inline-flex items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-3.5 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100">
          <Sparkles className="size-3" />
          来成长计划赚积分
        </button>
      </header>

      {/* 主内容区 - 内容整体下移，垂直居中显示 */}
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto">
        <div className="mx-auto w-full max-w-5xl px-8 pb-16">
          {/* Hero Section - 标题 + 右侧机器人吉祥物 */}
          <div className="mb-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div>
              <h1 className="text-[36px] font-bold leading-tight tracking-tight text-slate-950">
                AgentHub - 你的多 Agent 协作工作台
              </h1>

              {/* 一级场景切换 Tabs */}
              <div className="mt-6 flex flex-wrap items-center gap-2">
                {scenarioTabs.map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setScenarioTab(tab)}
                    className={cn(
                      'rounded-full px-5 py-2 text-sm font-medium transition',
                      scenarioTab === tab
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-800',
                    )}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* 二级快捷入口 Chips */}
              <div className="mt-4 flex flex-wrap gap-3">
                {quickTasks.map((task) => (
                  <button
                    key={task}
                    type="button"
                    onClick={() => setContent(task)}
                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:text-[#3370ff] hover:shadow-md"
                  >
                    <span className="flex size-6 items-center justify-center rounded-lg bg-blue-50 text-[#3370ff]">
                      <Sparkles className="size-3.5" />
                    </span>
                    {task}
                  </button>
                ))}
              </div>
            </div>

            {/* 3D 机器人吉祥物（占位符） */}
            <div className="hidden shrink-0 lg:flex lg:items-center lg:justify-center">
              <div className="relative flex size-44 items-center justify-center">
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-100 via-indigo-100 to-purple-100 blur-2xl opacity-70" />
                <div className="relative flex size-40 items-center justify-center rounded-[36%] bg-gradient-to-br from-white to-blue-50 shadow-xl shadow-blue-200/50">
                  <div className="text-6xl">🤖</div>
                </div>
                <div className="absolute -right-2 -top-1 flex size-8 animate-pulse items-center justify-center rounded-full bg-yellow-300 text-lg shadow-md">
                  ✨
                </div>
                <div className="absolute -left-3 bottom-4 flex size-7 items-center justify-center rounded-full bg-pink-200 text-sm shadow-md">
                  💬
                </div>
              </div>
            </div>
          </div>

          {/* 核心交互输入框 - 悬浮白色大卡片（输入 + 工具栏合并在一个阴影卡片中） */}
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-200/60">
            {draftTask && (
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-medium text-[#3370ff]">
                <Sparkles className="size-3" />
                已载入精选场景：{draftTask.sourceScenarioTitle}
              </div>
            )}
            {/* 上半部：输入区 */}
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void submit()
                }
              }}
              placeholder="今天想让 AgentHub 帮你完成什么？"
              className="min-h-[120px] resize-none border-0 bg-transparent px-6 pb-2 pt-5 text-base shadow-none placeholder:text-slate-400 focus-visible:ring-0"
            />

            {/* 附件列表 */}
            {pendingFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 px-6 pb-3">
                {pendingFiles.map((file) => (
                  <span key={`${file.name}-${file.lastModified}`} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
                    <Paperclip className="size-3" />
                    {file.name}
                    <button
                      type="button"
                      onClick={() => setPendingFiles((list) => list.filter((item) => item !== file))}
                      className="text-slate-400 transition hover:text-slate-700"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* 中间浅灰分割线 */}
            <div className="mx-6 h-px bg-slate-100" />

            {/* 下半部：参数配置栏 */}
            <div className="flex flex-wrap items-center gap-2 px-4 py-3">
              <select
                value={activeAgentIds[0] ?? ''}
                onChange={(e) => setSelectedAgentIds(e.target.value ? [e.target.value] : [])}
                className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none transition focus:border-blue-300"
              >
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>{getAgentDisplayName(agent)}</option>
                ))}
              </select>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setApprovalMode((mode) => (mode === 'review' ? 'auto' : 'review'))}
                className={cn(
                  'h-8 rounded-lg border-slate-200 text-xs font-medium transition-all',
                  approvalMode === 'auto' && 'border-blue-200 bg-blue-50 text-[#3370ff]',
                )}
              >
                {approvalMode === 'auto' ? '自动' : 'Review'}
              </Button>

              <Button variant="outline" size="sm" className="h-8 rounded-lg border-slate-200 text-xs font-medium text-slate-600">
                技能
              </Button>

              {/* 更多设置：折叠 连应用 / 默认权限 */}
              <Popover>
                <PopoverTrigger
                  render={
                    <Button
                      variant="outline"
                      size="icon-sm"
                      title="更多设置"
                      className="h-8 w-8 rounded-lg border-slate-200 text-slate-500 hover:text-slate-700"
                    >
                      <MoreHorizontal className="size-4" />
                    </Button>
                  }
                />
                <PopoverContent align="start" className="w-48 p-1">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-slate-700 transition hover:bg-slate-100"
                  >
                    连应用
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-slate-700 transition hover:bg-slate-100"
                  >
                    默认权限
                  </button>
                </PopoverContent>
              </Popover>

              {/* 分割线 + 右侧操作区 */}
              <div className="ml-auto flex items-center gap-1.5">
                <div className="mr-1 h-6 w-px bg-slate-200" />
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(event) => setPendingFiles(Array.from(event.target.files ?? []))}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="附件上传"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                >
                  <Paperclip className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="语音输入"
                  className="rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                >
                  <Mic className="size-4" />
                </Button>
                <Button
                  onClick={() => void submit()}
                  disabled={!content.trim() || activeAgentIds.length === 0 || sending || uploading}
                  size="icon"
                  className="ml-1 size-9 rounded-xl bg-[#3370ff] text-white shadow-md shadow-blue-200 transition hover:bg-[#2563eb] disabled:opacity-50"
                  title={uploading ? '上传中' : '发送'}
                >
                  <Send className="size-4" />
                </Button>
              </div>
            </div>
          </section>

          {/* 底部状态栏 - 居中对齐 */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5 rounded-md px-1">
              选择工作空间
            </span>
            <span className="text-slate-300">·</span>
            <span className="inline-flex items-center gap-1.5 rounded-md px-1">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              本地沙箱 · 运行中
            </span>
            <span className="text-slate-300">·</span>
            <span className="inline-flex items-center gap-1.5 rounded-md px-1">
              {approvalMode === 'review' ? 'Review 保护 enabled' : 'Auto 模式 · 直接生效'}
            </span>
            {activeAgents.length > 0 && (
              <>
                <span className="text-slate-300">·</span>
                <span className="inline-flex items-center gap-1.5 rounded-md px-1 text-[#3370ff]">
                  <AgentAvatar agent={activeAgents[0]} size="xs" />
                  {activeAgents.length === 1 ? getAgentDisplayName(activeAgents[0]) : `${getAgentDisplayName(activeAgents[0])} 等 ${activeAgents.length} 位 Agent`}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function ResizeHandle({ onDrag }: { onDrag: (deltaX: number) => void }) {
  const startDrag = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    const startX = event.clientX

    const handlePointerMove = (moveEvent: PointerEvent) => {
      onDrag(moveEvent.clientX - startX)
    }

    const stopDrag = () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', stopDrag)
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopDrag)
  }, [onDrag])

  return (
    <button
      type="button"
      onPointerDown={startDrag}
      className="group hidden w-3 shrink-0 cursor-col-resize items-stretch justify-center rounded-full lg:flex"
      aria-label="调整右侧栏宽度"
      title="拖拽调整右侧栏宽度"
    >
      <span className="my-3 w-1 rounded-full bg-transparent transition group-hover:bg-blue-200 group-active:bg-blue-300" />
    </button>
  )
}

function ConversationWorkspace() {
  const [rightWidth, setRightWidth] = useState(360)
  const workspaceOpen = useAppStore((s) => s.fileExplorerOpen || Boolean(s.previewArtifactId))

  const resizeRight = useCallback((deltaX: number) => {
    setRightWidth((width) => clampNumber(width - deltaX, 280, 560))
  }, [])

  return (
    <div className="flex h-full min-w-0 gap-3 p-3 xl:p-4">
      <section className="flex min-w-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/70 sm:min-w-[360px]">
        <ChatPanel />
        {workspaceOpen && (
          <ResizableRightPanel width={rightWidth} />
        )}
      </section>
      {workspaceOpen && <ResizeHandle onDrag={resizeRight} />}
    </div>
  )
}

function ResizableRightPanel({ width }: { width: number }) {
  return (
    <div className="hidden min-w-0 shrink-0 overflow-hidden border-l border-slate-100 lg:block" style={{ width }}>
      <div className="flex h-9 items-center justify-between border-b border-slate-100 bg-slate-50/70 px-3 text-xs text-slate-500">
        <span className="font-medium">右侧工作区</span>
        <span className="text-[11px] text-slate-400">点击文件或产物入口时显示</span>
      </div>
      <div className="h-[calc(100%-2.25rem)] [&>aside]:h-full [&>aside]:w-full [&>aside]:min-w-0 [&>aside]:border-l-0">
        <FileExplorerPanel />
        <ArtifactPreviewPanel />
      </div>
    </div>
  )
}

function ConversationListPanel({ variant = 'standalone' }: { variant?: 'standalone' | 'embedded' }) {
  const conversations = useConversationList().filter((c) => !c.archived)
  const activeId = useAppStore((s) => s.activeConversationId)
  const setActiveConversation = useAppStore((s) => s.setActiveConversation)
  const agents = useAppStore((s) => s.agents)
  const [query, setQuery] = useState('')

  const filtered = conversations.filter((conversation) => conversation.title.toLowerCase().includes(query.trim().toLowerCase()))

  return (
    <aside className={cn(
      'flex min-h-0 flex-col',
      variant === 'standalone' && 'hidden w-[292px] shrink-0 rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/60 lg:flex',
      variant === 'embedded' && 'h-full',
    )}>
      <div className={cn('border-b border-slate-100', variant === 'embedded' ? 'pb-3' : 'p-4')}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className={cn('font-semibold', variant === 'embedded' ? 'text-sm' : 'text-base')}>对话历史</h2>
            <p className="mt-1 truncate text-xs text-slate-500">选择一个会话继续协作</p>
          </div>
          {variant === 'standalone' && (
            <div className="flex shrink-0 items-center gap-1">
              <div className="flex size-8 items-center justify-center rounded-lg bg-blue-50 text-[#3370ff]">
                <MessageSquare className="size-4" />
              </div>
            </div>
          )}
        </div>
        <div className="relative mt-3">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索对话" className="h-9 rounded-lg border-0 bg-slate-100 pl-9 text-xs shadow-none transition placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-blue-100" />
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-0.5 py-2">
          <div className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-slate-400">最近对话</div>
          {filtered.map((conversation) => {
            const isGroup = conversation.mode === 'group' || conversation.agentIds.length > 1
            return (
              <button
                key={conversation.id}
                type="button"
                onClick={() => setActiveConversation(conversation.id)}
                className={cn(
                  'flex h-14 w-full items-center gap-2 rounded-lg px-2 text-left transition',
                  activeId === conversation.id
                    ? 'bg-blue-50 text-slate-950'
                    : 'text-slate-700 hover:bg-slate-100',
                )}
              >
                <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', activeId === conversation.id ? 'bg-white text-[#3370ff]' : 'bg-slate-100 text-slate-500')}>
                  {isGroup ? <Grid2X2 className="size-3.5" /> : <MessageCircle className="size-3.5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium leading-5">{conversation.title}</span>
                  <span className="mt-0.5 block truncate text-[11px] leading-4 text-slate-500">
                    {conversation.agentIds.map((id) => agents[id] ? getAgentDisplayName(agents[id]) : null).filter(Boolean).join(' / ') || '未配置 Agent'}
                  </span>
                </span>
                <span className="ml-1 shrink-0 self-start pt-1 text-[10px] text-slate-400">{formatConversationTime(conversation.updatedAt)}</span>
              </button>
            )
          })}
          {filtered.length === 0 && <div className="px-3 py-8 text-center text-xs text-slate-500">暂无匹配会话</div>}
        </div>
      </ScrollArea>
    </aside>
  )
}

function formatConversationTime(value: number) {
  const date = new Date(value)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (isToday) return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

function AgentWorkspace({
  onOpenConversations,
  onStartScenario,
}: {
  onOpenConversations: () => void
  onStartScenario: (draft: DraftTask) => void
}) {
  const agents = useAgentList()
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState('全部')
  const [agentView, setAgentView] = useState<'featured' | 'mine'>('featured')
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [selectedPresetId, setSelectedPresetId] = useState<string>(RESOURCE_AGENT_PRESETS[0]?.id ?? '')
  const [formOpen, setFormOpen] = useState(false)
  const [startingPresetId, setStartingPresetId] = useState<string | null>(null)
  const [listAtBottom, setListAtBottom] = useState(false)
  const listViewportRef = useRef<HTMLDivElement>(null)
  const upsertConversation = useAppStore((s) => s.upsertConversation)
  const upsertAgent = useAppStore((s) => s.upsertAgent)
  const setActiveConversation = useAppStore((s) => s.setActiveConversation)

  const myAgents = agents

  const filteredPresets = useMemo(() => {
    const q = query.trim().toLowerCase()
    return RESOURCE_AGENT_PRESETS.filter((preset) => {
      const matchesQuery = !q || `${getPresetDisplayName(preset)} ${preset.name} ${preset.description} ${preset.capabilities.join(' ')}`.toLowerCase().includes(q)
      const matchesTab = tab === '全部' || preset.category === tab
      return matchesQuery && matchesTab
    })
  }, [query, tab])

  const filteredAgents = useMemo(() => {
    const q = query.trim().toLowerCase()
    return myAgents.filter((agent) => {
      return !q || `${getAgentDisplayName(agent)} ${agent.name} ${agent.description} ${agent.modelId ?? ''}`.toLowerCase().includes(q)
    })
  }, [myAgents, query])

  const selectedAgent = agentView === 'mine'
    ? (selectedAgentId ? agents.find((agent) => agent.id === selectedAgentId) : filteredAgents[0])
    : undefined
  const selectedPreset = RESOURCE_AGENT_PRESETS.find((preset) => preset.id === selectedPresetId) ?? filteredPresets[0] ?? RESOURCE_AGENT_PRESETS[0]

  useEffect(() => {
    setListAtBottom(false)
    const viewport = listViewportRef.current
    if (viewport) viewport.scrollTop = 0
  }, [agentView, query, tab])

  function updateListBottomState() {
    const viewport = listViewportRef.current
    if (!viewport) return
    const canScroll = viewport.scrollHeight > viewport.clientHeight + 8
    const atBottom = viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 24
    setListAtBottom(canScroll && atBottom)
  }

  useEffect(() => {
    const viewport = listViewportRef.current
    if (!viewport) return
    updateListBottomState()
    viewport.addEventListener('scroll', updateListBottomState)
    window.addEventListener('resize', updateListBottomState)
    return () => {
      viewport.removeEventListener('scroll', updateListBottomState)
      window.removeEventListener('resize', updateListBottomState)
    }
  }, [agentView, filteredAgents.length, filteredPresets.length])

  const startPresetConversation = async (preset: ResourceAgentPreset) => {
    if (startingPresetId) return
    setStartingPresetId(preset.id)
    try {
      const existingAgent = agents.find((agent) => agent.name === preset.name || agent.name === getPresetDisplayName(preset))
      const agent = existingAgent ?? await createAgent({
        name: getPresetDisplayName(preset),
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
      if (!existingAgent) upsertAgent(agent)
      const conv = await createConversation({ mode: 'single', agentIds: [agent.id] })
      upsertConversation(conv)
      setActiveConversation(conv.id)
      onOpenConversations()
    } catch (err) {
      console.error('[AgentWorkspace] start preset conversation failed', err)
    } finally {
      setStartingPresetId(null)
    }
  }

  const startConversation = async (agent: AgentRow) => {
    try {
      const conv = await createConversation({ mode: 'single', agentIds: [agent.id] })
      upsertConversation(conv)
      setActiveConversation(conv.id)
      onOpenConversations()
    } catch (err) {
      console.error('[AgentWorkspace] start conversation failed', err)
    }
  }

  return (
    <div className="flex h-full min-w-0 gap-4 p-4 xl:p-6">
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/70">
        <div className="shrink-0 border-b border-slate-100 p-4 xl:p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Agent 库</h1>
              <p className="mt-1 text-sm text-slate-500">发现、配置和复用你的协作 Agent</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setFormOpen(true)} className="rounded-lg bg-[#3370ff] hover:bg-[#2563eb]">
                <Plus className="mr-2 size-4" />
                创建 Agent
              </Button>
              <Button
                variant="outline"
                onClick={() => setAgentView((view) => (view === 'mine' ? 'featured' : 'mine'))}
                className={cn(
                  'rounded-lg border-slate-200',
                  agentView === 'mine' && 'border-blue-200 bg-blue-50 text-[#3370ff] hover:bg-blue-50',
                )}
              >
                {agentView === 'mine' ? '精选 Agent' : '我的 Agent'}
              </Button>
            </div>
          </div>
          <div className="relative mt-4">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={agentView === 'mine' ? '搜索我的 Agent、模型或能力' : '搜索精选 Agent、预设或能力'}
              className="h-10 rounded-xl border-slate-200 pl-10"
            />
          </div>
          {agentView === 'featured' && (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {featuredCategories.map((item) => (
                <button key={item} type="button" onClick={() => setTab(item)} className={cn('shrink-0 rounded-full border px-3 py-1.5 text-xs transition', tab === item ? 'border-blue-200 bg-blue-50 text-[#3370ff]' : 'border-slate-200 text-slate-500 hover:text-slate-900')}>
                  {item}
                </button>
              ))}
            </div>
          )}
          {agentView === 'featured' && (
            <div className="mt-3 border-t border-slate-100 pt-3">
              <div className="mb-2">
                <h2 className="text-sm font-semibold text-slate-900">精选场景</h2>
                <p className="mt-1 text-xs text-slate-500">一键组合 Agent，快速载入任务提示词</p>
              </div>
              <div className="grid grid-cols-2 gap-3 min-[920px]:grid-cols-3 min-[1180px]:grid-cols-5">
                {FEATURED_SCENARIOS.map((scenario) => (
                  <ScenarioCard
                    key={scenario.id}
                    scenario={scenario}
                    onStart={() => onStartScenario({
                      agentPresetIds: scenario.agentPresetIds,
                      prompt: scenario.prompt,
                      sourceScenarioTitle: scenario.title,
                    })}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <ScrollArea className="min-h-0 flex-1" viewportRef={listViewportRef}>
          <div className="space-y-5 p-4 pb-[calc(6rem+env(safe-area-inset-bottom))] xl:p-5 xl:pb-[calc(6rem+env(safe-area-inset-bottom))]">
            {agentView === 'featured' ? (
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-slate-950">精选 Agent</h2>
                    <p className="mt-1 text-xs text-slate-500">选择一个预设 Agent，直接开始对话</p>
                  </div>
                </div>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
                  {filteredPresets.map((preset) => {
                    return (
                      <ResourcePresetCard
                        key={preset.id}
                        preset={preset}
                        starting={startingPresetId === preset.id}
                        selected={selectedPreset?.id === preset.id}
                        onSelect={() => setSelectedPresetId(preset.id)}
                        onStart={() => void startPresetConversation(preset)}
                      />
                    )
                  })}
                </div>
              </section>
            ) : (
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold">我的 Agent</h2>
                    <p className="mt-1 text-xs text-slate-500">来自当前 AgentHub 数据库，可直接开始对话或继续配置</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500">{filteredAgents.length} 个</span>
                </div>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
                  {filteredAgents.map((agent) => (
                    <AgentCard key={agent.id} agent={agent} selected={selectedAgent?.id === agent.id} onSelect={() => setSelectedAgentId(agent.id)} onStart={() => void startConversation(agent)} />
                  ))}
                </div>
                {filteredAgents.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-14 text-center">
                    <div className="text-sm font-medium text-slate-900">还没有我的 Agent</div>
                    <p className="mt-2 text-xs text-slate-500">点击右上角「创建 Agent」添加自定义 Agent，或从精选 Agent 直接开始对话。</p>
                  </div>
                )}
              </section>
            )}
          </div>
          {listAtBottom && (
            <div className="pointer-events-none sticky bottom-4 z-10 mx-auto mt-4 w-fit rounded-full border border-slate-200 bg-white/95 px-3 py-1.5 text-[11px] font-medium text-slate-500 shadow-sm shadow-slate-200/70 backdrop-blur">
              已滚动到底部
            </div>
          )}
        </ScrollArea>
      </section>

      {agentView === 'featured' ? (
        <FeaturedPresetDetailPanel preset={selectedPreset} />
      ) : (
        <AgentDetailPanel agent={selectedAgent} onStart={(agent) => void startConversation(agent)} />
      )}
      <CreateAgentDialog open={formOpen} onOpenChange={setFormOpen} />
    </div>
  )
}

function getPresetDisplayName(preset: ResourceAgentPreset) {
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

function getAgentDisplayName(agent: AgentRow) {
  const preset = RESOURCE_AGENT_PRESETS.find((item) => item.name === agent.name)
  return preset ? getPresetDisplayName(preset) : agent.name
}

function ScenarioCard({ scenario, onStart }: { scenario: FeaturedScenario; onStart: () => void }) {
  const Icon = scenario.icon

  return (
    <button
      type="button"
      onClick={onStart}
      className="flex min-h-[120px] w-full flex-col rounded-xl border border-[#E5E7EB] bg-white p-3 text-left transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
    >
      <span className={cn('flex size-9 items-center justify-center rounded-full', scenario.iconWrapClassName)}>
        <Icon className={cn('size-5', scenario.iconClassName)} />
      </span>
      <div className="mt-3 text-sm font-semibold leading-5 text-slate-950">{scenario.title}</div>
      <div className="mt-1.5 line-clamp-2 text-xs leading-5 text-slate-500">{scenario.description}</div>
    </button>
  )
}

function ResourcePresetCard({
  preset,
  starting,
  selected,
  onSelect,
  onStart,
}: {
  preset: ResourceAgentPreset
  starting: boolean
  selected: boolean
  onSelect: () => void
  onStart: () => void
}) {
  return (
    <article
      onClick={onSelect}
      className={cn(
        'group flex min-h-[220px] cursor-pointer flex-col rounded-2xl border bg-white p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md',
        selected ? 'border-blue-300 ring-2 ring-blue-50' : 'border-slate-200',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white text-xl shadow-sm ring-1 ring-slate-200 transition duration-200 group-hover:scale-105 group-hover:shadow-md">
          <span aria-hidden="true">{preset.avatar}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start gap-2">
            <h3 className={cn('line-clamp-2 flex-1 text-[15px] font-semibold leading-5 text-slate-950', getPresetDisplayName(preset).length > 22 && 'text-sm leading-5')}>
              {getPresetDisplayName(preset)}
            </h3>
            <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-medium text-[#3370ff] ring-1 ring-blue-100">{preset.category}</span>
          </div>
          <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-600">{preset.description}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {preset.capabilities.map((capability) => (
          <span key={capability} className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-700 ring-1 ring-blue-100 transition hover:bg-blue-100 hover:text-blue-800">
            {capability}
          </span>
        ))}
      </div>

      <div className="mt-auto pt-4">
        <Button
          size="sm"
          disabled={starting}
          onClick={(e) => {
            e.stopPropagation()
            onStart()
          }}
          className="h-8 w-full rounded-xl bg-[#3370ff] text-xs transition hover:bg-[#2563eb] disabled:opacity-60"
        >
          {starting ? '创建对话中' : '开始对话'}
        </Button>
      </div>
    </article>
  )
}

function FeaturedPresetDetailPanel({ preset }: { preset?: ResourceAgentPreset }) {
  const [promptOpen, setPromptOpen] = useState(false)

  if (!preset) {
    return (
      <aside className="hidden w-[360px] shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/70 xl:block">
        <div className="flex h-full items-center justify-center p-8 text-center text-sm text-slate-500">选择一个精选 Agent 查看详情</div>
      </aside>
    )
  }

  return (
    <aside className="hidden w-[360px] shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/70 xl:block">
      <div className="flex h-full flex-col">
        <div className="border-b border-slate-100 p-5">
          <div className="flex items-start gap-3">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 text-2xl shadow-sm ring-1 ring-blue-100/70 transition duration-200 hover:scale-105">
              {preset.avatar}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-xl font-semibold tracking-tight text-slate-950">{getPresetDisplayName(preset)}</h2>
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-[#3370ff]">精选</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500">{preset.description}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {preset.capabilities.map((capability) => (
              <span key={capability} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600 transition hover:bg-blue-50 hover:text-[#3370ff]">{capability}</span>
            ))}
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-4 p-5 text-sm">
            <DetailSection icon={<SlidersHorizontal className="size-4" />} title="模型配置" aside={<SavedState />}>
              <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-3 transition duration-200 hover:border-blue-200 hover:bg-blue-50">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-white text-[#3370ff] shadow-sm">
                      <Check className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium text-[#3370ff]">{preset.modelId}</div>
                      <div className="mt-0.5 text-[10px] text-slate-500">自定义模型 · WorkBuddy preset</div>
                    </div>
                  </div>
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
                </div>
              </div>
            </DetailSection>

            <DetailSection icon={<FileText className="size-4" />} title="系统提示词" aside="摘要">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className={cn('text-xs leading-5 text-slate-600 transition-all duration-200', !promptOpen && 'line-clamp-4')}>
                  {preset.systemPrompt}
                </div>
                <button type="button" onClick={() => setPromptOpen((open) => !open)} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#3370ff] transition hover:text-[#2563eb]">
                  {promptOpen ? '收起' : '查看更多'}
                  <ChevronDown className={cn('size-3 transition-transform duration-200', promptOpen && 'rotate-180')} />
                </button>
              </div>
            </DetailSection>

            <DetailSection icon={<Wrench className="size-4" />} title="工具权限">
              <div className="space-y-2">
                {preset.toolNames.map((toolName) => (
                  <PermissionRow key={toolName} name={formatToolName(toolName)} code={toolName} />
                ))}
              </div>
            </DetailSection>

            <DetailSection icon={<History className="size-4" />} title="最近会话">
              <HistoryRow icon={<MessageCircle className="size-4" />} title="精选 Agent 可直接开始" description="点击开始对话后会自动进入单 Agent 会话" time="刚刚" />
            </DetailSection>

            <DetailSection icon={<FileCode2 className="size-4" />} title="最近产物">
              <HistoryRow icon={<FileText className="size-4" />} title={`${getPresetDisplayName(preset)} preset`} description="开始对话时会复用或创建对应 Agent 配置" time="预设" />
            </DetailSection>
          </div>
        </ScrollArea>
      </div>
    </aside>
  )
}

function AgentCard({ agent, selected, onSelect, onStart }: { agent: AgentRow; selected: boolean; onSelect: () => void; onStart: () => void }) {
  return (
    <article onClick={onSelect} className={cn('cursor-pointer rounded-2xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md', selected ? 'border-blue-300 ring-2 ring-blue-50' : 'border-slate-200')}>
      <div className="flex items-start gap-3">
        <AgentAvatar agent={agent} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold">{getAgentDisplayName(agent)}</h3>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{agent.isBuiltin ? '内置' : '自定义'}</span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{agent.description || '可配置的协作 Agent'}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {[agent.adapterName, agent.isOrchestrator ? '编排' : '执行', agent.modelId ? '模型配置' : '默认模型'].map((tag) => (
          <span key={tag} className="rounded-full bg-slate-100 px-2 py-1 text-[10px] text-slate-600">{tag}</span>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
        <div className="truncate font-mono text-[11px] text-slate-500">{agent.modelId || 'default model'}</div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs" onClick={(e) => { e.stopPropagation(); onSelect() }}>详情</Button>
          <Button size="sm" className="h-8 rounded-lg bg-[#3370ff] text-xs hover:bg-[#2563eb]" onClick={(e) => { e.stopPropagation(); onStart() }}>开始对话</Button>
        </div>
      </div>
    </article>
  )
}

function AgentDetailPanel({ agent, onStart }: { agent?: AgentRow; onStart: (agent: AgentRow) => void }) {
  const [promptOpen, setPromptOpen] = useState(false)

  if (!agent) {
    return (
      <aside className="hidden w-[360px] shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/70 xl:block">
        <div className="flex h-full items-center justify-center p-8 text-center text-sm text-slate-500">选择一个 Agent 查看详情</div>
      </aside>
    )
  }

  return (
    <aside className="hidden w-[360px] shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/70 xl:block">
      <div className="flex h-full flex-col">
        <div className="border-b border-slate-100 p-5">
          <div className="flex items-start gap-3">
            <div className="transition duration-200 hover:scale-105">
              <AgentAvatar agent={agent} size="lg" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-xl font-semibold tracking-tight text-slate-950">{getAgentDisplayName(agent)}</h2>
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-[#3370ff]">{agent.isBuiltin ? '内置' : '自定义'}</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500">{agent.description || '可配置的协作 Agent'}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {agent.capabilities.map((capability) => (
              <span key={capability} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600 transition hover:bg-blue-50 hover:text-[#3370ff]">{capability}</span>
            ))}
          </div>
          <Button onClick={() => onStart(agent)} className="mt-4 w-full rounded-xl bg-[#3370ff] shadow-sm shadow-blue-100 transition hover:-translate-y-0.5 hover:bg-[#2563eb] hover:shadow-md">
            开始对话
          </Button>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-4 p-5 text-sm">
            <DetailSection icon={<SlidersHorizontal className="size-4" />} title="模型配置" aside={<SavedState />}>
              <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-3 transition duration-200 hover:border-blue-200 hover:bg-blue-50">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-white text-[#3370ff] shadow-sm">
                      <Check className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium text-[#3370ff]">{agent.modelId || 'default model'}</div>
                      <div className="mt-0.5 text-[10px] text-slate-500">{agent.adapterName} · {agent.modelProvider ?? '默认 provider'}</div>
                    </div>
                  </div>
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
                </div>
              </div>
            </DetailSection>

            <DetailSection icon={<FileText className="size-4" />} title="系统提示词" aside="摘要">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className={cn('text-xs leading-5 text-slate-600 transition-all duration-200', !promptOpen && 'line-clamp-4')}>
                  {agent.systemPrompt || '未配置系统提示'}
                </div>
                <button type="button" onClick={() => setPromptOpen((open) => !open)} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#3370ff] transition hover:text-[#2563eb]">
                  {promptOpen ? '收起' : '查看更多'}
                  <ChevronDown className={cn('size-3 transition-transform duration-200', promptOpen && 'rotate-180')} />
                </button>
              </div>
            </DetailSection>

            <DetailSection icon={<Wrench className="size-4" />} title="工具权限">
              <div className="space-y-2">
                {(agent.toolNames.length > 0 ? agent.toolNames : ['message']).map((toolName) => (
                  <PermissionRow key={toolName} name={formatToolName(toolName)} code={toolName} />
                ))}
              </div>
            </DetailSection>

            <DetailSection icon={<History className="size-4" />} title="最近会话">
              <HistoryRow icon={<MessageCircle className="size-4" />} title="新建单聊入口" description="已接入原有会话创建和消息流" time="可用" />
            </DetailSection>

            <DetailSection icon={<FileCode2 className="size-4" />} title="最近产物">
              <HistoryRow icon={<FileText className="size-4" />} title="产物库联动" description="按 Agent 过滤待后端聚合字段补充" time="已接入" />
            </DetailSection>
          </div>
        </ScrollArea>
      </div>
    </aside>
  )
}

function ArtifactWorkspace({ onOpenConversations }: { onOpenConversations: () => void }) {
  const [items, setItems] = useState<ArtifactListItem[]>([])
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState('全部')
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const upsertArtifact = useAppStore((s) => s.upsertArtifact)
  const openArtifactPreview = useAppStore((s) => s.openArtifactPreview)
  const previewArtifactId = useAppStore((s) => s.previewArtifactId)
  const setActiveConversation = useAppStore((s) => s.setActiveConversation)

  useEffect(() => {
    fetchArtifacts()
      .then((list) => {
        setItems(list)
        setSelectedId(list[0]?.id ?? null)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const groups = useMemo(() => groupArtifactVersions(items), [items])
  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase()
    return groups.filter((group) => {
      const item = group.latest
      const matchesQuery = !q || `${item.title} ${item.type} ${item.conversationTitle ?? ''}`.toLowerCase().includes(q)
      const matchesTab = tab === '全部' || item.type.toLowerCase().includes(tab.toLowerCase().replace('web 原型', 'web'))
      return matchesQuery && matchesTab
    })
  }, [groups, query, tab])

  const selected = items.find((item) => item.id === selectedId) ?? filteredGroups[0]?.latest
  const previewOpen = Boolean(previewArtifactId)

  const openPreview = async (id: string) => {
    try {
      const artifact = await fetchArtifact(id)
      upsertArtifact(artifact)
      openArtifactPreview(id)
    } catch (err) {
      console.error('[ArtifactWorkspace] open preview failed', err)
    }
  }

  return (
    <div className={cn('flex h-full min-w-0 gap-4', previewOpen ? 'p-4 xl:p-5' : 'p-6')}>
      {!previewOpen && (
        <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/70">
          <div className="shrink-0 border-b border-slate-100 p-4 xl:p-5">
            <div className="flex flex-nowrap items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-semibold tracking-tight text-slate-950">产物库</h1>
                <p className="mt-1 truncate text-sm text-slate-500">集中管理文档、原型、PPT、图片、项目和历史版本</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button variant="outline" className="h-9 rounded-xl border-slate-200 px-3 text-xs text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-[#3370ff]">批量管理</Button>
                <Button variant="outline" className="h-9 rounded-xl border-slate-200 px-3 text-xs text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-[#3370ff]">导出</Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setViewMode((mode) => (mode === 'grid' ? 'list' : 'grid'))}
                  className={cn('size-9 rounded-xl border-slate-200 text-slate-500 hover:border-blue-200 hover:bg-blue-50 hover:text-[#3370ff]', viewMode === 'grid' && 'border-blue-200 bg-blue-50 text-[#3370ff]')}
                  title={viewMode === 'grid' ? '切换列表视图' : '切换网格视图'}
                >
                  <Grid2X2 className="size-4" />
                </Button>
              </div>
            </div>

            <div className="relative mt-5">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索产物、版本或来源会话" className="h-10 w-full rounded-xl border-slate-200 bg-slate-50 pl-10 text-sm shadow-none focus-visible:ring-2 focus-visible:ring-blue-100" />
            </div>

            <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
              {artifactTabs.map((item) => (
                <button key={item} type="button" onClick={() => setTab(item)} className={cn('shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition', tab === item ? 'border-blue-200 bg-blue-50 text-[#3370ff]' : 'border-slate-200 bg-white text-slate-500 hover:border-blue-200 hover:bg-blue-50 hover:text-[#3370ff]')}>{item}</button>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <LibraryStat label="产物组" value={String(filteredGroups.length)} />
              <LibraryStat label="总版本" value={String(items.length)} />
              <LibraryStat label="当前分类" value={tab} />
              <LibraryStat label="视图" value={viewMode === 'grid' ? '网格' : '列表'} />
            </div>
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <div className={cn('p-4 xl:p-5', viewMode === 'grid' ? 'grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4' : 'space-y-2')}>
              {loading ? <div className="text-sm text-slate-500">加载中…</div> : filteredGroups.map((group) => (
                <ArtifactCard key={group.rootId} item={group.latest} versions={group.versions.length} selected={selected?.id === group.latest.id} compact={viewMode === 'list'} onSelect={() => setSelectedId(group.latest.id)} onPreview={() => void openPreview(group.latest.id)} onOpenConversation={() => { setActiveConversation(group.latest.conversationId); onOpenConversations() }} />
              ))}
              {!loading && filteredGroups.length === 0 && <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">暂无匹配产物</div>}
            </div>
          </ScrollArea>
        </section>
      )}
      <ArtifactDetailPanel item={selected} previewOpen={previewOpen} onPreview={(id) => void openPreview(id)} onOpenConversation={(id) => { setActiveConversation(id); onOpenConversations() }} />
      <ArtifactPreviewPanel />
    </div>
  )
}

function LibraryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 transition duration-200 hover:border-blue-100 hover:bg-blue-50/60">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 truncate text-lg font-semibold text-slate-900">{value}</div>
    </div>
  )
}

function ArtifactCard({ item, versions, selected, compact, onSelect, onPreview, onOpenConversation }: { item: ArtifactListItem; versions: number; selected: boolean; compact: boolean; onSelect: () => void; onPreview: () => void; onOpenConversation: () => void }) {
  if (compact) {
    return (
      <article
        onClick={onSelect}
        className={cn(
          'grid cursor-pointer grid-cols-[44px_minmax(0,1.5fr)_minmax(150px,0.9fr)_120px_176px] items-center gap-4 rounded-2xl border bg-white px-4 py-3 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md',
          selected ? 'border-blue-300 ring-2 ring-blue-50' : 'border-slate-200',
        )}
      >
        <div className="flex size-10 items-center justify-center rounded-2xl bg-blue-50 text-[#3370ff]"><FileText className="size-5" /></div>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-slate-950">{item.title}</h3>
          <div className="mt-1 truncate text-xs text-slate-500">v{item.version} · {item.type} · {versions} 个版本</div>
        </div>
        <div className="min-w-0 text-xs text-slate-500">
          <div className="truncate">{item.conversationTitle ?? '未命名会话'}</div>
          <div className="mt-1 truncate">{item.createdByAgentId ?? 'Agent'}</div>
        </div>
        <div className="truncate text-xs text-slate-500">{formatTime(item.createdAt)}</div>
        <div className="flex justify-end gap-2">
          <Button size="sm" className="h-8 rounded-lg bg-[#3370ff] px-3 text-xs hover:bg-[#2563eb]" onClick={(e) => { e.stopPropagation(); onPreview() }}>预览</Button>
          <Button size="sm" variant="outline" className="h-8 rounded-lg border-slate-200 px-3 text-xs hover:border-blue-200 hover:bg-blue-50 hover:text-[#3370ff]" onClick={(e) => { e.stopPropagation(); onOpenConversation() }}>打开会话</Button>
        </div>
      </article>
    )
  }

  return (
    <article
      onClick={onSelect}
      className={cn(
        'flex min-h-[260px] cursor-pointer flex-col rounded-2xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md',
        selected ? 'border-blue-300 ring-2 ring-blue-50' : 'border-slate-200',
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-[#3370ff]"><FileText className="size-5" /></div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-slate-950">{item.title}</h3>
          <div className="mt-1 truncate text-xs text-slate-500">v{item.version} · {item.type} · {versions} 个版本</div>
        </div>
        <MoreHorizontal className="size-4 shrink-0 text-slate-400" />
      </div>

      <div className="mt-4 space-y-2 text-xs text-slate-500">
        <div className="flex min-w-0 gap-2"><span className="shrink-0 text-slate-400">来源对话</span><span className="truncate">{item.conversationTitle ?? '未命名会话'}</span></div>
        <div className="flex min-w-0 gap-2"><span className="shrink-0 text-slate-400">创建者</span><span className="truncate">{item.createdByAgentId ?? 'Agent'}</span></div>
        <div className="flex min-w-0 gap-2"><span className="shrink-0 text-slate-400">更新时间</span><span className="truncate">{formatTime(item.createdAt)}</span></div>
      </div>

      <div className="mt-auto grid grid-cols-2 gap-2 border-t border-slate-100 pt-4">
        <Button size="sm" className="h-9 rounded-xl bg-[#3370ff] text-xs hover:bg-[#2563eb]" onClick={(e) => { e.stopPropagation(); onPreview() }}>预览</Button>
        <Button size="sm" variant="outline" className="h-9 rounded-xl border-slate-200 text-xs hover:border-blue-200 hover:bg-blue-50 hover:text-[#3370ff]" onClick={(e) => { e.stopPropagation(); onOpenConversation() }}>打开会话</Button>
      </div>
    </article>
  )
}

function ArtifactDetailPanel({ item, previewOpen, onPreview, onOpenConversation }: { item?: ArtifactListItem; previewOpen: boolean; onPreview: (id: string) => void; onOpenConversation: (conversationId: string) => void }) {
  return (
    <aside className={cn('hidden shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/70 xl:block', previewOpen ? 'w-[360px] 2xl:w-[380px]' : 'w-[360px]')}>
      {item ? (
        <div className="flex h-full flex-col">
          <div className="border-b border-slate-100 p-5">
            <div className="flex items-start gap-3">
              <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 text-[#3370ff] shadow-sm ring-1 ring-blue-100/70 transition duration-200 hover:scale-105">
                <FileText className="size-7" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-xl font-semibold tracking-tight text-slate-950">{item.title}</h2>
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-[#3370ff]">产物</span>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-500">{item.conversationTitle ?? '未命名会话'}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600 transition hover:bg-blue-50 hover:text-[#3370ff]">{item.type}</span>
              <span className="rounded-full bg-green-50 px-2.5 py-1 text-xs text-green-700">v{item.version}</span>
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs text-[#3370ff]">可预览</span>
            </div>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-4 p-5 text-sm">
              <DetailSection icon={<SlidersHorizontal className="size-4" />} title="元数据" aside={<SavedState />}>
                <div className="grid grid-cols-2 gap-3 text-xs text-slate-500">
                  <Meta label="创建者" value={item.createdByAgentId ?? 'Agent'} />
                  <Meta label="来源会话" value={item.conversationTitle ?? '未命名'} />
                  <Meta label="创建时间" value={formatTime(item.createdAt)} />
                  <Meta label="更新时间" value={formatTime(item.createdAt)} />
                </div>
              </DetailSection>

              <DetailSection icon={<Wrench className="size-4" />} title="快捷操作">
                <div className="grid gap-2">
                  <Button onClick={() => onPreview(item.id)} className="rounded-xl bg-[#3370ff] hover:bg-[#2563eb]">打开预览</Button>
                  <Button variant="outline" className="rounded-xl border-slate-200">复制引用</Button>
                  <Button variant="outline" className="rounded-xl border-slate-200">导出源码</Button>
                  <Button variant="outline" className="rounded-xl border-slate-200" onClick={() => onOpenConversation(item.conversationId)}>打开会话</Button>
                </div>
              </DetailSection>

              <DetailSection icon={<History className="size-4" />} title="版本历史">
                <HistoryRow icon={<FileCode2 className="size-4" />} title={`当前版本 v${item.version}`} description="已按 parentArtifactId 聚合版本；详情历史列表可继续扩展。" time="已接入" />
              </DetailSection>

              <DetailSection icon={<FileText className="size-4" />} title="产物标识">
                <div className="truncate rounded-2xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-500">{item.id}</div>
              </DetailSection>
            </div>
          </ScrollArea>
        </div>
      ) : (
        <div className="flex h-full items-center justify-center p-8 text-center text-sm text-slate-500">选择一个产物查看详情</div>
      )}
    </aside>
  )
}

function AutomationWorkspace() {
  return (
    <div className="h-full p-4 xl:p-6">
      <section className="flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/70">
        <div className="shrink-0 border-b border-slate-100 p-4 xl:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold tracking-tight text-slate-950">自动化</h1>
              <p className="mt-1 text-sm text-slate-500">管理自动化任务并查看近期运行记录</p>
            </div>
            <Button variant="outline" className="h-9 rounded-xl border-slate-200 px-3 text-xs text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-[#3370ff]">
              <Plus className="mr-1.5 size-3.5" />
              添加
            </Button>
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-5 p-4 xl:p-5">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <LibraryStat label="启用任务" value="4" />
              <LibraryStat label="今日运行" value="18" />
              <LibraryStat label="成功率" value="96.8%" />
              <LibraryStat label="待处理" value="1" />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {AUTOMATION_TASK_PRESETS.map((task) => (
                <AutomationTaskCard key={task.id} task={task} />
              ))}
            </div>

            <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-950">近期运行记录</h2>
                    <p className="mt-1 text-xs text-slate-500">按最近触发时间展示自动化任务状态</p>
                  </div>
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-[#3370ff]">实时</span>
                </div>
                <div className="mt-4 space-y-2">
                  {ANALYTICS_RECENT_RUNS.slice(0, 4).map((run) => (
                    <AutomationRunRow key={run.id} run={run} />
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-2">
                  <div className="flex size-8 items-center justify-center rounded-xl bg-white text-[#3370ff] shadow-sm">
                    <TrendingUp className="size-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-slate-950">运行概览</h2>
                    <p className="text-xs text-slate-500">今日高峰集中在上午</p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-7 items-end gap-2 rounded-2xl border border-slate-200 bg-white p-3">
                  {ANALYTICS_TREND.map((point) => (
                    <div key={point.label} className="flex min-h-[96px] flex-col items-center justify-end gap-2">
                      <div className="w-full rounded-full bg-blue-100">
                        <div className="mx-auto w-3 rounded-full bg-[#3370ff]" style={{ height: `${Math.max(18, point.value * 3)}px` }} />
                      </div>
                      <span className="text-[10px] text-slate-400">{point.label.slice(1)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>
        </ScrollArea>
      </section>
    </div>
  )
}

function AutomationTaskCard({ task }: { task: AutomationTaskPreset }) {
  const Icon = task.icon

  return (
    <article className="group cursor-pointer rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">
      <div className="flex items-start gap-3">
        <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-2xl transition duration-200 group-hover:scale-105', task.iconWrapClassName)}>
          <Icon className={cn('size-5', task.iconClassName)} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate text-base font-semibold text-slate-950">{task.title}</h3>
            <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium', task.status === '待配置' ? 'bg-slate-100 text-slate-500' : task.status === '运行中' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-[#3370ff]')}>
              {task.status}
            </span>
          </div>
          <p className="mt-1 truncate text-sm text-slate-500">{task.description}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-4">
        <Meta label="触发时间" value={task.cadence} />
        <Meta label="最近运行" value={task.latestRun} />
      </div>
    </article>
  )
}

function AnalyticsWorkspace() {
  const maxTrend = Math.max(...ANALYTICS_TREND.map((point) => point.value))

  return (
    <div className="h-full p-4 xl:p-6">
      <section className="flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/70">
        <div className="shrink-0 border-b border-slate-100 p-4 xl:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold tracking-tight text-slate-950">分析</h1>
              <p className="mt-1 text-sm text-slate-500">自动化任务运行分析，观察任务质量、成功率与近期趋势</p>
            </div>
            <Button variant="outline" className="h-9 rounded-xl border-slate-200 px-3 text-xs text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-[#3370ff]">
              <Clock3 className="mr-1.5 size-3.5" />
              近 7 天
            </Button>
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-5 p-4 xl:p-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {ANALYTICS_KPIS.map((kpi) => (
                <AnalyticsKpiCard key={kpi.label} kpi={kpi} />
              ))}
            </div>

            <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-950">运行趋势</h2>
                    <p className="mt-1 text-xs text-slate-500">近 7 天自动化任务触发次数</p>
                  </div>
                  <BarChart3 className="size-4 text-slate-400" />
                </div>
                <div className="mt-5 flex h-56 items-end gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:gap-5">
                  {ANALYTICS_TREND.map((point) => (
                    <div key={point.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
                      <div className="flex w-full flex-1 items-end justify-center">
                        <div className="w-full max-w-8 rounded-t-2xl bg-[#3370ff] transition hover:bg-[#2563eb]" style={{ height: `${Math.max(14, (point.value / maxTrend) * 100)}%` }} />
                      </div>
                      <div className="text-center">
                        <div className="text-[11px] font-medium text-slate-700">{point.value}</div>
                        <div className="text-[10px] text-slate-400">{point.label}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-950">任务类型分布</h2>
                    <p className="mt-1 text-xs text-slate-500">按本周运行次数统计</p>
                  </div>
                  <Layers className="size-4 text-slate-400" />
                </div>
                <div className="mt-5 space-y-4">
                  {ANALYTICS_DISTRIBUTION.map((item) => (
                    <div key={item.label}>
                      <div className="mb-1.5 flex items-center justify-between text-xs">
                        <span className="text-slate-600">{item.label}</span>
                        <span className="font-medium text-slate-900">{item.value}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100">
                        <div className={cn('h-full rounded-full', item.className)} style={{ width: `${item.value}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-950">最近运行记录</h2>
                  <p className="mt-1 text-xs text-slate-500">包含状态、耗时和任务类型，用于快速排查异常</p>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500">{ANALYTICS_RECENT_RUNS.length} 条记录</span>
              </div>
              <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                {ANALYTICS_RECENT_RUNS.map((run) => (
                  <AutomationRunRow key={run.id} run={run} table />
                ))}
              </div>
            </section>
          </div>
        </ScrollArea>
      </section>
    </div>
  )
}

function AnalyticsKpiCard({ kpi }: { kpi: AnalyticsKpi }) {
  const Icon = kpi.icon

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs text-slate-500">{kpi.label}</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{kpi.value}</div>
        </div>
        <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-2xl', kpi.toneClassName)}>
          <Icon className="size-5" />
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-500">{kpi.caption}</p>
    </article>
  )
}

function AutomationRunRow({ run, table = false }: { run: AnalyticsRunRecord; table?: boolean }) {
  const statusClassName = run.status === '成功'
    ? 'bg-emerald-50 text-emerald-600'
    : run.status === '运行中'
      ? 'bg-blue-50 text-[#3370ff]'
      : 'bg-rose-50 text-rose-600'

  return (
    <div className={cn('grid gap-3 border-slate-100 bg-white p-3 transition hover:bg-blue-50/40 sm:grid-cols-[minmax(0,1.3fr)_120px_88px_88px_80px] sm:items-center', table ? 'border-b last:border-b-0' : 'rounded-2xl border')}>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-slate-900">{run.title}</div>
        <div className="mt-0.5 text-xs text-slate-500 sm:hidden">{run.category} · {run.duration} · {run.time}</div>
      </div>
      <div className="hidden truncate text-xs text-slate-500 sm:block">{run.category}</div>
      <div className="hidden text-xs text-slate-500 sm:block">{run.duration}</div>
      <div className="hidden text-xs text-slate-500 sm:block">{run.time}</div>
      <span className={cn('w-fit rounded-full px-2 py-1 text-[10px] font-medium', statusClassName)}>{run.status}</span>
    </div>
  )
}

function DetailSection({
  icon,
  title,
  aside,
  children,
}: {
  icon: React.ReactNode
  title: string
  aside?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-blue-100 hover:shadow-md">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
            {icon}
          </div>
          <h3 className="truncate text-sm font-semibold text-slate-900">{title}</h3>
        </div>
        {aside && <div className="shrink-0 text-xs text-slate-400">{aside}</div>}
      </div>
      {children}
    </section>
  )
}

function SavedState() {
  return (
    <span className="inline-flex items-center gap-1 text-emerald-600">
      <CheckCircle2 className="size-3" />
      已保存
    </span>
  )
}

function PermissionRow({ name, code }: { name: string; code: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 transition duration-200 hover:border-blue-100 hover:bg-blue-50/60">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-white text-slate-500 shadow-sm">
        <Wrench className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium text-slate-800">{name}</div>
        <div className="mt-0.5 truncate font-mono text-[10px] text-slate-400">{code}</div>
      </div>
      <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
    </div>
  )
}

function HistoryRow({ icon, title, description, time }: { icon: React.ReactNode; title: string; description: string; time: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 transition duration-200 hover:border-blue-100 hover:bg-blue-50/60">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-white text-[#3370ff] shadow-sm">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium text-slate-800">{title}</div>
        <div className="mt-0.5 truncate text-[10px] text-slate-500">{description}</div>
      </div>
      <div className="shrink-0 text-[10px] text-slate-400">{time}</div>
    </div>
  )
}

function formatToolName(toolName: string) {
  const labels: Record<string, string> = {
    ask_user: '询问用户',
    bash: '运行命令',
    create_artifact: '创建产物',
    dispatch_to_agent: '调度 Agent',
    fs_list: '浏览文件',
    fs_read: '读取文件',
    fs_write: '写入文件',
    message: '消息回复',
    read_attachment: '读取附件',
  }
  return labels[toolName] ?? toolName.replaceAll('_', ' ')
}

function Meta({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="text-[10px] text-slate-400">{label}</div><div className="mt-1 truncate text-xs text-slate-700">{value}</div></div>
}

function formatTime(value: number) {
  return new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}
