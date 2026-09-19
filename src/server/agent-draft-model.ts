import OpenAI from 'openai'

import { normalizeModality } from '@/lib/llm-shared'
import { getProvider, listProviders } from '@/server/provider-service'
import {
  classifyError,
  getFailoverConfig,
  recordFailoverEvent,
  recordProviderFailure,
  recordProviderSuccess,
  resolveProvider,
} from '@/server/provider-router'
import {
  buildToolPermissionSummaries,
  getAgentToolPreset,
  inferAgentToolPreset,
  type AgentConfigDraft,
  type AgentDraftRequest,
} from '@/shared/agent-builder-config'

import { AgentConfigDraftSchema } from './agent-draft-schema'

/**
 * 用模型重新设计一份 Agent 配置草稿。
 *
 * 背景：`createAgentConfigDraft` 的启发式实现是**确定性**的 —— 同样的 intent / followUp
 * 必然产出逐字节相同的配置。团队成员详情里的「重新生成」按钮因此永远看不出任何变化。
 * 这里补上真正的模型通道：由模型重写身份、描述、能力标签与 system prompt，
 * 权限骨架（adapter / 模型 / 工具）仍沿用启发式结果，保证产物始终可落库。
 *
 * 模型不可用、调用失败或输出不合规时返回 null，调用方回落到启发式并如实告知用户。
 */

/** 能力键：未单独配置时 `resolveProvider` 会自动回退到全局优先级列表。 */
const CAPABILITY_KEY = 'agent_draft'
/** 重新生成要的是「换个角度」，温度偏高才有意义。 */
const AGENT_DRAFT_TEMPERATURE = 0.9
const MAX_NAME_CHARS = 64
const MAX_DESCRIPTION_CHARS = 280
const MAX_CAPABILITY_CHARS = 32
const MAX_SYSTEM_PROMPT_CHARS = 4000
const MAX_RATIONALE_CHARS = 240
const MAX_ASSUMPTION_LABEL_CHARS = 40
const MAX_ASSUMPTION_DETAIL_CHARS = 240

const AGENT_DRAFT_SYSTEM_PROMPT = `你是多 Agent 协作工作流平台的 Agent 配置设计师。根据用户给出的团队目标与成员角色，为这名成员设计一套可直接投产的 Agent 配置。

要求：
1. name：6-16 个字的中文角色名，必须体现这名成员在团队里的具体分工，不要用「助手」「专员」「成员」这类空泛称呼。
2. description：一句话说明他负责什么、交付什么产物，40-120 字。
3. capabilities：3-6 个短标签，每个 2-6 字，例如「竞品分析」「数据校对」。
4. systemPrompt：80-300 字的系统提示词。写清身份、工作方式、输出形态与自检标准；不要出现「你是一个 AI」这类废话，也不要重复用户原话。
5. modality：只能是 code、text、vision、image 之一。code 表示写代码或跑命令，text 表示写作与分析，vision 表示看图与识图，image 表示生图与设计。
6. rationale：2-4 条设计理由，每条 20-60 字，说明为什么这样定位这名成员。
7. assumptions：2-4 条默认假设，每条是一个对象，含 label（不超过 8 字）与 detail（20-60 字）。

只输出一个 JSON 对象，不要任何解释、前后寒暄或 markdown 代码围栏。`

const AGENT_DRAFT_JSON_SHAPE = `{
  "name": "成员角色名",
  "description": "职责与交付物的一句话描述",
  "capabilities": ["能力标签"],
  "systemPrompt": "该成员的系统提示词",
  "modality": "code|text|vision|image",
  "rationale": ["设计理由"],
  "assumptions": [{ "label": "假设名", "detail": "假设说明" }]
}`

/** 模型返回的、需要在启发式骨架上覆盖的字段。 */
interface ModelAgentDraftPayload {
  name?: string
  description?: string
  capabilities?: string[]
  systemPrompt?: string
  modality?: string
  rationale?: string[]
  assumptions?: { label: string; detail: string }[]
}

/**
 * 让模型重新设计一份配置。任何一步失败都返回 null（调用方回落启发式）。
 */
export async function regenerateAgentDraftWithModel(input: AgentDraftRequest): Promise<AgentConfigDraft | null> {
  const intent = input.intent.trim()
  if (!intent) return null

  try {
    const content = await completeWithFailover(buildUserPrompt(input))
    if (!content) return null

    const payload = parseDraftPayload(content)
    if (!payload) return null

    return mergePayloadIntoHeuristic(payload, input)
  } catch (err) {
    console.error('[agent-draft] model regeneration error:', err)
    return null
  }
}

