import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { POST } from './route'
import { writeTerminalInput } from '@/server/terminal-session-service'

vi.mock('@/server/terminal-session-service', () => ({
  writeTerminalInput: vi.fn(),
}))

const writeTerminalInputMock = vi.mocked(writeTerminalInput)

function makeReq(body: unknown) {
  return new NextRequest(new Request('http://localhost/api/conversations/conv_1/terminal-sessions/term_1/input', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  }))
}

describe('POST /api/conversations/[id]/terminal-sessions/[sessionId]/input', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('writes stdin through the terminal session service', async () => {
    writeTerminalInputMock.mockResolvedValueOnce({
      id: 'tevt_input',
      sessionId: 'term_1',
      conversationId: 'conv_1',
      runId: 'run_1',
      agentId: 'ag_1',
      taskId: null,
      toolCallId: 'call_1',
      type: 'terminal.input',
      stream: 'stdin',
      text: 'hello\n',
      payload: {},
      seq: 2,
      createdAt: 2,
    })

    const res = await POST(
      makeReq({ input: 'hello\n' }),
      { params: Promise.resolve({ id: 'conv_1', sessionId: 'term_1' }) },
    )

    expect(res.status).toBe(200)
    expect((await res.json()).event.id).toBe('tevt_input')
    expect(writeTerminalInputMock).toHaveBeenCalledWith({
      conversationId: 'conv_1',
      sessionId: 'term_1',
      input: 'hello\n',
    })
  })

  it('rejects empty input before writing to the PTY', async () => {
    const res = await POST(
      makeReq({ input: '' }),
      { params: Promise.resolve({ id: 'conv_1', sessionId: 'term_1' }) },
    )

    expect(res.status).toBe(400)
    expect(writeTerminalInputMock).not.toHaveBeenCalled()
  })
})
