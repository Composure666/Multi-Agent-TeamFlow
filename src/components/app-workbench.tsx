'use client'

import {
  BarChart3,
  Bot,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
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
  MoreHorizontal,
  Newspaper,
  Paperclip,
  PlayCircle,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  Trash2,
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
import { FileExplorerPanel } from '@/components/file-explorer-panel'
import { MessageHighlightLayer } from '@/components/message-highlight-layer'
import { PromptEnhanceModal } from '@/components/prompt-enhance-modal'
import { SelectionPopover } from '@/components/selection-popover'
import { SettingsDialog } from '@/components/settings-dialog'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import type { AgentRow } from '@/db/schema'
import {
  createConversation,
  createAgent,
  createAutomation,
  deleteAgent,
  deleteArtifact,
  deleteAutomation,
  disableAutomation,
  enableAutomation,
  fetchAgents,
  fetchArtifact,
  fetchArtifacts,
  fetchAutomationDashboard,
  fetchAutomationRuns,
  fetchConversations,
  fetchUsageSummary,
  optimizePrompt,
  runAutomationNow,
  sendMessage,
  setFsWriteApprovalMode,
  updateAutomation,
  uploadAttachment,
  type ArtifactListItem,
  type AutomationDashboard,
  type AutomationIconKey,
  type AutomationListItem,
  type AutomationRunDetailItem,
  type AutomationRunListItem,
  type AutomationScheduleType,
  type AutomationStatus,
  type SaveAutomationBody,
  type UsageSummary,
} from '@/lib/api'
import { groupArtifactVersions } from '@/lib/artifact-groups'
import type { AppNotification } from '@/shared/types'
import { cn } from '@/lib/utils'
import { useAgentList, useAppStore, useConversationList } from '@/stores/app-store'

type WorkbenchView = 'new-task' | 'conversations' | 'agents' | 'artifacts' | 'automation' | 'analytics'

const navItems: Array<{ id: WorkbenchView; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'new-task', label: '新建任务', icon: Plus },
  { id: 'conversations', label: '对话', icon: MessageSquare },
  { id: 'agents', label: 'Agent 库', icon: Bot },
  { id: 'artifacts', label: '产物库', icon: Layers },
  { id: 'automation', label: '自动化', icon: Workflow },
  { id: 'analytics', label: '分析', icon: BarChart3 },
]

const FEATURED_MY_AGENT_IDS_KEY = 'agenthub.featuredMyAgentIds'
const FEATURED_AGENT_PAGE_SIZE = 12
const ARTIFACT_GROUP_PAGE_SIZE = 12
const SCROLL_END_THRESHOLD_PX = 80

type ArtifactTabId = 'all' | 'document' | 'web_app' | 'ppt' | 'image' | 'project' | 'code'

type ArtifactFeedback = { type: 'success' | 'error'; message: string } | null

const artifactTabs: Array<{ id: ArtifactTabId; label: string; types: string[] }> = [
  { id: 'all', label: '全部', types: [] },
  { id: 'document', label: '文档', types: ['document'] },
  { id: 'web_app', label: 'Web 原型', types: ['web_app'] },
  { id: 'ppt', label: 'PPT', types: ['ppt'] },
  { id: 'image', label: '图片', types: ['image'] },
  { id: 'project', label: '项目', types: ['project'] },
  { id: 'code', label: '代码', types: ['code_file', 'diff'] },
]

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

type SceneCategoryId = 'daily' | 'code' | 'finance' | 'design' | 'docs'

type SceneCategory = {
  id: SceneCategoryId
  label: string
  description: string
}

type SummonableMember = {
  id: string
  name: string
  role: string
  avatar: string
  modelName: string
  isLead?: boolean
  presetId: string
}

