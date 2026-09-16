import type { ModelProvider } from './types'

export type AgentBuilderAdapter = 'custom' | 'claude-code' | 'codex' | 'image-gen'
export type AgentBuilderProvider = ModelProvider

export const AGENT_BUILDER_PROVIDER_DEFAULTS: Record<
  AgentBuilderProvider,
  { label: string; defaultModel: string }
> = {
  deepseek: { label: 'DeepSeek', defaultModel: 'deepseek-v4-flash' },
  anthropic: { label: 'Anthropic', defaultModel: 'claude-opus-4-7' },
  openai: { label: 'OpenAI', defaultModel: 'gpt-4o' },
  'volcano-ark': { label: '火山方舟 (豆包)', defaultModel: 'doubao-seed-2-0-lite-260428' },
  'openai-compatible': { label: 'OpenAI-compatible', defaultModel: '' },
}

export const CLAUDE_CODE_DEFAULT_MODEL = 'claude-opus-4-7'
export const CODEX_DEFAULT_MODEL = 'gpt-5-codex'

export const AVAILABLE_AGENT_TOOLS = [
  'write_artifact',
  'deploy_artifact',
  'deploy_workspace',
  'read_artifact',
  'read_attachment',
  'ask_user',
  'fs_list',
  'fs_read',
  'fs_write',
  'bash',
  'web_fetch',
  'web_search',
] as const

/**
 * 所有自定义 Agent 默认内嵌的联网工具。
 *
 * 创建 Agent 时就会写进工具集；AgentRunner 在组装运行时也会对 custom Agent 兜底注入一次，
 * 于是本次改动之前创建的存量 Agent 同样具备联网能力 —— 两处共用这一个常量，避免漂移。
 *
 * 为什么做成默认内嵌而不是可选项：联网检索是绝大多数任务的隐含前提。缺了它，Agent 只能
 * 拿 web_fetch 去手拼搜索引擎 URL 硬抓（实测一个子任务因此烧掉 40 分钟、50+ 次无效抓取）。
 */
export const ALWAYS_ON_AGENT_TOOLS = ['web_search', 'web_fetch'] as const

/** 保证工具名列表一定包含内嵌联网工具（保持原顺序，去重补齐）。 */
export function withAlwaysOnAgentTools(toolNames: readonly string[]): string[] {
  const out = [...toolNames]
  for (const name of ALWAYS_ON_AGENT_TOOLS) {
    if (!out.includes(name)) out.push(name)
  }
  return out
}

export type AgentToolName = (typeof AVAILABLE_AGENT_TOOLS)[number]
export type AgentToolPresetId = 'all-purpose' | 'local-code' | 'artifact' | 'review'

export interface AgentToolPreset {
  id: AgentToolPresetId
  label: string
  desc: string
  tools: readonly AgentToolName[]
}

export const AGENT_TOOL_PRESETS: readonly AgentToolPreset[] = [
  {
    id: 'all-purpose',
    label: '全栈通用',
    desc: '本地代码 + artifact 交付',
    tools: AVAILABLE_AGENT_TOOLS,
  },
  {
    id: 'local-code',
    label: '本地代码',
    desc: '读写 workspace 并运行命令',
    tools: ['deploy_workspace', 'read_artifact', 'read_attachment', 'ask_user', 'fs_list', 'fs_read', 'fs_write', 'bash', 'web_fetch', 'web_search'],
  },
  {
    id: 'artifact',
    label: '产物交付',
    desc: '网页、文档、原型卡片',
    tools: ['write_artifact', 'deploy_artifact', 'deploy_workspace', 'read_artifact', 'read_attachment', 'ask_user', 'web_fetch', 'web_search'],
  },
  {
    id: 'review',
    label: '审查验证',
    desc: '读取产物/文件并跑检查',
    tools: ['read_artifact', 'read_attachment', 'ask_user', 'fs_list', 'fs_read', 'bash', 'web_fetch', 'web_search'],
  },
]

export const DEFAULT_CUSTOM_AGENT_TOOLS = AGENT_TOOL_PRESETS[0].tools

