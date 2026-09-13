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
