/**
 * LLM Provider Router —— Provider 路由与故障转移中心。
 *
 * 核心职责：
 * 1. 根据优先级列表 + 供应商运行时状态，解析某个能力实际使用的 Provider
 * 2. 判断请求失败是否触发故障转移（额度耗尽/鉴权失败/限流/5xx/超时 → 切换；参数错误/业务错误 → 不切换）
 * 3. 记录供应商运行时状态（连续失败次数、冷却期、延迟）
 * 4. 记录切换事件（供信息中心展示）
 * 5. 故障转移配置管理（触发条件、重试次数、冷却、自动恢复）
 *
 * 优先级数据存在 llm_model_assignments 表：
 *   - 全局优先级：scope='global', capabilityKey='global:default'
 *   - 用途级优先级：scope='system'/'agent', capabilityKey='prompt_optimize'/'agent:code' 等
 *   - 用途级 useGlobal=true 或没有记录时，回退到全局优先级
 */
import { eq } from 'drizzle-orm'

import { db, schema } from '@/db/client'
import type {
  LlmFailoverConfigRow,
  LlmFailoverEventRow,
  LlmProviderStatusRow,
} from '@/db/schema'

const CONFIG_SINGLETON_ID = 'singleton'
const GLOBAL_CAPABILITY_KEY = 'global:default'

// ─── 错误码分类 ──────────────────────────────────────────────────

/** 可触发故障转移的错误码/状态。 */
export const FAILOVER_TRIGGER_CODES = {
  // ⚠️ 余额类必须认全「欠费」的各家叫法：部分网关欠费返回的是 **HTTP 400 + `Arrearage`**，
  // 消息里带 `#overdue-payment`，而不是 402 —— 只认 402 的话，账号一欠费就会
  // 当场硬失败（400 不触发切换），链尾那条健康的兜底模型完全用不上。
  // 线上实测（2026-09-16）：`{"type":"Arrearage","code":"Arrearage",
  //   "message":"Access denied, please make sure your account is in good standing.
  //              For details, see: .../error-code#overdue-payment"}`。
  balance: [
    '402',
    'insufficient_balance',
    'insufficient balance',
    'quota_exceeded',
    'billing',
    'arrearage',
    'overdue-payment',
    'overdue_payment',
    '欠费',
  ],
  auth: ['401', '403', 'invalid_api_key', 'authentication_failed'],
  rateLimit: ['429', 'rate_limit', 'too_many_requests'],
  serverError: ['500', '502', '503', '504', 'server_error', 'service_unavailable'],
  timeout: ['timeout', 'aborted', 'network_error', 'econnrefused', 'etimedout'],
} as const

export type FailoverTriggerType = keyof typeof FAILOVER_TRIGGER_CODES

/**
 * 判断错误是否属于可触发故障转移的类型。
 * 返回 null 表示不触发（参数错误/业务错误等）。
 */
export function classifyError(error: unknown): FailoverTriggerType | null {
  const message = error instanceof Error ? error.message : String(error ?? '')
  const lower = message.toLowerCase()

  // 先匹配更具体的
  if (FAILOVER_TRIGGER_CODES.balance.some((c) => lower.includes(c.toLowerCase()))) return 'balance'
  if (FAILOVER_TRIGGER_CODES.auth.some((c) => lower.includes(c.toLowerCase()))) return 'auth'
  if (FAILOVER_TRIGGER_CODES.rateLimit.some((c) => lower.includes(c.toLowerCase()))) return 'rateLimit'
  if (FAILOVER_TRIGGER_CODES.timeout.some((c) => lower.includes(c.toLowerCase()))) return 'timeout'
  if (FAILOVER_TRIGGER_CODES.serverError.some((c) => lower.includes(c.toLowerCase()))) return 'serverError'

  // HTTP 状态码匹配
  const statusMatch = message.match(/\b(4\d\d|5\d\d)\b/)
  if (statusMatch) {
    const code = statusMatch[1]
    if (code === '402') return 'balance'
    if (code === '401' || code === '403') return 'auth'
    if (code === '429') return 'rateLimit'
    if (code.startsWith('5')) return 'serverError'
  }

  return null // 400 参数错误、业务错误等不触发
}

// ─── 故障转移配置 ─────────────────────────────────────────────────

const DEFAULT_CONFIG: LlmFailoverConfigRow = {
  id: CONFIG_SINGLETON_ID,
  enabled: true,
  triggerBalance: true,
  triggerAuth: true,
  triggerRateLimit: true,
  triggerServerError: true,
  triggerTimeout: true,
  maxRetries: 2,
  cooldownSeconds: 30,
  autoRecover: true,
  updatedAt: 0,
}

export async function getFailoverConfig(): Promise<LlmFailoverConfigRow> {
  const row = await db.query.llmFailoverConfig.findFirst({
    where: eq(schema.llmFailoverConfig.id, CONFIG_SINGLETON_ID),
  })
  return row ?? DEFAULT_CONFIG
}

