import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GET } from './route'
import { listTerminalSessionsForRun } from '@/server/terminal-session-service'

vi.mock('@/server/terminal-session-service', () => ({
  listTerminalSessionsForRun: vi.fn(),
}))

const listTerminalSessionsForRunMock = vi.mocked(listTerminalSessionsForRun)

function makeReq(url: string) {
  return new NextRequest(new Request(url))
}

describe('GET /api/conversations/[id]/agent-runs/[runId]/terminal-sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns terminal sessions for the requested run', async () => {
    listTerminalSessionsForRunMock.mockResolvedValueOnce([
      {
        id: 'term_1',
        conversationId: 'conv_1',
        runId: 'run_1',
        parentRunId: null,
        agentId: 'ag_1',
        taskId: null,
        toolCallId: 'call_1',
        shell: 'powershell.exe',
        cwd: 'C:/workspace',
        command: 'Write-Output hello',
        status: 'exited',
        exitCode: 0,
        signal: null,
        startedAt: 1,
        endedAt: 2,
      },
    ])

    const res = await GET(
      makeReq('http://localhost/api/conversations/conv_1/agent-runs/run_1/terminal-sessions'),
      { params: Promise.resolve({ id: 'conv_1', runId: 'run_1' }) },
    )

    expect(res.status).toBe(200)
    expect((await res.json()).sessions).toHaveLength(1)
    expect(listTerminalSessionsForRunMock).toHaveBeenCalledWith('conv_1', 'run_1')
  })

  it('returns 404 when the run is outside the conversation scope', async () => {
    listTerminalSessionsForRunMock.mockRejectedValueOnce(new Error('Agent run not found: run_1'))

    const res = await GET(
      makeReq('http://localhost/api/conversations/conv_2/agent-runs/run_1/terminal-sessions'),
      { params: Promise.resolve({ id: 'conv_2', runId: 'run_1' }) },
    )

    expect(res.status).toBe(404)
  })
})
