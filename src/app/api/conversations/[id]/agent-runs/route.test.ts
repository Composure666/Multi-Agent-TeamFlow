import { describe, expect, it, vi, beforeEach } from 'vitest'

import { GET } from './route'
import { listAgentRunsForConversationPage } from '@/server/agent-run-debug-service'
import type { AgentRunDebugListItem } from '@/shared/types'

vi.mock('@/server/agent-run-debug-service', () => ({
  listAgentRunsForConversationPage: vi.fn(),
}))

const listAgentRunsForConversationPageMock = vi.mocked(listAgentRunsForConversationPage)

function makeReq(url: string): Request {
  return new Request(url)
}

describe('GET /api/conversations/[id]/agent-runs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns a paginated run page', async () => {
    listAgentRunsForConversationPageMock.mockResolvedValueOnce({
      runs: [{ id: 'run_2' }, { id: 'run_1' }] as AgentRunDebugListItem[],
      hasMore: true,
      nextCursor: { startedAt: 200, runId: 'run_1' },
    })

    const res = await GET(makeReq('http://localhost/api/conversations/conv_1/agent-runs?limit=2&beforeStartedAt=300&beforeRunId=run_3'), {
      params: Promise.resolve({ id: 'conv_1' }),
    })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(listAgentRunsForConversationPageMock).toHaveBeenCalledWith('conv_1', {
      limit: 2,
      before: { startedAt: 300, runId: 'run_3' },
    })
    expect(body).toEqual({
      runs: [{ id: 'run_2' }, { id: 'run_1' }],
      hasMore: true,
      nextCursor: { startedAt: 200, runId: 'run_1' },
    })
  })

  it('returns 404 when the conversation scope is invalid', async () => {
    listAgentRunsForConversationPageMock.mockRejectedValueOnce(new Error('Agent run not found: run_1'))

    const res = await GET(makeReq('http://localhost/api/conversations/conv_2/agent-runs'), {
      params: Promise.resolve({ id: 'conv_2' }),
    })

    expect(res.status).toBe(404)
  })
})
