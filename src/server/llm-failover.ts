/**
 * LLM 降级兜底（failover）运行时。
 *
 * 与 `provider-router` 的分工：
 *   - `provider-router` 负责「**业务侧**按能力解析一个可用供应商」（用于提示词增强等一次性调用），
 *     以及供应商健康状态 / 冷却 / 切换事件的登记。
 *   - 本模块负责「**Agent 运行时**把整条候选链一次性拿给 adapter」，让 adapter 在
 *     「还没产出任何内容」时就能就地切到下一个候选，而不是把错误抛给用户再重跑一遍。
 *
 * 链的构成（顺序即尝试顺序）：
 *   1. Agent 自己配置的 provider/model（`agents.model_provider` + `model_id` + 凭证）
 *   2. 该 Agent 模态能力（`agent:<modality>`）在「设置-模型分配」里配的优先级链
 *      链尾恒为 deepseek + deepseek-v4-flash（项目原有基线模型）
 *
 * 只做「同一次调用内的切换」：一旦已经向用户吐出过内容（首 token / 首个 tool_call），
 * 就不再切换，避免同一条消息里出现两段互相矛盾的输出。
 */
import { eq } from 'drizzle-orm'

import { db, schema } from '@/db/client'
import {
  BUILTIN_PROVIDERS,
  FALLBACK_MODEL_NAME,
  FALLBACK_PROVIDER_ID,
  GLOBAL_PRIORITY_KEY,
  isImageGenerationModel,
  normalizeModality,
  providerIdToModelProvider,
} from '@/lib/llm-shared'
import { resolveProviderRowForAgent } from '@/server/provider-service'
import type { ModelProvider } from '@/shared/types'
import {
  classifyError,
  getFailoverConfig,
  getProviderStatus,
  recordFailoverEvent,
  recordProviderFailure,
  recordProviderSuccess,
  type FailoverTriggerType,
} from '@/server/provider-router'

/** Agent 的模态 → 能力 key（与「设置-模型分配」里的 agent:xxx 对齐）。 */
export function capabilityKeyForModality(modality: string | null | undefined): string {
  return `agent:${normalizeModality(modality)}`
}

export interface FailoverCandidate {
  /** llm_providers.id；识别不出时为 null（比如 agent 自带了一个不在供应商列表里的 baseUrl） */
  providerId: string | null
  provider: ModelProvider
  apiKey: string
  apiBaseUrl: string | null
  modelId: string
}

export interface FailoverAgentLike {
  modelProvider?: string | null
  modelId?: string | null
  apiKey?: string | null
  apiBaseUrl?: string | null
  modality?: string | null
}

/** 供应商行 → 可否作为候选（要有 key；冷却期内的跳过）。 */
async function isCandidateAvailable(providerId: string): Promise<boolean> {
  const status = await getProviderStatus(providerId)
  if (!status) return true
  if (status.status === 'unavailable' && status.unavailableUntil && status.unavailableUntil > Date.now()) {
    return false
  }
  return true
}

function builtinBaseUrl(providerId: string): string | null {
  return BUILTIN_PROVIDERS[providerId]?.baseUrl ?? null
}

/**
 * 解析一个能力的候选链（按 priority 升序，跳过冷却期内的供应商）。
 *
 * `capabilityKey` 没有自己的分配时，回退到全局优先级链（`global:default`）。
 */
export async function resolveFailoverChain(capabilityKey: string): Promise<FailoverCandidate[]> {
  const load = (key: string) =>
    db.query.llmModelAssignments.findMany({
      where: eq(schema.llmModelAssignments.capabilityKey, key),
      orderBy: (a, { asc }) => [asc(a.priority)],
    })

  let assignments = await load(capabilityKey)
  const hasCustom = assignments.some((a) => !a.useGlobal)
  if (!hasCustom) {
    assignments = await load(GLOBAL_PRIORITY_KEY)
  }

  const chain: FailoverCandidate[] = []
  for (const a of assignments) {
    const modelName = a.modelName?.trim()
    if (!a.providerId || !modelName) continue

    const provider = await db.query.llmProviders.findFirst({ where: eq(schema.llmProviders.id, a.providerId) })
    if (!provider) continue
    const apiKey = provider.apiKey?.trim()
    if (!apiKey) continue
    if (!(await isCandidateAvailable(a.providerId))) continue

    const apiBaseUrl = provider.baseUrl?.trim() || builtinBaseUrl(a.providerId)
    chain.push({
      providerId: a.providerId,
      provider: providerIdToModelProvider(a.providerId),
      apiKey,
      apiBaseUrl,
      modelId: modelName,
    })
  }
  return chain
}