export const AGENT_TOOL_META: Record<AgentToolName, { label: string; desc: string }> = {
  write_artifact: { label: '创建产物', desc: '生成可预览的代码 / 网页 / 文档 / PPT，支持多版本迭代' },
  deploy_artifact: { label: '部署网页', desc: '把网页产物发布为本地静态站点，生成预览链接与下载包' },
  deploy_workspace: { label: '部署目录', desc: '把工作区内 dist/build/out 等静态目录生成预览链接与下载包' },
  read_artifact: { label: '读取产物', desc: '查看会话中已有产物的完整内容，便于在其基础上继续改' },
  read_attachment: { label: '读取附件', desc: '读取用户上传的文本 / 文件附件内容' },
  ask_user: { label: '结构化提问', desc: '让用户在明确选项中选择，用于范围、风格、平台等关键澄清' },
  fs_list: { label: '列出文件', desc: '列出工作区内的目录和文件，用于安全探索项目结构' },
  fs_read: { label: '读取文件', desc: '读取工作区内的文件（源码 / 配置等），仅限沙箱目录' },
  fs_write: { label: '写入文件', desc: '在工作区内新建 / 修改文件；review 模式下需用户批准' },
  bash: { label: '执行命令', desc: '在工作区内运行命令行；受命令黑名单与沙箱目录约束' },
  web_fetch: { label: '读取网页', desc: '读取公开 HTTPS 网页文本；会阻断 localhost、私网、metadata endpoint 和二进制响应' },
  web_search: { label: '联网搜索', desc: '联网检索实时信息（新闻 / 行情 / 政策 / 文档），返回摘要与来源链接；抓搜索引擎结果页无效，检索一律走这个工具' },
}

export interface AgentDraftAssumption {
  label: string
  detail: string
}

export interface AgentToolPermissionSummary {
  toolName: AgentToolName
  label: string
  desc: string
}

export interface AgentConfigDraft {
  name: string
  avatar: string
  description: string
  capabilities: string[]
  systemPrompt: string
  adapterName: AgentBuilderAdapter
  modelProvider?: AgentBuilderProvider
  modelId?: string
  /** Agent 模态分类，用于自动匹配模型（text/vision/image/audio/code/multimodal）。 */
  modality?: string
  toolNames: AgentToolName[]
  supportsVision: boolean
  rationale: string[]
  assumptions: AgentDraftAssumption[]
  toolPermissionSummaries: AgentToolPermissionSummary[]
}

export interface AgentDraftRequest {
  intent: string
  followUp?: string
}

export interface AgentDraftResponse {
  draft: AgentConfigDraft
}

export function normalizeAgentToolNames(toolNames: readonly string[]): AgentToolName[] {
  const allowed = new Set<string>(AVAILABLE_AGENT_TOOLS)
  const seen = new Set<string>()
  const normalized: AgentToolName[] = []

  for (const toolName of toolNames) {
    if (!allowed.has(toolName) || seen.has(toolName)) continue
    seen.add(toolName)
    normalized.push(toolName as AgentToolName)
  }

  return normalized
}

export function getAgentToolPreset(presetId: AgentToolPresetId): AgentToolPreset {
  return AGENT_TOOL_PRESETS.find((preset) => preset.id === presetId) ?? AGENT_TOOL_PRESETS[0]
}

export function buildToolPermissionSummaries(
  toolNames: readonly string[],
): AgentToolPermissionSummary[] {
  // 与 AgentRunner 运行时对齐：联网工具是内嵌的，摘要里也要显示出来，
  // 否则预览说的工具集和实际跑起来的工具集对不上。
  return normalizeAgentToolNames(withAlwaysOnAgentTools(toolNames)).map((toolName) => ({
    toolName,
    ...AGENT_TOOL_META[toolName],
  }))
}

export function inferAgentToolPreset(intent: string, followUp?: string): AgentToolPresetId {
  const text = `${intent}\n${followUp ?? ''}`.toLowerCase()
  const wantsToWrite =
    /写|实现|开发|生成|创建|搭建|部署|build|implement|create|write|ship/.test(text) ||
    /修改(?!建议)/.test(text)
  const wantsReview = /审查|评审|检查|验证|验收|风险|review|audit|inspect|validate|verify/.test(text)
  if (wantsReview && !wantsToWrite) return 'review'

  if (
    /代码|源码|仓库|本地|文件|命令|终端|测试|修复|重构|调试|workspace|repo|repository|code|cli|bash|test|lint|debug|refactor/.test(
      text,
    )
  ) {
    return 'local-code'
  }

  if (
    /产物|网页|页面|原型|文档|报告|幻灯片|演示|图示|图表|设计稿|ppt|slides|presentation|website|document|diagram|mermaid|prototype/.test(
      text,
    )
  ) {
    return 'artifact'
  }

  return 'all-purpose'
}
