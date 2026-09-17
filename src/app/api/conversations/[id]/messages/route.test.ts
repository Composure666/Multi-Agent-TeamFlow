import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

import { GET } from './route'
import { listMessages } from '@/server/conversation-service'
import type { MessageRow } from '@/db/schema'

vi.mock('@/server/conversation-service', () => ({
  clearConversationHistory: vi.fn(),
  listMessages: vi.fn(),
  sendMessage: vi.fn(),
}))

function makeReq(url: string) {
  return new NextRequest(new Request(url))
}

function makeCtx(id = 'conv_1') {
  return { params: Promise.resolve({ id }) }
}

function makeMessage(id: string, createdAt: number): MessageRow {
  return {
    id,
    conversationId: 'conv_1',
    role: 'user',
    agentId: null,
    parts: [{ type: 'text', content: id }],
    status: 'complete',
    parentMessageId: null,
    mentionedAgentIds: [],
    runId: null,
    usage: null,
    createdAt,
  }
}

const listMessagesMock = vi.mocked(listMessages)

describe('GET /api/conversations/[id]/messages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the newest page and reports whether older messages exist', async () => {
    listMessagesMock.mockResolvedValueOnce([
      makeMessage('m1', 10),
      makeMessage('m2', 20),
      makeMessage('m3', 30),
    ])

    const res = await GET(makeReq('http://localhost/api/conversations/conv_1/messages?limit=2'), makeCtx())
    const body = await res.json()

    expect(listMessagesMock).toHaveBeenCalledWith('conv_1', { limit: 3, before: undefined })
    expect(body.messages.map((m: MessageRow) => m.id)).toEqual(['m2', 'm3'])
    expect(body.hasMore).toBe(true)
    expect(body.nextBefore).toBe(20)
  })

  it('passes before to the message query when loading an older page', async () => {
    listMessagesMock.mockResolvedValueOnce([
      makeMessage('m4', 40),
      makeMessage('m5', 50),
    ])

    await GET(
      makeReq('http://localhost/api/conversations/conv_1/messages?limit=2&before=60'),
      makeCtx(),
    )

    expect(listMessagesMock).toHaveBeenCalledWith('conv_1', { limit: 3, before: 60 })
  })

  it('returns the full payload by default', async () => {
    const heavy = makeMessage('m1', 10)
    heavy.parts = [
      { type: 'text', content: 'hello' },
      { type: 'tool_result', callId: 'c1', result: 'x'.repeat(5000), isError: false },
    ]
    listMessagesMock.mockResolvedValueOnce([heavy])

    const res = await GET(makeReq('http://localhost/api/conversations/conv_1/messages?limit=1'), makeCtx())
    const body = await res.json()

    expect(body.messages[0].parts[1].result).toHaveLength(5000)
  })

  it('strips tool payloads when slim=1 (run-board 只做预览)', async () => {
    const heavy = makeMessage('m1', 10)
    heavy.parts = [
      { type: 'text', content: 'hello' },
      { type: 'thinking', content: 'y'.repeat(5000) },
      { type: 'tool_use', callId: 'c1', toolName: 'bash', args: { command: 'z'.repeat(5000) } },
      { type: 'tool_result', callId: 'c1', result: 'x'.repeat(5000), isError: true },
    ]
    listMessagesMock.mockResolvedValueOnce([heavy])

    const res = await GET(
      makeReq('http://localhost/api/conversations/conv_1/messages?limit=1&slim=1'),
      makeCtx(),
    )
    const body = await res.json()

    // 结构与数量不变，否则下游按 type 分支 / parts.length 兜底的代码会静默失效
    expect(body.messages[0].parts.map((p: { type: string }) => p.type))
      .toEqual(['text', 'thinking', 'tool_use', 'tool_result'])
    expect(body.messages[0].parts[0]).toEqual({ type: 'text', content: 'hello' })
    expect(body.messages[0].parts[1]).toEqual({ type: 'thinking', content: '' })
    expect(body.messages[0].parts[2]).toEqual({ type: 'tool_use', callId: 'c1', toolName: 'bash', args: null })
    expect(body.messages[0].parts[3]).toEqual({ type: 'tool_result', callId: 'c1', result: null, isError: true })
    // 非 parts 字段照旧
    expect(body.messages[0].id).toBe('m1')
  })

  it('keeps the full payload for slim=0 (不把「显式要完整数据」反向解读)', async () => {
    const heavy = makeMessage('m1', 10)
    heavy.parts = [{ type: 'tool_result', callId: 'c1', result: 'x'.repeat(5000), isError: false }]
    listMessagesMock.mockResolvedValueOnce([heavy])

    const res = await GET(
      makeReq('http://localhost/api/conversations/conv_1/messages?limit=1&slim=0'),
      makeCtx(),
    )
    const body = await res.json()

    expect(body.messages[0].parts[0].result).toHaveLength(5000)
  })

  it('rejects an unrecognized slim value instead of silently guessing', async () => {
    const res = await GET(
      makeReq('http://localhost/api/conversations/conv_1/messages?limit=1&slim=yes'),
      makeCtx(),
    )

    expect(res.status).toBe(400)
    expect(listMessagesMock).not.toHaveBeenCalled()
  })
})