/** 组装用户侧提示：目标 + 角色 + 上一版（要求避开）。 */
function buildUserPrompt(input: AgentDraftRequest): string {
  const sections = [`团队目标 / 成员意图：${input.intent.trim()}`]

  const followUp = input.followUp?.trim()
  if (followUp) sections.push(`已知的成员设定与偏好：${followUp}`)

  const previous = input.previous
  if (previous && (previous.name || previous.description || previous.systemPrompt)) {
    sections.push(
      [
        '上一版配置（用户看过之后点了「重新生成」，说明不满意）——请给出一版**明显不同**的设计：',
        '换一个切入角度、换一组职责表述，不要只是把同义句改写一遍。',
        previous.name ? `- 上一版名称：${previous.name}` : '',
        previous.description ? `- 上一版描述：${previous.description}` : '',
        previous.systemPrompt ? `- 上一版系统提示词：${previous.systemPrompt}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    )
  }

  sections.push(`请按以下 JSON 结构输出（只输出 JSON）：\n${AGENT_DRAFT_JSON_SHAPE}`)
  return sections.join('\n\n')
}

/**
 * 带故障转移的补全调用。
 *
 * 与 `/api/prompt/optimize` 同一套机制：按能力优先级选供应商，失败记录状态，
 * 触发阈值时切换下一个，最多 3 次；没有任何可用供应商时返回 null 而非抛错。
 */
async function completeWithFailover(userPrompt: string): Promise<string | null> {
  const config = await getFailoverConfig()
  const maxAttempts = config.enabled ? 3 : 1
  let lastError: unknown = null
  let previousProviderId: string | null = null

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // 先按「能力优先级」配置选；整条链没配（全新实例，或清空供应商时把分配一起清了）
    // 时用平台默认供应商兜底，否则这里恒为 null，「重新生成」永远只能回落启发式。
    const resolved = (await resolveProvider(CAPABILITY_KEY)) ?? (await resolveDefaultDraftProvider())
    if (!resolved) break

    const provider = await getProvider(resolved.providerId)
    if (!provider?.apiKey) {
      await recordProviderFailure(resolved.providerId, new Error('API Key not configured'))
      previousProviderId = resolved.providerId
      continue
    }

    const client = new OpenAI({
      apiKey: provider.apiKey,
      baseURL: provider.baseUrl ?? undefined,
      maxRetries: 0,
    })
    const model = resolved.modelName ?? provider.models?.[0]
    if (!model) {
      await recordProviderFailure(resolved.providerId, new Error('No model configured'))
      previousProviderId = resolved.providerId
      continue
    }

    const startTime = Date.now()
    try {
      const result = await client.chat.completions.create({
        model,
        temperature: AGENT_DRAFT_TEMPERATURE,
        messages: [
          { role: 'system', content: AGENT_DRAFT_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      })

      const content = result.choices[0]?.message.content?.trim()
      if (content) {
        await recordProviderSuccess(resolved.providerId, Date.now() - startTime)
        return content
      }
      lastError = new Error('Empty response')
    } catch (err) {
      lastError = err
      const triggerType = classifyError(err)
      const { triggered } = await recordProviderFailure(resolved.providerId, err)

      if (triggered && previousProviderId && previousProviderId !== resolved.providerId) {
        await recordFailoverEvent(
          CAPABILITY_KEY,
          previousProviderId,
          resolved.providerId,
          triggerType ? `${triggerType} triggered failover` : 'provider unavailable',
          triggerType ?? undefined,
        )
      }
      previousProviderId = resolved.providerId

      if (!config.enabled || !triggerType) throw err
    }
  }

  if (lastError) console.error('[agent-draft] all providers failed:', lastError)
  return null
}

/**
 * 零配置兜底：能力优先级链为空时挑一个可用的供应商。
 *
 * 现实场景（2026-09-19 线上实测）：`llm_model_assignments` 整表为空 —— 清空供应商时
 * 分配被一并清掉，于是 `resolveProvider` 对任何能力都返回 null。此时按
 * 「deepseek 且已连接 → 任一已连接 → deepseek → 任一有 key」挑一条，
 * 与 team-draft-service 直接用已连接 deepseek 的口径一致，保证开箱可用。
 */
async function resolveDefaultDraftProvider(): Promise<{ providerId: string; modelName: string | null } | null> {
  const providers = await listProviders()
  const usable = providers.filter((provider) => Boolean(provider.apiKey && provider.apiKey.trim()))
  if (usable.length === 0) return null

  const chosen =
    usable.find((provider) => provider.id === 'deepseek' && provider.isConnected) ??
    usable.find((provider) => provider.isConnected) ??
    usable.find((provider) => provider.id === 'deepseek') ??
    usable[0]

  return { providerId: chosen.id, modelName: chosen.models?.[0] ?? null }
}

/** 容错解析模型输出：直接 JSON、```json 围栏、首尾大括号截取三种都试。 */
function parseDraftPayload(content: string): ModelAgentDraftPayload | null {
  const candidates = [content]

  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced) candidates.push(fenced[1])

  const firstBrace = content.indexOf('{')
  const lastBrace = content.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) candidates.push(content.slice(firstBrace, lastBrace + 1))

  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate.trim())
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as ModelAgentDraftPayload
      }
    } catch {
      // 换下一种切法
    }
  }
  return null
}

