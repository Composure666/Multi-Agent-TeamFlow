import { describe, expect, it } from 'vitest'

import type { MessageRow } from '@/db/schema'
import type { MessagePart } from '@/shared/types'
import { SLIM_TEXT_LIMIT, parseSlimFlag, selectUnloadedMessages, slimMessage, slimMessageParts } from './message-payload'

function makeMessage(parts: MessagePart[]): MessageRow {
  return {
    id: 'm1',
    conversationId: 'conv_1',
    role: 'agent',
    agentId: null,
    parts,
    status: 'complete',
    parentMessageId: null,
    mentionedAgentIds: [],
    runId: null,
    usage: null,
    createdAt: 1,
  }
}

const heavyParts: MessagePart[] = [
  { type: 'text', content: 'x'.repeat(SLIM_TEXT_LIMIT * 3) },
  { type: 'thinking', content: 'y'.repeat(5000) },
  { type: 'tool_use', callId: 'call_1', toolName: 'bash', args: { command: 'z'.repeat(5000) } },
  { type: 'tool_result', callId: 'call_1', result: 'r'.repeat(200_000), isError: false },
  { type: 'code', language: 'ts', content: 'c'.repeat(SLIM_TEXT_LIMIT * 2) },
  { type: 'artifact_ref', artifactId: 'art_1' },
]

describe('slimMessageParts', () => {
  it('drops the heavy payload while keeping the part count and type sequence intact', () => {
    const slim = slimMessageParts(heavyParts)

    expect(slim.length).toBe(heavyParts.length)
    expect(slim.map((p) => p.type)).toEqual(heavyParts.map((p) => p.type))
  })

  it('drops tool results, tool args and thinking bodies', () => {
    const slim = slimMessageParts(heavyParts)

    const result = slim.find((p) => p.type === 'tool_result')
    expect(result).toEqual({ type: 'tool_result', callId: 'call_1', result: null, isError: false })

    const use = slim.find((p) => p.type === 'tool_use')
    expect(use).toEqual({ type: 'tool_use', callId: 'call_1', toolName: 'bash', args: null })

    const thinking = slim.find((p) => p.type === 'thinking')
    expect(thinking).toEqual({ type: 'thinking', content: '' })
  })

  it('keeps text and code previews but truncates them', () => {
    const slim = slimMessageParts(heavyParts)

    const text = slim.find((p) => p.type === 'text')
    expect(text?.type).toBe('text')
    expect((text as { content: string }).content.length).toBeLessThanOrEqual(SLIM_TEXT_LIMIT + 1)
    expect((text as { content: string }).content).toMatch(/…$/)

    const code = slim.find((p) => p.type === 'code')
    expect(code).toMatchObject({ type: 'code', language: 'ts' })
    expect((code as { content: string }).content).toMatch(/…$/)
  })

  it('leaves short text untouched (no ellipsis)', () => {
    const slim = slimMessageParts([{ type: 'text', content: '短文本' }])
    expect(slim).toEqual([{ type: 'text', content: '短文本' }])
  })

  it('keeps small parts as-is', () => {
    const slim = slimMessageParts(heavyParts)
    expect(slim[5]).toEqual({ type: 'artifact_ref', artifactId: 'art_1' })
  })

  it('shrinks a realistic message by more than an order of magnitude', () => {
    const before = JSON.stringify(heavyParts).length
    const after = JSON.stringify(slimMessageParts(heavyParts)).length
    expect(after).toBeLessThan(before / 10)
  })

  it('does not mutate the input', () => {
    const snapshot = JSON.stringify(heavyParts)
    slimMessageParts(heavyParts)
    expect(JSON.stringify(heavyParts)).toBe(snapshot)
  })
})

describe('slimMessage', () => {
  it('keeps every non-parts field untouched', () => {
    const row = makeMessage(heavyParts)
    const slim = slimMessage(row)

    expect(slim.id).toBe(row.id)
    expect(slim.conversationId).toBe(row.conversationId)
    expect(slim.role).toBe(row.role)
    expect(slim.status).toBe(row.status)
    expect(slim.createdAt).toBe(row.createdAt)
    expect(slim.parts).not.toEqual(row.parts)
  })

  it('preserves the preview text the run-board reads for its message cards', () => {
    // run-board 的 summarizeMessagePreview() 取 text/code 的 content 做卡片标题，
    // 并拿 parts.length 当兜底文案 —— 两者都必须在投影后保持可用
    const row = makeMessage([{ type: 'text', content: '查一下今天的新闻' }, { type: 'tool_result', callId: 'c', result: 'x'.repeat(9999), isError: false }])
    const slim = slimMessage(row)

    expect(slim.parts[0]).toEqual({ type: 'text', content: '查一下今天的新闻' })
    expect(slim.parts.length).toBe(2)
  })
})

describe('parseSlimFlag', () => {
  it('accepts only the explicit on-values', () => {
    expect(parseSlimFlag('1')).toBe(true)
    expect(parseSlimFlag('true')).toBe(true)
  })

  it('treats everything else as "keep the full payload"', () => {
    // 关键回归：z.coerce.boolean() 会把 '0' / 'false' 判成 true，反过来把「显式要完整数据」
    // 变成要了瘦身数据。这里必须全部为 false。
    for (const value of ['0', 'false', '', 'no', 'off', null, undefined]) {
      expect(parseSlimFlag(value)).toBe(false)
    }
  })
})

describe('selectUnloadedMessages', () => {
  const full = makeMessage([{ type: 'text', content: 'hello' }, { type: 'tool_result', callId: 'c', result: 'REAL OUTPUT', isError: false }])
  const slim = slimMessage(full)

  it('never hands back a message the store already holds', () => {
    // 这条不变量保护的是：slim 数据不得把 message-list 已加载的完整消息覆盖成 result:null，
    // 否则界面上的工具输出会直接变空白。
    const stored = { [full.id]: full }
    expect(selectUnloadedMessages(stored, [full, slim])).toEqual([])
  })

  it('returns only the genuinely new messages', () => {
    const other = { ...makeMessage([{ type: 'text', content: 'newer' }]), id: 'm2' }
    const stored = { m1: full }
    expect(selectUnloadedMessages(stored, [full, other]).map((m) => m.id)).toEqual(['m2'])
  })

  it('returns everything when the store is empty (首次进入调试图)', () => {
    const other = { ...makeMessage([{ type: 'text', content: 'newer' }]), id: 'm2' }
    expect(selectUnloadedMessages({}, [full, other]).map((m) => m.id)).toEqual(['m1', 'm2'])
  })

  it('treats a stored slim entry as "already loaded" too (不来回覆盖)', () => {
    expect(selectUnloadedMessages({ m1: slim }, [full])).toEqual([])
  })

  it('does not mutate the incoming array', () => {
    const incoming = [full, slim]
    const snapshot = incoming.length
    selectUnloadedMessages({}, incoming)
    expect(incoming.length).toBe(snapshot)
  })
})
