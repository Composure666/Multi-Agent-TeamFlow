'use client'

import { useCallback, useRef, useState } from 'react'

import { streamScriptTurn } from '@/shared/scripted-stream'
import {
  DEMO_ARTIFACTS,
  DEMO_CONVERSATION_ID,
  DEMO_TURNS,
  DEMO_USER_MESSAGE_ID,
} from '@/server/demo-seed'
import { useAppStore } from '@/stores/app-store'

export type DemoReplayStatus = 'playing' | 'done'

const ORCHESTRATOR_RUN_ID = DEMO_TURNS[0].runId

function baseEvent(conversationId: string): { conversationId: string; timestamp: number } {
  return { conversationId, timestamp: Date.now() }
}

/**
 * 演示回放：把 demo-seed 里的五轮脚本按 MockAdapter 的节奏，
 * 一条条以 StreamEvent 经 store.applyEvent 落到 UI 上 —— 与真实 SSE
 * 走同一条 reducer，所以聊天、产物、调度计划、运行状态的渲染与工作台完全一致。
 *
 * 隔离性：全程只读内存里的种子数据，不发任何请求、不碰数据库、不碰终端。
 * runToken 保证跳过 / 重播时，旧的未跑完的循环吐出的事件会被丢弃，不会串台。
 */
export function useDemoReplay() {
  const applyEvent = useAppStore((s) => s.applyEvent)
  const [status, setStatus] = useState<DemoReplayStatus>('playing')
  const [turnIndex, setTurnIndex] = useState(0)
  const turnIndexRef = useRef(0)
  const runTokenRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const callCounterRef = useRef(0)

  const playFrom = useCallback(
    async (fromTurn: number, instant: boolean) => {
      const token = ++runTokenRef.current
      const controller = new AbortController()
      abortRef.current = controller
      const signal = controller.signal
      const isCurrent = () => token === runTokenRef.current && !signal.aborted
      setStatus('playing')

      for (let i = fromTurn; i < DEMO_TURNS.length; i++) {
        if (!isCurrent()) return
        const turn = DEMO_TURNS[i]
        turnIndexRef.current = i
        setTurnIndex(i)
        const base = baseEvent(DEMO_CONVERSATION_ID)

        applyEvent({
          ...base,
          type: 'run.start',
          runId: turn.runId,
          agentId: turn.agentId,
          triggerMessageId: DEMO_USER_MESSAGE_ID,
        })
        if (i > 0) {
          applyEvent({
            ...base,
            type: 'dispatch.start',
            parentRunId: ORCHESTRATOR_RUN_ID,
            childRunId: turn.runId,
            taskId: `task-${i}`,
            agentId: turn.agentId,
          })
        }

        for await (const event of streamScriptTurn(
          turn.steps,
          {
            conversationId: DEMO_CONVERSATION_ID,
            messageId: turn.messageId,
            agentId: turn.agentId,
            runId: turn.runId,
          },
          signal,
          () => `call_demo_${++callCounterRef.current}`,
          { instant },
        )) {
          if (!isCurrent()) return
          applyEvent(event)
        }
        if (!isCurrent()) return

        applyEvent({ ...base, type: 'run.end', runId: turn.runId, status: 'complete' })
        if (i > 0) {
          applyEvent({
            ...base,
            type: 'dispatch.end',
            parentRunId: ORCHESTRATOR_RUN_ID,
            childRunId: turn.runId,
            taskId: `task-${i}`,
            status: 'complete',
          })
        }
        turnIndexRef.current = i + 1
        setTurnIndex(i + 1)
      }

      if (isCurrent()) setStatus('done')
    },
    [applyEvent],
  )

  /** 跳过播放：停掉当前流式循环，剩余轮次瞬间落库。 */
  const skip = useCallback(() => {
    abortRef.current?.abort()
    void playFrom(turnIndexRef.current, true)
  }, [playFrom])

  /** 重新播放：清掉演示消息与产物，从第一轮重来。 */
  const replay = useCallback(() => {
    abortRef.current?.abort()
    const store = useAppStore.getState()
    store.removeMessages(
      DEMO_CONVERSATION_ID,
      DEMO_TURNS.map((t) => t.messageId),
    )
    store.removeArtifacts(DEMO_ARTIFACTS.map((a) => a.id))
    store.closeArtifactPreview()
    turnIndexRef.current = 0
    setTurnIndex(0)
    void playFrom(0, false)
  }, [playFrom])

  /** 从第一轮开始播放（由页面在水合完成后调用一次）。 */
  const play = useCallback(() => {
    void playFrom(0, false)
  }, [playFrom])

  /** 停掉当前回放循环（卸载时调用）。 */
  const stop = useCallback(() => {
    abortRef.current?.abort()
    runTokenRef.current++
  }, [])

  return { status, turnIndex, totalTurns: DEMO_TURNS.length, play, stop, replay, skip }
}
