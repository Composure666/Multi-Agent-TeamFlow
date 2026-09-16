/**
 * LLM Provider 管理服务。
 *
 * 供应商负责「接入」：存储 API Key / Base URL / 可用模型 / 连接状态。
 * 模型分配（哪个能力用哪个供应商）由 model-assignment-service 负责。
 *
 * 内置供应商（id 固定）：anthropic / openai / deepseek / ark。
 * 自定义供应商 id 由 upsert 时生成（prov_xxx）。
 */
import { eq } from 'drizzle-orm'

import { db, schema } from '@/db/client'
import type { LlmProviderRow } from '@/db/schema'
import {
  BUILTIN_PROVIDER_IDS,
  BUILTIN_PROVIDERS,
  type ProviderType,
} from '@/lib/llm-shared'


// ─── CRUD ──────────────────────────────────────────────────────

export async function listProviders(): Promise<LlmProviderRow[]> {
  return db.query.llmProviders.findMany({
    orderBy: (p, { asc }) => [asc(p.createdAt)],
  })
}

export async function getProvider(id: string): Promise<LlmProviderRow | null> {
  const row = await db.query.llmProviders.findFirst({ where: eq(schema.llmProviders.id, id) })
  return row ?? null
}

export interface ProviderUpsertInput {
  id?: string
  providerType?: ProviderType
  displayName?: string
  apiKey?: string | null
  baseUrl?: string | null
  models?: string[]
  isConnected?: boolean
  lastTestedAt?: number | null
  lastError?: string | null
}

export async function upsertProvider(input: ProviderUpsertInput): Promise<LlmProviderRow> {
  const now = Date.now()
  const id = input.id ?? `prov_${Math.random().toString(36).slice(2, 10)}`
  const existing = await getProvider(id)
  const builtin = BUILTIN_PROVIDERS[id]

  const next: LlmProviderRow = {
    id,
    providerType: input.providerType ?? existing?.providerType ?? builtin?.providerType ?? 'custom',
    displayName: input.displayName ?? existing?.displayName ?? builtin?.displayName ?? '自定义供应商',
    apiKey: input.apiKey !== undefined ? input.apiKey : existing?.apiKey ?? null,
    baseUrl: input.baseUrl !== undefined ? input.baseUrl : existing?.baseUrl ?? builtin?.baseUrl ?? null,
    models: input.models ?? existing?.models ?? builtin?.models ?? [],
    isConnected: input.isConnected ?? existing?.isConnected ?? false,
    lastTestedAt: input.lastTestedAt !== undefined ? input.lastTestedAt : existing?.lastTestedAt ?? null,
    lastError: input.lastError !== undefined ? input.lastError : existing?.lastError ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }

  await db
    .insert(schema.llmProviders)
    .values(next)
    .onConflictDoUpdate({ target: schema.llmProviders.id, set: next })
  return next
}

export async function deleteProvider(id: string): Promise<void> {
  if (BUILTIN_PROVIDER_IDS.includes(id)) {
    // 内置供应商不删除，只清空 key
    await upsertProvider({ id, apiKey: null, isConnected: false })
    return
  }
  await db.delete(schema.llmProviders).where(eq(schema.llmProviders.id, id))
}

// ─── 连接测试 + 拉取模型列表 ────────────────────────────────────

/**
 * 从上游 {baseUrl}/models 拉取模型列表（OpenAI 兼容格式），并存入 llm_providers.models。
 * 返回拉到的模型名数组；失败返回 error。
 */