export interface FailoverConfigPatch {
  enabled?: boolean
  triggerBalance?: boolean
  triggerAuth?: boolean
  triggerRateLimit?: boolean
  triggerServerError?: boolean
  triggerTimeout?: boolean
  maxRetries?: number
  cooldownSeconds?: number
  autoRecover?: boolean
}

export async function updateFailoverConfig(patch: FailoverConfigPatch): Promise<LlmFailoverConfigRow> {
  const current = await getFailoverConfig()
  const next: LlmFailoverConfigRow = { ...current, ...patch, updatedAt: Date.now() }
  await db
    .insert(schema.llmFailoverConfig)
    .values(next)
    .onConflictDoUpdate({ target: schema.llmFailoverConfig.id, set: next })
  return next
}

// ─── 供应商运行时状态 ─────────────────────────────────────────────

export async function getProviderStatus(providerId: string): Promise<LlmProviderStatusRow | null> {
  const row = await db.query.llmProviderStatus.findFirst({
    where: eq(schema.llmProviderStatus.providerId, providerId),
  })
  return row ?? null
}

export async function getAllProviderStatus(): Promise<LlmProviderStatusRow[]> {
  return db.query.llmProviderStatus.findMany()
}

async function upsertProviderStatus(providerId: string, patch: Partial<LlmProviderStatusRow>): Promise<LlmProviderStatusRow> {
  const existing = await getProviderStatus(providerId)
  const now = Date.now()
  const next: LlmProviderStatusRow = {
    providerId,
    status: patch.status ?? existing?.status ?? 'healthy',
    lastCheckedAt: patch.lastCheckedAt ?? existing?.lastCheckedAt ?? null,
    lastError: patch.lastError !== undefined ? patch.lastError : existing?.lastError ?? null,
    lastErrorCode: patch.lastErrorCode !== undefined ? patch.lastErrorCode : existing?.lastErrorCode ?? null,
    consecutiveFailures: patch.consecutiveFailures ?? existing?.consecutiveFailures ?? 0,
    latencyMs: patch.latencyMs !== undefined ? patch.latencyMs : existing?.latencyMs ?? null,
    unavailableUntil: patch.unavailableUntil !== undefined ? patch.unavailableUntil : existing?.unavailableUntil ?? null,
    updatedAt: now,
  }
  await db
    .insert(schema.llmProviderStatus)
    .values(next)
    .onConflictDoUpdate({ target: schema.llmProviderStatus.providerId, set: next })
  return next
}

/** 记录请求成功：重置连续失败计数，状态恢复 healthy。 */
export async function recordProviderSuccess(providerId: string, latencyMs?: number): Promise<void> {
  await upsertProviderStatus(providerId, {
    status: 'healthy',
    consecutiveFailures: 0,
    lastError: null,
    lastErrorCode: null,
    unavailableUntil: null,
    latencyMs: latencyMs ?? null,
    lastCheckedAt: Date.now(),
  })
}

/**
 * 记录请求失败：增加连续失败计数，达到阈值后标记 unavailable 并进入冷却。
 * 返回是否触发了故障转移（即该 provider 被标记为不可用）。
 */
export async function recordProviderFailure(
  providerId: string,
  error: unknown,
): Promise<{ triggered: boolean; triggerType: FailoverTriggerType | null }> {
  const triggerType = classifyError(error)
  const config = await getFailoverConfig()

  // 不属于可触发类型，或故障转移未开启 → 只记录错误，不标记不可用
  if (!config.enabled || !triggerType || !config[`trigger${triggerType.charAt(0).toUpperCase() + triggerType.slice(1)}` as keyof typeof config]) {
    await upsertProviderStatus(providerId, {
      lastError: error instanceof Error ? error.message : String(error),
      lastErrorCode: triggerType,
      lastCheckedAt: Date.now(),
    })
    return { triggered: false, triggerType }
  }

  const status = await getProviderStatus(providerId)
  const consecutive = (status?.consecutiveFailures ?? 0) + 1

  // 达到最大重试次数 → 标记不可用，进入冷却
  if (consecutive >= config.maxRetries) {
    const unavailableUntil = Date.now() + config.cooldownSeconds * 1000
    await upsertProviderStatus(providerId, {
      status: 'unavailable',
      consecutiveFailures: consecutive,
      lastError: error instanceof Error ? error.message : String(error),
      lastErrorCode: triggerType,
      unavailableUntil,
      lastCheckedAt: Date.now(),
    })
    return { triggered: true, triggerType }
  }

  // 未达阈值 → 标记 degraded，继续重试
  await upsertProviderStatus(providerId, {
    status: 'degraded',
    consecutiveFailures: consecutive,
    lastError: error instanceof Error ? error.message : String(error),
    lastErrorCode: triggerType,
    lastCheckedAt: Date.now(),
  })
  return { triggered: false, triggerType }
}

