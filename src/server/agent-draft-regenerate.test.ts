import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildHeuristicAgentConfigDraft, createAgentConfigDraft } from './agent-draft-service'
import { AgentDraftRequestSchema, AgentDraftResponseSchema } from './agent-draft-schema'

/**
 * 「重新生成」链路回归。
 *
 * 背景：`/api/agents/draft` 的启发式实现是确定性函数 —— 同样的 intent 必然返回逐字节
 * 相同的配置，团队成员详情里的「重新生成」因此永远看不出变化。修法是让前端在重新生成时
 * 带上 `regenerate` + 上一版草稿，由服务端走模型通道重写身份与提示词。
 *
 * 这组用例锁三件事：
 * 1. 不带 regenerate 时绝不调用模型（首次生成仍是毫秒级本地规则）
 * 2. 带 regenerate 且模型可用时，采用模型产出，权限骨架仍由平台预设决定
 * 3. 模型不可用 / 输出不合规时如实回落，并把 source 标成 heuristic 让 UI 能解释原因
 */

const mocks = vi.hoisted(() => ({
  resolveProvider: vi.fn(),
  getProvider: vi.fn(),
  createCompletion: vi.fn(),
}))

vi.mock('@/server/provider-router', () => ({
  resolveProvider: mocks.resolveProvider,
  getFailoverConfig: async () => ({ enabled: false }),
  recordProviderFailure: async () => ({ triggered: false }),
  recordProviderSuccess: async () => undefined,
  recordFailoverEvent: async () => undefined,
  classifyError: () => null,
}))

vi.mock('@/server/provider-service', () => ({
  getProvider: mocks.getProvider,
}))

vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: mocks.createCompletion } }
  },
}))

const INTENT = '产品增长团队 - 负责竞品调研并输出结构化对比报告'

/** 让 resolveProvider / getProvider 表现为「有一个可用的供应商」。 */
function enableProvider() {
  mocks.resolveProvider.mockResolvedValue({ providerId: 'deepseek', modelName: 'deepseek-flash', fromPriority: true })
  mocks.getProvider.mockResolvedValue({
    id: 'deepseek',
    apiKey: 'sk-test',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-flash'],
  })
}

/** 让模型返回一段指定文本。 */
function replyWith(content: string) {
  mocks.createCompletion.mockResolvedValue({ choices: [{ message: { content } }] })
}

const VALID_MODEL_DRAFT = {
  name: '竞品情报官',
  description: '负责持续追踪竞品动态与定价策略，输出可对比的结构化情报简报。',
  capabilities: ['竞品分析', '情报简报', '定价追踪'],
  systemPrompt: '你是竞品情报官。先确认对比维度，再逐项取证；每条结论都要给出信息来源与置信度。',
  modality: 'text',
  rationale: ['团队缺少专职情报角色，需要独立视角避免只做执行。'],
  assumptions: [{ label: '输出形态', detail: '默认输出 markdown 对比表，需要时补充要点摘要。' }],
}

