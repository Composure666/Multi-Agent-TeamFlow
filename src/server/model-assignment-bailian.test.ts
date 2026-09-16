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
    const { db } = client
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

  it('回归：百炼「欠费」虽然返回 400，也必须触发切换', async () => {
    // 线上实测（2026-09-16）：百炼账号欠费时返回的是 **HTTP 400 + Arrearage**，
    // 不是 402 —— 消息形如
    //   Access denied, please make sure your account is in good standing.
    //   For details, see: https://help.aliyun.com/zh/model-studio/error-code#overdue-payment
    // 老的关键字表只有 402 / insufficient_balance / quota_exceeded / billing，
    // 全都命中不了 → 归到「400 参数错误，不切换」→ **整条链当场硬失败**，
    // 链尾那条健康的兜底模型（deepseek 独立 key）完全用不上。
    for (const message of [
      '400 Access denied, please make sure your account is in good standing. For details, see: '
        + 'https://help.aliyun.com/zh/model-studio/error-code#overdue-payment',
      '400 {"type":"Arrearage","code":"Arrearage","message":"Access denied"}',
      '400 账户已欠费，请充值后重试',
    ]) {
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
 * 回归：适配器 / 降级链必须与自有模型的**协议**一致，判据是「模型是不是生图模型」。
 *
 * 现场是 主图设计师（modality='image' + adapter_name='custom' + 自有模型 deepseek-v4-flash）：
 *  1) chat 适配器 + 生图模型 → `Input should be 'user': input.messages.0.role`
 *     （HTTP 200 + SSE error，故 classifyError 判不出「可降级」）→ run 0.3s 猝死；
 *  2) 只改适配器不改模型也不行：chat 模型打原生生图端点得 HTTP 400「url error」——
 *     400 同样不触发降级 → 还是当场死。
 *
 * 第一版修复是「让模型跟着模态走」（skipOwnModel：生图模态就把自有 chat 模型换成生图链），
 * 方向错了 —— 它把一批「chat 模型 + 工具循环」的视觉生产成员一起拉去生图链，能力被砍窄。
 * 正确做法是**让适配器跟着模型走**（`shouldUseImageGenAdapter`），链只收同一套协议的候选。
 */
describe('适配器 / 降级链的协议一致性（判据是模型，不是模态）', () => {
  // 延迟构造：llmShared 是 beforeAll 里动态 import 的，模块收集阶段还没有值
  const imageOwnModelCase = () => ({
    modelProvider: 'openai-compatible' as const,
    modelId: 'z-image-turbo',
    apiKey: BAILIAN_KEY,
    apiBaseUrl: llmShared.BAILIAN_BASE_URL,
    modality: 'image',
  })
  const chatModelOnImageModalityCase = () => ({
    modelProvider: 'deepseek' as const,
    modelId: 'deepseek-v4-flash',
    apiKey: BAILIAN_KEY,
    apiBaseUrl: llmShared.BAILIAN_BASE_URL,
    modality: 'image',
  })

  it('生图模型：链首就是它自己，链上只收生图模型', async () => {
    const chain = await failover.buildAgentFailoverChain(imageOwnModelCase())

    expect(chain[0].modelId).toBe('z-image-turbo')
    expect(llmShared.isImageGenerationModel(chain[0].modelId)).toBe(true)
    expect(chain.every((c) => llmShared.isImageGenerationModel(c.modelId))).toBe(true)
    // 备用生图模型也在链上
    expect(chain.map((c) => c.modelId)).toContain('qwen-image-3.0-pro')
  })

  it('生图协议下不补 chat 基线兜底：基线是 chat 模型，对生图只会撞不降级的 400', async () => {
    const chain = await failover.buildAgentFailoverChain(imageOwnModelCase())
    expect(failover.hasBaselineFallback(chain)).toBe(false)
    expect(chain.map((c) => c.modelId)).not.toContain('deepseek-v4-flash')
  })

  it('回归：生图模态 + chat 模型**不再**被强行拉去生图链', async () => {
    // 2026-09-16 那版 skipOwnModel 会把这里的链首换成 z-image-turbo，等于偷偷改掉用户
    // 显式配置的模型，还把成员从「工具循环的视觉生产」变成「只会调一个出图端点」。
    const chain = await failover.buildAgentFailoverChain(chatModelOnImageModalityCase())

    expect(chain[0].modelId).toBe('deepseek-v4-flash')
    expect(chain.some((c) => llmShared.isImageGenerationModel(c.modelId))).toBe(false)
  })

  it('chat 成员：agent:image 链上的生图模型会被过滤掉，不会留在候选里', async () => {
    const chain = await failover.buildAgentFailoverChain(chatModelOnImageModalityCase())
    // 线上 agent:image 链是 z-image-turbo → qwen-image-3.0-pro → deepseek-v4-flash，
    // 前两个是生图模型，对 chat 协议只会撞 400 —— 必须被过滤。
    expect(chain.map((c) => c.modelId)).not.toContain('z-image-turbo')
    expect(chain.map((c) => c.modelId)).not.toContain('qwen-image-3.0-pro')
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

  it('创建时按**模型**纠偏：生图模型 + custom 适配器会被落到 image-gen 并清空工具集', async () => {
    const created = await agentService.createCustomAgent({
      name: '海报生成器',
      avatar: '🎨',
      description: '横版海报生成',
      capabilities: [],
      systemPrompt: '你是海报生成器',
      adapterName: 'custom',
      modelProvider: 'openai-compatible',
      modelId: 'z-image-turbo',
      apiKey: BAILIAN_KEY,
      apiBaseUrl: llmShared.BAILIAN_BASE_URL,
      toolNames: ['write_artifact', 'web_search'],
      modality: 'image',
    })

    expect(created.adapterName).toBe('image-gen')
    // 生图适配器不消费工具集
    expect(created.toolNames).toEqual([])
  })

  it('创建时：生图模态 + chat 模型 + custom 适配器**保持 custom 并保留工具集**', async () => {
    // 回归 2026-09-16：这是生图师 / 视觉设计师 / 图表设计师 / 主图设计师 的正常形态 ——
    // 它们靠 bash / fs_write / write_artifact 自己产 SVG 图或调外部生图服务。
    const created = await agentService.createCustomAgent({
      name: '视觉设计师',
      avatar: '🎨',
      description: '视觉设计',
      capabilities: [],
      systemPrompt: '你是视觉设计师',
      adapterName: 'custom',
      modelProvider: 'deepseek',
      modelId: 'deepseek-v4-flash',
      apiKey: BAILIAN_KEY,
      apiBaseUrl: llmShared.BAILIAN_BASE_URL,
      toolNames: ['write_artifact', 'bash'],
      modality: 'image',
    })

    expect(created.adapterName).toBe('custom')
    expect(created.toolNames).toEqual(['write_artifact', 'bash'])
  })

  it('显式请求 image-gen 但模型不是生图模型 → 报错并给出修法', async () => {
    await expect(
      agentService.createCustomAgent({
        name: '错配助手',
        avatar: '🎨',
        description: '',
        capabilities: [],
        systemPrompt: 'x',
        adapterName: 'image-gen',
        modelProvider: 'deepseek',
        modelId: 'deepseek-v4-flash',
        apiKey: BAILIAN_KEY,
        apiBaseUrl: llmShared.BAILIAN_BASE_URL,
        toolNames: [],
        modality: 'image',
      }),
    ).rejects.toThrow(/生图适配器需要生图模型/)
  })

  it('编辑时按**模型**纠偏：把已有 Agent 的模型换成生图模型，适配器自动切到 image-gen', async () => {
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

    await agentService.updateCustomAgent(created.id, {
      modelId: 'z-image-turbo',
      modelProvider: 'openai-compatible',
    })

    const row = client.sqlite
      .prepare('SELECT adapter_name FROM agents WHERE id = ?')
      .get(created.id) as { adapter_name: string }
    expect(row.adapter_name).toBe('image-gen')
  })

  it('回归：把模态改成生图但模型仍是 chat 模型时，适配器保持 custom', async () => {
    const created = await agentService.createCustomAgent({
      name: '图表设计师',
      avatar: '📊',
      description: '做图表',
      capabilities: [],
      systemPrompt: '你做图表',
      adapterName: 'custom',
      modelProvider: 'deepseek',
      modelId: 'deepseek-v4-flash',
      apiKey: BAILIAN_KEY,
      apiBaseUrl: llmShared.BAILIAN_BASE_URL,
      toolNames: ['write_artifact', 'bash'],
      modality: 'text',
    })

    await agentService.updateCustomAgent(created.id, { modality: 'image' })

    const row = client.sqlite
      .prepare('SELECT adapter_name, tool_names FROM agents WHERE id = ?')
      .get(created.id) as { adapter_name: string; tool_names: string }
    expect(row.adapter_name).toBe('custom')
    // 工具集必须留着 —— 这是它出图的手段
    expect(JSON.parse(row.tool_names)).toContain('bash')
  })

  it('回归：生图模态 + chat 成员必须拿到跨供应商兜底（agent:image 链对它全不可用）', async () => {
    // 修复前：agent:image 链上的生图模型被协议过滤干净，只剩链尾那条 chat 基线；
    // 基线又与自有模型撞 key 去重 → 链里只剩自有模型一个候选，「自有模型不可用」等于
    // 「该成员彻底不可用」，没有任何跨供应商余量。
    const chain = await failover.buildAgentFailoverChain(chatModelOnImageModalityCase())

    expect(chain.length).toBeGreaterThan(1)
    // 回退到 agent:text（chat 协议的标准链），拿到百炼的通用模型作为第二供应商
    expect(chain.map((c) => c.modelId)).toContain('qwen3.8-flash')
    expect(new Set(chain.map((c) => c.providerId)).size).toBeGreaterThan(1)
  })

  it('回归：生图模态 + 百炼 chat 成员时，链尾补回真正的项目基线', async () => {
    const chain = await failover.buildAgentFailoverChain({
      modelProvider: 'openai-compatible',
      modelId: 'qwen3.8-flash',
      apiKey: BAILIAN_KEY,
      apiBaseUrl: llmShared.BAILIAN_BASE_URL,
      modality: 'image',
    })

    // 自有模型已占 agent:text 链首，去重后链尾必须是 deepseek 基线（跨供应商的最后一道）
    expect(chain[0]).toMatchObject({ providerId: 'bailian', modelId: 'qwen3.8-flash' })
    expect(failover.hasBaselineFallback(chain)).toBe(true)
    expect(chain[chain.length - 1]).toMatchObject({ providerId: 'deepseek', modelId: 'deepseek-v4-flash' })
  })
})

/**
 * 回归：「供应商」按**实际端点**定，不按 `model_provider` 标签定。
 *
 * 线上现象（2026-09-16，每秒一次）：5 个视觉类成员（主图设计师 / 文案策划 / 视觉质检 /
 * 总策划 / 前端发布工程师）被配成 `model_provider=deepseek` + `api_base_url=百炼` + 百炼 key。
 * 老逻辑两处都按标签走：
 *   (a) chat 客户端对 `provider='deepseek'` **硬编码** `api.deepseek.com`、忽略 `apiBaseUrl`
 *       → 拿一把百炼 key 去打 DeepSeek 官方，秒回 `401 Your api key: ****pT2g is invalid`；
 *   (b) 这个 401 被记在 **deepseek** 名下 → `consecutive_failures` 冲到 500、`status=unavailable`。
 * 而 deepseek 正是链尾兜底 —— 等于「一个配错的标签把健康的兜底打死」。
 *
 * 实测「百炼端点 + `deepseek-v4-flash`」HTTP 200：这些成员的配置是有效的，纯粹被硬编码端点拦住。
 * 修法即两条不变式：**端点优先于标签**（`resolveCustomProviderClientConfig`）、
 * **归因跟着端点走**（`findProviderIdForEndpoint`）。
 */
describe('供应商归因按端点定，不按 model_provider 标签定', () => {
  const mislabeledCase = () => ({
    modelProvider: 'deepseek' as const,
    modelId: 'deepseek-v4-flash',
    apiKey: BAILIAN_KEY,
    apiBaseUrl: llmShared.BAILIAN_BASE_URL,
    modality: 'text' as const,
  })

  it('标签写 deepseek、端点写百炼 → 链首归因到 bailian，且端点原样保留', async () => {
    const chain = await failover.buildAgentFailoverChain(mislabeledCase())

    expect(chain[0]).toMatchObject({
      providerId: 'bailian',
      provider: 'openai-compatible',
      apiBaseUrl: llmShared.BAILIAN_BASE_URL,
      modelId: 'deepseek-v4-flash',
    })
  })

  it('端点匹配不上任何供应商行 → 不归因（providerId 为 null，不污染别人的状态）', async () => {
    const chain = await failover.buildAgentFailoverChain({
      modelProvider: 'deepseek',
      modelId: 'deepseek-v4-flash',
      apiKey: 'sk-self-hosted-gateway',
      apiBaseUrl: 'https://llm.internal.example.com/v1',
      modality: 'text',
    })

    expect(chain[0].providerId).toBeNull()
    expect(chain[0].provider).toBe('openai-compatible')
  })

  it('自有模型没配端点时仍按内置供应商归因（原有行为不变）', async () => {
    const chain = await failover.buildAgentFailoverChain({
      modelProvider: 'deepseek',
      modelId: 'deepseek-v4-flash',
      modality: 'text',
    })

    expect(chain[0].providerId).toBe('deepseek')
    expect(chain[0].provider).toBe('deepseek')
  })

  it('findProviderIdForEndpoint：按 key 认供应商，端点不认识就返回 null', async () => {
    expect(
      await providerService.findProviderIdForEndpoint({
        apiBaseUrl: llmShared.BAILIAN_BASE_URL,
        apiKey: BAILIAN_KEY,
        modelId: 'deepseek-v4-flash',
      }),
    ).toBe('bailian')

    expect(
      await providerService.findProviderIdForEndpoint({
        apiBaseUrl: 'https://nowhere.example.com/v1',
        apiKey: BAILIAN_KEY,
      }),
    ).toBeNull()

    expect(await providerService.findProviderIdForEndpoint({ apiBaseUrl: null })).toBeNull()
  })

  it('两行供应商端点 + key 相同 → 候选链不会留下重复目标', async () => {
    // 线上真实数据：`openai` 行被填成了百炼的兼容端点 + 百炼 key，与 `bailian` 行**完全等价**。
    // 归因改按端点反查后，两行会各自认领同一次请求；若判重仍只看 `providerId`，链上就会留下
    // 两个一模一样的目标 —— 第一个失败后第二个必然同样失败，白烧一次切换配额，还挤掉链尾基线。
    const before = await providerService.getProvider('openai')
    try {
      await providerService.upsertProvider({
        id: 'openai',
        baseUrl: llmShared.BAILIAN_BASE_URL,
        apiKey: BAILIAN_KEY,
      })

      const chain = await failover.buildAgentFailoverChain({
        modelProvider: 'openai-compatible',
        modelId: 'qwen3.8-flash',
        apiKey: BAILIAN_KEY,
        apiBaseUrl: llmShared.BAILIAN_BASE_URL,
        modality: 'text',
      })

      const targets = chain.map((c) => `${c.apiBaseUrl}|${c.apiKey}|${c.modelId}`)
      expect(new Set(targets).size).toBe(targets.length)
      // 端点 + key + 模型相同的两行只能留一个
      expect(chain.filter((c) => c.modelId === 'qwen3.8-flash').length).toBe(1)
      // 链尾基线仍要在：重复候选不该把兜底挤掉
      expect(failover.hasBaselineFallback(chain)).toBe(true)
    } finally {
      await providerService.upsertProvider({
        id: 'openai',
        baseUrl: before?.baseUrl ?? null,
        apiKey: before?.apiKey ?? null,
      })
    }
  })
})