function candidateKey(c: FailoverCandidate): string {
  return `${c.providerId ?? 'unknown'}::${c.modelId}`
}

/**
 * 组装 Agent 运行时的完整候选链：Agent 自身配置在前，模态分配链在后（去重）。
 *
 * 顺序语义：
 *   1. `agents.model_provider` + `model_id` 永远是第一顺位 —— 用户显式配过的东西不被隐性改写；
 *   2. 之后接该 Agent 模态在「设置-模型分配」里配的优先级链（去掉与第 1 项重复的）；
 *   3. 最后保证链尾存在项目基线 `deepseek + deepseek-v4-flash`，作为跨供应商的最终兜底。
 *
 * 返回空数组表示「没有可用的候选」，调用方保持旧行为（直接用 agent 字段跑，报错照抛）。
 */
export async function buildAgentFailoverChain(agent: FailoverAgentLike): Promise<FailoverCandidate[]> {
  const chain: FailoverCandidate[] = []
  const seen = new Set<string>()

  const capabilityKey = capabilityKeyForModality(agent.modality)
  const capabilityChain = await resolveFailoverChain(capabilityKey)

  // 生图模态的链首必须是生图模型。
  //
  // 生图走原生 multimodal-generation，chat 模型打上去直接 HTTP 400「url error」；
  // 而 400 在 classifyError 里**刻意不触发降级**（避免白烧额度）。于是「chat 模型占据
  // 生图链的首位」会让每一次调用都先撞一次不可降级的错、run 当场结束 —— 现场事故
  // （「落地发布组」主图重做 4/4 失败）里 agent 自己配的 deepseek-v4-flash 正是这个角色。
  //
  // 判据刻意保守：只有「能力链里确实存在可识别的生图模型」且「自己的模型不像生图模型」
  // 时才跳过自己的模型；其余情况完全保持旧行为（用户显式配过的东西不被隐性改写）。
  const ownModelId = agent.modelId?.trim()
  const skipOwnModel =
    normalizeModality(agent.modality) === 'image' &&
    !!ownModelId &&
    !isImageGenerationModel(ownModelId) &&
    capabilityChain.some((c) => isImageGenerationModel(c.modelId))

  if (ownModelId && skipOwnModel) {
    console.warn(
      `[llm-failover] Agent 模态为生图，但自己配的模型 "${ownModelId}" 不是生图模型；` +
        '已跳过它并直接使用「agent:image」的分配链，避免每次调用都先撞一次不触发降级的 400。',
    )
  }

  if (ownModelId && !skipOwnModel) {
    const row = await resolveProviderRowForAgent(agent)
    const provider = providerIdToModelProvider(row?.id ?? agent.modelProvider ?? null)
    const apiKey = agent.apiKey?.trim() || row?.apiKey?.trim() || ''
    const apiBaseUrl =
      agent.apiBaseUrl?.trim() || row?.baseUrl?.trim() || (row ? builtinBaseUrl(row.id) : null)
    // openai-compatible 协议必须自带 key（没有 env 兜底）；内置 provider 允许空 key，adapter 会去读 env。
    if (apiKey || provider !== 'openai-compatible') {
      const own: FailoverCandidate = {
        providerId: row?.id ?? null,
        provider,
        apiKey,
        apiBaseUrl: apiBaseUrl || null,
        modelId: ownModelId,
      }
      chain.push(own)
      seen.add(candidateKey(own))
    }
  }

  for (const c of capabilityChain) {
    if (seen.has(candidateKey(c))) continue
    seen.add(candidateKey(c))
    chain.push(c)
  }

  // 链尾兜底：基线模型（deepseek + deepseek-v4-flash）
  if (!seen.has(`${FALLBACK_PROVIDER_ID}::${FALLBACK_MODEL_NAME}`)) {
    const baseline = await buildBaselineCandidate()
    if (baseline) chain.push(baseline)
  }

  return chain
}

/**
 * 项目基线候选：deepseek + deepseek-v4-flash。
 *
 * 它不依赖「设置-模型分配」是否配过 —— 只要供应商中心里有可用的 deepseek key 就能兜底，
 * 这样即使分配表被用户清空，Agent 也不会因为新模型不可用而彻底挂掉。
 */
export async function buildBaselineCandidate(): Promise<FailoverCandidate | null> {
  const row = await db.query.llmProviders.findFirst({ where: eq(schema.llmProviders.id, FALLBACK_PROVIDER_ID) })
  const apiKey = row?.apiKey?.trim()
  if (!apiKey) return null
  if (!(await isCandidateAvailable(FALLBACK_PROVIDER_ID))) return null
  return {
    providerId: FALLBACK_PROVIDER_ID,
    provider: 'deepseek',
    apiKey,
    apiBaseUrl: row?.baseUrl?.trim() || builtinBaseUrl(FALLBACK_PROVIDER_ID),
    modelId: FALLBACK_MODEL_NAME,
  }
}

