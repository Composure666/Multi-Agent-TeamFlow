import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { StreamEvent } from '@/shared/types'

import {
  CUSTOM_AGENT_MAX_OUTPUT_TOKENS,
  CUSTOM_AGENT_MAX_TURNS,
  CustomAgentAdapter,
  describeInvalidToolArguments,
  safeArgumentsJson,
} from './custom-agent-adapter'
import type { AdapterInput } from './types'

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }))

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = { completions: { create: createMock } }
  },
}))

function deltaChunk(delta: Record<string, unknown>, finishReason: string | null = null) {
  return { choices: [{ index: 0, delta, finish_reason: finishReason }] }
}

function streamOf(chunks: unknown[]) {
  return (async function* () {
    for (const chunk of chunks) yield chunk
  })()
}

function baseInput(overrides: Partial<AdapterInput> = {}): AdapterInput {
  return {
    agentId: 'agent_test',
    conversationId: 'conv_test',
    runId: 'run_test',
    prompt: '读取 /tmp/a.txt',
    workspacePath: process.cwd(),
    systemPrompt: '你是测试 Agent。',
    apiKey: 'sk-test',
    apiBaseUrl: null,
    modelId: 'deepseek-v4-flash',
    toolNames: ['fs_read'],
    customConfig: { modelProvider: 'deepseek', supportsVision: false },
    ...overrides,
  }
}

async function collect(input: AdapterInput): Promise<StreamEvent[]> {
  const controller = new AbortController()
  const events: StreamEvent[] = []
  for await (const event of new CustomAgentAdapter().stream(input, controller.signal)) {
    events.push(event)
  }
  return events
}

function bodyOf(callIndex: number): { messages: Record<string, unknown>[]; max_tokens?: number } {
  return createMock.mock.calls[callIndex]?.[0] as { messages: Record<string, unknown>[]; max_tokens?: number }
}

describe('CustomAgentAdapter turn budget', () => {
  it('allows enough tool turns for implementation agents to inspect and write', () => {
    expect(CUSTOM_AGENT_MAX_TURNS).toBeGreaterThanOrEqual(32)
  })

  it('sends an explicit max_tokens so long outputs are not silently cut off', () => {
    expect(CUSTOM_AGENT_MAX_OUTPUT_TOKENS).toBeGreaterThanOrEqual(4096)
  })
})

describe('CustomAgentAdapter truncated output handling', () => {
  beforeEach(() => {
    createMock.mockReset()
  })

  it('drops tool calls cut off by the length limit instead of replaying broken arguments', async () => {
    createMock
      .mockImplementationOnce(async () =>
        streamOf([
          deltaChunk({
            tool_calls: [
              { index: 0, id: 'call_1', function: { name: 'fs_read', arguments: '{"path":"/tmp/a' } },
            ],
          }),
          deltaChunk({}, 'length'),
        ]),
      )
      .mockImplementationOnce(async () =>
        streamOf([deltaChunk({ content: '好的，我改成分块读取。' }), deltaChunk({}, 'stop')]),
      )

    const events = await collect(baseInput())

    // 截断轮不产出任何工具调用，也不会把半截 arguments 回传给网关
    expect(events.some((event) => event.type === 'tool.call')).toBe(false)
    expect(createMock).toHaveBeenCalledTimes(2)

    // body.messages 是同一个数组引用，后面几轮会继续往里 push，
    // 所以断言「每一条 assistant 消息都没带 tool_calls」而不是条数。
    const second = bodyOf(1)
    const assistantMessages = second.messages.filter((message) => message.role === 'assistant')
    expect(assistantMessages.length).toBeGreaterThan(0)
    for (const message of assistantMessages) {
      expect(message.tool_calls).toBeUndefined()
    }
    expect(String(assistantMessages[0].content)).toMatch(/截断/)
    // 续写提示以 user 消息注入
    expect(second.messages.some((message) => message.role === 'user')).toBe(true)
  })

  it('aborts after repeated truncation instead of looping forever', async () => {
    createMock.mockImplementation(async () =>
      streamOf([deltaChunk({ content: '很长的一段输出' }), deltaChunk({}, 'length')]),
    )

    await expect(collect(baseInput())).rejects.toThrow(/长度上限/)
  })

  it('reports invalid tool arguments as a tool error rather than executing the tool', async () => {
    createMock
      .mockImplementationOnce(async () =>
        streamOf([
          deltaChunk({
            tool_calls: [{ index: 0, id: 'call_9', function: { name: 'fs_read', arguments: '{"path":' } }],
          }),
          deltaChunk({}, 'tool_calls'),
        ]),
      )
      .mockImplementationOnce(async () =>
        streamOf([deltaChunk({ content: '重试完成' }), deltaChunk({}, 'stop')]),
      )

    const events = await collect(baseInput())

    const toolResult = events.find((event) => event.type === 'tool.result')
    expect(toolResult).toBeDefined()
    const result = toolResult as { isError: boolean; result: { error: string } }
    expect(result.isError).toBe(true)
    expect(result.result.error).toMatch(/不是合法 JSON/)

    // 回传的 assistant.tool_calls 必须是合法 JSON（否则百炼 400）
    const second = bodyOf(1)
    const assistantMessages = second.messages.filter((message) => message.role === 'assistant')
    const toolCalls = assistantMessages[0]?.tool_calls as { function: { arguments: string } }[]
    expect(toolCalls[0]?.function.arguments).toBe('{}')
  })
})

describe('tool argument safety helpers', () => {
  it('never replays non-JSON arguments to the gateway', () => {
    expect(safeArgumentsJson('{"a":1}')).toBe('{"a":1}')
    expect(safeArgumentsJson('{"a":')).toBe('{}')
    expect(safeArgumentsJson('')).toBe('{}')
    expect(safeArgumentsJson('   ')).toBe('{}')
  })

  it('flags only genuinely broken arguments', () => {
    expect(describeInvalidToolArguments('{"a":1}')).toBeNull()
    expect(describeInvalidToolArguments('')).toBeNull()
    expect(describeInvalidToolArguments('{"a":')).not.toBeNull()
  })
})
