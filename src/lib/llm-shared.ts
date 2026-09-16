/**
 * LLM 相关的纯类型 + 常量（不依赖 db / better-sqlite3）。
 *
 * Client Component 只能从这里 import，不能从 @/server/*-service import，
 * 因为 service 文件顶部 import 了 db（better-sqlite3 → fs），会被打包到浏览器。
 */
import type { ModelProvider } from '@/shared/types'

export type ProviderType = 'anthropic' | 'openai' | 'deepseek' | 'ark' | 'custom'

/**
 * llm_providers.id → 运行时 ModelProvider（`agents.model_provider` 那一套）。
 *
 * 供应商列表里的四个内置 id 与 ModelProvider 基本同名，只有 ark ↔ volcano-ark 要换名；
 * 其余（含用户自定义供应商）一律走 openai-compatible 协议。
 */
export function providerIdToModelProvider(providerId: string | null | undefined): ModelProvider {
  if (providerId === 'ark') return 'volcano-ark'
  if (providerId === 'anthropic' || providerId === 'openai' || providerId === 'deepseek') return providerId
  return 'openai-compatible'
}

/** 内置供应商的默认配置（Base URL + 常用模型）。 */
export const BUILTIN_PROVIDERS: Record<
  string,
  { providerType: ProviderType; displayName: string; baseUrl?: string; models: string[] }
> = {
  anthropic: {
    providerType: 'anthropic',
    displayName: 'Anthropic',
    baseUrl: 'https://api.anthropic.com',
    models: ['claude-opus-4-7', 'claude-sonnet-4-5', 'claude-haiku-4-5'],
  },
  openai: {
    providerType: 'openai',
    displayName: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-5', 'gpt-4o', 'gpt-4o-mini'],
  },
  deepseek: {
    providerType: 'deepseek',
    displayName: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-v4-flash', 'deepseek-v4'],
  },
  ark: {
    providerType: 'ark',
    displayName: 'Volcano Ark',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    models: ['doubao-1-5-pro-32k', 'doubao-1-5-lite-32k'],
  },
}

export const BUILTIN_PROVIDER_IDS = Object.keys(BUILTIN_PROVIDERS)

export type AssignmentScope = 'global' | 'system' | 'agent'

/** 预定义的系统能力（UI 用）。 */
export const SYSTEM_CAPABILITIES = [
  { key: 'prompt_optimize', label: '提示词增强', description: '自动化 / 任务描述的 AI 优化' },
  { key: 'task_planning', label: '任务规划', description: 'Orchestrator 拆解子任务' },
  { key: 'context_summary', label: '上下文摘要', description: '长对话 / 长文档摘要' },
  { key: 'system_chat', label: '系统对话', description: '系统级对话 / 问答' },
] as const

/** 预定义的 Agent 能力（UI 用）。 */
export const AGENT_CAPABILITIES = [
  { key: 'agent:default', label: '默认 Agent', description: '未单独指定的 Agent' },
  { key: 'agent:code', label: '代码 Agent', description: '编程 / 调试 / 重构' },
  { key: 'agent:research', label: '研究 Agent', description: '资料检索 / 调研 / 分析' },
  { key: 'agent:design', label: '设计 Agent', description: 'UI / 视觉 / 原型' },
  { key: 'agent:writer', label: '写作 Agent', description: '文案 / 报告 / 摘要' },
] as const

/**
 * Agent 模态分类 —— 用于创建时自动匹配模型。
 *
 * 只保留常用开发会碰到的四类：写代码、写文本、识图、生图。音频与「多模态」两类早期有、
 * 但实际没有对应能力也没有对应模型，留着只会在策略面板里占位置，已归并到最接近的类型。
 */
export type AgentModality = 'text' | 'vision' | 'image' | 'code'

/**
 * 四类模态的展示元数据 —— UI 选择与 `MODALITY_CAPABILITIES` 的唯一真相源。
 *
 * 顺序即智能体模型分配面板里的排列顺序（`MODALITY_CAPABILITIES` 由它派生）。
 */
export const MODALITY_OPTIONS: ReadonlyArray<{
  value: AgentModality
  label: string
  description: string
}> = [
  { value: 'code', label: '代码', description: '编程 / 调试 / 重构' },
  { value: 'text', label: '文本', description: '文案 / 写作 / 对话 / 分析' },
  { value: 'vision', label: '视觉', description: '识图 / 截图理解 / 设计稿分析' },
  { value: 'image', label: '生图', description: '生成图片 / 海报 / 插画' },
]

export function modalityToCapabilityKey(modality: AgentModality): string {
  return `agent:${modality}`
}

export const MODALITY_CAPABILITIES: Array<{ key: string; label: string; description: string }> =
  MODALITY_OPTIONS.map((m) => ({
    key: modalityToCapabilityKey(m.value),
    label: `${m.label} Agent`,
    description: m.description,
  }))

/** 历史模态 → 现行四类的归并映射，保证旧 agent / 旧数值不悬空。 */
const MODALITY_ALIASES: Record<string, AgentModality> = {
  audio: 'text',
  multimodal: 'vision',
}

export function normalizeModality(value: string | null | undefined): AgentModality {
  const raw = value?.trim()
  if (!raw) return 'text'
  if (raw === 'text' || raw === 'vision' || raw === 'image' || raw === 'code') return raw
  return MODALITY_ALIASES[raw] ?? 'text'
}

/** 全局策略的 capabilityKey。 */
export const GLOBAL_KEYS = {
  defaultProvider: 'global:default_provider',
  fallbackProvider: 'global:fallback_provider',
  autoFailover: 'global:auto_failover',
} as const

/** provider-router 用的全局优先级 key（与 GLOBAL_KEYS 并存：前者是「默认供应商」，这个是「优先级链」）。 */
export const GLOBAL_PRIORITY_KEY = 'global:default'

// ─── 降级兜底（基线模型）───────────────────────────────────────
//
// 项目基线：deepseek 供应商 + deepseek-v4-flash。它是所有能力链的最后兜底。

export const FALLBACK_PROVIDER_ID = 'deepseek'
export const FALLBACK_MODEL_NAME = 'deepseek-v4-flash'

export interface ProviderUsage {
  systemCapabilities: string[]
  agentCapabilities: string[]
  globalKeys: string[]
}

export interface ResolvedModel {
  providerId: string
  modelName: string | null
}

export interface AssignmentUpsertInput {
  id?: string
  scope: AssignmentScope
  capabilityKey: string
  providerId?: string | null
  modelName?: string | null
  priority?: number
  /** 用途级配置是否使用全局优先级（scope != 'global' 时有效） */
  useGlobal?: boolean
}