/**
 * 模型输出只覆盖「身份 + 提示词」这类语义字段，权限骨架沿用启发式结果。
 *
 * 这样做的原因：`toolNames` / `toolPermissionSummaries` 需要与平台真实工具集严格对齐，
 * 交给模型生成会引入不可控的越权风险；而 adapter、模型、视觉开关本就有平台默认值。
 * 长度一律裁剪到 schema 上限，避免模型超长导致整份草稿被拒。
 */
function mergePayloadIntoHeuristic(payload: ModelAgentDraftPayload, input: AgentDraftRequest): AgentConfigDraft | null {
  const intent = input.intent.replace(/\s+/g, ' ').trim()
  const followUp = (input.followUp ?? '').replace(/\s+/g, ' ').trim()
  const preset = getAgentToolPreset(inferAgentToolPreset(intent, followUp))

  const name = clampText(payload.name, MAX_NAME_CHARS)
  const description = clampText(payload.description, MAX_DESCRIPTION_CHARS)
  const systemPrompt = clampText(payload.systemPrompt, MAX_SYSTEM_PROMPT_CHARS, true)

  // 名称与提示词是配置的骨架，模型没给出可用值就整体作废，交回启发式。
  if (!name || !systemPrompt) return null

  const capabilities = clampStringList(payload.capabilities, MAX_CAPABILITY_CHARS, 12)
  const modality = normalizeModality(typeof payload.modality === 'string' ? payload.modality : undefined)

  const draft: AgentConfigDraft = {
    name,
    avatar: '🤖',
    description: description ?? `${name}：${intent.slice(0, 72)}`,
    capabilities,
    systemPrompt,
    adapterName: 'claude-code',
    modelProvider: 'deepseek',
    modality,
    toolNames: [],
    supportsVision: true,
    rationale: clampStringList(payload.rationale, MAX_RATIONALE_CHARS, 8),
    assumptions: clampAssumptions(payload.assumptions),
    toolPermissionSummaries: buildToolPermissionSummaries(preset.tools),
  }

  const parsed = AgentConfigDraftSchema.safeParse(draft)
  if (!parsed.success) {
    console.warn('[agent-draft] model draft rejected by schema:', parsed.error.issues)
    return null
  }
  return parsed.data
}

/** 裁剪单段文本；`keepNewlines` 为真时保留换行（system prompt 依赖段落结构）。 */
function clampText(value: unknown, maxChars: number, keepNewlines = false): string | null {
  if (typeof value !== 'string') return null
  const trimmed = (keepNewlines ? value.replace(/^\s+|\s+$/g, '') : value.replace(/\s+/g, ' ').trim())
  if (!trimmed) return null
  const chars = Array.from(trimmed)
  return chars.length <= maxChars ? trimmed : `${chars.slice(0, maxChars - 1).join('')}…`
}

/** 裁剪字符串数组：去空、去重、限长、限数量。 */
function clampStringList(value: unknown, maxChars: number, maxItems: number): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const items: string[] = []
  for (const entry of value) {
    const text = clampText(entry, maxChars)
    if (!text || seen.has(text)) continue
    seen.add(text)
    items.push(text)
    if (items.length >= maxItems) break
  }
  return items
}

/** 裁剪默认假设列表。 */
function clampAssumptions(value: unknown): { label: string; detail: string }[] {
  if (!Array.isArray(value)) return []
  const items: { label: string; detail: string }[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue
    const raw = entry as { label?: unknown; detail?: unknown }
    const label = clampText(raw.label, MAX_ASSUMPTION_LABEL_CHARS)
    const detail = clampText(raw.detail, MAX_ASSUMPTION_DETAIL_CHARS)
    if (!label || !detail) continue
    items.push({ label, detail })
    if (items.length >= 8) break
  }
  return items
}
