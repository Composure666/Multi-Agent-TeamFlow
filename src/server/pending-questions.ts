import type { AskUserAnswer, AskUserQuestionItem, PendingQuestion } from '@/shared/types'

import { eventBus } from './event-bus'
import { newPendingQuestionId } from './ids'

/**
 * ask_user 工具的等待中心。Agent 调 ask_user → 注册 pending → 推 SSE → 前端弹 dialog →
 * 用户答 → answer() 唤醒 await → 工具返回 answers。
 *
 * 模块级单例 + HMR-safe via globalThis。dev server 重启所有 pending 丢失（与 PendingWrites 同语义）。
 *
 * 详见 specs/07-tools.md `ask_user` 一节。
 */

interface PendingEntry {
  question: PendingQuestion
  resolver: ((answers: Record<string, AskUserAnswer> | null) => void) | null
}

class PendingQuestionsStore {
  private map = new Map<string, PendingEntry>()

  register(args: {
    conversationId: string
    agentId: string
    runId: string
    questions: AskUserQuestionItem[]
  }): PendingQuestion {
    const id = newPendingQuestionId()
    const question: PendingQuestion = {
      id,
      conversationId: args.conversationId,
      agentId: args.agentId,
      runId: args.runId,
      questions: args.questions,
      createdAt: Date.now(),
    }
    this.map.set(id, { question, resolver: null })

    eventBus.publish({
      type: 'ask_user.pending',
      conversationId: args.conversationId,
      timestamp: question.createdAt,
      pendingQuestion: question,
    })

    return question
  }

  attachResolver(
    id: string,
    resolver: (answers: Record<string, AskUserAnswer> | null) => void,
  ): void {
    const entry = this.map.get(id)
    if (entry) entry.resolver = resolver
  }

  get(id: string): PendingQuestion | undefined {
    return this.map.get(id)?.question
  }

  listByConversation(conversationId: string): PendingQuestion[] {
    return Array.from(this.map.values())
      .filter((e) => e.question.conversationId === conversationId)
      .map((e) => e.question)
      .sort((a, b) => a.createdAt - b.createdAt)
  }

  /** 用户提交答案：resolve + finalize（发 SSE 让前端关 dialog） */
  answer(id: string, answers: Record<string, AskUserAnswer>): boolean {
    const entry = this.map.get(id)
    if (!entry) return false
    entry.resolver?.(answers)
    this.map.delete(id)
    eventBus.publish({
      type: 'ask_user.resolved',
      conversationId: entry.question.conversationId,
      timestamp: Date.now(),
      pendingId: id,
      answered: true,
    })
    return true
  }

  /** Run abort 路径：静默取消 (不发 SSE，store 跟随 run cleanup 移除) */
  cancel(id: string): void {
    const entry = this.map.get(id)
    if (!entry) return
    entry.resolver?.(null)
    this.map.delete(id)
  }
}

const globalForPQ = globalThis as unknown as {
  __agenthubPendingQuestions?: PendingQuestionsStore
}

export const pendingQuestions =
  globalForPQ.__agenthubPendingQuestions ?? new PendingQuestionsStore()

if (!globalForPQ.__agenthubPendingQuestions) {
  globalForPQ.__agenthubPendingQuestions = pendingQuestions
}
