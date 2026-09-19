import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `/api/prompt/optimize` 接线回归。
 *
 * 关注两点(生成质量本身由 `@/server/prompt-enhance` 的用例覆盖):
 * 1. 无论模型可用与否,响应里都不能出现系统上下文与内部规则;
 * 2. 旧客户端(把「当前上下文」拼进 prompt)发来的请求,也能被正确拆回用户原文。
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

import { POST } from './route'

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/prompt/optimize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const FORBIDDEN = ['会话模式', '写入审批模式', '场景分类', '## 任务要求', '## 原始需求', '先判断']

describe('POST /api/prompt/optimize', () => {
  beforeEach(() => {
    mocks.resolveProvider.mockReset()
    mocks.getProvider.mockReset()
    mocks.createCompletion.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('把模型产出净化后返回,并标明来源', async () => {
    mocks.resolveProvider.mockResolvedValue({ providerId: 'deepseek', modelName: 'deepseek-flash' })
    mocks.getProvider.mockResolvedValue({ id: 'deepseek', apiKey: 'sk-test', baseUrl: 'https://api.deepseek.com/v1' })
    mocks.createCompletion.mockResolvedValue({
      choices: [{ message: { content: '以下是优化后的提示词：\n\n帮我写一份本周周报，分已完成/进行中/下周计划三部分。' } }],
    })

    const res = await POST(makeRequest({ prompt: '帮我写周报' }) as never)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.source).toBe('model')
    expect(data.enhancedText).toContain('本周周报')
    expect(data.enhancedText).not.toContain('以下是优化后的提示词')
  })

  it('模型不可用时走本地兜底,输出里没有任何系统上下文', async () => {
    mocks.resolveProvider.mockResolvedValue(null)

    const res = await POST(makeRequest({ prompt: '帮我写周报' }) as never)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.source).toBe('fallback')
    expect(data.enhancedText).toContain('帮我写周报')
    for (const forbidden of FORBIDDEN) {
      expect(data.enhancedText).not.toContain(forbidden)
    }
  })

  it('旧客户端拼接串:只把用户原文交给模型,背景不进入 system/user 正文', async () => {
    mocks.resolveProvider.mockResolvedValue({ providerId: 'deepseek', modelName: 'deepseek-flash' })
    mocks.getProvider.mockResolvedValue({ id: 'deepseek', apiKey: 'sk-test', baseUrl: 'https://api.deepseek.com/v1' })
    mocks.createCompletion.mockResolvedValue({ choices: [{ message: { content: '把迎新活动办成一场面向新同事的欢迎仪式。' } }] })

    const legacy = [
      '请结合上下文增强用户提示词。',
      '',
      '## 当前上下文',
      '- 会话模式：群聊',
      '- 写入审批模式：Auto（写入直接生效）',
      '',
      '## 用户原始输入',
      '帮我做一次迎新活动的活动策划',
    ].join('\n')

    const res = await POST(makeRequest({ prompt: legacy }) as never)
    const data = await res.json()
    const userMessage = mocks.createCompletion.mock.calls[0][0].messages[1].content as string

    expect(res.status).toBe(200)
    expect(userMessage).toContain('帮我做一次迎新活动的活动策划')
    expect(userMessage).not.toContain('会话模式')
    expect(userMessage).not.toContain('写入审批模式')
    expect(data.enhancedText).not.toContain('会话模式')
  })

  it('context 只在背景段落里出现,且被标注为不可复述', async () => {
    mocks.resolveProvider.mockResolvedValue({ providerId: 'deepseek', modelName: 'deepseek-flash' })
    mocks.getProvider.mockResolvedValue({ id: 'deepseek', apiKey: 'sk-test', baseUrl: 'https://api.deepseek.com/v1' })
    mocks.createCompletion.mockResolvedValue({ choices: [{ message: { content: '整理一份基于门店清单的活动方案。' } }] })

    await POST(
      makeRequest({
        prompt: '帮我做一次活动策划',
        context: { participants: ['营销总策划'], attachments: ['门店清单.xlsx'] },
      }) as never,
    )

    const userMessage = mocks.createCompletion.mock.calls[0][0].messages[1].content as string
    expect(userMessage).toContain('【背景素材】')
    expect(userMessage).toContain('门店清单.xlsx')
    expect(userMessage).toContain('不要')
  })

  it('空 prompt 返回 400', async () => {
    const res = await POST(makeRequest({ prompt: '   ' }) as never)

    expect(res.status).toBe(400)
  })
})
