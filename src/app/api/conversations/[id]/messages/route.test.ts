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
})