/** 链尾兜底是否就是项目基线（deepseek + deepseek-v4-flash）。测试与 UI 都用它自检。 */
export function hasBaselineFallback(chain: FailoverCandidate[]): boolean {
  const last = chain[chain.length - 1]
  return !!last && last.providerId === FALLBACK_PROVIDER_ID && last.modelId === FALLBACK_MODEL_NAME
}

export interface FailoverHooks {
  capabilityKey: string
  /** 只有「还没吐出任何内容」时才允许继续切下一个候选 */
  signal?: AbortSignal
}

/**
 * 判断错误是否应该触发切换（与 provider-router 的开关 / 触发条件保持一致）。
 */
export async function shouldFailover(error: unknown): Promise<{ ok: boolean; triggerType: FailoverTriggerType | null }> {
  const triggerType = classifyError(error)
  if (!triggerType) return { ok: false, triggerType: null }
  const config = await getFailoverConfig()
  if (!config.enabled) return { ok: false, triggerType }
  const flagKey = `trigger${triggerType.charAt(0).toUpperCase()}${triggerType.slice(1)}` as keyof typeof config
  if (!config[flagKey]) return { ok: false, triggerType }
  return { ok: true, triggerType }
}

/**
 * 记录一次候选失败。
 *
 * 返回 `{ switchable, triggerType }`：
 * - `switchable=true` 表示这个错误在故障转移配置里被允许触发切换（额度/鉴权/限流/5xx/超时）；
 * - 无论是否可切换，都会把失败登记到供应商健康状态（连续失败计数 → degraded → unavailable + 冷却）。
 */
export async function recordCandidateFailure(
  candidate: FailoverCandidate,
  error: unknown,
): Promise<{ switchable: boolean; triggerType: FailoverTriggerType | null }> {
  const { ok, triggerType } = await shouldFailover(error)
  if (candidate.providerId) {
    await recordProviderFailure(candidate.providerId, error)
  }
  return { switchable: ok, triggerType }
}

/** 写一条「从谁切到谁」的切换事件，供「设置-故障转移」面板展示。 */
export async function recordCandidateSwitch(
  capabilityKey: string,
  from: FailoverCandidate,
  to: FailoverCandidate,
  triggerType: FailoverTriggerType | null,
): Promise<void> {
  await recordFailoverEvent(
    capabilityKey,
    from.providerId,
    to.providerId,
    `${triggerType ?? 'error'}：${from.modelId} 不可用，降级到 ${to.modelId}`,
    triggerType ?? undefined,
  )
}

export async function reportCandidateSuccess(candidate: FailoverCandidate, latencyMs?: number): Promise<void> {
  if (!candidate.providerId) return
  await recordProviderSuccess(candidate.providerId, latencyMs)
}

/**
 * 通用「按候选链尝试」执行器。adapter 层只需要给出 `attempt(candidate)`。
 *
 * - 第 i 个候选失败且属于可切换错误、且链上还有下一个、且 `canSwitch()` 允许
 *   → 记录健康状态 + 切换事件，继续第 i+1 个
 * - 不可切换（400 参数错误 / 业务错误）→ 直接抛出，不浪费配额
 * - `canSwitch()` 返回 false（本轮已产出内容，再切会出现两段输出）→ 直接抛出
 * - 链尾也失败 → 抛出最后一个错误（此时已记录足够的诊断信息）
 */
export async function runWithFailover<T>(
  chain: FailoverCandidate[],
  attempt: (candidate: FailoverCandidate, index: number) => Promise<T>,
  hooks: FailoverHooks & { canSwitch: () => boolean },
): Promise<{ value: T; candidate: FailoverCandidate; index: number }> {
  if (chain.length === 0) throw new Error('failover chain is empty')
  let lastError: unknown = null

  for (let i = 0; i < chain.length; i++) {
    const candidate = chain[i]
    const startedAt = Date.now()
    try {
      const value = await attempt(candidate, i)
      await reportCandidateSuccess(candidate, Date.now() - startedAt)
      return { value, candidate, index: i }
    } catch (err) {
      lastError = err
      if (hooks.signal?.aborted) throw err
      const { switchable, triggerType } = await recordCandidateFailure(candidate, err)
      const next = chain[i + 1]
      if (!switchable || !next || !hooks.canSwitch()) throw err
      await recordCandidateSwitch(hooks.capabilityKey, candidate, next, triggerType)
    }
  }
  throw lastError ?? new Error('failover chain exhausted')
}
