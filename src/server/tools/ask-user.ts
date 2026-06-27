import { z } from 'zod'

import { pendingQuestions } from '@/server/pending-questions'
import type { AskUserAnswer } from '@/shared/types'

import type { ToolDef } from './types'

/**
 * ask_user —— 让 agent 结构化问用户问题。
 *
 * Schema 与 Anthropic SDK 的 AskUserQuestion 对齐（1-4 questions × 2-4 options 每题）。
 * Custom adapter 通过 toolRegistry.execute 直接调本工具；
 * ClaudeCodeAdapter 通过 createSdkMcpServer 把它暴露成 `mcp__agenthub__ask_user`。
 *
 * 返回：`{ answers: { [question]: 'label1, label2' | 'label1; note: 自由文本' } }`
 * 给用户选了「其他」并填了 freeformNote 时，answer 字符串里追加 `note:` 段。
 */

const OptionSchema = z.object({
  label: z.string().min(1),
  description: z.string().optional().default(''),
  preview: z.string().optional(),
})

const QuestionSchema = z.object({
  question: z.string().min(1),
  header: z.string().min(1).max(40),
  options: z.array(OptionSchema).min(2).max(4),
  multiSelect: z.boolean().optional().default(false),
})

const ArgsSchema = z.object({
  questions: z.array(QuestionSchema).min(1).max(4),
})

export const askUserTool: ToolDef = {
  name: 'ask_user',
  description:
    'Ask the user one or more structured multiple-choice questions with 2-4 options each. Use when there is a clear set of choices the user should pick from (vs. open-ended questions, where you should just ask in text). Each option carries a short label + a description + optional preview content (code snippet, mockup) for the dropdown UI. Returns the user\'s chosen labels (and any free-form note they added).',
  parameters: {
    type: 'object',
    required: ['questions'],
    properties: {
      questions: {
        type: 'array',
        minItems: 1,
        maxItems: 4,
        description: 'Questions to ask (1-4)',
        items: {
          type: 'object',
          required: ['question', 'header', 'options'],
          properties: {
            question: { type: 'string', description: 'Full question text (end with ?)' },
            header: { type: 'string', description: 'Short chip label (≤12 chars)' },
            multiSelect: {
              type: 'boolean',
              description: 'true = user can pick multiple options',
            },
            options: {
              type: 'array',
              minItems: 2,
              maxItems: 4,
              items: {
                type: 'object',
                required: ['label'],
                properties: {
                  label: { type: 'string', description: 'Short (1-5 words) shown in button' },
                  description: { type: 'string', description: 'Explanation / trade-off note' },
                  preview: {
                    type: 'string',
                    description: 'Optional code/text preview to show next to the option',
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  async handler(args, ctx) {
    const parsed = ArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: `Invalid args: ${parsed.error.message}` }
    }

    const pending = pendingQuestions.register({
      conversationId: ctx.conversationId,
      agentId: ctx.agentId,
      runId: ctx.runId,
      questions: parsed.data.questions,
    })

    const decision = await new Promise<Record<string, AskUserAnswer> | null>((resolve) => {
      pendingQuestions.attachResolver(pending.id, resolve)
      const onAbort = () => {
        pendingQuestions.cancel(pending.id)
        resolve(null)
      }
      if (ctx.abortSignal.aborted) onAbort()
      else ctx.abortSignal.addEventListener('abort', onAbort, { once: true })
    })

    if (!decision) {
      return { ok: false, error: 'User did not answer the question (aborted)' }
    }

    // 格式化成「问题文本 → 答案字符串」给 LLM 看
    const formatted: Record<string, string> = {}
    for (const q of parsed.data.questions) {
      const a = decision[q.question]
      if (!a) {
        formatted[q.question] = '(no answer)'
        continue
      }
      const parts: string[] = []
      if (a.selectedLabels.length > 0) parts.push(a.selectedLabels.join(', '))
      if (a.freeformNote && a.freeformNote.trim()) parts.push(`note: ${a.freeformNote.trim()}`)
      formatted[q.question] = parts.join(' ; ') || '(empty)'
    }

    return { ok: true, value: { answers: formatted } }
  },
}
