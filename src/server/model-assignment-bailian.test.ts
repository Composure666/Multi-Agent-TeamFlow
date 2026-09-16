import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 模型分配 + 降级兜底 的集成测试（真实 DB，无网络）。
 *
 * 覆盖用户要求里的三件事：
 *   1) 各类 Agent 创建时按模态拿到「合适的主模型」；
 *   2) 主模型不可用时自动转发到兜底模型，链尾恒为 deepseek-v4-flash；
 *   3) 兜底链、供应商、分配表在首次启动时被正确 seed。
 */

let dataDir: string
let client: typeof import('@/db/client')
let providerService: typeof import('./provider-service')
let failover: typeof import('./llm-failover')
let draftService: typeof import('./agent-draft-service')
let agentService: typeof import('./agent-service')
let router: typeof import('./provider-router')
let llmShared: typeof import('@/lib/llm-shared')

const BAILIAN_KEY = 'sk-test-bailian-key'
const DEEPSEEK_KEY = 'sk-test-deepseek-key'

beforeAll(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'agenthub-model-assignment-'))
  process.env.AGENTHUB_DATA_DIR = dataDir
  process.env.BAILIAN_API_KEY = BAILIAN_KEY
  vi.resetModules()

  client = await import('@/db/client')
  llmShared = await import('@/lib/llm-shared')
  providerService = await import('./provider-service')
  router = await import('./provider-router')
  failover = await import('./llm-failover')
  draftService = await import('./agent-draft-service')
  agentService = await import('./agent-service')

  // 基线供应商 deepseek 平时来自用户配置，测试里显式补一条可用的 key。
  // （分配表在 bootstrap 时就已经按 DEFAULT_MODEL_ASSIGNMENT_PLAN 落好了，这里不用再插。）
  await providerService.upsertProvider({
    id: 'deepseek',
    apiKey: DEEPSEEK_KEY,
    isConnected: true,
  })
})

