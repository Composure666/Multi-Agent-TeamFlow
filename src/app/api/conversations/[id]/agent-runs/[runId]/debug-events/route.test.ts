import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GET } from './route'
import { getAgentRunDebugEvents } from '@/server/agent-run-debug-service'

vi.mock('@/server/agent-run-debug-service', () => ({
  getAgentRunDebugEvents: vi.fn(),
}))

function makeReq(url: string) {
  return new NextRequest(new Request(url))
}

const getAgentRunDebugEventsMock = vi.mocked(getAgentRunDebugEvents)

describe('GET /api/conversations/[id]/agent-runs/[runId]/debug-events', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns event records for the requested run', async () => {
    getAgentRunDebugEventsMock.mockResolvedValueOnce([
      {
        id: 'dbg_1',
        conversationId: 'conv_1',
        runId: 'run_1',
        parentRunId: null,
        agentId: 'ag_1',
        taskId: null,
        stepId: 'step_1',
        toolCallId: null,
        type: 'run.debug.step.started',
        status: 'running',
        payload: { label: 'run' },
        createdAt: 1,
      },
    ])

    const res = await GET(
      makeReq('http://localhost/api/conversations/conv_1/agent-runs/run_1/debug-events'),
      { params: Promise.resolve({ id: 'conv_1', runId: 'run_1' }) },
    )

    expect(res.status).toBe(200)
    expect((await res.json()).events).toHaveLength(1)
    expect(getAgentRunDebugEventsMock).toHaveBeenCalledWith('conv_1', 'run_1')
  })

  it('returns 404 when the run is outside the conversation scope', async () => {
    getAgentRunDebugEventsMock.mockRejectedValueOnce(new Error('Agent run not found: run_1'))

    const res = await GET(
      makeReq('http://localhost/api/conversations/conv_2/agent-runs/run_1/debug-events'),
      { params: Promise.resolve({ id: 'conv_2', runId: 'run_1' }) },
    )

    expect(res.status).toBe(404)
  })
})