describe('agent draft regenerate', () => {
  beforeEach(() => {
    mocks.resolveProvider.mockReset()
    mocks.getProvider.mockReset()
    mocks.createCompletion.mockReset()
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not touch the model on first generation', async () => {
    const result = await createAgentConfigDraft({ intent: INTENT })

    expect(result.source).toBe('heuristic')
    expect(mocks.createCompletion).not.toHaveBeenCalled()
    expect(mocks.resolveProvider).not.toHaveBeenCalled()
  })

  it('falls back to heuristic when no provider is configured', async () => {
    mocks.resolveProvider.mockResolvedValue(null)

    const result = await createAgentConfigDraft({ intent: INTENT, regenerate: true, previous: { name: '旧版角色' } })

    expect(result.source).toBe('heuristic')
    expect(result.draft.systemPrompt.length).toBeGreaterThan(0)
  })

  it('falls back when the provider has no api key', async () => {
    mocks.resolveProvider.mockResolvedValue({ providerId: 'deepseek', modelName: 'deepseek-flash', fromPriority: true })
    mocks.getProvider.mockResolvedValue({ id: 'deepseek', apiKey: null, models: ['deepseek-flash'] })

    const result = await createAgentConfigDraft({ intent: INTENT, regenerate: true })

    expect(result.source).toBe('heuristic')
    expect(mocks.createCompletion).not.toHaveBeenCalled()
  })

  it('adopts the model draft and keeps the platform tool skeleton', async () => {
    enableProvider()
    replyWith(JSON.stringify(VALID_MODEL_DRAFT))

    const result = await createAgentConfigDraft({ intent: INTENT, regenerate: true })

    expect(result.source).toBe('model')
    expect(result.draft.name).toBe('竞品情报官')
    expect(result.draft.systemPrompt).toBe(VALID_MODEL_DRAFT.systemPrompt)
    expect(result.draft.capabilities).toEqual(VALID_MODEL_DRAFT.capabilities)
    // 权限骨架不交给模型：仍是平台预设 + SDK adapter 约定
    expect(result.draft.adapterName).toBe('claude-code')
    expect(result.draft.toolNames).toEqual([])
    expect(result.draft.toolPermissionSummaries.length).toBeGreaterThan(0)
  })

  it('tells the model what the previous version looked like', async () => {
    enableProvider()
    replyWith(JSON.stringify(VALID_MODEL_DRAFT))

    await createAgentConfigDraft({
      intent: INTENT,
      regenerate: true,
      previous: { name: '旧版角色', description: '旧版描述', systemPrompt: '旧版提示词' },
    })

    const prompt = String(mocks.createCompletion.mock.calls[0][0].messages[1].content)
    expect(prompt).toContain('旧版角色')
    expect(prompt).toContain('旧版提示词')
    expect(prompt).toContain(INTENT)
  })

  it('parses output wrapped in a markdown code fence', async () => {
    enableProvider()
    replyWith('```json\n' + JSON.stringify(VALID_MODEL_DRAFT) + '\n```')

    const result = await createAgentConfigDraft({ intent: INTENT, regenerate: true })

    expect(result.source).toBe('model')
    expect(result.draft.name).toBe('竞品情报官')
  })

  it('clamps over-long model fields instead of rejecting the draft', async () => {
    enableProvider()
    replyWith(
      JSON.stringify({
        ...VALID_MODEL_DRAFT,
        name: '竞'.repeat(120),
        description: '描'.repeat(600),
        capabilities: Array.from({ length: 30 }, (_, i) => `能力标签${i}`),
      }),
    )

    const result = await createAgentConfigDraft({ intent: INTENT, regenerate: true })

    expect(result.source).toBe('model')
    expect(Array.from(result.draft.name).length).toBeLessThanOrEqual(64)
    expect(Array.from(result.draft.description).length).toBeLessThanOrEqual(280)
    expect(result.draft.capabilities.length).toBeLessThanOrEqual(12)
  })

  it('falls back when the model output is not usable JSON', async () => {
    enableProvider()
    replyWith('抱歉，我无法完成这个请求。')

    const result = await createAgentConfigDraft({ intent: INTENT, regenerate: true })

    expect(result.source).toBe('heuristic')
  })

  it('falls back when the model omits the prompt skeleton', async () => {
    enableProvider()
    replyWith(JSON.stringify({ ...VALID_MODEL_DRAFT, name: '', systemPrompt: '' }))

    const result = await createAgentConfigDraft({ intent: INTENT, regenerate: true })

    expect(result.source).toBe('heuristic')
  })

  it('falls back when the provider call throws', async () => {
    enableProvider()
    mocks.createCompletion.mockRejectedValue(new Error('ECONNRESET'))

    const result = await createAgentConfigDraft({ intent: INTENT, regenerate: true })

    expect(result.source).toBe('heuristic')
  })
})

describe('agent draft determinism anchor', () => {
  it('produces byte-identical drafts for identical input, which is exactly why regenerate needs the model', () => {
    const first = buildHeuristicAgentConfigDraft({ intent: INTENT, followUp: '专注竞品对比' })
    const second = buildHeuristicAgentConfigDraft({ intent: INTENT, followUp: '专注竞品对比' })

    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
  })
})

describe('agent draft schema', () => {
  it('accepts regenerate with a previous draft', () => {
    const parsed = AgentDraftRequestSchema.safeParse({
      intent: INTENT,
      regenerate: true,
      previous: { name: '旧版角色', description: '旧版描述', systemPrompt: '旧版提示词' },
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects an over-long previous system prompt', () => {
    const parsed = AgentDraftRequestSchema.safeParse({
      intent: INTENT,
      regenerate: true,
      previous: { systemPrompt: 'x'.repeat(4001) },
    })
    expect(parsed.success).toBe(false)
  })

  it('requires a source on the response so the UI can explain an unchanged result', () => {
    const draft = buildHeuristicAgentConfigDraft({ intent: INTENT })
    expect(AgentDraftResponseSchema.safeParse({ draft }).success).toBe(false)
    expect(AgentDraftResponseSchema.safeParse({ draft, source: 'heuristic' }).success).toBe(true)
    expect(AgentDraftResponseSchema.safeParse({ draft, source: 'model' }).success).toBe(true)
  })
})