export async function fetchAndSaveModels(id: string): Promise<{ models: string[]; error?: string }> {
  const provider = await getProvider(id)
  if (!provider) return { models: [], error: '供应商不存在' }
  if (!provider.apiKey) return { models: [], error: '未配置 API Key' }
  const baseUrl = provider.baseUrl ?? BUILTIN_PROVIDERS[id]?.baseUrl
  if (!baseUrl) return { models: [], error: '未配置 Base URL' }

  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/models`, {
      headers: { Authorization: `Bearer ${provider.apiKey}` },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return { models: [], error: `HTTP ${res.status}` }
    const data = await res.json()
    const models: string[] = Array.isArray(data?.data)
      ? data.data.map((m: { id?: string }) => m?.id).filter(Boolean)
      : []
    if (models.length > 0) {
      await upsertProvider({ id, models })
    }
    return { models }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    return { models: [], error }
  }
}

/**
 * 测试供应商连接：发 GET /models 请求（OpenAI 兼容格式）。
 * 成功后自动拉取模型列表并存入 models 字段。
 */
export async function testProviderConnection(id: string): Promise<{ connected: boolean; error?: string; models?: string[] }> {
  const provider = await getProvider(id)
  if (!provider) return { connected: false, error: '供应商不存在' }
  if (!provider.apiKey) return { connected: false, error: '未配置 API Key' }

  const baseUrl = provider.baseUrl ?? BUILTIN_PROVIDERS[id]?.baseUrl
  if (!baseUrl) return { connected: false, error: '未配置 Base URL' }

  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/models`, {
      headers: { Authorization: `Bearer ${provider.apiKey}` },
      signal: AbortSignal.timeout(10000),
    })
    const connected = res.ok
    const error = connected ? undefined : `HTTP ${res.status}`
    await upsertProvider({ id, isConnected: connected, lastTestedAt: Date.now(), lastError: error ?? null })

    let models: string[] | undefined
    if (connected) {
      const fetched = await fetchAndSaveModels(id)
      models = fetched.models
    }
    return { connected, error, models }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    await upsertProvider({ id, isConnected: false, lastTestedAt: Date.now(), lastError: error })
    return { connected: false, error }
  }
}

// ─── 供应商 ↔ Agent 凭证解析 ────────────────────────────────────
//
// 「设置-模型分配」只存 (providerId, modelName)，而 Agent 运行时需要 apiKey + baseUrl。
// 创建 Agent 与运行时兜底都靠下面这两个函数把模型分配翻译成可用的凭证。

export function normalizeProviderBaseUrl(baseUrl: string | null | undefined): string {
  return (baseUrl ?? '').trim().replace(/\/+$/, '').toLowerCase()
}

/**
 * 按「请求实际会打到的端点」反查供应商行 id —— 归因（健康状态 / 冷却 / 切换事件）的依据。
 *
 * 为什么不直接用 `model_provider` 标签：那只是个标签，用户完全可能把它写成 `deepseek`
 * 而把 base URL 指向别的网关（线上就有 5 个这样的成员）。按标签归因的后果是
 * 「请求其实打到了 A，失败却被记在 B 头上」—— B 被冷却，而 B 恰好是链尾兜底，
 * 等于把兜底打死（线上实测：deepseek 被记了 500 次连续失败、状态 unavailable，
 * 而 401 里那个 key 根本不是 deepseek 的）。
 *
 * 匹配规则：先按规范化 baseUrl 找出候选行；再优先选 apiKey 完全一致的那行（最可靠），
 * 其次选 models 里含该模型的那行，最后退到第一行。
 * **端点匹配不上任何供应商行 → 返回 null（不归因给任何供应商）** —— 宁可不冷却，
 * 也不要把账算到没被调用的供应商头上。
 */
export async function findProviderIdForEndpoint(binding: {
  apiBaseUrl?: string | null
  apiKey?: string | null
  modelId?: string | null
}): Promise<string | null> {
  const target = normalizeProviderBaseUrl(binding.apiBaseUrl)
  if (!target) return null
  const rows = await db.query.llmProviders.findMany()
  const matched = rows.filter((r) => normalizeProviderBaseUrl(r.baseUrl) === target)
  if (matched.length === 0) return null
  const key = binding.apiKey?.trim()
  if (key) {
    const sameKey = matched.find((r) => (r.apiKey ?? '').trim() === key)
    if (sameKey) return sameKey.id
  }
  const modelId = binding.modelId?.trim()
  if (modelId) {
    const withModel = matched.find((r) => (r.models ?? []).includes(modelId))
    if (withModel) return withModel.id
  }
  return matched[0].id
}

export interface AgentModelBinding {
  modelProvider?: string | null
  modelId?: string | null
  apiBaseUrl?: string | null
}

