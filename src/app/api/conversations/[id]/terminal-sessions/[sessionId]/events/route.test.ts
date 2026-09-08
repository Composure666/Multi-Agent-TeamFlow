import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GET } from './route'
import { getTerminalEventsForSession } from '@/server/terminal-session-service'

vi.mock('@/server/terminal-session-service', () => ({
  getTerminalEventsForSession: vi.fn(),
}))

const getTerminalEventsForSessionMock = vi.mocked(getTerminalEventsForSession)

function makeReq(url: string) {
  return new NextRequest(new Request(url))
}

describe('GET /api/conversations/[id]/terminal-sessions/[sessionId]/events', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns terminal events in the requested conversation scope', async () => {
    getTerminalEventsForSessionMock.mockResolvedValueOnce([
      {
        id: 'tevt_1',
        sessionId: 'term_1',
        conversationId: 'conv_1',
        runId: 'run_1',
        agentId: 'ag_1',
        taskId: null,
        toolCallId: 'call_1',
        type: 'terminal.output',
        stream: 'stdout',
        text: 'hello\r\n',
        payload: {},
        seq: 2,
        createdAt: 2,
      },
    ])

    const res = await GET(
      makeReq('http://localhost/api/conversations/conv_1/terminal-sessions/term_1/events'),
      { params: Promise.resolve({ id: 'conv_1', sessionId: 'term_1' }) },
    )

    expect(res.status).toBe(200)
    expect((await res.json()).events).toHaveLength(1)
    expect(getTerminalEventsForSessionMock).toHaveBeenCalledWith('conv_1', 'term_1')
  })

  it('returns 404 when the session is outside the conversation scope', async () => {
    getTerminalEventsForSessionMock.mockRejectedValueOnce(new Error('Terminal session not found: term_1'))

    const res = await GET(
      makeReq('http://localhost/api/conversations/conv_2/terminal-sessions/term_1/events'),
      { params: Promise.resolve({ id: 'conv_2', sessionId: 'term_1' }) },
    )

    expect(res.status).toBe(404)
  })
})
