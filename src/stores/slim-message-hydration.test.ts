import { beforeEach, describe, expect, it } from 'vitest'

import type { MessageRow } from '@/db/schema'
import { selectUnloadedMessages, slimMessage } from '@/server/message-payload'

import { useAppStore } from './app-store'

/**
 * 回归：slim（调试图用）与完整数据（消息列表用）混写同一个 store 时的方向性。
 *
 * store 的 `messages` 是按 id 归一化的共享结构，`setMessagesForConversation` 内部的
 * `areMessagesEquivalent()` 会比 `parts` —— 所以「谁后写谁赢」。
 *
 * 真实事故场景：用户在会话页看完消息（store 里是最新 50 条**完整**消息，工具输出全文都在），
 * 切到 run-board 时调试图会用 slim 补齐更早的历史。如果无条件写进去，
 * slim 是降级数据，会把已有的完整消息覆盖成 `result: null` —— 回到会话页工具输出就是空白。
 *
 * 因此约定由 `selectUnloadedMessages()` 强制：**slim 只补 store 里没有的消息，绝不覆盖已有条目**。
 */
function makeMessage(id: string, createdAt: number, opts: { heavy: boolean }): MessageRow {
  return {
    id,
    conversationId: 'conv_1',
    role: 'agent',
    agentId: null,
    parts: [
      { type: 'text', content: `标题 ${id}` },
      opts.heavy
        ? { type: 'tool_result', callId: `call_${id}`, result: `REAL OUTPUT ${id} `.repeat(200), isError: false }
        : { type: 'tool_result', callId: `call_${id}`, result: `trimmed ${id}`, isError: false },
    ],
    status: 'complete',
    parentMessageId: null,
    mentionedAgentIds: [],
    runId: null,
    usage: null,
    createdAt,
  }
}

/** 会话里共有 120 条消息；消息列表先加载了最新 50 条（完整），调试图要补齐更早的 70 条。 */
const TOTAL = 120
const PAGE = 50

function allMessages(): MessageRow[] {
  return Array.from({ length: TOTAL }, (_, i) =>
    makeMessage(`m${String(i).padStart(3, '0')}`, 1_000 + i, { heavy: true }),
  )
}

function toolResultOf(message: MessageRow | undefined): unknown {
  const part = message?.parts.find((candidate) => candidate.type === 'tool_result')
  return part && part.type === 'tool_result' ? part.result : undefined
}

describe('slim 与完整消息混写共享 store', () => {
  beforeEach(() => {
    useAppStore.setState({ messages: {}, messageIdsByConv: {} })
  })

  it('keeps the完整 page intact when the run-board hydrates older history with slim data', () => {
    const setMessages = useAppStore.getState().setMessagesForConversation
    const everything = allMessages()
    const newestPage = everything.slice(TOTAL - PAGE)

    // 1) 会话页（message-list）：完整数据
    setMessages('conv_1', newestPage)

    // 2) 调试图：slim 数据补齐整段历史 —— 必须只写「store 里没有的」
    const slimAll = everything.map(slimMessage)
    const missing = selectUnloadedMessages(useAppStore.getState().messages, slimAll)
    expect(missing.length).toBe(TOTAL - PAGE)
    setMessages('conv_1', missing)

    const store = useAppStore.getState().messages

    // 最新 50 条必须仍是完整数据 —— 工具输出不能被降级成 null
    for (const message of newestPage) {
      expect(toolResultOf(store[message.id])).toContain('REAL OUTPUT')
    }

    // 更早的 70 条：调试图补进来的 slim 版本，够画会话图即可
    for (const message of everything.slice(0, TOTAL - PAGE)) {
      expect(toolResultOf(store[message.id])).toBeNull()
    }
  })

  it('upgrades a slim entry once the message list loads it for real (方向正确)', () => {
    const setMessages = useAppStore.getState().setMessagesForConversation
    const everything = allMessages()

    // 调试图先跑：只剩 slim
    setMessages('conv_1', everything.map(slimMessage))
    expect(toolResultOf(useAppStore.getState().messages['m119'])).toBeNull()

    // 会话页随后加载最新一页：完整数据必须覆盖 slim
    setMessages('conv_1', everything.slice(TOTAL - PAGE))

    expect(toolResultOf(useAppStore.getState().messages['m119'])).toContain('REAL OUTPUT')
  })

  it('does not double-write when nothing is actually new', () => {
    const setMessages = useAppStore.getState().setMessagesForConversation
    const everything = allMessages()
    setMessages('conv_1', everything.map(slimMessage))

    const missing = selectUnloadedMessages(useAppStore.getState().messages, everything.map(slimMessage))
    expect(missing).toEqual([])
  })
})