// ─── 切换事件记录 ─────────────────────────────────────────────────

export async function recordFailoverEvent(
  capabilityKey: string,
  fromProviderId: string | null,
  toProviderId: string | null,
  reason: string,
  errorCode?: string,
): Promise<void> {
  const id = `fo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  await db.insert(schema.llmFailoverEvents).values({
    id,
    capabilityKey,
    fromProviderId,
    toProviderId,
    reason,
    errorCode: errorCode ?? null,
    createdAt: Date.now(),
  })
}

export async function getFailoverEvents(limit = 50): Promise<LlmFailoverEventRow[]> {
  return db.query.llmFailoverEvents.findMany({
    orderBy: (e, { desc: descFn }) => [descFn(e.createdAt)],
    limit,
  })
}

// ─── 核心路由：解析实际使用的 Provider ────────────────────────────

export interface ResolvedProvider {
  providerId: string
  modelName: string | null
  /** 是否是从优先级列表中选的（false 表示所有都不可用，返回了第一个兜底） */
  fromPriority: boolean
}

/**
 * 解析某个能力实际使用的 Provider。
 *
 * 逻辑：
 * 1. 取该 capabilityKey 的优先级列表（按 priority 升序）
 * 2. 如果该能力配置了 useGlobal 或没有记录，回退到全局优先级
 * 3. 过滤掉状态为 unavailable 且在冷却期内的供应商
 * 4. 返回第一个可用的供应商 + 模型
 * 5. 如果都不可用（或都在冷却），返回优先级第一个（兜底，调用方自己处理错误）
 * 6. 如果开启了 autoRecover，冷却期已过的供应商会被重新考虑
 */
export async function resolveProvider(capabilityKey: string): Promise<ResolvedProvider | null> {
  const now = Date.now()

  // 1. 取该能力的优先级列表
  let assignments = await db.query.llmModelAssignments.findMany({
    where: eq(schema.llmModelAssignments.capabilityKey, capabilityKey),
    orderBy: (a, { asc }) => [asc(a.priority)],
  })

  // 2. 如果没有记录，或记录里 useGlobal=true，回退到全局
  const hasCustom = assignments.length > 0 && assignments.some((a) => !a.useGlobal)
  if (!hasCustom) {
    assignments = await db.query.llmModelAssignments.findMany({
      where: eq(schema.llmModelAssignments.capabilityKey, GLOBAL_CAPABILITY_KEY),
      orderBy: (a, { asc }) => [asc(a.priority)],
    })
  }

  if (assignments.length === 0) return null

  // 3. 过滤冷却期内的 unavailable 供应商，找第一个可用的
  for (const a of assignments) {
    if (!a.providerId) continue
    const status = await getProviderStatus(a.providerId)
    if (!status) {
      // 没有状态记录 = 健康
      return { providerId: a.providerId, modelName: a.modelName, fromPriority: true }
    }
    if (status.status === 'unavailable' && status.unavailableUntil && status.unavailableUntil > now) {
      // 冷却期内，跳过
      continue
    }
    // 可用（healthy / degraded / 冷却已过）
    return { providerId: a.providerId, modelName: a.modelName, fromPriority: true }
  }

  // 4. 都不可用 → 返回第一个兜底
  const first = assignments.find((a) => a.providerId)
  if (first?.providerId) {
    return { providerId: first.providerId, modelName: first.modelName, fromPriority: false }
  }
  return null
}

/**
 * 获取某个能力的完整优先级列表（含供应商状态），用于 UI 展示。
 */
export async function getPriorityList(capabilityKey: string): Promise<
  Array<{
    providerId: string
    modelName: string | null
    priority: number
    status: 'healthy' | 'degraded' | 'unavailable' | 'unknown'
    unavailableUntil: number | null
  }>
> {
  let assignments = await db.query.llmModelAssignments.findMany({
    where: eq(schema.llmModelAssignments.capabilityKey, capabilityKey),
    orderBy: (a, { asc }) => [asc(a.priority)],
  })
  const hasCustom = assignments.length > 0 && assignments.some((a) => !a.useGlobal)
  if (!hasCustom) {
    assignments = await db.query.llmModelAssignments.findMany({
      where: eq(schema.llmModelAssignments.capabilityKey, GLOBAL_CAPABILITY_KEY),
      orderBy: (a, { asc }) => [asc(a.priority)],
    })
  }

  const result = []
  for (const a of assignments) {
    if (!a.providerId) continue
    const status = await getProviderStatus(a.providerId)
    result.push({
      providerId: a.providerId,
      modelName: a.modelName,
      priority: a.priority,
      status: (status?.status ?? 'unknown') as 'healthy' | 'degraded' | 'unavailable' | 'unknown',
      unavailableUntil: status?.unavailableUntil ?? null,
    })
  }
  return result
}
