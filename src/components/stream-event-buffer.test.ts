import { describe, expect, it } from 'vitest'

import type { StreamEvent } from '@/shared/types'

import { StreamEventBuffer } from './stream-event-buffer'

function delta(messageId: string, text: string, timestamp: number): StreamEvent {
  return {
    type: 'part.delta',
    conversationId: 'conv_1',
    timestamp,
    messageId,
    partIndex: 0,
    delta: { type: 'text.append', text },
  }
}

function messageEnd(timestamp: number): StreamEvent {
  return {
    type: 'message.end',
    conversationId: 'conv_1',
    timestamp,
    messageId: 'msg_1',
  }
}

describe('StreamEventBuffer', () => {
  it('coalesces adjacent part deltas before flushing', () => {
    const applied: StreamEvent[] = []
    const buffer = new StreamEventBuffer((event) => applied.push(event))

    buffer.push(delta('msg_1', 'hel', 1))
    buffer.push(delta('msg_1', 'lo', 2))
    buffer.flush()

    expect(applied).toHaveLength(1)
    expect(applied[0]).toMatchObject({
      type: 'part.delta',
      messageId: 'msg_1',
      partIndex: 0,
      delta: { type: 'text.append', text: 'hello' },
    })
    expect(applied[0].timestamp).toBe(2)
  })

  it('flushes buffered deltas before applying non-delta events', () => {
    const applied: StreamEvent[] = []
    const buffer = new StreamEventBuffer((event) => applied.push(event))

    buffer.push(delta('msg_1', 'done', 1))
    buffer.push(messageEnd(2))

    expect(applied.map((event) => event.type)).toEqual(['part.delta', 'message.end'])
    expect(applied[0]).toMatchObject({ delta: { text: 'done' } })
  })

  it('does not merge deltas for different messages', () => {
    const applied: StreamEvent[] = []
    const buffer = new StreamEventBuffer((event) => applied.push(event))

    buffer.push(delta('msg_1', 'a', 1))
    buffer.push(delta('msg_2', 'b', 2))
    buffer.flush()

    expect(applied.map((event) => event.type)).toEqual(['part.delta', 'part.delta'])
    expect(applied.map((event) => (event.type === 'part.delta' ? event.messageId : ''))).toEqual([
      'msg_1',
      'msg_2',
    ])
  })
})