/**
 * 找出 Agent 实际使用的供应商行。
 *
 * - 内置 provider（deepseek/openai/anthropic/volcano-ark）按 id 直接命中；
 * - openai-compatible 按 baseUrl 规范化后比对（同 baseUrl 多个候选时优先 models 里含该模型的）。
 */
export async function resolveProviderRowForAgent(agent: AgentModelBinding): Promise<LlmProviderRow | null> {
  const provider = agent.modelProvider ?? null
  const builtinId =
    provider === 'deepseek'
      ? 'deepseek'
      : provider === 'openai'
        ? 'openai'
        : provider === 'anthropic'
          ? 'anthropic'
          : provider === 'volcano-ark'
            ? 'ark'
            : null
  if (builtinId) {
    return (await db.query.llmProviders.findFirst({ where: eq(schema.llmProviders.id, builtinId) })) ?? null
  }

  const target = normalizeProviderBaseUrl(agent.apiBaseUrl)
  if (target) {
    const rows = await db.query.llmProviders.findMany()
    const matched = rows.filter((r) => normalizeProviderBaseUrl(r.baseUrl) === target)
    if (matched.length > 0) {
      if (agent.modelId) {
        const withModel = matched.find((r) => (r.models ?? []).includes(agent.modelId as string))
        if (withModel) return withModel
      }
      return matched[0]
    }
  }

  // 兜底：按模型名反查「设置-模型分配」。凡是分配表里配过的模型，都能找回它的供应商，
  // 这样「模型分配直接指定了模型、Agent 上没填 Base URL」的 Agent 也能自动拿到凭证。
  if (agent.modelId) {
    const assignments = await db.query.llmModelAssignments.findMany({
      where: eq(schema.llmModelAssignments.modelName, agent.modelId),
    })
    for (const a of assignments) {
      if (!a.providerId) continue
      const row = await db.query.llmProviders.findFirst({ where: eq(schema.llmProviders.id, a.providerId) })
      if (row?.apiKey?.trim()) return row
    }
  }

  return null
}

/**
 * 把「模型分配里的供应商」翻译成 Agent 可用的凭证。
 *
 * 只在 Agent 自己没填 key / baseUrl 时补，绝不覆盖 per-agent 的显式配置。
 * 返回 null 表示解析不出来（调用方保持原样，照旧报错提示用户手填）。
 */
export async function resolveProviderCredentialsForAgent(agent: AgentModelBinding): Promise<{
  providerId: string
  apiKey: string | null
  apiBaseUrl: string | null
} | null> {
  const row = await resolveProviderRowForAgent(agent)
  if (!row) return null
  const builtin = BUILTIN_PROVIDERS[row.id]
  return {
    providerId: row.id,
    apiKey: row.apiKey?.trim() || null,
    apiBaseUrl: row.baseUrl?.trim() || builtin?.baseUrl?.trim() || null,
  }
}

// ─── 从 app_settings 迁移（幂等） ───────────────────────────────

/**
 * 把 app_settings 里旧的 provider key 迁移到 llm_providers 表。
 * 只在 llm_providers 表为空时执行；已存在的供应商不覆盖。
 */
export async function migrateProvidersFromAppSettings(): Promise<void> {
  const existing = await listProviders()
  if (existing.length > 0) return

  const { getAppSettings } = await import('@/server/settings-service')
  const settings = await getAppSettings()
  const now = Date.now()

  const migrations: Array<{ id: string; apiKey: string | null; baseUrl: string | null }> = [
    { id: 'anthropic', apiKey: settings.anthropicApiKey, baseUrl: settings.anthropicBaseUrl },
    { id: 'openai', apiKey: settings.openaiApiKey, baseUrl: null },
    { id: 'deepseek', apiKey: settings.deepseekApiKey, baseUrl: null },
    { id: 'ark', apiKey: settings.arkApiKey, baseUrl: null },
  ]

  for (const m of migrations) {
    const builtin = BUILTIN_PROVIDERS[m.id]
    await db
      .insert(schema.llmProviders)
      .values({
        id: m.id,
        providerType: builtin.providerType,
        displayName: builtin.displayName,
        apiKey: m.apiKey,
        baseUrl: m.baseUrl ?? builtin.baseUrl ?? null,
        models: builtin.models,
        isConnected: false,
        lastTestedAt: null,
        lastError: null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
  }
}