afterAll(() => {
  client?.sqlite.close()
  if (dataDir) rmSync(dataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  delete process.env.AGENTHUB_DATA_DIR
  delete process.env.BAILIAN_API_KEY
})

beforeEach(async () => {
  // 每个用例都从「健康」状态出发，避免上一条用例写入的冷却状态影响判断
  const { db, schema } = client
  await db.delete(schema.llmProviderStatus)
  await db.delete(schema.llmFailoverEvents)
})

describe('seed：供应商与分配表', () => {
  it('首次启动就落出百炼供应商（baseUrl + 精选模型 + 已连接）', async () => {
    const provider = await providerService.getProvider('bailian')
    expect(provider).toBeTruthy()
    expect(provider?.displayName).toBe('阿里云百炼')
    expect(provider?.baseUrl).toBe(llmShared.BAILIAN_BASE_URL)
    expect(provider?.apiKey).toBe(BAILIAN_KEY)
    expect(provider?.isConnected).toBe(true)
    expect(provider?.models).toContain('qwen3-coder-plus')
    expect(provider?.models).toContain('z-image-turbo')
    // 精选清单必须都登记在供应商上，否则「模型分配」下拉框选不到
    for (const model of llmShared.BAILIAN_MODELS) {
      expect(provider?.models).toContain(model)
    }
  })

  it('四个内置供应商行在首次启动就被补齐（兜底链的外键前提）', async () => {
    for (const id of llmShared.BUILTIN_PROVIDER_IDS) {
      expect(await providerService.getProvider(id)).toBeTruthy()
    }
  })

  it('每个能力都有「主模型 + deepseek-v4-flash 兜底」的分配链', async () => {
    const { db, schema } = client
    const assignments = await db.query.llmModelAssignments.findMany()
    const byKey = new Map<string, typeof assignments>()
    for (const a of assignments) {
      const list = byKey.get(a.capabilityKey) ?? []
      list.push(a)
      byKey.set(a.capabilityKey, list)
    }

    for (const capabilityKey of Object.keys(llmShared.DEFAULT_MODEL_ASSIGNMENT_PLAN)) {
      const chain = (byKey.get(capabilityKey) ?? []).sort((a, b) => a.priority - b.priority)
      expect(chain.length).toBeGreaterThan(0)
      const last = chain[chain.length - 1]
      expect(`${last.providerId}/${last.modelName}`).toBe('deepseek/deepseek-v4-flash')
    }
  })

  it('故障转移默认开启（额度/鉴权/限流/5xx/超时全部勾选）', async () => {
    const config = await router.getFailoverConfig()
    expect(config.enabled).toBe(true)
    expect(config.triggerBalance).toBe(true)
    expect(config.triggerAuth).toBe(true)
    expect(config.triggerRateLimit).toBe(true)
    expect(config.triggerServerError).toBe(true)
    expect(config.triggerTimeout).toBe(true)
  })
})

describe('Agent / 团队成员创建时的模型分配', () => {
  const cases: Array<{ intent: string; modality: string; model: string; adapter: string }> = [
    { intent: '帮我重构这个 Python 项目的代码并跑测试', modality: 'code', model: 'qwen3-coder-plus', adapter: 'custom' },
    { intent: '帮我写一篇产品发布文案', modality: 'text', model: 'qwen3.8-flash', adapter: 'custom' },
    { intent: '帮我识别设计稿里的问题并给出修改建议', modality: 'vision', model: 'qwen3-vl-plus', adapter: 'custom' },
    { intent: '帮我生成一组海报插画', modality: 'image', model: 'z-image-turbo', adapter: 'image-gen' },
  ]

  for (const c of cases) {
    it(`「${c.modality}」模态自动匹配 ${c.model}（适配器 ${c.adapter}）`, async () => {
      const draft = await draftService.createAgentConfigDraft({ intent: c.intent })
      expect(draft.modality).toBe(c.modality)
      expect(draft.adapterName).toBe(c.adapter)
      expect(draft.modelProvider).toBe('openai-compatible')
      expect(draft.modelId).toBe(c.model)
    })
  }

  it('创建出来的 Agent 自动带上供应商凭证（不需要用户手填 Key / Base URL）', async () => {
    const draft = await draftService.createAgentConfigDraft({ intent: '帮我重构这个 Python 项目的代码并跑测试' })
    const created = await agentService.createCustomAgent({
      name: draft.name,
      avatar: draft.avatar,
      description: draft.description,
      capabilities: draft.capabilities,
      systemPrompt: draft.systemPrompt,
      adapterName: draft.adapterName,
      modelProvider: draft.modelProvider,
      modelId: draft.modelId,
      toolNames: draft.toolNames,
      supportsVision: draft.supportsVision,
      modality: draft.modality,
    })
    expect(created.modelId).toBe('qwen3-coder-plus')
    expect(created.apiKey).toBe(BAILIAN_KEY)
    expect(created.apiBaseUrl).toBe(llmShared.BAILIAN_BASE_URL)
  })

  it('生图 Agent 走生图适配器并自动补凭证（不再被「必须填 API Key」挡住）', async () => {
    const draft = await draftService.createAgentConfigDraft({ intent: '帮我生成一组海报插画' })
    const created = await agentService.createCustomAgent({
      name: draft.name,
      avatar: draft.avatar,
      description: draft.description,
      capabilities: draft.capabilities,
      systemPrompt: draft.systemPrompt,
      adapterName: draft.adapterName,
      modelId: draft.modelId,
      toolNames: [],
      modality: draft.modality,
    })
    expect(created.adapterName).toBe('image-gen')
    expect(created.modelProvider).toBe('openai-compatible')
    expect(created.modelId).toBe('z-image-turbo')
    expect(created.apiKey).toBe(BAILIAN_KEY)
    expect(created.apiBaseUrl).toBe(llmShared.BAILIAN_BASE_URL)
  })

  it('团队成员（每个成员一个 Agent）按各自模态分配到不同模型', async () => {
    const members = [
      { intent: '负责前端代码实现与重构', expect: 'qwen3-coder-plus' },
      { intent: '负责产品需求文档与文案', expect: 'qwen3.8-flash' },
      { intent: '负责界面设计稿的视觉走查', expect: 'qwen3-vl-plus' },
    ]
    const assigned: string[] = []
    for (const m of members) {
      const draft = await draftService.createAgentConfigDraft({ intent: m.intent })
      expect(draft.modelId).toBe(m.expect)
      assigned.push(draft.modelId as string)
    }
    expect(new Set(assigned).size).toBe(members.length)
  })
})

describe('降级兜底链', () => {
  it('Agent 链首是它自己的模型，链尾一定是 deepseek-v4-flash', async () => {
    const chain = await failover.buildAgentFailoverChain({
      modelProvider: 'openai-compatible',
      modelId: 'qwen3-coder-plus',
      apiKey: BAILIAN_KEY,
      apiBaseUrl: llmShared.BAILIAN_BASE_URL,
      modality: 'code',
    })
    expect(chain[0]).toMatchObject({ providerId: 'bailian', modelId: 'qwen3-coder-plus' })
    expect(failover.hasBaselineFallback(chain)).toBe(true)
    expect(chain[chain.length - 1]).toMatchObject({ providerId: 'deepseek', modelId: 'deepseek-v4-flash' })
  })

  it('视觉模态链上是 vl-plus → vl-flash → v4-flash', async () => {
    const chain = await failover.buildAgentFailoverChain({
      modelProvider: 'openai-compatible',
      modelId: 'qwen3-vl-plus',
      apiKey: BAILIAN_KEY,
      apiBaseUrl: llmShared.BAILIAN_BASE_URL,
      modality: 'vision',
    })
    expect(chain.map((c) => c.modelId)).toEqual(['qwen3-vl-plus', 'qwen3-vl-flash', 'deepseek-v4-flash'])
  })

  it('按模型名反查供应商：Agent 上只有 modelId 也能解析出凭证', async () => {
    const creds = await providerService.resolveProviderCredentialsForAgent({
      modelProvider: 'openai-compatible',
      modelId: 'qwen3-coder-plus',
    })
    expect(creds).toMatchObject({ providerId: 'bailian', apiKey: BAILIAN_KEY, apiBaseUrl: llmShared.BAILIAN_BASE_URL })
  })
})

describe('降级兜底转发', () => {
  const chain = () => [
    { providerId: 'bailian', provider: 'openai-compatible' as const, apiKey: BAILIAN_KEY, apiBaseUrl: llmShared.BAILIAN_BASE_URL, modelId: 'qwen3-coder-plus' },
    { providerId: 'deepseek', provider: 'deepseek' as const, apiKey: DEEPSEEK_KEY, apiBaseUrl: null, modelId: 'deepseek-v4-flash' },
  ]

  it('429 限流 → 自动切到 deepseek-v4-flash 并把结果交回来', async () => {
    const attempts: string[] = []
    const result = await failover.runWithFailover(
      chain(),
      async (c) => {
        attempts.push(c.modelId)
        if (c.providerId === 'bailian') throw new Error('429 rate_limit exceeded')
        return `answer from ${c.modelId}`
      },
      { capabilityKey: 'agent:code', canSwitch: () => true },
    )

    expect(attempts).toEqual(['qwen3-coder-plus', 'deepseek-v4-flash'])
    expect(result.value).toBe('answer from deepseek-v4-flash')
    expect(result.candidate.providerId).toBe('deepseek')

    // 切换记录可被「设置-故障转移」面板读到
    const events = await router.getFailoverEvents(10)
    expect(events.length).toBe(1)
    expect(events[0]).toMatchObject({ capabilityKey: 'agent:code', fromProviderId: 'bailian', toProviderId: 'deepseek' })

    // 主供应商被记为 degraded 并累计连续失败
    const status = await router.getProviderStatus('bailian')
    expect(status?.consecutiveFailures).toBe(1)
    expect(status?.status).toBe('degraded')
  })

  it('402 额度耗尽 / 401 鉴权失败 / 5xx 同样触发切换', async () => {
    for (const message of ['402 insufficient_balance', '401 invalid_api_key', '503 service_unavailable', 'request timeout']) {
      await client.db.delete(client.schema.llmFailoverEvents)
      const result = await failover.runWithFailover(
        chain(),
        async (c) => {
          if (c.providerId === 'bailian') throw new Error(message)
          return c.modelId
        },
        { capabilityKey: 'agent:code', canSwitch: () => true },
      )
      expect(result.candidate.modelId).toBe('deepseek-v4-flash')
    }
  })

  it('400 参数错误不切换（避免无意义地烧兜底模型的额度）', async () => {
    await expect(
      failover.runWithFailover(
        chain(),
        async (c) => {
          if (c.providerId === 'bailian') throw new Error('400 invalid_request_error: prompt too long')
          return c.modelId
        },
        { capabilityKey: 'agent:code', canSwitch: () => true },
      ),
    ).rejects.toThrow('400')
    expect(await router.getFailoverEvents(10)).toHaveLength(0)
  })

  it('已经产出内容后不再切换（防止一条消息里出现两段输出）', async () => {
    await expect(
      failover.runWithFailover(
        chain(),
        async (c) => {
          if (c.providerId === 'bailian') throw new Error('500 server_error')
          return c.modelId
        },
        { capabilityKey: 'agent:code', canSwitch: () => false },
      ),
    ).rejects.toThrow('500')
  })

  it('链尾也失败时抛出真实错误，并把供应商标记为不可用 + 冷却', async () => {
    await expect(
      failover.runWithFailover(
        chain(),
        async (c) => {
          throw new Error(c.providerId === 'bailian' ? '429 rate_limit' : '503 service_unavailable')
        },
        { capabilityKey: 'agent:code', canSwitch: () => true },
      ),
    ).rejects.toThrow('503')

    // deepseek 只失败 1 次（maxRetries=2）→ degraded；再失败一次才 unavailable
    const status = await router.getProviderStatus('deepseek')
    expect(status?.consecutiveFailures).toBe(1)
    expect(status?.status).toBe('degraded')
  })

  it('兜底模型（deepseek）不可用时会被冷却跳过', async () => {
    for (let i = 0; i < 2; i++) {
      await router.recordProviderFailure('deepseek', new Error('429 rate_limit'))
    }
    const cooling = await router.getProviderStatus('deepseek')
    expect(cooling?.status).toBe('unavailable')
    expect(cooling?.unavailableUntil ?? 0).toBeGreaterThan(Date.now())

    const chainWithFallback = await failover.buildAgentFailoverChain({
      modelProvider: 'openai-compatible',
      modelId: 'qwen3-coder-plus',
      apiKey: BAILIAN_KEY,
      apiBaseUrl: llmShared.BAILIAN_BASE_URL,
      modality: 'code',
    })
    expect(chainWithFallback.map((c) => c.modelId)).not.toContain('deepseek-v4-flash')
  })
})

/**
 * 回归：线上「落地发布组」t4「主图重做」4/4 失败、t5 被连带 skipped。
 *
 * 现场是 主图设计师（modality='image' + adapter_name='custom' + 自有模型 deepseek-v4-flash）：
 *  1) 适配器是 chat 协议 → chat 请求被网关按模型路由到生图模型上 →
 *     `Input should be 'user': input.messages.0.role`（HTTP 200 + SSE error，故 classifyError
 *     判不出「可降级」）；
 *  2) 即便改成 image-gen 适配器，降级链首位仍是 agent 自有的 chat 模型，打原生生图端点
 *     得 HTTP 400「url error」—— 400 同样不触发降级 → 还是当场死。
 * 两条都必须修，run 才跑得通。
 */
describe('生图模态的一致性（适配器 + 降级链首）', () => {
  // 延迟构造：llmShared 是 beforeAll 里动态 import 的，模块收集阶段还没有值
  const imageOwnModelCase = () => ({
    modelProvider: 'deepseek' as const,
    modelId: 'deepseek-v4-flash',
    apiKey: BAILIAN_KEY,
    apiBaseUrl: llmShared.BAILIAN_BASE_URL,
    modality: 'image',
  })

  it('生图模态的降级链首必须是生图模型，不能被 agent 自有的 chat 模型占位', async () => {
    const chain = await failover.buildAgentFailoverChain(imageOwnModelCase())

    expect(chain[0].modelId).toBe('z-image-turbo')
    expect(llmShared.isImageGenerationModel(chain[0].modelId)).toBe(true)
    // 兜底层仍然保留（链尾恒 deepseek-v4-flash 是用户硬要求）
    const last = chain[chain.length - 1]
    expect(`${last.providerId}/${last.modelId}`).toBe('deepseek/deepseek-v4-flash')
  })

  it('生图模态链上同时有主用与备用两张生图模型', async () => {
    const chain = await failover.buildAgentFailoverChain(imageOwnModelCase())
    const imageModels = chain
      .filter((c) => llmShared.isImageGenerationModel(c.modelId))
      .map((c) => c.modelId)
    expect(imageModels).toEqual(['z-image-turbo', 'qwen-image-3.0-pro'])
  })

  it('非生图模态不受影响：显式配置的自有模型仍排链首', async () => {
    const chain = await failover.buildAgentFailoverChain({
      modelProvider: 'deepseek',
      modelId: 'qwen3.8-flash',
      apiKey: BAILIAN_KEY,
      apiBaseUrl: llmShared.BAILIAN_BASE_URL,
      modality: 'text',
    })
    expect(chain[0].modelId).toBe('qwen3.8-flash')
  })

  it('生图模型判据：认得出生图模型，也不会把 chat 模型误判成生图', () => {
    for (const id of ['z-image-turbo', 'qwen-image-3.0-pro', 'flux-1-dev', 'dall-e-3', 'gpt-image-2']) {
      expect(llmShared.isImageGenerationModel(id)).toBe(true)
    }
    for (const id of ['deepseek-v4-flash', 'qwen3.8-flash', 'glm-5.3', 'kimi-k3', 'qwen3-coder-plus', '', null]) {
      expect(llmShared.isImageGenerationModel(id)).toBe(false)
    }
  })

  it('创建时强制纠偏：生图模态 + custom 适配器会被落到 image-gen', async () => {
    const created = await agentService.createCustomAgent({
      name: '主图设计师',
      avatar: '🎨',
      description: '横版主图生成',
      capabilities: [],
      systemPrompt: '你是主图设计师',
      adapterName: 'custom',
      modelProvider: 'deepseek',
      modelId: 'deepseek-v4-flash',
      apiKey: BAILIAN_KEY,
      apiBaseUrl: llmShared.BAILIAN_BASE_URL,
      toolNames: ['write_artifact', 'web_search'],
      modality: 'image',
    })

    expect(created.adapterName).toBe('image-gen')
    // 与创建路径对 image-gen 的处理一致：不消费工具集
    expect(created.toolNames).toEqual([])
  })

  it('编辑时同样纠偏：把已有 Agent 的模态改成生图，适配器自动切到 image-gen', async () => {
    const created = await agentService.createCustomAgent({
      name: '文案小助手',
      avatar: '✍️',
      description: '写文案',
      capabilities: [],
      systemPrompt: '你写文案',
      adapterName: 'custom',
      modelProvider: 'deepseek',
      modelId: 'deepseek-v4-flash',
      apiKey: BAILIAN_KEY,
      apiBaseUrl: llmShared.BAILIAN_BASE_URL,
      toolNames: ['write_artifact'],
      modality: 'text',
    })
    expect(created.adapterName).toBe('custom')

    await agentService.updateCustomAgent(created.id, { modality: 'image' })

    const row = client.sqlite
      .prepare('SELECT adapter_name FROM agents WHERE id = ?')
      .get(created.id) as { adapter_name: string }
    expect(row.adapter_name).toBe('image-gen')
  })
})