type SummonableTeam = {
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

type AutomationTaskPreset = {
  id: string
  title: string
  description: string
  category: string
  cadence: string
  latestRun: string
  latestRunAt: number | null
  rawStatus: AutomationStatus
  status: '运行中' | '已启用' | '待配置' | '已暂停'
  statusClassName: string
  lastError: string | null
  prompt: string
  agentId: string | null
  conversationId: string | null
  scheduleType: AutomationScheduleType
  scheduleConfig: unknown
  nextRunAt: number | null
  icon: React.ComponentType<{ className?: string }>
  iconWrapClassName: string
  iconClassName: string
}

const WEEKDAY_LABELS: Record<number, string> = {
  0: '周日',
  1: '周一',
  2: '周二',
  3: '周三',
  4: '周四',
  5: '周五',
  6: '周六',
}

const AUTOMATION_ICON_STYLES: Record<AutomationIconKey, Pick<AutomationTaskPreset, 'icon' | 'iconWrapClassName' | 'iconClassName'>> = {
  newspaper: { icon: Newspaper, iconWrapClassName: 'bg-slate-100', iconClassName: 'text-slate-600' },
  languages: { icon: Languages, iconWrapClassName: 'bg-emerald-50', iconClassName: 'text-emerald-600' },
  calendar_clock: { icon: CalendarClock, iconWrapClassName: 'bg-violet-50', iconClassName: 'text-violet-600' },
  video: { icon: Video, iconWrapClassName: 'bg-orange-50', iconClassName: 'text-orange-600' },
  history: { icon: History, iconWrapClassName: 'bg-cyan-50', iconClassName: 'text-cyan-600' },
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

const ANALYTICS_KPIS: AnalyticsKpi[] = [
  { label: '任务总数', value: '5', caption: '已配置自动化任务', icon: Workflow, toneClassName: 'bg-slate-100 text-slate-600' },
  { label: '今日运行次数', value: '18', caption: '较昨日 +4 次', icon: PlayCircle, toneClassName: 'bg-slate-100 text-slate-600' },
  { label: '成功率', value: '96.8%', caption: '近 7 天稳定运行', icon: CheckCircle2, toneClassName: 'bg-slate-100 text-slate-600' },
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
  { label: '内容推送', value: 42, className: 'bg-[var(--agenthub-accent,#2F5FD0)]' },
  { label: '学习提醒', value: 24, className: 'bg-slate-500' },
  { label: '项目报告', value: 20, className: 'bg-slate-400' },
  { label: '兴趣推荐', value: 14, className: 'bg-slate-300' },
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

const featuredCategories = ['全部', ...Array.from(new Set(RESOURCE_AGENT_PRESETS.map((preset) => preset.category)))]

const SUMMON_SCENE_CATEGORIES: SceneCategory[] = [
  { id: 'daily', label: '日常协作', description: '会议、汇报、资料整理与个人效率' },
  { id: 'code', label: '代码开发', description: '理解代码、规划实现、调试审查与上线' },
  { id: 'finance', label: '金融投资', description: '市场检索、财报分析、风险与组合建议' },
  { id: 'design', label: '设计产物', description: '需求、设计、原型与多模态创意' },
  { id: 'docs', label: '内容文档', description: '报告、PPT、纪要与产品文案' },
]

const SUMMON_TEAMS: SummonableTeam[] = [
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

async function resolveOrCreatePresetAgent(
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

async function resolveOrCreateTeamAgents(
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

function findOrchestratorAgent(agents: AgentRow[]) {
  return agents.find((agent) => agent.isOrchestrator) ?? null
}

function includeOrchestrator(teamAgents: AgentRow[], agents: AgentRow[]) {
  const orchestrator = findOrchestratorAgent(agents)
  const orderedAgents = orchestrator ? [orchestrator, ...teamAgents] : teamAgents
  const seen = new Set<string>()

  return orderedAgents.filter((agent) => {
    if (seen.has(agent.id)) return false
    seen.add(agent.id)
    return true
  })
}

function artifactExportUrl(artifactId: string) {
  return `/api/artifacts/${encodeURIComponent(artifactId)}/export`
}

function buildArtifactReference(item: ArtifactListItem) {
  return `请参考产物「${item.title}」v${item.version}（artifactId: ${item.id}）。`
}

export function AppWorkbench() {
  const [view, setView] = useState<WorkbenchView>('new-task')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [selectedTeam, setSelectedTeam] = useState<SummonableTeam | null>(null)
  const [teamDialogOpen, setTeamDialogOpen] = useState(false)
  const [summoningTeamId, setSummoningTeamId] = useState<string | null>(null)
  const agents = useAgentList()
  const setConversations = useAppStore((s) => s.setConversations)
  const setAgents = useAppStore((s) => s.setAgents)
  const upsertConversation = useAppStore((s) => s.upsertConversation)
  const upsertAgent = useAppStore((s) => s.upsertAgent)
  const setActiveConversation = useAppStore((s) => s.setActiveConversation)
  const mobileSidebarOpen = useAppStore((s) => s.mobileSidebarOpen)
  const setMobileSidebarOpen = useAppStore((s) => s.setMobileSidebarOpen)

  useEffect(() => {
    fetchConversations().then(setConversations).catch(console.error)
    fetchAgents().then(setAgents).catch(console.error)
  }, [setAgents, setConversations])

  const openTeamDetail = (team: SummonableTeam) => {
    setSelectedTeam(team)
    setTeamDialogOpen(true)
  }

  const handleSummonTeam = async (team: SummonableTeam) => {
    if (summoningTeamId) return
    setSummoningTeamId(team.id)
    try {
      const teamAgents = includeOrchestrator(await resolveOrCreateTeamAgents(team, agents, upsertAgent), agents)
      const uniqueAgentIds = teamAgents.map((agent) => agent.id)
      if (uniqueAgentIds.length === 0) return

      const conv = await createConversation({
        title: team.name,
        mode: uniqueAgentIds.length > 1 ? 'group' : 'single',
        agentIds: uniqueAgentIds,
      })
      upsertConversation(conv)
      setActiveConversation(conv.id)
      setTeamDialogOpen(false)
      setSelectedTeam(null)
      setView('conversations')
    } catch (err) {
      console.error('[AppWorkbench] summon team failed', err)
    } finally {
      setSummoningTeamId(null)
    }
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
    <div className="flex min-h-[calc(100vh-var(--agenthub-titlebar-height,0px))] bg-[var(--agenthub-surface-muted)] text-slate-950 dark:text-slate-50">
      <WorkbenchNav view={view} onViewChange={setView} onOpenSettings={() => setSettingsOpen(true)} />
      <main className="min-w-0 flex-1 overflow-visible">
        {view !== 'conversations' && <MobileWorkbenchTopBar currentLabel={currentViewLabel} onOpen={openMobileSidebar} />}
        <div className="overflow-visible">
          {view === 'new-task' && <NewTaskView onOpenConversations={() => setView('conversations')} />}
          {view === 'conversations' && <ConversationWorkspace />}
          {view === 'agents' && <AgentWorkspace onOpenConversations={() => setView('conversations')} onOpenTeamDetail={openTeamDetail} />}
          {view === 'artifacts' && <ArtifactWorkspace onOpenConversations={() => setView('conversations')} />}
          {view === 'automation' && <AutomationWorkspace />}
          {view === 'analytics' && <AnalyticsWorkspace />}
        </div>
      </main>
      <MobileWorkbenchDrawer open={mobileSidebarOpen} view={view} onClose={closeMobileSidebar} onViewChange={changeViewFromMobile} onOpenSettings={openSettingsFromMobile} />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <TeamSummonDialog
        team={selectedTeam}
        open={teamDialogOpen}
        onOpenChange={(open) => {
          setTeamDialogOpen(open)
          if (!open) setSelectedTeam(null)
        }}
        onSummon={handleSummonTeam}
        summoning={Boolean(summoningTeamId)}
      />
      <SelectionPopover />
      <MessageHighlightLayer />
    </div>
  )
}

function TeamSummonDialog({
  team,
  open,
  onOpenChange,
  onSummon,
  summoning,
}: {
  team: SummonableTeam | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSummon: (team: SummonableTeam) => Promise<void>
  summoning: boolean
}) {
  if (!team) return null

  const category = SUMMON_SCENE_CATEGORIES.find((item) => item.id === team.category)
  const leadMember = team.members.find((member) => member.isLead) ?? team.members[0]
  const hiddenMemberCount = Math.max(team.members.length - 3, 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(760px,calc(100vh-2rem))] max-w-3xl grid-rows-none flex-col overflow-hidden border border-slate-200 bg-white p-0 dark:border-white/10 dark:bg-[#1C1F26] sm:max-w-3xl">
        <div className={cn('relative overflow-hidden bg-gradient-to-br px-5 pb-5 pt-6 text-white', team.coverClassName)}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_34%),linear-gradient(180deg,rgba(15,23,42,0.12),rgba(15,23,42,0.72))]" />
          <DialogHeader className="relative z-10 gap-3 pr-10">
            <div className="flex items-start gap-4">
              <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-white/12 text-3xl shadow-sm backdrop-blur">
                {leadMember?.avatar ?? '🤖'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/85 backdrop-blur">{category?.label ?? '场景'}</span>
                  <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/85 backdrop-blur">{team.type === 'team' ? '多 Agent 团队' : '单 Agent'}</span>
                  <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/85 backdrop-blur">{team.heat}</span>
                </div>
                <DialogTitle className="truncate text-2xl font-semibold tracking-tight text-white">{team.name}</DialogTitle>
                <DialogDescription className="mt-2 max-w-2xl text-sm leading-6 text-white/78">{team.description}</DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-4 p-5 pb-8">
            <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-[#121418]/70">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-950 dark:text-slate-100">工作流说明</h3>
                <Button variant="outline" size="sm" className="h-7 rounded-md text-xs">
                  <Settings className="mr-1.5 size-3.5" />
                  设置
                </Button>
              </div>
              <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{team.workflow}</p>
            </section>

            <section>
              <h3 className="mb-2 text-sm font-semibold text-slate-950 dark:text-slate-100">擅长领域</h3>
              <div className="flex flex-wrap gap-2">
                {team.tags.map((tag) => (
                  <span key={tag} className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                    {tag}
                  </span>
                ))}
              </div>
            </section>

            {team.type === 'team' ? (
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-950 dark:text-slate-100">团队成员</h3>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{team.members.length} 位 Agent</span>
                </div>
                <div className="max-h-[250px] overflow-y-auto pr-1">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {team.members.map((member) => (
                      <div key={member.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-[#252932]">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-lg dark:border-white/10 dark:bg-[#121418]">{member.avatar}</div>
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-center gap-2">
                            <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{member.name}</div>
                            {member.isLead && <span className="shrink-0 rounded-full bg-[var(--agenthub-accent-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--agenthub-accent)]">主理人</span>}
                          </div>
                          <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                            <span className="truncate">{member.role}</span>
                            <span className="shrink-0">·</span>
                            <span className="truncate font-mono">{member.modelName}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            ) : (
              <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#252932]">
                <h3 className="text-sm font-semibold text-slate-950 dark:text-slate-100">能力介绍</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{team.systemPromptTemplate}</p>
                <div className="mt-3 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="flex size-7 items-center justify-center rounded-md bg-slate-100 text-base dark:bg-[#121418]">{leadMember.avatar}</span>
                  <span>{leadMember.name}</span>
                  <span>·</span>
                  <span className="font-mono">{leadMember.modelName}</span>
                </div>
              </section>
            )}

            <section className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-[#121418]/70">
              <h3 className="text-sm font-semibold text-slate-950 dark:text-slate-100">召唤上下文</h3>
              <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{team.systemPromptTemplate}</p>
            </section>
          </div>
        </ScrollArea>

        <DialogFooter className="sticky bottom-0 z-10 m-0 shrink-0 flex-row items-center justify-between rounded-none border-t border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#1C1F26]">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex -space-x-2">
              {team.members.slice(0, 3).map((member) => (
                <span key={member.id} className="flex size-7 items-center justify-center rounded-full border border-white bg-slate-100 text-sm dark:border-[#1C1F26] dark:bg-[#252932]">{member.avatar}</span>
              ))}
              {hiddenMemberCount > 0 && <span className="flex size-7 items-center justify-center rounded-full border border-white bg-slate-200 text-[10px] text-slate-600 dark:border-[#1C1F26] dark:bg-[#252932] dark:text-slate-300">+{hiddenMemberCount}</span>}
            </div>
            <span className="truncate text-xs text-slate-500 dark:text-slate-400">{team.type === 'team' ? `${team.members.length} 位成员协作` : '单 Agent 对话'}</span>
          </div>
          <Button onClick={() => void onSummon(team)} disabled={summoning} className="shrink-0 rounded-md bg-[var(--agenthub-accent)] px-4 text-white hover:bg-[var(--agenthub-accent-hover)]">
            {summoning ? '召唤中' : `召唤 ${team.name}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function HorizontalScrollControls({
  children,
  className,
  contentClassName,
  scrollAmount = 280,
}: {
  children: React.ReactNode
  className?: string
  contentClassName?: string
  scrollAmount?: number
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const scrollByAmount = (left: number) => {
    scrollRef.current?.scrollBy({ left, behavior: 'smooth' })
  }

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    const element = scrollRef.current
    if (!element || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return

    const maxScrollLeft = element.scrollWidth - element.clientWidth
    if (maxScrollLeft <= 0) return

    const atStart = element.scrollLeft <= 0
    const atEnd = element.scrollLeft >= maxScrollLeft - 1
    const shouldScrollLeft = event.deltaY < 0
    const shouldScrollRight = event.deltaY > 0
    const canScroll = (shouldScrollLeft && !atStart) || (shouldScrollRight && !atEnd)

    if (!canScroll) return

    event.preventDefault()
    element.scrollBy({ left: event.deltaY, behavior: 'smooth' })
  }

  const buttonClassName = 'absolute top-1/2 z-10 hidden size-8 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-slate-500 shadow-sm backdrop-blur transition hover:border-slate-300 hover:bg-white hover:text-slate-900 group-hover:flex dark:border-white/10 dark:bg-neutral-900/90 dark:text-slate-400 dark:hover:bg-neutral-900 dark:hover:text-slate-100'

  return (
    <div className={cn('group relative', className)}>
      <button
        type="button"
        aria-label="向左滚动"
        onClick={() => scrollByAmount(-scrollAmount)}
        className={cn(buttonClassName, 'left-0')}
      >
        <ChevronLeft className="size-4" />
      </button>
      <div
        ref={scrollRef}
        onWheel={handleWheel}
        className={cn('agenthub-hide-scrollbar flex overflow-x-auto overscroll-x-contain scroll-smooth px-10 touch-pan-x', contentClassName)}
      >
        {children}
      </div>
      <button
        type="button"
        aria-label="向右滚动"
        onClick={() => scrollByAmount(scrollAmount)}
        className={cn(buttonClassName, 'right-0')}
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  )
}

function MobileWorkbenchTopBar({ currentLabel, onOpen }: { currentLabel: string; onOpen: () => void }) {
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5 dark:border-white/10 dark:bg-neutral-900 md:hidden">
      <button
        type="button"
        onClick={onOpen}
        className="flex size-10 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 active:bg-slate-200 dark:text-slate-300 dark:hover:bg-neutral-800 dark:active:bg-neutral-700"
        title="打开菜单"
      >
        <Menu className="size-5 stroke-[2.2]" />
      </button>
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-slate-900 text-white dark:border-white/10 dark:bg-neutral-800">
        <Sparkles className="size-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">AgentHub</div>
        <div className="truncate text-xs text-slate-500 dark:text-slate-400">{currentLabel}</div>
      </div>
      <ThemeToggle className="size-8 rounded-lg text-slate-500 dark:text-slate-400" />
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
          'fixed inset-y-0 left-0 z-50 flex w-[min(86vw,320px)] flex-col border-r border-slate-200 bg-white shadow-lg transition-transform duration-200 dark:border-white/10 dark:bg-neutral-900 md:hidden',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4 dark:border-white/10">
          <button type="button" onClick={() => onViewChange('new-task')} className="flex min-w-0 items-center gap-3 text-left">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-slate-900 text-white dark:border-white/10 dark:bg-neutral-800">
              <Sparkles className="size-4" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-950 dark:text-slate-50">AgentHub</div>
              <div className="truncate text-xs text-slate-500 dark:text-slate-400">个人多 Agent 工作区</div>
            </div>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex size-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 active:bg-slate-200 dark:text-slate-400 dark:hover:bg-neutral-800 dark:hover:text-slate-100 dark:active:bg-neutral-700"
            title="关闭菜单"
          >
            <X className="size-4 stroke-[2.2]" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
          <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-neutral-950/40">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-900 dark:text-slate-100">
              <CheckCircle2 className="size-3.5 text-emerald-500 dark:text-emerald-300" />
              个人工作区
            </div>
            <p className="mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">管理本地会话、Agent、产物与自动化任务。</p>
          </div>

          <button
            type="button"
            onClick={() => onViewChange('new-task')}
            className={cn(
              'mb-3 flex min-h-10 w-full items-center gap-3 rounded-lg border border-slate-300 bg-white px-3 text-left text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 active:scale-[0.99] dark:border-white/10 dark:bg-neutral-900 dark:text-slate-300 dark:hover:border-white/15 dark:hover:bg-neutral-800',
              view === 'new-task' && 'border-[var(--agenthub-accent,#2F5FD0)] text-[var(--agenthub-accent,#2F5FD0)]',
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
                    'relative flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm transition active:scale-[0.99]',
                    active
                      ? 'bg-slate-100 font-semibold text-[var(--agenthub-accent,#2F5FD0)] before:absolute before:left-0 before:top-2 before:h-6 before:w-[3px] before:rounded-r-full before:bg-[var(--agenthub-accent,#2F5FD0)] dark:bg-neutral-800'
                      : 'text-slate-600 hover:bg-slate-100 active:bg-slate-200 dark:text-slate-400 dark:hover:bg-neutral-800 dark:active:bg-neutral-700',
                  )}
                >
                  <Icon className="size-5 stroke-[2.1]" />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                </button>
              )
            })}
          </nav>
        </div>

        <div className="space-y-2 border-t border-slate-100 p-3 dark:border-white/10">
          {accountOpen && (
            <UserAccountOverview usage={usage} onReload={usage.reload} onOpenSettings={onOpenSettings} />
          )}

          <button
            type="button"
            onClick={() => setAccountOpen((expanded) => !expanded)}
            aria-expanded={accountOpen}
            className="flex min-h-12 w-full items-center gap-3 rounded-lg border border-slate-200 bg-white p-2.5 text-left transition hover:border-slate-300 hover:bg-slate-50 active:bg-slate-100 dark:border-white/10 dark:bg-neutral-900 dark:hover:border-white/15 dark:hover:bg-neutral-800 dark:active:bg-neutral-700"
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">A</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-xs font-medium text-slate-900">Agenter</span>
                <span className="rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">个人</span>
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
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-[var(--agenthub-shadow-card)] dark:border-white/10 dark:bg-neutral-900">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-slate-900 dark:text-slate-50">个人账户</div>
          <div className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">本地单用户 · 用量概览</div>
        </div>
        <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">已连接</span>
      </div>

      {usage.loading && !usage.data ? (
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-5 text-center text-xs text-slate-500 dark:border-white/10 dark:bg-neutral-950/40 dark:text-slate-400">加载用量数据...</div>
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
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-1.5 py-1 text-left text-xs transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-neutral-800 dark:hover:text-slate-100"
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
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs text-slate-500 dark:border-white/10 dark:bg-neutral-950/40 dark:text-slate-400">还没有用量数据，和 Agent 对话后会显示在这里。</div>
          )}
        </div>
      ) : null}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onReload}
          disabled={usage.loading}
          className="flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50 dark:border-white/10 dark:bg-neutral-900 dark:text-slate-300 dark:hover:border-white/15 dark:hover:bg-neutral-800 dark:hover:text-slate-100"
        >
          <BarChart3 className="size-3.5" />
          {usage.loading ? '刷新中' : '刷新'}
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900 dark:border-white/10 dark:bg-neutral-900 dark:text-slate-300 dark:hover:border-white/15 dark:hover:bg-neutral-800 dark:hover:text-slate-100"
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
    <div className="space-y-1 rounded-lg bg-slate-50 px-2.5 py-2 dark:bg-neutral-950/40">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="min-w-0 flex-1 truncate font-mono text-slate-600 dark:text-slate-300">{label}</span>
        <span className="shrink-0 font-mono text-[11px] text-slate-400 dark:text-slate-500">{formatTok(value)} · {runs}</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-slate-200 dark:bg-neutral-800">
        <div className="h-full rounded-full bg-[var(--agenthub-accent,#2F5FD0)] transition-all" style={{ width: `${pct}%` }} />
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
  const [accountOpen, setAccountOpen] = useState(false)
  const hasAutomationResultNotice = useAppStore((s) => s.notifications.some((notification) => notification.source === 'automation' && notification.conversationId))
  const usage = useUsageSummary(accountOpen && !collapsed)

  return (
    <aside className={cn('sticky top-[var(--agenthub-titlebar-height,0px)] hidden h-[calc(100vh-var(--agenthub-titlebar-height,0px))] shrink-0 flex-col border-r border-slate-200 bg-white px-3 py-3 transition-[width] duration-200 dark:border-white/10 dark:bg-neutral-900 md:flex', collapsed ? 'w-[88px]' : view === 'conversations' ? 'w-[288px]' : 'w-[236px]')}>
      <div className={cn('mb-3 flex items-center gap-2 px-2', collapsed && 'flex-col px-0')}>
        <button
          type="button"
          onClick={() => onViewChange('new-task')}
          className={cn('flex min-w-0 items-center gap-2 text-left', collapsed ? 'w-full flex-col justify-center' : 'flex-1')}
          title={collapsed ? 'AgentHub' : undefined}
        >
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-slate-900 text-white dark:border-white/10 dark:bg-neutral-800">
            <Sparkles className="size-4" />
          </div>
          {collapsed && <span className="truncate text-[11px] font-semibold tracking-tight text-slate-900 dark:text-slate-50">AgentHub</span>}
          {!collapsed && (
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold tracking-tight dark:text-slate-50">AgentHub</div>
              <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">Multi-Agent Workspace</div>
            </div>
          )}
        </button>
        {!collapsed && (
          <div className="flex shrink-0 items-center gap-1">
            <ThemeToggle className="size-8 rounded-lg text-slate-400 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-100" />
            <button
              type="button"
              onClick={onOpenSettings}
              className="flex size-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-neutral-800 dark:hover:text-slate-100"
              title="设置"
            >
              <Settings className="size-4 stroke-[2.2]" />
            </button>
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              className="flex size-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-neutral-800 dark:hover:text-slate-100"
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
          'mb-2 flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 hover:text-[var(--agenthub-accent,#2F5FD0)] dark:border-white/10 dark:bg-neutral-900 dark:text-slate-300 dark:hover:border-white/15 dark:hover:bg-neutral-800 dark:hover:text-slate-50',
          collapsed && 'px-0',
        )}
      >
        <Plus className="size-4" />
        {!collapsed && <span className="min-w-0 flex-1 text-left">新建任务</span>}
        {!collapsed && <span className="ml-auto text-[10px] font-normal text-slate-400">Ctrl + N</span>}
      </button>

      <nav className="space-y-1">
        {navItems.filter((item) => item.id !== 'new-task').map((item) => {
          const Icon = item.icon
          const active = view === item.id || (item.id === 'conversations' && view === 'new-task')
          const showAutomationResultNotice = item.id === 'conversations' && hasAutomationResultNotice && !active
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onViewChange(item.id)}
              title={collapsed ? item.label : undefined}
              className={cn(
                'relative flex h-9 w-full items-center gap-2 rounded-md px-3 text-sm transition',
                collapsed && 'justify-center px-0',
                active
                  ? 'bg-slate-100 font-semibold text-[var(--agenthub-accent,#2F5FD0)] before:absolute before:left-0 before:top-2 before:h-5 before:w-[3px] before:rounded-r-full before:bg-[var(--agenthub-accent,#2F5FD0)] dark:bg-neutral-800'
                  : 'font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-neutral-800 dark:hover:text-slate-100',
                showAutomationResultNotice && 'animate-pulse ring-1 ring-[var(--agenthub-accent-border)]',
              )}
            >
              <Icon className={cn('size-4 shrink-0 stroke-[2.2]', active && 'stroke-[2.5]')} />
              {!collapsed && item.label}
              {showAutomationResultNotice && (
                <span className={cn('ml-auto size-2 rounded-full bg-[var(--agenthub-accent)]', collapsed && 'absolute right-2 top-2')} title="有自动化任务结果生成" />
              )}
            </button>
          )
        })}
      </nav>

      {!collapsed && view === 'conversations' && (
        <div className="mt-2 min-h-0 flex-1 overflow-hidden border-t border-slate-100 pt-3 dark:border-white/10">
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
          className={cn('w-full rounded-lg border border-slate-200 bg-white p-2.5 text-left transition hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-neutral-900 dark:hover:border-white/15 dark:hover:bg-neutral-800', collapsed && 'px-2')}
          title={collapsed ? '展开账户概览' : accountOpen ? '收起账户概览' : '展开账户概览'}
        >
          <div className={cn('flex items-center gap-2', collapsed && 'justify-center')}>
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">A</div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <div className="truncate text-xs font-medium">Agenter</div>
                  <span className="rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:border-white/10 dark:bg-neutral-800 dark:text-slate-300">个人</span>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
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
  onOpenConversations,
}: {
  onOpenConversations: () => void
}) {
  const agents = useAgentList()
  const defaultAgent = findOrchestratorAgent(agents) ?? agents[0]
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([])
  const [selectedTeam, setSelectedTeam] = useState<{ id: string; name: string } | null>(null)
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const [approvalMode, setApprovalMode] = useState<'auto' | 'review'>('review')
  const [uploading, setUploading] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [enhanceOpen, setEnhanceOpen] = useState(false)
  const [enhancingPrompt, setEnhancingPrompt] = useState(false)
  const [enhancedText, setEnhancedText] = useState('')
  const [enhanceError, setEnhanceError] = useState<string | null>(null)
  const [enhanceOriginalText, setEnhanceOriginalText] = useState('')
  const [activeCategory, setActiveCategory] = useState<SceneCategoryId>(SUMMON_SCENE_CATEGORIES[0].id)
  const [activeSubcategoryId, setActiveSubcategoryId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const upsertConversation = useAppStore((s) => s.upsertConversation)
  const setActiveConversation = useAppStore((s) => s.setActiveConversation)
  const addLocalUserMessage = useAppStore((s) => s.addLocalUserMessage)
  const replaceLocalMessageId = useAppStore((s) => s.replaceLocalMessageId)
  const upsertMessage = useAppStore((s) => s.upsertMessage)
  const upsertAgent = useAppStore((s) => s.upsertAgent)
  const [selectingTeamId, setSelectingTeamId] = useState<string | null>(null)
  const [sceneAgentError, setSceneAgentError] = useState<string | null>(null)

  const activeAgentIds = selectedAgentIds.length > 0 ? selectedAgentIds : defaultAgent ? [defaultAgent.id] : []
  const activeAgents = activeAgentIds.map((id) => agents.find((agent) => agent.id === id)).filter((agent): agent is AgentRow => Boolean(agent))
  const activeCategoryMeta = SUMMON_SCENE_CATEGORIES.find((category) => category.id === activeCategory) ?? SUMMON_SCENE_CATEGORIES[0]
  const quickTeams = SUMMON_TEAMS.filter((team) => team.category === activeCategory)

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

  const buildNewTaskEnhanceInput = (text: string) => {
    const lines = [
      '请结合新建任务上下文增强用户提示词。',
      '',
      '## 当前上下文',
      `- 场景分类：${activeCategoryMeta.label}`,
      selectedTeam ? `- 已选择小队：${selectedTeam.name}（${activeAgents.length} 位协作）` : `- 当前 Agent：${activeAgents.map((agent) => getAgentDisplayName(agent)).join('、') || '未选择'}`,
      `- 写入审批模式：${approvalMode === 'review' ? 'Review（写入需审批）' : 'Auto（写入直接生效）'}`,
      pendingFiles.length > 0 ? `- 待上传附件：${pendingFiles.map((file) => file.name).join('、')}` : '',
      '',
      '## 用户原始输入',
      text,
    ].filter((line) => line.length > 0)
    return lines.join('\n').slice(0, 4000)
  }

  const enhancePrompt = async () => {
    const text = content.trim()
    if (enhancingPrompt) return
    if (!text) {
      setEnhanceError('请输入需要增强的提示词。')
      setEnhanceOriginalText('')
      setEnhancedText('')
      setEnhanceOpen(true)
      return
    }

    setEnhancingPrompt(true)
    setEnhanceError(null)
    setEnhanceOriginalText(text)
    setEnhancedText('')
    setEnhanceOpen(true)
    try {
      const result = await optimizePrompt(buildNewTaskEnhanceInput(text))
      setEnhancedText(result.enhancedText)
    } catch (err) {
      console.error('[NewTaskView] optimize prompt failed', err)
      setEnhanceError('提示词增强失败，请稍后重试。')
    } finally {
      setEnhancingPrompt(false)
    }
  }

  const applySubcategoryPrompt = async (team: SummonableTeam) => {
    const category = SUMMON_SCENE_CATEGORIES.find((item) => item.id === team.category)
    const memberNames = team.members.map((member) => member.name).join('、')
    const lines = [
      `我想使用「${team.name}」完成一个任务。`,
      category ? `场景：${category.label}` : '',
      `目标：${team.description}`,
      `建议工作流：${team.workflow}`,
      memberNames ? `建议参与 Agent：${memberNames}` : '',
      '请基于以上场景，先帮我澄清目标、拆解步骤，并给出可执行方案。',
    ].filter((line) => line.length > 0)

    setActiveSubcategoryId(team.id)
    setContent(lines.join('\n'))
    setSceneAgentError(null)
    setSelectingTeamId(team.id)

    try {
      const teamAgents = includeOrchestrator(await resolveOrCreateTeamAgents(team, agents, upsertAgent), agents)
      if (teamAgents.length > 0) {
        setSelectedAgentIds(teamAgents.map((agent) => agent.id))
        setSelectedTeam({ id: team.id, name: team.name })
      }
    } catch (err) {
      console.error('[NewTaskView] resolve scene agents failed', err)
      setSceneAgentError('未能自动匹配场景 Agent，可手动选择后继续。')
    } finally {
      setSelectingTeamId(null)
    }
  }

  const submit = async () => {
    const text = content.trim()
    if (!text || activeAgentIds.length === 0 || sending) return
    setSending(true)
    try {
      const submittedAgentIds = activeAgentIds.length > 1 ? includeOrchestrator(activeAgents, agents).map((agent) => agent.id) : activeAgentIds
      const initialMentionedAgentIds = submittedAgentIds.length > 1 ? [] : submittedAgentIds
      const conv = await createConversation({
        title: text.length > 24 ? `${text.slice(0, 24)}…` : text,
        mode: submittedAgentIds.length > 1 ? 'group' : 'single',
        agentIds: submittedAgentIds,
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
        mentionedAgentIds: initialMentionedAgentIds,
        attachments: uploadedAttachments,
      })
      setContent('')
      setPendingFiles([])
      const result = await sendMessage(conv.id, {
        content: text,
        mentionedAgentIds: initialMentionedAgentIds,
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
    <div className="flex min-w-0 flex-col bg-[var(--agenthub-surface-muted)]">
      {/* 主内容区 - 内容整体下移，垂直居中显示 */}
      <div className="flex min-h-[calc(100vh-var(--agenthub-titlebar-height,0px)-64px)] items-center justify-center">
        <div className="mx-auto w-full max-w-5xl px-6 pb-12">
          {/* Hero Section - 标题 + 右侧机器人吉祥物 */}
          <div className="mb-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div>
              <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-slate-950">
                AgentHub - 你的多 Agent 协作工作台
              </h1>

              {/* 一级场景切换 Tabs */}
              <div className="mt-4 flex flex-wrap items-center gap-1.5">
                {SUMMON_SCENE_CATEGORIES.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => {
                      setActiveCategory(category.id)
                      setActiveSubcategoryId(null)
                      setSelectedTeam(null)
                    }}
                    className={cn(
                      'rounded-full px-4 py-2 text-sm font-semibold transition active:scale-[0.98]',
                      activeCategory === category.id
                        ? 'bg-slate-950 text-white shadow-sm dark:bg-slate-100 dark:text-slate-950'
                        : 'bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50 hover:text-slate-900 dark:bg-white/5 dark:text-slate-400 dark:ring-white/10 dark:hover:bg-white/10 dark:hover:text-slate-100',
                    )}
                  >
                    {category.label}
                  </button>
                ))}
              </div>

              {/* 二级子类胶囊 */}
              <div className="mt-3 space-y-2">
                <div className="text-xs text-slate-500 dark:text-slate-400">{activeCategoryMeta.description}</div>
                <div className="flex flex-wrap gap-2">
                  {quickTeams.map((team) => {
                    const active = activeSubcategoryId === team.id
                    return (
                      <button
                        key={team.id}
                        type="button"
                        onClick={() => void applySubcategoryPrompt(team)}
                        disabled={selectingTeamId === team.id}
                        className={cn(
                          'rounded-full border px-3.5 py-2 text-sm font-medium transition active:scale-[0.98] disabled:cursor-wait disabled:opacity-70',
                          active
                            ? 'border-[var(--agenthub-accent-border)] bg-[var(--agenthub-accent-soft)] text-[var(--agenthub-accent)]'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-slate-100',
                        )}
                        title={team.description}
                      >
                        {selectingTeamId === team.id ? '匹配中…' : team.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* 3D 机器人吉祥物（占位符） */}
            <div className="hidden shrink-0 lg:flex lg:items-center lg:justify-center">
              <div className="relative flex size-44 items-center justify-center">
                <div className="absolute inset-0 rounded-full bg-slate-200 blur-xl opacity-50" />
                <div className="relative flex size-36 items-center justify-center rounded-[28%] border border-slate-200 bg-white shadow-sm">
                  <div className="text-5xl">🤖</div>
                </div>
                <div className="absolute -right-2 -top-1 flex size-7 items-center justify-center rounded-full border border-amber-200 bg-amber-50 text-base text-amber-700">
                  ✨
                </div>
                <div className="absolute -left-3 bottom-4 flex size-6 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-xs text-slate-600">
                  💬
                </div>
              </div>
            </div>
          </div>

          {/* 核心交互输入框 - 悬浮白色大卡片（输入 + 工具栏合并在一个阴影卡片中） */}
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[var(--agenthub-shadow-card)]">
            {/* 上半部：输入区 */}
            <PromptEnhanceModal
              visible={enhanceOpen}
              originalText={enhanceOriginalText || content}
              enhancedText={enhancedText}
              loading={enhancingPrompt}
              error={enhanceError}
              onOpenChange={(open) => {
                if (!enhancingPrompt) setEnhanceOpen(open)
              }}
              onKeepOriginal={() => setEnhanceOpen(false)}
              onUseEnhanced={() => {
                setContent(enhancedText)
                setEnhanceOpen(false)
              }}
            />
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
              className="min-h-[108px] resize-none border-0 bg-transparent px-5 pb-2 pt-4 text-[15px] shadow-none placeholder:text-slate-400 focus-visible:ring-0"
            />

            {/* 附件列表 */}
            {enhanceError && !enhanceOpen && <div className="px-5 pb-3 text-xs text-red-600">{enhanceError}</div>}
            {pendingFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 px-5 pb-3">
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
            <div className="mx-5 h-px bg-slate-100" />

            {/* 下半部：参数配置栏 */}
            <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
              <select
                value={selectedTeam ? selectedTeam.id : activeAgentIds[0] ?? ''}
                onChange={(e) => {
                  setSelectedAgentIds(e.target.value ? [e.target.value] : [])
                  setSelectedTeam(null)
                }}
                className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none transition focus:border-[var(--agenthub-accent)]"
              >
                {selectedTeam && <option value={selectedTeam.id}>{selectedTeam.name} · {activeAgents.length} 位协作</option>}
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
                  approvalMode === 'auto' && 'border-slate-300 bg-slate-100 text-slate-900',
                )}
              >
                {approvalMode === 'auto' ? '自动' : 'Review'}
              </Button>

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
                  title={enhancingPrompt ? '提示词增强中' : '增强提示词'}
                  onClick={() => void enhancePrompt()}
                  disabled={enhancingPrompt || sending || uploading}
                  className="rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                >
                  <Sparkles className="size-4" />
                </Button>
                <Button
                  onClick={() => void submit()}
                  disabled={!content.trim() || activeAgentIds.length === 0 || sending || uploading}
                  size="icon"
                  className="ml-1 size-8 rounded-md bg-[var(--agenthub-accent,#2F5FD0)] text-white transition hover:bg-[var(--agenthub-accent-hover,#244FB3)] disabled:opacity-50"
                  title={uploading ? '上传中' : '发送'}
                >
                  <Send className="size-4" />
                </Button>
              </div>
            </div>
          </section>

          {/* 底部状态栏 - 居中对齐 */}
          {sceneAgentError && <div className="mt-3 text-center text-xs text-amber-600 dark:text-amber-300">{sceneAgentError}</div>}
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
              {selectedTeam ? `已选择小队：${selectedTeam.name} · ${activeAgents.length} 位协作` : approvalMode === 'review' ? 'Review 保护 enabled' : 'Auto 模式 · 直接生效'}
            </span>
            {activeAgents.length > 0 && (
              <>
                <span className="text-slate-300">·</span>
                <span className="inline-flex items-center gap-1.5 rounded-md px-1 text-[var(--agenthub-accent)]">
                  <AgentAvatar agent={activeAgents[0]} size="xs" />
                  {selectedTeam ? `${selectedTeam.name} · ${activeAgents.length} 位协作` : activeAgents.length === 1 ? getAgentDisplayName(activeAgents[0]) : `${getAgentDisplayName(activeAgents[0])} 等 ${activeAgents.length} 位 Agent`}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function TeamAvatarStack({ members }: { members: SummonableMember[] }) {
  const hiddenCount = Math.max(members.length - 3, 0)

  return (
    <div className="flex -space-x-2">
      {members.slice(0, 3).map((member) => (
        <span key={member.id} className="flex size-7 items-center justify-center rounded-full border border-white/60 bg-white/90 text-sm shadow-sm shadow-slate-950/10 backdrop-blur dark:border-white/20 dark:bg-white/15">
          {member.avatar}
        </span>
      ))}
      {hiddenCount > 0 && (
        <span className="flex size-7 items-center justify-center rounded-full border border-white/60 bg-white/85 text-[10px] font-medium text-slate-700 shadow-sm shadow-slate-950/10 backdrop-blur dark:border-white/20 dark:bg-white/15 dark:text-white/90">
          +{hiddenCount}
        </span>
      )}
    </div>
  )
}

function FeaturedTeamCard({ team, onOpen }: { team: SummonableTeam; onOpen: () => void }) {
  const category = SUMMON_SCENE_CATEGORIES.find((item) => item.id === team.category)

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn('group relative flex h-[176px] w-[300px] shrink-0 snap-start overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br p-4 text-left text-white shadow-sm shadow-slate-950/10 ring-1 ring-black/5 transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-950/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--agenthub-accent-border)] focus-visible:ring-offset-2 active:translate-y-0 sm:w-[340px] lg:w-[360px]', team.coverClassName)}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.22),transparent_36%),linear-gradient(180deg,rgba(15,23,42,0.08),rgba(15,23,42,0.38)_46%,rgba(15,23,42,0.9))]" />
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate rounded-full border border-white/25 bg-white/15 px-2.5 py-1 text-[11px] font-medium text-white/90 shadow-sm backdrop-blur-md">{category?.label}</span>
          <span className="shrink-0 rounded-full border border-white/25 bg-white/15 px-2.5 py-1 text-[11px] font-medium text-white/90 shadow-sm backdrop-blur-md">{team.heat}</span>
        </div>
        <div className="mt-auto">
          <div className="text-xs font-medium text-white/72">{team.type === 'team' ? '热门团队' : '热门 Agent'}</div>
          <h3 className="mt-1 truncate text-[17px] font-semibold tracking-tight text-white drop-shadow-sm">{team.name}</h3>
          <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-white/82">{team.description}</p>
          <div className="mt-3 flex items-center justify-between gap-3">
            <TeamAvatarStack members={team.members} />
            <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold text-white shadow-sm backdrop-blur transition group-hover:bg-white/22">打开详情</span>
          </div>
        </div>
      </div>
    </button>
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
      <span className="my-3 w-1 rounded-full bg-transparent transition group-hover:bg-[var(--agenthub-accent-border)] group-active:bg-[var(--agenthub-accent)]" />
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
    <div className="flex h-[calc(100vh-var(--agenthub-titlebar-height,0px))] min-w-0 gap-3 p-3 xl:p-4">
      <section className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/70 sm:min-w-[360px]">
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
    <div className="hidden h-full min-w-0 shrink-0 overflow-hidden border-l border-slate-100 lg:block" style={{ width }}>
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
              <div className="flex size-8 items-center justify-center rounded-lg bg-[var(--agenthub-accent-soft)] text-[var(--agenthub-accent)]">
                <MessageSquare className="size-4" />
              </div>
            </div>
          )}
        </div>
        <div className="relative mt-3">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索对话" className="h-9 rounded-lg border-0 bg-slate-100 pl-9 text-xs shadow-none transition placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-[var(--agenthub-accent-border)]" />
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
                    ? 'bg-[var(--agenthub-accent-soft)] text-slate-950'
                    : 'text-slate-700 hover:bg-slate-100',
                )}
              >
                <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', activeId === conversation.id ? 'bg-white text-[var(--agenthub-accent)]' : 'bg-slate-100 text-slate-500')}>
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
  onOpenTeamDetail,
}: {
  onOpenConversations: () => void
  onOpenTeamDetail: (team: SummonableTeam) => void
}) {
  const agents = useAgentList()
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState('全部')
  const [agentView, setAgentView] = useState<'featured' | 'mine'>('featured')
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null)
  const [agentDetailOpen, setAgentDetailOpen] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [startingPresetId, setStartingPresetId] = useState<string | null>(null)
  const [deleteTargetAgentId, setDeleteTargetAgentId] = useState<string | null>(null)
  const [deletingAgentId, setDeletingAgentId] = useState<string | null>(null)
  const [agentFeedback, setAgentFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [selectedDeleteAgentIds, setSelectedDeleteAgentIds] = useState<Set<string>>(() => new Set())
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false)
  const [batchDeleting, setBatchDeleting] = useState(false)
  const [featuredMyAgentIds, setFeaturedMyAgentIds] = useState<Set<string>>(() => new Set())
  const [addingPresetId, setAddingPresetId] = useState<string | null>(null)
  const [visiblePresetCount, setVisiblePresetCount] = useState(FEATURED_AGENT_PAGE_SIZE)
  const upsertConversation = useAppStore((s) => s.upsertConversation)
  const upsertAgent = useAppStore((s) => s.upsertAgent)
  const removeAgent = useAppStore((s) => s.removeAgent)
  const setActiveConversation = useAppStore((s) => s.setActiveConversation)

  const myAgents = useMemo(() => {
    return agents.filter((agent) => {
      if (agent.isBuiltin) return false
      if (!isPresetBackedAgent(agent)) return true
      return featuredMyAgentIds.has(agent.id)
    })
  }, [agents, featuredMyAgentIds])

  useEffect(() => {
    setFeaturedMyAgentIds(readFeaturedMyAgentIds())
  }, [])

  useEffect(() => {
    setSelectedDeleteAgentIds((current) => {
      const visibleIds = new Set(myAgents.map((agent) => agent.id))
      const next = new Set(Array.from(current).filter((id) => visibleIds.has(id)))
      return next.size === current.size ? current : next
    })
  }, [myAgents])

  const filteredPresets = useMemo(() => {
    const q = query.trim().toLowerCase()
    return RESOURCE_AGENT_PRESETS.filter((preset) => {
      const matchesQuery = !q || `${getPresetDisplayName(preset)} ${preset.name} ${preset.description} ${preset.capabilities.join(' ')}`.toLowerCase().includes(q)
      const matchesTab = tab === '全部' || preset.category === tab
      return matchesQuery && matchesTab
    })
  }, [query, tab])
  const visiblePresets = filteredPresets.slice(0, visiblePresetCount)
  const hasMorePresets = visiblePresetCount < filteredPresets.length

  useEffect(() => {
    setVisiblePresetCount(FEATURED_AGENT_PAGE_SIZE)
  }, [agentView, query, tab])

  useEffect(() => {
    if (agentView !== 'featured' || !hasMorePresets) return

    const handleWindowScroll = () => {
      const distanceToBottom = document.documentElement.scrollHeight - window.innerHeight - window.scrollY
      if (distanceToBottom > SCROLL_END_THRESHOLD_PX) return

      setVisiblePresetCount((count) => Math.min(count + FEATURED_AGENT_PAGE_SIZE, filteredPresets.length))
    }

    window.addEventListener('scroll', handleWindowScroll, { passive: true })
    handleWindowScroll()

    return () => window.removeEventListener('scroll', handleWindowScroll)
  }, [agentView, filteredPresets.length, hasMorePresets])

  const filteredAgents = useMemo(() => {
    const q = query.trim().toLowerCase()
    return myAgents.filter((agent) => {
      return !q || `${getAgentDisplayName(agent)} ${agent.name} ${agent.description} ${agent.modelId ?? ''}`.toLowerCase().includes(q)
    })
  }, [myAgents, query])

  const selectedAgent = agentView === 'mine' && selectedAgentId
    ? agents.find((agent) => agent.id === selectedAgentId)
    : undefined
  const selectedPreset = agentView === 'featured' && selectedPresetId
    ? RESOURCE_AGENT_PRESETS.find((preset) => preset.id === selectedPresetId)
    : undefined
  const selectedPresetAgent = selectedPreset
    ? agents.find((agent) => agent.name === selectedPreset.name || agent.name === getPresetDisplayName(selectedPreset))
    : undefined
  const selectedPresetAdded = selectedPresetAgent ? featuredMyAgentIds.has(selectedPresetAgent.id) : false

  const addPresetToMine = async (preset: ResourceAgentPreset) => {
    if (addingPresetId) return
    setAddingPresetId(preset.id)
    setAgentFeedback(null)
    try {
      const knownAgents = [...agents]
      const agent = await resolveOrCreatePresetAgent(preset, knownAgents, upsertAgent)
      setFeaturedMyAgentIds((current) => {
        const next = new Set(current)
        next.add(agent.id)
        writeFeaturedMyAgentIds(next)
        return next
      })
      setAgentFeedback({ type: 'success', message: `已添加「${getPresetDisplayName(preset)}」到我的 Agent。` })
    } catch (err) {
      console.error('[AgentWorkspace] add preset to mine failed', err)
      setAgentFeedback({ type: 'error', message: '添加精选 Agent 失败，请稍后重试。' })
    } finally {
      setAddingPresetId(null)
    }
  }

  const startPresetConversation = async (preset: ResourceAgentPreset) => {
    if (startingPresetId) return
    setStartingPresetId(preset.id)
    try {
      const knownAgents = [...agents]
      const agent = await resolveOrCreatePresetAgent(preset, knownAgents, upsertAgent)
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

  const confirmDeleteAgent = async () => {
    if (!deleteTargetAgentId || deletingAgentId) return

    const target = agents.find((agent) => agent.id === deleteTargetAgentId)
    if (!target || target.isBuiltin) return

    setDeletingAgentId(target.id)
    setAgentFeedback(null)
    try {
      await deleteAgent(target.id)
      removeAgent(target.id)
      setSelectedAgentId((current) => current === target.id ? null : current)
      if (selectedAgentId === target.id) setAgentDetailOpen(false)
      setSelectedDeleteAgentIds((current) => {
        const next = new Set(current)
        next.delete(target.id)
        return next
      })
      setDeleteTargetAgentId(null)
      setAgentFeedback({ type: 'success', message: `已删除 Agent「${getAgentDisplayName(target)}」。` })
    } catch (err) {
      console.error('[AgentWorkspace] delete agent failed', err)
      setAgentFeedback({ type: 'error', message: '删除 Agent 失败，请确认该 Agent 未被会话或产物引用。' })
    } finally {
      setDeletingAgentId(null)
    }
  }

  const deleteSelectedAgents = async () => {
    const targetIds = Array.from(selectedDeleteAgentIds)
    if (targetIds.length === 0 || batchDeleting) return

    setBatchDeleting(true)
    setAgentFeedback(null)
    try {
      const results = await Promise.allSettled(targetIds.map(async (id) => {
        const agent = agents.find((item) => item.id === id)
        if (!agent || agent.isBuiltin) throw new Error(`Agent cannot be deleted: ${id}`)
        await deleteAgent(id)
        return agent
      }))
      const succeededAgents = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : [])
      const succeededIds = new Set(succeededAgents.map((agent) => agent.id))
      const failedCount = targetIds.length - succeededIds.size

      for (const agent of succeededAgents) removeAgent(agent.id)
      setSelectedDeleteAgentIds((current) => {
        const next = new Set(current)
        for (const id of succeededIds) next.delete(id)
        return next
      })
      setSelectedAgentId((current) => current && succeededIds.has(current) ? null : current)
      if (selectedAgentId && succeededIds.has(selectedAgentId)) setAgentDetailOpen(false)
      if (failedCount > 0) {
        setAgentFeedback({ type: 'error', message: `已删除 ${succeededIds.size} 个，${failedCount} 个删除失败。` })
      } else {
        setBatchDeleteOpen(false)
        setAgentFeedback({ type: 'success', message: `已删除 ${succeededIds.size} 个 Agent。` })
      }
    } catch (err) {
      console.error('[AgentWorkspace] batch delete agents failed', err)
      setAgentFeedback({ type: 'error', message: '批量删除 Agent 失败，请稍后重试。' })
    } finally {
      setBatchDeleting(false)
    }
  }

  const toggleDeleteSelection = (agentId: string) => {
    setSelectedDeleteAgentIds((current) => {
      const next = new Set(current)
      if (next.has(agentId)) next.delete(agentId)
      else next.add(agentId)
      return next
    })
  }

  const deleteTargetAgent = deleteTargetAgentId ? agents.find((agent) => agent.id === deleteTargetAgentId) : null

  return (
    <div className="flex min-w-0 items-start gap-3 p-4 xl:p-5">
      <section className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white shadow-[var(--agenthub-shadow-card)] dark:border-white/10 dark:bg-neutral-900">
        <div className="border-b border-slate-200 p-4 dark:border-white/10">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Agent 库</h1>
              <p className="mt-1 text-sm text-slate-500">发现、配置和复用你的协作 Agent</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setFormOpen(true)} className="rounded-md bg-[var(--agenthub-accent,#2F5FD0)] hover:bg-[var(--agenthub-accent-hover,#244FB3)]">
                <Plus className="mr-2 size-4" />
                创建 Agent
              </Button>
              {agentView === 'mine' && (
                <Button
                  variant="outline"
                  disabled={selectedDeleteAgentIds.size === 0 || batchDeleting}
                  onClick={() => setBatchDeleteOpen(true)}
                  className="rounded-md border-slate-200"
                >
                  <Trash2 className="mr-2 size-4" />
                  {selectedDeleteAgentIds.size > 0 ? `批量删除 (${selectedDeleteAgentIds.size})` : '批量删除'}
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => {
                  setAgentView((view) => (view === 'mine' ? 'featured' : 'mine'))
                  setAgentDetailOpen(false)
                  setSelectedAgentId(null)
                  setSelectedPresetId(null)
                  setSelectedDeleteAgentIds(new Set())
                }}
                className={cn(
                  'rounded-md border-slate-200',
                  agentView === 'mine' && 'border-slate-300 bg-slate-100 text-slate-900 hover:bg-slate-100',
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
              className="h-9 rounded-md border-slate-200 bg-slate-50 pl-10"
            />
          </div>
          {agentView === 'featured' && (
            <HorizontalScrollControls className="mt-3" contentClassName="gap-2 pb-1" scrollAmount={220}>
              {featuredCategories.map((item) => (
                <button key={item} type="button" onClick={() => setTab(item)} className={cn('shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition', tab === item ? 'border-[var(--agenthub-accent-border)] bg-[var(--agenthub-accent-soft)] text-[var(--agenthub-accent)] dark:border-[var(--agenthub-accent-border)] dark:bg-[var(--agenthub-accent-soft)] dark:text-[var(--agenthub-accent)]' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900 dark:border-white/10 dark:bg-neutral-900 dark:text-slate-400 dark:hover:border-white/15 dark:hover:bg-neutral-800 dark:hover:text-slate-100')}>
                  {item}
                </button>
              ))}
            </HorizontalScrollControls>
          )}
          {agentView === 'featured' && (
            <div className="mt-3 border-t border-slate-100 pt-3 dark:border-white/10">
              <div className="mb-2">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">精选场景</h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">从场景卡片进入统一团队详情，召唤后直接创建会话</p>
              </div>
              <HorizontalScrollControls
                className="-mx-1"
                contentClassName="snap-x snap-mandatory gap-4 px-1 pb-3 pt-1"
                scrollAmount={380}
              >
                {SUMMON_TEAMS.filter((team) => team.featured).map((team) => (
                  <FeaturedTeamCard key={team.id} team={team} onOpen={() => onOpenTeamDetail(team)} />
                ))}
              </HorizontalScrollControls>
            </div>
          )}
        </div>

        <div className="space-y-4 p-4">
          {agentView === 'featured' ? (
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-slate-950 dark:text-slate-100">精选 Agent</h2>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">选择一个预设 Agent，直接开始对话</p>
                  </div>
                </div>
                <div className="min-h-[280px] pr-1">
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
                    {visiblePresets.map((preset) => {
                      return (
                        <ResourcePresetCard
                          key={preset.id}
                          preset={preset}
                          starting={startingPresetId === preset.id}
                          selected={agentDetailOpen && selectedPreset?.id === preset.id}
                          onSelect={() => {
                            setSelectedPresetId(preset.id)
                            setAgentDetailOpen(true)
                          }}
                          onStart={() => void startPresetConversation(preset)}
                        />
                      )
                    })}
                  </div>
                  {filteredPresets.length > 0 && !hasMorePresets && (
                    <div className="py-4 text-center text-xs text-slate-400 dark:text-slate-500">已经到底了</div>
                  )}
                </div>
                {filteredPresets.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-14 text-center dark:border-white/10 dark:bg-neutral-950/40">
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">没有匹配的精选 Agent</div>
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">试试切换分类或调整搜索关键词。</p>
                  </div>
                )}
              </section>
            ) : (
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold">我的 Agent</h2>
                    <p className="mt-1 text-xs text-slate-500">仅展示你创建的自定义 Agent，可直接开始对话或继续配置</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500">{filteredAgents.length} 个</span>
                </div>
                {agentFeedback && (
                  <div className={cn(
                    'mb-3 rounded-lg border px-3 py-2 text-xs',
                    agentFeedback.type === 'success'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-red-200 bg-red-50 text-red-600',
                  )}>
                    {agentFeedback.message}
                  </div>
                )}
                <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
                  {filteredAgents.map((agent) => (
                    <AgentCard
                      key={agent.id}
                      agent={agent}
                      selected={agentDetailOpen && selectedAgent?.id === agent.id}
                      selectable={agentView === 'mine'}
                      checked={selectedDeleteAgentIds.has(agent.id)}
                      onToggleSelected={() => toggleDeleteSelection(agent.id)}
                      onSelect={() => {
                        setSelectedAgentId(agent.id)
                        setAgentDetailOpen(true)
                      }}
                      onStart={() => void startConversation(agent)}
                    />
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
      </section>

      {agentDetailOpen && selectedPreset && agentView === 'featured' && (
        <FeaturedPresetDetailPanel
          preset={selectedPreset}
          addedToMine={selectedPresetAdded}
          adding={addingPresetId === selectedPreset.id}
          onAddToMine={(preset) => void addPresetToMine(preset)}
          onClose={() => {
            setSelectedPresetId(null)
            setAgentDetailOpen(false)
          }}
        />
      )}
      {agentDetailOpen && selectedAgent && agentView === 'mine' && (
        <AgentDetailPanel
          agent={selectedAgent}
          deleting={deletingAgentId === selectedAgent.id}
          onStart={(agent) => void startConversation(agent)}
          onDelete={(agent) => setDeleteTargetAgentId(agent.id)}
          onClose={() => {
            setSelectedAgentId(null)
            setAgentDetailOpen(false)
          }}
        />
      )}
      <CreateAgentDialog open={formOpen} onOpenChange={setFormOpen} />
      <Dialog open={Boolean(deleteTargetAgentId)} onOpenChange={(open) => {
        if (!open && !deletingAgentId) setDeleteTargetAgentId(null)
      }}>
        <DialogContent className="max-w-md border border-slate-200 bg-white dark:border-white/10 dark:bg-neutral-900">
          <DialogHeader>
            <DialogTitle>确认删除 Agent</DialogTitle>
            <DialogDescription>
              确定删除「{deleteTargetAgent ? getAgentDisplayName(deleteTargetAgent) : '该 Agent'}」吗？已使用该 Agent 的会话可能无法继续调用它。此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTargetAgentId(null)} disabled={Boolean(deletingAgentId)}>取消</Button>
            <Button onClick={() => void confirmDeleteAgent()} disabled={Boolean(deletingAgentId)} className="bg-red-600 text-white hover:bg-red-700">
              {deletingAgentId ? '删除中…' : '确认删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={batchDeleteOpen} onOpenChange={(open) => {
        if (!open && !batchDeleting) setBatchDeleteOpen(false)
      }}>
        <DialogContent className="max-w-md border border-slate-200 bg-white dark:border-white/10 dark:bg-neutral-900">
          <DialogHeader>
            <DialogTitle>批量删除 Agent</DialogTitle>
            <DialogDescription>
              确定删除已选择的 {selectedDeleteAgentIds.size} 个 Agent 吗？已使用这些 Agent 的会话可能无法继续调用它们。此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchDeleteOpen(false)} disabled={batchDeleting}>取消</Button>
            <Button onClick={() => void deleteSelectedAgents()} disabled={batchDeleting || selectedDeleteAgentIds.size === 0} className="bg-red-600 text-white hover:bg-red-700">
              {batchDeleting ? '删除中…' : '确认删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

function isPresetBackedAgent(agent: AgentRow) {
  return RESOURCE_AGENT_PRESETS.some((preset) => agent.name === preset.name || agent.name === getPresetDisplayName(preset))
}

function readFeaturedMyAgentIds() {
  if (typeof window === 'undefined') return new Set<string>()

  try {
    const raw = window.localStorage.getItem(FEATURED_MY_AGENT_IDS_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [])
  } catch {
    return new Set<string>()
  }
}

function writeFeaturedMyAgentIds(ids: Set<string>) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(FEATURED_MY_AGENT_IDS_KEY, JSON.stringify(Array.from(ids)))
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
      className={cn(
        'group relative flex min-h-[190px] flex-col rounded-lg border bg-white p-3.5 transition duration-200 hover:border-slate-300 hover:bg-slate-50 dark:bg-neutral-900 dark:hover:border-white/15 dark:hover:bg-neutral-800/70',
        selected ? 'border-[var(--agenthub-accent,#2F5FD0)] before:absolute before:left-0 before:top-3 before:h-8 before:w-[3px] before:rounded-r-full before:bg-[var(--agenthub-accent,#2F5FD0)] dark:border-[var(--agenthub-accent-border)]' : 'border-slate-200 dark:border-white/10',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-lg transition duration-200 dark:border-white/10 dark:bg-neutral-800">
          <span aria-hidden="true">{preset.avatar}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start gap-2">
            <h3 className={cn('line-clamp-2 flex-1 text-[15px] font-semibold leading-5 text-slate-950 dark:text-slate-50', getPresetDisplayName(preset).length > 22 && 'text-sm leading-5')}>
              {getPresetDisplayName(preset)}
            </h3>
            <span className="shrink-0 rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:border-white/10 dark:bg-neutral-800 dark:text-slate-300">{preset.category}</span>
          </div>
          <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-600 dark:text-slate-400">{preset.description}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {preset.capabilities.slice(0, 2).map((capability) => (
          <span key={capability} className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] text-slate-600 dark:border-white/10 dark:bg-neutral-800 dark:text-slate-300">
            {capability}
          </span>
        ))}
        {preset.capabilities.length > 2 && (
          <span className="rounded border border-slate-200 bg-white px-2 py-0.5 font-mono text-[11px] text-slate-400 dark:border-white/10 dark:bg-neutral-900 dark:text-slate-500">+{preset.capabilities.length - 2}</span>
        )}
      </div>

      <div className="mt-auto grid grid-cols-2 gap-2 pt-4">
        <Button
          size="sm"
          onClick={onSelect}
          variant="outline"
          className="h-8 rounded-md border-slate-300 bg-white text-xs text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-neutral-900 dark:text-slate-300 dark:hover:bg-neutral-800"
        >
          详情
        </Button>
        <Button
          size="sm"
          disabled={starting}
          onClick={(e) => {
            e.stopPropagation()
            onStart()
          }}
          variant="outline"
          className="h-8 rounded-md border-slate-300 bg-white text-xs text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-white/10 dark:bg-neutral-900 dark:text-slate-300 dark:hover:bg-neutral-800"
        >
          {starting ? '创建中' : '开始对话'}
        </Button>
      </div>
    </article>
  )
}

function FeaturedPresetDetailPanel({
  preset,
  addedToMine,
  adding,
  onAddToMine,
  onClose,
}: {
  preset?: ResourceAgentPreset
  addedToMine: boolean
  adding: boolean
  onAddToMine: (preset: ResourceAgentPreset) => void
  onClose: () => void
}) {
  const [promptOpen, setPromptOpen] = useState(false)

  if (!preset) {
    return (
      <aside className="hidden w-[340px] shrink-0 self-start rounded-xl border border-slate-200 bg-white shadow-[var(--agenthub-shadow-card)] xl:sticky xl:top-[calc(var(--agenthub-titlebar-height,0px)+1rem)] xl:block">
        <div className="flex h-full items-center justify-center p-8 text-center text-sm text-slate-500">选择一个精选 Agent 查看详情</div>
      </aside>
    )
  }

  return (
    <aside className="hidden w-[340px] shrink-0 self-start rounded-xl border border-slate-200 bg-white shadow-[var(--agenthub-shadow-card)] xl:sticky xl:top-[calc(var(--agenthub-titlebar-height,0px)+1rem)] xl:block">
      <div className="flex h-full flex-col">
        <div className="border-b border-slate-200 p-4">
          <div className="flex items-start gap-3">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-xl">
              {preset.avatar}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-base font-semibold tracking-tight text-slate-950">{getPresetDisplayName(preset)}</h2>
                <span className="rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">精选</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500">{preset.description}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-100"
              title="关闭详情"
              aria-label="关闭详情"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {preset.capabilities.slice(0, 2).map((capability) => (
              <span key={capability} className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] text-slate-600">{capability}</span>
            ))}
            {preset.capabilities.length > 2 && (
              <span className="rounded border border-slate-200 bg-white px-2 py-0.5 font-mono text-[11px] text-slate-400">+{preset.capabilities.length - 2}</span>
            )}
          </div>
          <Button
            variant="outline"
            onClick={() => onAddToMine(preset)}
            disabled={addedToMine || adding}
            className="mt-3 w-full rounded-xl border-slate-200 text-xs"
          >
            <Plus className="mr-2 size-4" />
            {addedToMine ? '已在我的 Agent' : adding ? '添加中…' : '添加到我的 Agent'}
          </Button>
        </div>

        <div className="space-y-3 p-4 text-sm">
            <DetailSection icon={<SlidersHorizontal className="size-4" />} title="模型配置" aside={<SavedState />}>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500">
                      <Check className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium text-[var(--agenthub-accent)]">{preset.modelId}</div>
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
                <button type="button" onClick={() => setPromptOpen((open) => !open)} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[var(--agenthub-accent)] transition hover:text-[var(--agenthub-accent-hover)]">
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
      </div>
    </aside>
  )
}

function AgentCard({
  agent,
  selected,
  selectable,
  checked,
  onToggleSelected,
  onSelect,
  onStart,
}: {
  agent: AgentRow
  selected: boolean
  selectable: boolean
  checked: boolean
  onToggleSelected: () => void
  onSelect: () => void
  onStart: () => void
}) {
  return (
    <article className={cn('relative rounded-lg border bg-white p-3.5 transition hover:border-slate-300 hover:bg-slate-50 dark:bg-neutral-900 dark:hover:border-white/15 dark:hover:bg-neutral-800/70', selected ? 'border-[var(--agenthub-accent,#2F5FD0)] before:absolute before:left-0 before:top-3 before:h-8 before:w-[3px] before:rounded-r-full before:bg-[var(--agenthub-accent,#2F5FD0)] dark:border-[var(--agenthub-accent-border)]' : 'border-slate-200 dark:border-white/10')}>
      {selectable && (
        <button
          type="button"
          aria-pressed={checked}
          title={checked ? '取消选择' : '选择用于批量删除'}
          onClick={(e) => {
            e.stopPropagation()
            onToggleSelected()
          }}
          className={cn(
            'absolute right-3 top-3 z-10 flex size-6 items-center justify-center rounded-md border text-xs transition',
            checked
              ? 'border-[var(--agenthub-accent,#2F5FD0)] bg-[var(--agenthub-accent,#2F5FD0)] text-white'
              : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:text-slate-700 dark:border-white/10 dark:bg-neutral-900 dark:text-slate-500 dark:hover:border-white/15 dark:hover:bg-neutral-800 dark:hover:text-slate-200',
          )}
        >
          {checked && <Check className="size-4" />}
        </button>
      )}
      <div className="flex items-start gap-3 pr-7">
        <AgentAvatar agent={agent} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-slate-950 dark:text-slate-50">{getAgentDisplayName(agent)}</h3>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-neutral-800 dark:text-slate-400">{agent.isBuiltin ? '内置' : '自定义'}</span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{agent.description || '可配置的协作 Agent'}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {[agent.adapterName, agent.isOrchestrator ? '编排' : '执行'].map((tag) => (
          <span key={tag} className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[10px] text-slate-600 dark:border-white/10 dark:bg-neutral-800 dark:text-slate-300">{tag}</span>
        ))}
        <span className="rounded border border-slate-200 bg-white px-2 py-0.5 font-mono text-[10px] text-slate-400 dark:border-white/10 dark:bg-neutral-900 dark:text-slate-500">+1</span>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-white/10">
        <div className="truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">{agent.modelId || 'default model'}</div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-8 rounded-md border-slate-300 bg-white text-xs text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-neutral-900 dark:text-slate-300 dark:hover:bg-neutral-800" onClick={onSelect}>详情</Button>
          <Button size="sm" variant="outline" className="h-8 rounded-md border-slate-300 bg-white text-xs text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-neutral-900 dark:text-slate-300 dark:hover:bg-neutral-800" onClick={onStart}>开始对话</Button>
        </div>
      </div>
    </article>
  )
}

function AgentDetailPanel({
  agent,
  deleting,
  onStart,
  onDelete,
  onClose,
}: {
  agent?: AgentRow
  deleting: boolean
  onStart: (agent: AgentRow) => void
  onDelete: (agent: AgentRow) => void
  onClose: () => void
}) {
  const [promptOpen, setPromptOpen] = useState(false)

  if (!agent) {
    return (
      <aside className="hidden w-[340px] shrink-0 self-start rounded-xl border border-slate-200 bg-white shadow-[var(--agenthub-shadow-card)] xl:sticky xl:top-[calc(var(--agenthub-titlebar-height,0px)+1rem)] xl:block">
        <div className="flex h-full items-center justify-center p-8 text-center text-sm text-slate-500">选择一个 Agent 查看详情</div>
      </aside>
    )
  }

  return (
    <aside className="hidden w-[340px] shrink-0 self-start rounded-xl border border-slate-200 bg-white shadow-[var(--agenthub-shadow-card)] xl:sticky xl:top-[calc(var(--agenthub-titlebar-height,0px)+1rem)] xl:block">
      <div className="flex h-full flex-col">
        <div className="border-b border-slate-200 p-4">
          <div className="flex items-start gap-3">
            <div className="transition duration-200 hover:scale-105">
              <AgentAvatar agent={agent} size="lg" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-xl font-semibold tracking-tight text-slate-950">{getAgentDisplayName(agent)}</h2>
                <span className="rounded-full bg-[var(--agenthub-accent-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--agenthub-accent)]">{agent.isBuiltin ? '内置' : '自定义'}</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500">{agent.description || '可配置的协作 Agent'}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-100"
              title="关闭详情"
              aria-label="关闭详情"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {agent.capabilities.map((capability) => (
              <span key={capability} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600 transition hover:bg-slate-100 hover:text-slate-900">{capability}</span>
            ))}
          </div>
          <Button onClick={() => onStart(agent)} className="mt-4 w-full rounded-xl bg-[var(--agenthub-accent)] shadow-sm shadow-none transition hover:-translate-y-0.5 hover:bg-[var(--agenthub-accent-hover)] hover:shadow-md">
            开始对话
          </Button>
          {!agent.isBuiltin && (
            <Button
              variant="outline"
              onClick={() => onDelete(agent)}
              disabled={deleting}
              className="mt-2 w-full rounded-xl border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              <Trash2 className="mr-2 size-4" />
              {deleting ? '删除中…' : '删除 Agent'}
            </Button>
          )}
        </div>

        <div className="space-y-3 p-4 text-sm">
            <DetailSection icon={<SlidersHorizontal className="size-4" />} title="模型配置" aside={<SavedState />}>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500">
                      <Check className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium text-[var(--agenthub-accent)]">{agent.modelId || 'default model'}</div>
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
                <button type="button" onClick={() => setPromptOpen((open) => !open)} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[var(--agenthub-accent)] transition hover:text-[var(--agenthub-accent-hover)]">
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
      </div>
    </aside>
  )
}

function ArtifactWorkspace({ onOpenConversations }: { onOpenConversations: () => void }) {
  const [items, setItems] = useState<ArtifactListItem[]>([])
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<ArtifactTabId>('all')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<ArtifactFeedback>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [artifactDetailOpen, setArtifactDetailOpen] = useState(false)
  const [visibleArtifactCount, setVisibleArtifactCount] = useState(ARTIFACT_GROUP_PAGE_SIZE)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [copiedArtifactId, setCopiedArtifactId] = useState<string | null>(null)
  const [exportingId, setExportingId] = useState<string | null>(null)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [deleteTargetIds, setDeleteTargetIds] = useState<string[] | null>(null)
  const [deletingIds, setDeletingIds] = useState<Set<string>>(() => new Set())
  const [pendingAction, setPendingAction] = useState<'delete' | null>(null)
  const upsertArtifact = useAppStore((s) => s.upsertArtifact)
  const openArtifactPreview = useAppStore((s) => s.openArtifactPreview)
  const previewArtifactId = useAppStore((s) => s.previewArtifactId)
  const setActiveConversation = useAppStore((s) => s.setActiveConversation)

  const showFeedback = useCallback((next: ArtifactFeedback) => {
    setFeedback(next)
    if (next?.type === 'success') window.setTimeout(() => setFeedback(null), 1800)
  }, [])

  const loadArtifacts = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const list = await fetchArtifacts()
      setItems(list)
      setSelectedId((current) => current && list.some((item) => item.id === current) ? current : null)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setLoadError(message)
      showFeedback({ type: 'error', message: '产物加载失败，请重试。' })
    } finally {
      setLoading(false)
    }
  }, [showFeedback])

  useEffect(() => {
    void loadArtifacts()
  }, [loadArtifacts])

  const groups = useMemo(() => groupArtifactVersions(items), [items])
  const activeTab = artifactTabs.find((item) => item.id === tab) ?? artifactTabs[0]
  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase()
    return groups.filter((group) => {
      const item = group.latest
      const matchesQuery = !q || `${item.title} ${item.type} ${item.conversationTitle ?? ''}`.toLowerCase().includes(q)
      const matchesTab = activeTab.id === 'all' || activeTab.types.includes(item.type)
      return matchesQuery && matchesTab
    })
  }, [activeTab, groups, query])
  const visibleGroups = filteredGroups.slice(0, visibleArtifactCount)
  const hasMoreArtifacts = visibleArtifactCount < filteredGroups.length

  useEffect(() => {
    setVisibleArtifactCount(ARTIFACT_GROUP_PAGE_SIZE)
  }, [query, tab, filteredGroups.length])

  const selected = selectedId ? items.find((item) => item.id === selectedId) : undefined
  const previewOpen = Boolean(previewArtifactId)

  useEffect(() => {
    if (previewOpen || !hasMoreArtifacts) return

    const handleWindowScroll = () => {
      const distanceToBottom = document.documentElement.scrollHeight - window.innerHeight - window.scrollY
      if (distanceToBottom > SCROLL_END_THRESHOLD_PX) return

      setVisibleArtifactCount((count) => Math.min(count + ARTIFACT_GROUP_PAGE_SIZE, filteredGroups.length))
    }

    window.addEventListener('scroll', handleWindowScroll, { passive: true })
    handleWindowScroll()

    return () => window.removeEventListener('scroll', handleWindowScroll)
  }, [filteredGroups.length, hasMoreArtifacts, previewOpen])

  const clearSelection = () => {
    setSelectedIds(new Set())
    setSelectionMode(false)
  }

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const exportArtifactSource = (artifactId: string) => {
    setExportingId(artifactId)
    window.location.href = artifactExportUrl(artifactId)
    showFeedback({ type: 'success', message: '已开始导出产物。' })
    window.setTimeout(() => setExportingId(null), 800)
  }

  const deleteArtifactsByIds = async (ids: string[]) => {
    const targetIds = Array.from(new Set(ids))
    if (targetIds.length === 0 || pendingAction) return

    setPendingAction('delete')
    setDeletingIds(new Set(targetIds))
    try {
      const results = await Promise.allSettled(targetIds.map((id) => deleteArtifact(id)))
      const succeededIds = targetIds.filter((_, index) => results[index]?.status === 'fulfilled')
      const failedCount = targetIds.length - succeededIds.length
      const succeededSet = new Set(succeededIds)

      setItems((current) => {
        const next = current.filter((item) => !succeededSet.has(item.id))
        setSelectedId((currentSelectedId) => {
          if (!currentSelectedId || !succeededSet.has(currentSelectedId)) return currentSelectedId
          setArtifactDetailOpen(false)
          return null
        })
        return next
      })
      setSelectedIds((current) => {
        const next = new Set(current)
        for (const id of succeededIds) next.delete(id)
        return next
      })

      if (failedCount > 0) showFeedback({ type: 'error', message: `已删除 ${succeededIds.length} 个，${failedCount} 个删除失败。` })
      else {
        showFeedback({ type: 'success', message: `已删除 ${succeededIds.length} 个产物。` })
        clearSelection()
      }
    } catch (err) {
      console.error('[ArtifactWorkspace] delete artifacts failed', err)
      showFeedback({ type: 'error', message: '删除产物失败，请稍后重试。' })
    } finally {
      setDeletingIds(new Set())
      setPendingAction(null)
    }
  }

  const openPreview = async (id: string) => {
    setSelectedId(id)
    setArtifactDetailOpen(true)
    try {
      const artifact = await fetchArtifact(id)
      upsertArtifact(artifact)
      openArtifactPreview(id)
    } catch (err) {
      console.error('[ArtifactWorkspace] open preview failed', err)
      showFeedback({ type: 'error', message: '打开预览失败，请稍后重试。' })
    }
  }

  const copyArtifactReference = async (item: ArtifactListItem) => {
    if (!navigator.clipboard?.writeText) {
      showFeedback({ type: 'error', message: '当前环境不支持剪贴板写入。' })
      return
    }

    try {
      await navigator.clipboard.writeText(buildArtifactReference(item))
      setCopiedArtifactId(item.id)
      showFeedback({ type: 'success', message: '已复制产物引用。' })
      window.setTimeout(() => setCopiedArtifactId(null), 1500)
    } catch (err) {
      console.error('[ArtifactWorkspace] copy reference failed', err)
      showFeedback({ type: 'error', message: '复制失败，请检查剪贴板权限。' })
    }
  }

  const showArtifactDetailPanel = artifactDetailOpen && Boolean(selected)
  const previewOnly = previewOpen && !showArtifactDetailPanel

  const confirmDelete = async () => {
    if (!deleteTargetIds) return
    await deleteArtifactsByIds(deleteTargetIds)
    setDeleteTargetIds(null)
  }

  return (
    <div
      className={cn(
        'flex min-w-0 gap-4 bg-[var(--agenthub-surface-muted)] p-4 xl:p-5',
        previewOnly
          ? 'h-[calc(100vh-var(--agenthub-titlebar-height,0px))] items-stretch overflow-hidden'
          : 'items-start',
      )}
    >
      {!previewOpen && (
        <section className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white shadow-[var(--agenthub-shadow-card)] dark:border-white/10 dark:bg-neutral-900">
          <div className="shrink-0 border-b border-slate-100 p-4 dark:border-white/10 xl:p-5">
            <div className="flex flex-nowrap items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="truncate text-xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">产物库</h1>
                <p className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">集中管理文档、原型、PPT、图片、项目和历史版本</p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                {selectionMode ? (
                  <>
                    <Button variant="outline" className="h-8 rounded-lg px-3 text-xs" disabled={selectedIds.size === 0 || pendingAction === 'delete'} onClick={() => setDeleteTargetIds(Array.from(selectedIds))}>
                      {pendingAction === 'delete' ? '删除中…' : `删除所选(${selectedIds.size})`}
                    </Button>
                    <Button variant="outline" className="h-8 rounded-lg px-3 text-xs" disabled={pendingAction === 'delete'} onClick={clearSelection}>完成</Button>
                  </>
                ) : (
                  <Button variant="outline" className="h-8 rounded-lg px-3 text-xs" onClick={() => setSelectionMode(true)}>批量管理</Button>
                )}
                <Button variant="outline" className="h-8 rounded-lg px-3 text-xs" disabled={!selected || exportingId === selected.id} onClick={() => selected && exportArtifactSource(selected.id)}>{selected && exportingId === selected.id ? '导出中…' : '导出源码'}</Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setViewMode((mode) => (mode === 'grid' ? 'list' : 'grid'))}
                  className={cn('size-8 rounded-lg text-slate-500 dark:text-slate-400', viewMode === 'grid' && 'border-[var(--agenthub-accent-border)] bg-[var(--agenthub-accent-soft)] text-[var(--agenthub-accent)]')}
                  title={viewMode === 'grid' ? '切换列表视图' : '切换网格视图'}
                >
                  <Grid2X2 className="size-4" />
                </Button>
              </div>
            </div>

            <div className="relative mt-4">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索产物、版本或来源会话" className="h-9 w-full rounded-lg border-slate-200 bg-slate-50 pl-10 text-sm shadow-none focus-visible:ring-2 focus-visible:ring-ring/20 dark:border-white/10 dark:bg-neutral-950/50 dark:text-slate-100 dark:placeholder:text-slate-500" />
            </div>

            <HorizontalScrollControls className="mt-3" contentClassName="gap-2 pb-1" scrollAmount={220}>
              {artifactTabs.map((item) => (
                <button key={item.id} type="button" onClick={() => setTab(item.id)} className={cn('shrink-0 rounded-md border px-3 py-1.5 text-xs font-medium transition', tab === item.id ? 'border-[var(--agenthub-accent-border)] bg-[var(--agenthub-accent-soft)] text-[var(--agenthub-accent)]' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900 dark:border-white/10 dark:bg-neutral-900 dark:text-slate-400 dark:hover:border-white/15 dark:hover:bg-neutral-800 dark:hover:text-slate-100')}>{item.label}</button>
              ))}
            </HorizontalScrollControls>

            {feedback && (
              <div className={cn('mt-3 rounded-lg border px-3 py-2 text-xs', feedback.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300' : 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300')}>
                {feedback.message}
              </div>
            )}

            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <LibraryStat label="产物组" value={String(filteredGroups.length)} />
              <LibraryStat label="总版本" value={String(items.length)} />
              <LibraryStat label="当前分类" value={activeTab.label} />
              <LibraryStat label="视图" value={viewMode === 'grid' ? '网格' : '列表'} />
            </div>
          </div>

          <div
            className={cn(
              'min-h-[320px] p-4 xl:p-5',
              viewMode === 'grid' ? 'grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3' : 'space-y-2',
            )}
          >
            {loading ? (
              <div className="text-sm text-slate-500 dark:text-slate-400">加载中…</div>
            ) : loadError ? (
              <div className="rounded-xl border border-dashed border-red-200 bg-red-50 px-6 py-12 text-center text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
                <div>产物加载失败</div>
                <Button variant="outline" size="sm" className="mt-3 rounded-lg" onClick={() => void loadArtifacts()}>重试</Button>
              </div>
            ) : visibleGroups.map((group) => (
              <ArtifactCard
                key={group.rootId}
                item={group.latest}
                versions={group.versions.length}
                selected={artifactDetailOpen && selected?.id === group.latest.id}
                compact={viewMode === 'list'}
                selectable={selectionMode}
                checked={selectedIds.has(group.latest.id)}
                deleting={deletingIds.has(group.latest.id)}
                onToggleSelected={() => toggleSelected(group.latest.id)}
                onSelect={() => {
                  setSelectedId(group.latest.id)
                  setArtifactDetailOpen(true)
                }}
                onPreview={() => void openPreview(group.latest.id)}
                onOpenConversation={() => { setActiveConversation(group.latest.conversationId); onOpenConversations() }}
              />
            ))}
            {!loading && !loadError && filteredGroups.length > 0 && !hasMoreArtifacts && (
              <div className={cn('py-4 text-center text-xs text-slate-400 dark:text-slate-500', viewMode === 'grid' && 'col-span-full')}>已经到底了</div>
            )}
            {!loading && !loadError && filteredGroups.length === 0 && <div className={cn('rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-neutral-950/40 dark:text-slate-400', viewMode === 'grid' && 'col-span-full')}>{items.length === 0 ? '暂无产物' : '暂无匹配产物'}</div>}
          </div>
        </section>
      )}
      {showArtifactDetailPanel && selected && (
        <ArtifactDetailPanel
          item={selected}
          previewOpen={previewOpen}
          copied={copiedArtifactId === selected?.id}
          exporting={Boolean(selected && exportingId === selected.id)}
          deleting={Boolean(selected && deletingIds.has(selected.id))}
          onPreview={(id) => void openPreview(id)}
          onCopyReference={(item) => void copyArtifactReference(item)}
          onExport={exportArtifactSource}
          onDelete={(id) => setDeleteTargetIds([id])}
          onOpenConversation={(id) => { setActiveConversation(id); onOpenConversations() }}
          onClose={() => {
            setSelectedId(null)
            setArtifactDetailOpen(false)
          }}
        />
      )}
      <ArtifactPreviewPanel fullHeight={previewOnly} />
      <Dialog open={Boolean(deleteTargetIds)} onOpenChange={(open) => { if (!open && pendingAction !== 'delete') setDeleteTargetIds(null) }}>
        <DialogContent className="max-w-md border border-slate-200 bg-white dark:border-white/10 dark:bg-neutral-900">
          <DialogHeader>
            <DialogTitle>确认删除产物</DialogTitle>
            <DialogDescription>确认删除 {deleteTargetIds?.length ?? 0} 个产物？此操作不可撤销。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTargetIds(null)} disabled={pendingAction === 'delete'}>取消</Button>
            <Button onClick={() => void confirmDelete()} disabled={pendingAction === 'delete'} className="bg-red-600 text-white hover:bg-red-700">{pendingAction === 'delete' ? '删除中…' : '确认删除'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function LibraryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 transition hover:border-slate-300 hover:bg-slate-100 dark:border-white/10 dark:bg-neutral-950/40 dark:hover:border-white/15 dark:hover:bg-neutral-800/70">
      <div className="text-[11px] text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 truncate text-base font-semibold text-slate-900 dark:text-slate-50">{value}</div>
    </div>
  )
}

function ArtifactCard({
  item,
  versions,
  selected,
  compact,
  selectable,
  checked,
  deleting,
  onToggleSelected,
  onSelect,
  onPreview,
  onOpenConversation,
}: {
  item: ArtifactListItem
  versions: number
  selected: boolean
  compact: boolean
  selectable: boolean
  checked: boolean
  deleting: boolean
  onToggleSelected: () => void
  onSelect: () => void
  onPreview: () => void
  onOpenConversation: () => void
}) {
  const selector = selectable ? (
    <button
      type="button"
      aria-pressed={checked}
      onClick={(event) => {
        event.stopPropagation()
        onToggleSelected()
      }}
      className={cn(
        'absolute left-2 top-2 z-10 flex size-6 items-center justify-center rounded-md border text-xs shadow-sm transition',
        checked ? 'border-[var(--agenthub-accent-border)] bg-[var(--agenthub-accent)] text-white' : 'border-slate-200 bg-white text-transparent hover:border-slate-300 dark:border-white/10 dark:bg-neutral-900',
      )}
    >
      <Check className="size-3.5" />
    </button>
  ) : null

  if (compact) {
    return (
      <article
        className={cn(
          'relative grid grid-cols-[44px_minmax(0,1.5fr)_minmax(150px,0.9fr)_120px_232px] items-center gap-4 rounded-lg border bg-white px-4 py-3 transition hover:border-slate-300 hover:bg-slate-50 dark:bg-neutral-900 dark:hover:border-white/15 dark:hover:bg-neutral-800/70',
          selected ? 'border-[var(--agenthub-accent-border)] before:absolute before:left-0 before:top-2 before:h-8 before:w-[3px] before:rounded-r-full before:bg-[var(--agenthub-accent)] dark:border-[var(--agenthub-accent-border)]' : 'border-slate-200 dark:border-white/10',
          selectable && 'pl-10',
          deleting && 'pointer-events-none opacity-60',
        )}
      >
        {selector}
        <div className="flex size-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-neutral-800 dark:text-slate-300"><FileText className="size-4" /></div>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-slate-950 dark:text-slate-50">{item.title}</h3>
          <div className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">v{item.version} · {item.type} · {versions} 个版本</div>
        </div>
        <div className="min-w-0 text-xs text-slate-500 dark:text-slate-400">
          <div className="truncate">{item.conversationTitle ?? '未命名会话'}</div>
          <div className="mt-1 truncate font-mono text-[11px] text-slate-400 dark:text-slate-500">{item.createdByAgentId ?? 'Agent'}</div>
        </div>
        <div className="truncate text-xs text-slate-500 dark:text-slate-400">{formatTime(item.createdAt)}</div>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" className="h-8 rounded-lg px-3 text-xs" onClick={onSelect}>详情</Button>
          <Button size="sm" className="h-8 rounded-lg px-3 text-xs" onClick={onPreview}>预览</Button>
          <Button size="sm" variant="outline" className="h-8 rounded-lg px-3 text-xs" onClick={onOpenConversation}>打开会话</Button>
        </div>
      </article>
    )
  }

  return (
    <article
      className={cn(
        'relative flex min-h-[236px] flex-col rounded-lg border bg-white p-4 transition hover:border-slate-300 hover:bg-slate-50 dark:bg-neutral-900 dark:hover:border-white/15 dark:hover:bg-neutral-800/70',
        selected ? 'border-[var(--agenthub-accent-border)] before:absolute before:left-0 before:top-3 before:h-8 before:w-[3px] before:rounded-r-full before:bg-[var(--agenthub-accent)] dark:border-[var(--agenthub-accent-border)]' : 'border-slate-200 dark:border-white/10',
        selectable && 'pt-10',
        deleting && 'pointer-events-none opacity-60',
      )}
    >
      {selector}
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-neutral-800 dark:text-slate-300"><FileText className="size-4" /></div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-slate-950 dark:text-slate-50">{item.title}</h3>
          <div className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">v{item.version} · {item.type} · {versions} 个版本</div>
        </div>
        <MoreHorizontal className="size-4 shrink-0 text-slate-400 dark:text-slate-500" />
      </div>

      <div className="mt-4 space-y-2 text-xs text-slate-500 dark:text-slate-400">
        <div className="flex min-w-0 gap-2"><span className="shrink-0 text-slate-400 dark:text-slate-500">来源对话</span><span className="truncate">{item.conversationTitle ?? '未命名会话'}</span></div>
        <div className="flex min-w-0 gap-2"><span className="shrink-0 text-slate-400 dark:text-slate-500">创建者</span><span className="truncate font-mono text-[11px]">{item.createdByAgentId ?? 'Agent'}</span></div>
        <div className="flex min-w-0 gap-2"><span className="shrink-0 text-slate-400 dark:text-slate-500">更新时间</span><span className="truncate">{formatTime(item.createdAt)}</span></div>
      </div>

      <div className="mt-auto grid grid-cols-3 gap-2 border-t border-slate-100 pt-4 dark:border-white/10">
        <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs" onClick={onSelect}>详情</Button>
        <Button size="sm" className="h-8 rounded-lg text-xs" onClick={onPreview}>预览</Button>
        <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs" onClick={onOpenConversation}>打开会话</Button>
      </div>
    </article>
  )
}

function ArtifactDetailPanel({
  item,
  previewOpen,
  copied,
  exporting,
  deleting,
  onPreview,
  onCopyReference,
  onExport,
  onDelete,
  onOpenConversation,
  onClose,
}: {
  item?: ArtifactListItem
  previewOpen: boolean
  copied: boolean
  exporting: boolean
  deleting: boolean
  onPreview: (id: string) => void
  onCopyReference: (item: ArtifactListItem) => void
  onExport: (id: string) => void
  onDelete: (id: string) => void
  onOpenConversation: (conversationId: string) => void
  onClose: () => void
}) {
  return (
    <aside className={cn('hidden shrink-0 self-start rounded-xl border border-slate-200 bg-white shadow-[var(--agenthub-shadow-card)] dark:border-white/10 dark:bg-neutral-900 xl:sticky xl:top-[calc(var(--agenthub-titlebar-height,0px)+1rem)] xl:block', previewOpen ? 'w-[360px] 2xl:w-[380px]' : 'w-[360px]')}>
      {item ? (
        <div className="flex h-full flex-col">
          <div className="border-b border-slate-200 p-4 dark:border-white/10">
            <div className="flex items-start gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 ring-1 ring-slate-200 dark:bg-neutral-800 dark:text-slate-300 dark:ring-white/10">
                <FileText className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-base font-semibold tracking-tight text-slate-950 dark:text-slate-50">{item.title}</h2>
                  <span className="rounded-md border border-[var(--agenthub-accent-border)] bg-[var(--agenthub-accent-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--agenthub-accent)]">产物</span>
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{item.conversationTitle ?? '未命名会话'}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-100"
                title="关闭详情"
                aria-label="关闭详情"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-neutral-800 dark:text-slate-300">{item.type}</span>
              <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">v{item.version}</span>
              <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-neutral-800 dark:text-slate-300">可预览</span>
            </div>
          </div>
          <div className="space-y-3 p-4 text-sm">
              <DetailSection icon={<SlidersHorizontal className="size-4" />} title="元数据" aside={<SavedState />}>
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <Meta label="创建者" value={item.createdByAgentId ?? 'Agent'} />
                  <Meta label="来源会话" value={item.conversationTitle ?? '未命名'} />
                  <Meta label="创建时间" value={formatTime(item.createdAt)} />
                  <Meta label="更新时间" value={formatTime(item.createdAt)} />
                </div>
              </DetailSection>

              <DetailSection icon={<Wrench className="size-4" />} title="快捷操作">
                <div className="grid gap-2">
                  <Button onClick={() => onPreview(item.id)} className="rounded-lg">打开预览</Button>
                  <Button variant="outline" className="rounded-lg" onClick={() => onCopyReference(item)}>{copied ? '已复制' : '复制引用'}</Button>
                  <Button variant="outline" className="rounded-lg" disabled={exporting} onClick={() => onExport(item.id)}>{exporting ? '导出中…' : '导出源码'}</Button>
                  <Button variant="outline" className="rounded-lg" onClick={() => onOpenConversation(item.conversationId)}>打开会话</Button>
                  <Button variant="outline" className="rounded-lg border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/10" disabled={deleting} onClick={() => onDelete(item.id)}>
                    <Trash2 className="mr-2 size-4" />
                    {deleting ? '删除中…' : '删除产物'}
                  </Button>
                </div>
              </DetailSection>

              <DetailSection icon={<History className="size-4" />} title="版本历史">
                <HistoryRow icon={<FileCode2 className="size-4" />} title={`当前版本 v${item.version}`} description="已按 parentArtifactId 聚合版本；详情历史列表可继续扩展。" time="已接入" />
              </DetailSection>

              <DetailSection icon={<FileText className="size-4" />} title="产物标识">
                <div className="truncate rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-500 dark:border-white/10 dark:bg-neutral-950/50 dark:text-slate-400">{item.id}</div>
              </DetailSection>
          </div>
        </div>
      ) : (
        <div className="flex h-full items-center justify-center p-8 text-center text-sm text-slate-500 dark:text-slate-400">选择一个产物查看详情</div>
      )}
    </aside>
  )
}

function automationStatusLabel(status: AutomationStatus): AutomationTaskPreset['status'] {
  if (status === 'running') return '运行中'
  if (status === 'enabled') return '已启用'
  if (status === 'paused') return '已暂停'
  return '待配置'
}

function automationStatusClassName(status: AutomationStatus): string {
  if (status === 'running') return 'bg-emerald-50 text-emerald-600'
  if (status === 'enabled') return 'bg-[var(--agenthub-accent-soft)] text-[var(--agenthub-accent)]'
  if (status === 'paused') return 'bg-slate-100 text-slate-500'
  return 'bg-amber-50 text-amber-600'
}

function automationStatusDescription(status: AutomationStatus): string {
  if (status === 'running') return '已有运行记录处理中，页面会自动同步最新状态。'
  if (status === 'enabled') return '任务已启用，等待下一次触发。'
  if (status === 'paused') return '任务已暂停，不会自动触发。'
  return '任务仍需补全配置后才能运行。'
}

function mapAutomationTask(item: AutomationListItem): AutomationTaskPreset {
  const iconStyle = AUTOMATION_ICON_STYLES[item.iconKey]
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    category: item.category,
    cadence: item.cadence,
    latestRun: item.latestRunAt ? formatRelativeRunTime(item.latestRunAt) : '尚未运行',
    latestRunAt: item.latestRunAt,
    rawStatus: item.status,
    status: automationStatusLabel(item.status),
    statusClassName: automationStatusClassName(item.status),
    lastError: item.lastError,
    prompt: item.prompt,
    agentId: item.agentId,
    conversationId: item.conversationId,
    scheduleType: item.scheduleType,
    scheduleConfig: item.scheduleConfig,
    nextRunAt: item.nextRunAt,
    ...iconStyle,
  }
}

function mapAutomationRun(item: AutomationRunListItem): AnalyticsRunRecord {
  return {
    id: item.id,
    title: item.title,
    category: item.category,
    status: item.status === 'success' ? '成功' : item.status === 'running' ? '运行中' : '失败',
    duration: item.status === 'running' ? '进行中' : formatDuration(item.durationMs),
    time: formatRelativeRunTime(item.startedAt),
  }
}

function formatDuration(value: number | null): string {
  if (value === null) return '—'
  const totalSeconds = Math.max(0, Math.round(value / 1000))
  if (totalSeconds < 60) return `${totalSeconds}s`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`
}

function formatRelativeRunTime(value: number): string {
  const now = new Date()
  const target = new Date(value)
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const targetDay = new Date(target)
  targetDay.setHours(0, 0, 0, 0)
  const diffDays = Math.round((today.getTime() - targetDay.getTime()) / (24 * 60 * 60 * 1000))
  const clock = target.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  if (diffDays === 0) return `今日 ${clock}`
  if (diffDays === 1) return `昨日 ${clock}`
  if (diffDays > 1 && diffDays < 7) return `${diffDays} 天前`
  return target.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

function formatSyncTime(value: number | null): string {
  if (value === null) return '尚未同步'
  const date = new Date(value)
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function formatDateTime(value: number | null): string {
  if (value === null) return '—'
  return new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function scheduleConfigField(config: unknown, key: string): string {
  if (!config || typeof config !== 'object' || !(key in config)) return ''
  const value = (config as Record<string, unknown>)[key]
  return typeof value === 'number' || typeof value === 'string' ? String(value) : ''
}

function buildAutomationSaveBody(form: AutomationFormState): SaveAutomationBody {
  const scheduleConfig =
    form.scheduleType === 'interval'
      ? { intervalMinutes: Number(form.intervalMinutes || 60) }
      : form.scheduleType === 'daily'
        ? { timeOfDay: form.timeOfDay || '09:00' }
        : form.scheduleType === 'weekly'
          ? { dayOfWeek: Number(form.dayOfWeek || 1), timeOfDay: form.timeOfDay || '09:00' }
          : undefined

  return {
    title: form.title.trim(),
    description: form.description.trim(),
    category: form.category.trim(),
    prompt: form.prompt.trim(),
    agentId: form.agentId || null,
    conversationId: form.conversationId || null,
    scheduleType: form.scheduleType,
    scheduleConfig,
    status: form.status,
  }
}

function buildAutomationPromptEnhanceInput(form: AutomationFormState): string {
  const scheduleLabel =
    form.scheduleType === 'interval'
      ? `每 ${form.intervalMinutes || '60'} 分钟执行一次`
      : form.scheduleType === 'daily'
        ? `每天 ${form.timeOfDay || '09:00'} 执行`
        : form.scheduleType === 'weekly'
          ? `每周 ${WEEKDAY_LABELS[Number(form.dayOfWeek || 1)] ?? '周一'} ${form.timeOfDay || '09:00'} 执行`
          : '手动触发'

  return [
    '请为一个 AgentHub 自动化任务生成可直接保存执行的任务提示词。',
    `任务标题：${form.title.trim() || '未命名自动化任务'}`,
    `任务分类：${form.category.trim() || '自定义任务'}`,
    form.description.trim() ? `任务描述：${form.description.trim()}` : '',
    `触发方式：${scheduleLabel}`,
    form.prompt.trim() ? `当前提示词草稿：${form.prompt.trim()}` : '',
    '要求：输出中文；说明清楚目标、输入范围、执行步骤和最终输出格式；不要输出额外解释。',
  ].filter((line) => line.length > 0).join('\n')
}

function trendBarHeight(value: number, maxValue: number): number {
  if (value <= 0) return 4
  return Math.round(18 + (value / Math.max(maxValue, 1)) * 68)
}

type LoadDashboardOptions = {
  silent?: boolean
}

type AutomationFormState = {
  title: string
  description: string
  category: string
  prompt: string
  agentId: string
  conversationId: string
  scheduleType: AutomationScheduleType
  intervalMinutes: string
  timeOfDay: string
  dayOfWeek: string
  status: Exclude<AutomationStatus, 'running'>
}

function automationFormFromTask(task?: AutomationTaskPreset | null): AutomationFormState {
  return {
    title: task?.title ?? '',
    description: task?.description ?? '',
    category: task?.category ?? '自定义任务',
    prompt: task?.prompt ?? '',
    agentId: task?.agentId ?? '',
    conversationId: task?.conversationId ?? '',
    scheduleType: task?.scheduleType ?? 'manual',
    intervalMinutes: scheduleConfigField(task?.scheduleConfig, 'intervalMinutes') || '60',
    timeOfDay: scheduleConfigField(task?.scheduleConfig, 'timeOfDay') || '09:00',
    dayOfWeek: scheduleConfigField(task?.scheduleConfig, 'dayOfWeek') || '1',
    status: task?.rawStatus === 'enabled' || task?.rawStatus === 'paused' || task?.rawStatus === 'draft' ? task.rawStatus : 'draft',
  }
}

function AutomationWorkspace() {
  const [dashboard, setDashboard] = useState<AutomationDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [showAllRuns, setShowAllRuns] = useState(false)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit' | null>(null)
  const [form, setForm] = useState<AutomationFormState>(() => automationFormFromTask())
  const [submitting, setSubmitting] = useState(false)
  const [promptFilling, setPromptFilling] = useState(false)
  const [promptEnhanceOpen, setPromptEnhanceOpen] = useState(false)
  const [promptEnhanceOriginal, setPromptEnhanceOriginal] = useState('')
  const [promptEnhanceResult, setPromptEnhanceResult] = useState('')
  const [promptEnhanceError, setPromptEnhanceError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [runHistory, setRunHistory] = useState<AutomationRunDetailItem[]>([])
  const [runHistoryLoading, setRunHistoryLoading] = useState(false)
  const [runsError, setRunsError] = useState<string | null>(null)
  const requestSeqRef = useRef(0)
  const hasDashboardRef = useRef(false)

  const loadDashboard = useCallback(async (options: LoadDashboardOptions = {}) => {
    const requestSeq = requestSeqRef.current + 1
    requestSeqRef.current = requestSeq
    const hasDashboard = hasDashboardRef.current
    if (!options.silent) {
      if (hasDashboard) setRefreshing(true)
      else setLoading(true)
      setError(null)
    }
    try {
      const nextDashboard = await fetchAutomationDashboard()
      if (requestSeq !== requestSeqRef.current) return
      setDashboard(nextDashboard)
      hasDashboardRef.current = true
      setLastUpdatedAt(Date.now())
      setError(null)
    } catch (err) {
      if (requestSeq !== requestSeqRef.current) return
      const message = err instanceof Error ? err.message : '自动化数据加载失败'
      setError(hasDashboard ? `同步失败，当前显示上次同步数据：${message}` : message)
    } finally {
      if (requestSeq === requestSeqRef.current && !options.silent) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [])

  useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

  const hasRunningState = useMemo(
    () => Boolean(dashboard?.automations.some((item) => item.status === 'running') || dashboard?.recentRuns.some((run) => run.status === 'running')),
    [dashboard],
  )

  useEffect(() => {
    if (!hasRunningState) return
    const timer = window.setInterval(() => {
      void loadDashboard({ silent: true })
    }, 5000)
    return () => window.clearInterval(timer)
  }, [hasRunningState, loadDashboard])

  useEffect(() => {
    if (!selectedTaskId) {
      setRunHistory([])
      setRunsError(null)
      return
    }
    let cancelled = false
    setRunHistoryLoading(true)
    setRunsError(null)
    fetchAutomationRuns(selectedTaskId)
      .then((runs) => {
        if (!cancelled) setRunHistory(runs)
      })
      .catch((err) => {
        if (!cancelled) setRunsError(err instanceof Error ? err.message : '运行记录加载失败')
      })
      .finally(() => {
        if (!cancelled) setRunHistoryLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedTaskId, dashboard])

  const tasks = useMemo(
    () => (dashboard?.automations ?? []).map(mapAutomationTask),
    [dashboard?.automations],
  )
  const recentRuns = useMemo(
    () => (dashboard?.recentRuns ?? []).map(mapAutomationRun),
    [dashboard?.recentRuns],
  )
  const visibleRuns = showAllRuns ? recentRuns : recentRuns.slice(0, 4)
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null
  const trend = dashboard?.trend ?? []
  const maxTrend = Math.max(...trend.map((point) => point.value), 1)
  const syncBadge = refreshing ? '同步中' : hasRunningState ? '自动刷新' : '已同步'
  const initialLoading = loading && !dashboard
  const agents = useAgentList()
  const conversations = useConversationList()
  const addNotification = useAppStore((s) => s.addNotification)

  const notifyAutomation = useCallback((notification: Omit<AppNotification, 'id' | 'createdAt' | 'source'>) => {
    addNotification({
      ...notification,
      id: `ntf_${nanoid()}`,
      source: 'ui',
      createdAt: Date.now(),
    })
  }, [addNotification])

  const openCreateDialog = () => {
    setForm(automationFormFromTask())
    setDialogMode('create')
    setError(null)
  }

  const openEditDialog = () => {
    if (!selectedTask) return
    setForm(automationFormFromTask(selectedTask))
    setDialogMode('edit')
    setError(null)
  }

  const handleSaveAutomation = async () => {
    if (!form.title.trim() || !form.prompt.trim()) {
      setError('标题和任务提示词不能为空')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const body = buildAutomationSaveBody(form)
      const saved = dialogMode === 'edit' && selectedTask ? await updateAutomation(selectedTask.id, body) : await createAutomation(body)
      setDialogMode(null)
      setSelectedTaskId(saved.id)
      notifyAutomation({
        title: dialogMode === 'edit' ? '自动化任务已更新' : '自动化任务已创建',
        body: `任务「${saved.title}」已保存。`,
        level: 'success',
        automationId: saved.id,
      })
      await loadDashboard()
    } catch (err) {
      const message = err instanceof Error ? err.message : '自动化任务保存失败'
      setError(message)
      notifyAutomation({ title: '自动化任务保存失败', body: message, level: 'error', urgent: true })
    } finally {
      setSubmitting(false)
    }
  }

  const handleEnhanceAutomationPrompt = async () => {
    if (!form.title.trim() && !form.description.trim() && !form.prompt.trim()) {
      setError('请先填写标题、描述或任务提示词，再使用 AI 优化提示词')
      return
    }

    const originalPrompt = form.prompt.trim()
    const originalText = originalPrompt || '未输入原始提示词，AI 将根据任务标题、描述、分类和触发计划生成。'
    setPromptFilling(true)
    setPromptEnhanceOriginal(originalText)
    setPromptEnhanceResult('')
    setPromptEnhanceError(null)
    setPromptEnhanceOpen(true)
    setError(null)
    try {
      const result = await optimizePrompt(buildAutomationPromptEnhanceInput(form))
      setPromptEnhanceResult(result.enhancedText.trim())
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI 优化提示词失败'
      setPromptEnhanceError(message)
      setError(message)
      notifyAutomation({ title: 'AI 优化提示词失败', body: message, level: 'error' })
    } finally {
      setPromptFilling(false)
    }
  }

  const handleAutomationAction = async (action: 'enable' | 'disable' | 'run' | 'delete') => {
    if (!selectedTask) return
    setActionLoading(action)
    setError(null)
    try {
      if (action === 'enable') await enableAutomation(selectedTask.id)
      if (action === 'disable') await disableAutomation(selectedTask.id)
      if (action === 'run') await runAutomationNow(selectedTask.id)
      if (action === 'delete') {
        if (!window.confirm(`确认删除自动化任务「${selectedTask.title}」？`)) return
        await deleteAutomation(selectedTask.id)
        setSelectedTaskId(null)
      }
      notifyAutomation({
        title: action === 'run' ? '已提交自动化运行' : action === 'delete' ? '自动化任务已删除' : '自动化任务状态已更新',
        body: action === 'run' ? `任务「${selectedTask.title}」已开始执行。` : `任务「${selectedTask.title}」操作已完成。`,
        level: 'success',
        automationId: selectedTask.id,
      })
      await loadDashboard()
    } catch (err) {
      const message = err instanceof Error ? err.message : '自动化操作失败'
      setError(message)
      notifyAutomation({ title: '自动化操作失败', body: message, level: 'error', automationId: selectedTask.id, urgent: true })
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="h-full p-4 xl:p-6">
      <section className="flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/70">
        <div className="shrink-0 border-b border-slate-100 p-4 xl:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold tracking-tight text-slate-950">自动化</h1>
              <p className="mt-1 text-sm text-slate-500">管理自动化任务并查看近期运行记录</p>
              <p className="mt-1 text-xs text-slate-400">最近同步：{formatSyncTime(lastUpdatedAt)}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" disabled={refreshing} onClick={() => void loadDashboard()} className="h-9 rounded-xl border-slate-200 px-3 text-xs text-slate-700 transition hover:border-[var(--agenthub-accent-border)] hover:bg-slate-100 hover:text-slate-900">
                <RefreshCw className={cn('mr-1.5 size-3.5', refreshing && 'animate-spin')} />
                {refreshing ? '同步中' : '刷新'}
              </Button>
              <Button variant="outline" onClick={openCreateDialog} className="h-9 rounded-xl border-slate-200 px-3 text-xs text-slate-700 transition hover:border-[var(--agenthub-accent-border)] hover:bg-slate-100 hover:text-slate-900">
                <Plus className="mr-1.5 size-3.5" />
                添加
              </Button>
            </div>
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-5 p-4 xl:p-5">
            {error && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-100 bg-rose-50 p-3 text-xs text-rose-600">
                <span>自动化数据加载失败：{error}</span>
                <Button variant="outline" onClick={() => void loadDashboard()} className="h-8 rounded-xl border-rose-200 px-3 text-xs text-rose-600 hover:bg-rose-100">
                  重试
                </Button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <LibraryStat label="启用任务" value={initialLoading ? '—' : String(dashboard?.stats.enabledCount ?? 0)} />
              <LibraryStat label="今日运行" value={initialLoading ? '—' : String(dashboard?.stats.todayRunCount ?? 0)} />
              <LibraryStat label="成功率" value={initialLoading ? '—' : `${dashboard?.stats.successRate ?? 0}%`} />
              <LibraryStat label="待处理" value={initialLoading ? '—' : String(dashboard?.stats.pendingCount ?? 0)} />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {tasks.map((task) => (
                <AutomationTaskCard
                  key={task.id}
                  task={task}
                  selected={selectedTask?.id === task.id}
                  onSelect={(id) => setSelectedTaskId((current) => (current === id ? null : id))}
                />
              ))}
              {initialLoading && Array.from({ length: 3 }, (_, index) => (
                <div key={index} className="min-h-[168px] rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm" />
              ))}
            </div>
            {!initialLoading && tasks.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">暂无自动化任务，点击“添加”创建第一个任务。</div>
            )}

            {selectedTask && (
              <div className="rounded-2xl border border-[var(--agenthub-accent-border)] bg-[var(--agenthub-accent-soft)]/50 p-4 text-sm text-slate-700">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-base font-semibold text-slate-950">{selectedTask.title}</h2>
                      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', selectedTask.statusClassName)}>{selectedTask.status}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{automationStatusDescription(selectedTask.rawStatus)}</p>
                  </div>
                  <button type="button" onClick={() => setSelectedTaskId(null)} className="rounded-lg p-1 text-slate-400 transition hover:bg-white/70 hover:text-slate-700" aria-label="关闭自动化详情">
                    <X className="size-4" />
                  </button>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-4">
                  <Meta label="分类" value={selectedTask.category} />
                  <Meta label="触发时间" value={selectedTask.cadence} />
                  <Meta label="下次运行" value={formatDateTime(selectedTask.nextRunAt)} />
                  <Meta label="最近运行" value={selectedTask.latestRun} />
                </div>
                <div className="mt-4 rounded-xl border border-white/70 bg-white/70 p-3 text-xs text-slate-600">
                  <div className="font-medium text-slate-700">任务提示词</div>
                  <p className="mt-1 line-clamp-3 whitespace-pre-wrap">{selectedTask.prompt || '暂无提示词'}</p>
                  {selectedTask.lastError && <p className="mt-2 text-rose-600">最近错误：{selectedTask.lastError}</p>}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="outline" onClick={openEditDialog} className="h-8 rounded-xl bg-white px-3 text-xs">编辑</Button>
                  {selectedTask.rawStatus === 'enabled' || selectedTask.rawStatus === 'running' ? (
                    <Button variant="outline" disabled={actionLoading === 'disable'} onClick={() => void handleAutomationAction('disable')} className="h-8 rounded-xl bg-white px-3 text-xs">
                      {actionLoading === 'disable' ? '暂停中…' : '暂停'}
                    </Button>
                  ) : (
                    <Button variant="outline" disabled={actionLoading === 'enable'} onClick={() => void handleAutomationAction('enable')} className="h-8 rounded-xl bg-white px-3 text-xs">
                      {actionLoading === 'enable' ? '启用中…' : '启用'}
                    </Button>
                  )}
                  <Button disabled={actionLoading === 'run'} onClick={() => void handleAutomationAction('run')} className="h-8 rounded-xl px-3 text-xs">
                    {actionLoading === 'run' ? '提交中…' : '立即运行'}
                  </Button>
                  <Button variant="outline" disabled={actionLoading === 'delete'} onClick={() => void handleAutomationAction('delete')} className="h-8 rounded-xl border-red-200 bg-white px-3 text-xs text-red-600 hover:bg-red-50">
                    {actionLoading === 'delete' ? '删除中…' : '删除'}
                  </Button>
                </div>
                <div className="mt-4 rounded-xl border border-white/70 bg-white/70 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs font-medium text-slate-700">运行历史</div>
                    {runHistoryLoading && <span className="text-[10px] text-slate-400">加载中</span>}
                  </div>
                  {runsError && <p className="mt-2 text-xs text-rose-600">{runsError}</p>}
                  <div className="mt-2 space-y-2">
                    {runHistory.slice(0, 4).map((run) => (
                      <div key={run.id} className="rounded-lg border border-slate-100 bg-white p-2 text-xs text-slate-600">
                        <div className="flex items-center justify-between gap-2">
                          <span>{run.trigger === 'manual' ? '手动触发' : '计划触发'} · {run.status === 'success' ? '成功' : run.status === 'running' ? '运行中' : '失败'}</span>
                          <span className="text-slate-400">{formatRelativeRunTime(run.startedAt)}</span>
                        </div>
                        {run.error && <p className="mt-1 text-rose-600">{run.error}</p>}
                        {run.logs[0] && <p className="mt-1 text-slate-400">{run.logs[0].message}</p>}
                      </div>
                    ))}
                    {!runHistoryLoading && runHistory.length === 0 && <p className="text-xs text-slate-400">暂无运行历史</p>}
                  </div>
                </div>
              </div>
            )}

            <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-950">近期运行记录</h2>
                    <p className="mt-1 text-xs text-slate-500">按最近触发时间展示自动化任务状态</p>
                  </div>
                  <span className="rounded-full bg-[var(--agenthub-accent-soft)] px-2.5 py-1 text-xs font-medium text-[var(--agenthub-accent)]">{syncBadge}</span>
                </div>
                <div className="mt-4 space-y-2">
                  {visibleRuns.map((run) => (
                    <AutomationRunRow key={run.id} run={run} />
                  ))}
                  {!initialLoading && recentRuns.length > 4 && (
                    <Button variant="ghost" onClick={() => setShowAllRuns((open) => !open)} className="h-8 w-full rounded-xl text-xs text-slate-500 hover:bg-slate-50 hover:text-slate-800">
                      {showAllRuns ? '收起运行记录' : `查看全部 ${recentRuns.length} 条`}
                    </Button>
                  )}
                  {!initialLoading && recentRuns.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500">暂无运行记录</div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-2">
                  <div className="flex size-8 items-center justify-center rounded-xl bg-white text-[var(--agenthub-accent)] shadow-sm">
                    <TrendingUp className="size-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-slate-950">运行概览</h2>
                    <p className="text-xs text-slate-500">最近 7 天运行次数</p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-7 items-end gap-2 rounded-2xl border border-slate-200 bg-white p-3">
                  {trend.map((point) => (
                    <div key={point.label} className="flex min-h-[96px] flex-col items-center justify-end gap-2" title={`${point.label}：${point.value} 次`}>
                      <div className="flex h-[86px] w-full items-end justify-center rounded-full bg-blue-100/70">
                        <div className={cn('mx-auto w-3 rounded-full', point.value > 0 ? 'bg-[var(--agenthub-accent)]' : 'bg-slate-200')} style={{ height: `${trendBarHeight(point.value, maxTrend)}px` }} />
                      </div>
                      <span className="text-[10px] text-slate-400">{point.label.slice(1)}</span>
                    </div>
                  ))}
                  {initialLoading && Array.from({ length: 7 }, (_, index) => (
                    <div key={index} className="flex min-h-[96px] flex-col items-center justify-end gap-2">
                      <div className="flex h-[86px] w-full items-end justify-center rounded-full bg-blue-100/70">
                        <div className="mx-auto h-1 w-3 rounded-full bg-slate-200" />
                      </div>
                      <span className="text-[10px] text-slate-400">—</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>
        </ScrollArea>
      </section>

      <Dialog open={dialogMode !== null} onOpenChange={(open) => !open && setDialogMode(null)}>
        <DialogContent className="flex max-h-[calc(100vh-2rem)] max-w-2xl flex-col overflow-hidden rounded-2xl border-slate-200 bg-white p-0">
          <DialogHeader className="shrink-0 px-6 pt-6">
            <DialogTitle>{dialogMode === 'edit' ? '编辑自动化任务' : '创建自动化任务'}</DialogTitle>
            <DialogDescription>配置任务提示词、执行目标和基础触发计划。</DialogDescription>
          </DialogHeader>
          <ScrollArea className="min-h-0 flex-1 px-6">
            <div className="grid gap-3 py-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs text-slate-500">标题
                <Input value={form.title} onChange={(event) => setForm((draft) => ({ ...draft, title: event.target.value }))} className="mt-1" />
              </label>
              <label className="text-xs text-slate-500">分类
                <Input value={form.category} onChange={(event) => setForm((draft) => ({ ...draft, category: event.target.value }))} className="mt-1" />
              </label>
            </div>
            <label className="text-xs text-slate-500">描述
              <Input value={form.description} onChange={(event) => setForm((draft) => ({ ...draft, description: event.target.value }))} className="mt-1" />
            </label>
            <div>
              <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                <span>任务提示词</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  title={promptFilling ? 'AI 优化中' : 'AI 优化提示词'}
                  aria-label="AI 优化提示词"
                  onClick={() => void handleEnhanceAutomationPrompt()}
                  disabled={promptFilling || submitting}
                  className="group relative size-7 rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-[var(--agenthub-accent)] disabled:cursor-wait disabled:opacity-60"
                >
                  <Sparkles className={cn('size-3.5', promptFilling && 'animate-pulse')} />
                  <span className="pointer-events-none absolute right-0 top-full z-10 mt-1 hidden whitespace-nowrap rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-normal text-slate-600 shadow-sm group-hover:block">
                    {promptFilling ? 'AI 优化中' : 'AI 优化提示词'}
                  </span>
                </Button>
              </div>
              <Textarea value={form.prompt} onChange={(event) => setForm((draft) => ({ ...draft, prompt: event.target.value }))} className="mt-1 min-h-32 max-h-64 resize-y whitespace-pre-wrap break-words" />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs text-slate-500">目标 Agent
                <select value={form.agentId} onChange={(event) => setForm((draft) => ({ ...draft, agentId: event.target.value }))} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm">
                  <option value="">自动选择</option>
                  {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
                </select>
              </label>
              <label className="text-xs text-slate-500">目标会话
                <select value={form.conversationId} onChange={(event) => setForm((draft) => ({ ...draft, conversationId: event.target.value }))} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm">
                  <option value="">未绑定</option>
                  {conversations.map((conversation) => <option key={conversation.id} value={conversation.id}>{conversation.title}</option>)}
                </select>
              </label>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <label className="text-xs text-slate-500">触发类型
                <select value={form.scheduleType} onChange={(event) => setForm((draft) => ({ ...draft, scheduleType: event.target.value as AutomationScheduleType }))} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm">
                  <option value="manual">手动</option>
                  <option value="interval">间隔</option>
                  <option value="daily">每天</option>
                  <option value="weekly">每周</option>
                </select>
              </label>
              {form.scheduleType === 'interval' && (
                <label className="text-xs text-slate-500">间隔分钟
                  <Input type="number" min={1} value={form.intervalMinutes} onChange={(event) => setForm((draft) => ({ ...draft, intervalMinutes: event.target.value }))} className="mt-1" />
                </label>
              )}
              {(form.scheduleType === 'daily' || form.scheduleType === 'weekly') && (
                <label className="text-xs text-slate-500">时间
                  <Input type="time" value={form.timeOfDay} onChange={(event) => setForm((draft) => ({ ...draft, timeOfDay: event.target.value }))} className="mt-1" />
                </label>
              )}
              {form.scheduleType === 'weekly' && (
                <label className="text-xs text-slate-500">星期
                  <select value={form.dayOfWeek} onChange={(event) => setForm((draft) => ({ ...draft, dayOfWeek: event.target.value }))} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm">
                    <option value="1">周一</option><option value="2">周二</option><option value="3">周三</option><option value="4">周四</option><option value="5">周五</option><option value="6">周六</option><option value="0">周日</option>
                  </select>
                </label>
              )}
              <label className="text-xs text-slate-500">状态
                <select value={form.status} onChange={(event) => setForm((draft) => ({ ...draft, status: event.target.value as Exclude<AutomationStatus, 'running'> }))} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm">
                  <option value="draft">草稿</option>
                  <option value="enabled">启用</option>
                  <option value="paused">暂停</option>
                </select>
              </label>
            </div>
            </div>
          </ScrollArea>
          <DialogFooter className="shrink-0 border-t border-slate-100 px-6 py-4">
            <Button variant="outline" onClick={() => setDialogMode(null)} disabled={submitting || promptFilling}>取消</Button>
            <Button onClick={() => void handleSaveAutomation()} disabled={submitting || promptFilling}>{submitting ? '保存中…' : '保存'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PromptEnhanceModal
        visible={promptEnhanceOpen}
        title={form.prompt.trim() ? 'AI 优化提示词' : 'AI 生成提示词'}
        description={form.prompt.trim() ? '对比原始提示词和优化后的提示词，选择继续使用原版或替换为优化版。' : '当前未输入提示词，AI 会根据任务信息生成一份可执行提示词。'}
        originalLabel="原始提示词"
        enhancedLabel={form.prompt.trim() ? '优化后的提示词' : '生成后的提示词'}
        loadingText={form.prompt.trim() ? '正在优化提示词…' : '正在生成提示词…'}
        keepOriginalText="使用原版"
        useEnhancedText={form.prompt.trim() ? '使用优化版' : '使用生成版'}
        originalText={promptEnhanceOriginal}
        enhancedText={promptEnhanceResult}
        loading={promptFilling}
        error={promptEnhanceError}
        onOpenChange={(open) => {
          if (!promptFilling) setPromptEnhanceOpen(open)
        }}
        onKeepOriginal={() => setPromptEnhanceOpen(false)}
        onUseEnhanced={() => {
          setForm((draft) => ({ ...draft, prompt: promptEnhanceResult }))
          setPromptEnhanceOpen(false)
          notifyAutomation({ title: '提示词已更新', body: '已使用 AI 处理后的提示词。', level: 'success' })
        }}
      />
    </div>
  )
}

function AutomationTaskCard({
  task,
  selected,
  onSelect,
}: {
  task: AutomationTaskPreset
  selected: boolean
  onSelect: (id: string) => void
}) {
  const Icon = task.icon

  return (
    <button
      type="button"
      onClick={() => onSelect(task.id)}
      className={cn(
        'group rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-[var(--agenthub-accent-border)] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[var(--agenthub-accent-border)]',
        selected && 'border-[var(--agenthub-accent-border)] shadow-md',
      )}
      aria-pressed={selected}
    >
      <div className="flex items-start gap-3">
        <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-2xl transition duration-200 group-hover:scale-105', task.iconWrapClassName)}>
          <Icon className={cn('size-5', task.iconClassName)} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate text-base font-semibold text-slate-950">{task.title}</h3>
            <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium', task.statusClassName)}>
              {task.status}
            </span>
          </div>
          <p className="mt-1 truncate text-sm text-slate-500">{task.description}</p>
          <p className="mt-1 text-xs text-slate-400">{task.category}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-4">
        <Meta label="触发时间" value={task.cadence} />
        <Meta label="最近运行" value={task.latestRun} />
      </div>
    </button>
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
            <Button variant="outline" className="h-9 rounded-xl border-slate-200 px-3 text-xs text-slate-700 hover:border-[var(--agenthub-accent-border)] hover:bg-slate-100 hover:text-slate-900">
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
                        <div className="w-full max-w-8 rounded-t-2xl bg-[var(--agenthub-accent)] transition hover:bg-[var(--agenthub-accent-hover)]" style={{ height: `${Math.max(14, (point.value / maxTrend) * 100)}%` }} />
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
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-[var(--agenthub-accent-border)] hover:shadow-md">
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
      ? 'bg-[var(--agenthub-accent-soft)] text-[var(--agenthub-accent)]'
      : 'bg-rose-50 text-rose-600'

  return (
    <div className={cn('grid gap-3 border-slate-100 bg-white p-3 transition hover:bg-[var(--agenthub-accent-soft)]/40 sm:grid-cols-[minmax(0,1.3fr)_120px_88px_88px_80px] sm:items-center', table ? 'border-b last:border-b-0' : 'rounded-2xl border')}>
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
    <section className="rounded-lg border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-neutral-950/30">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500 dark:bg-neutral-800 dark:text-slate-400">
            {icon}
          </div>
          <h3 className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
        </div>
        {aside && <div className="shrink-0 text-xs text-slate-400 dark:text-slate-500">{aside}</div>}
      </div>
      {children}
    </section>
  )
}

function SavedState() {
  return (
    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-300">
      <CheckCircle2 className="size-3" />
      已保存
    </span>
  )
}

function PermissionRow({ name, code }: { name: string; code: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 transition hover:border-slate-300 hover:bg-slate-100 dark:border-white/10 dark:bg-neutral-950/40 dark:hover:border-white/15 dark:hover:bg-neutral-800/70">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-white text-slate-500 dark:bg-neutral-800 dark:text-slate-400">
        <Wrench className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium text-slate-800 dark:text-slate-100">{name}</div>
        <div className="mt-0.5 truncate font-mono text-[10px] text-slate-400 dark:text-slate-500">{code}</div>
      </div>
      <CheckCircle2 className="size-4 shrink-0 text-emerald-500 dark:text-emerald-300" />
    </div>
  )
}

function HistoryRow({ icon, title, description, time }: { icon: React.ReactNode; title: string; description: string; time: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 transition hover:border-slate-300 hover:bg-slate-100 dark:border-white/10 dark:bg-neutral-950/40 dark:hover:border-white/15 dark:hover:bg-neutral-800/70">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-white text-slate-500 dark:bg-neutral-800 dark:text-slate-400">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium text-slate-800 dark:text-slate-100">{title}</div>
        <div className="mt-0.5 truncate text-[10px] text-slate-500 dark:text-slate-400">{description}</div>
      </div>
      <div className="shrink-0 text-[10px] text-slate-400 dark:text-slate-500">{time}</div>
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
  return <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 dark:border-white/10 dark:bg-neutral-950/40"><div className="text-[10px] text-slate-400 dark:text-slate-500">{label}</div><div className="mt-1 truncate text-xs text-slate-700 dark:text-slate-200">{value}</div></div>
}

function formatTime(value: number) {
  return new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}
