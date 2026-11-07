import type { ArtifactRecord, DispatchPlanItem, StreamEvent } from './types'

/**
 * 脚本化流式步骤 —— MockAdapter 与 /demo 回放共用同一种事件序列。
 *
 * 一个步骤对应一段「一次 LLM 响应里」的内容：一段文字 / 一段思考 / 一段代码 /
 * 一次工具调用 / 一次产物创建 / 一份调度计划。生成器按现有 MockAdapter 的
 * 节奏吐事件（text 4 字 / 20ms、thinking 与 code 8 字 / 15ms、工具调用停 300ms），
 * 两边的回放体感一致，事件协议也走同一条 StreamEvent 契约。
 *
 * partIndex 按 parts 数组的真实下标推进：tool.call / tool.result 各占一位
 * （reducer 里是 push），artifact_ref 再占一位 —— 不能像旧 MockAdapter 那样
 * 按步骤数粗略递增，否则 tool 步骤后的一段文字会覆盖掉刚推入的 tool_result。
 */
export type ScriptStep =
  | { kind: 'text'; content: string }
  | { kind: 'thinking'; content: string }
  | { kind: 'code'; language: string; content: string }
  | { kind: 'tool'; toolName: string; args: unknown; result?: unknown }
  | {
      kind: 'artifact'
      toolName: string
      args: unknown
      result?: unknown
      artifact: ArtifactRecord
    }
  | { kind: 'dispatch'; plan: DispatchPlanItem[] }

export interface ScriptTurnContext {
  conversationId: string
  messageId: string
  agentId: string
  runId: string
}

/** 一条 agent 消息的完整事件流：message.start → 各步骤 → message.end。 */
export async function* streamScriptTurn(
  steps: ScriptStep[],
  ctx: ScriptTurnContext,
  signal: AbortSignal,
  newCallId: () => string,
  opts?: { instant?: boolean },
): AsyncIterable<StreamEvent> {
  const instant = opts?.instant ?? false
  const base = { conversationId: ctx.conversationId, timestamp: Date.now() }
  yield {
    ...base,
    type: 'message.start',
    messageId: ctx.messageId,
    agentId: ctx.agentId,
    runId: ctx.runId,
  }

  // 下一个 part 将要占据的 parts 数组下标
  let partIndex = 0

  for (const step of steps) {
    if (signal.aborted) break

    if (step.kind === 'text' || step.kind === 'thinking' || step.kind === 'code') {
      const index = partIndex++
      const part =
        step.kind === 'text'
          ? { type: 'text' as const, content: '' }
          : step.kind === 'thinking'
            ? { type: 'thinking' as const, content: '' }
            : { type: 'code' as const, language: step.language, content: '' }
      const deltaType =
        step.kind === 'text'
          ? 'text.append'
          : step.kind === 'thinking'
            ? 'thinking.append'
            : 'code.append'
      const chunkSize = step.kind === 'text' ? 4 : 8
      const chunkDelayMs = step.kind === 'text' ? 20 : 15
      yield { ...base, type: 'part.start', messageId: ctx.messageId, partIndex: index, part }
      for (const chunk of chunkText(step.content, chunkSize)) {
        if (signal.aborted) break
        await sleep(chunkDelayMs, instant)
        yield {
          ...base,
          type: 'part.delta',
          messageId: ctx.messageId,
          partIndex: index,
          delta: { type: deltaType, text: chunk },
        }
      }
      yield { ...base, type: 'part.end', messageId: ctx.messageId, partIndex: index }
    } else if (step.kind === 'tool') {
      yield* streamToolCall(step.toolName, step.args, step.result, ctx, signal, newCallId, instant)
      partIndex += 2
    } else if (step.kind === 'artifact') {
      yield* streamToolCall(step.toolName, step.args, step.result, ctx, signal, newCallId, instant)
      if (signal.aborted) break
      partIndex += 2
      yield { ...base, type: 'artifact.create', artifact: step.artifact }
      const index = partIndex++
      yield {
        ...base,
        type: 'part.start',
        messageId: ctx.messageId,
        partIndex: index,
        part: { type: 'artifact_ref', artifactId: step.artifact.id },
      }
      yield { ...base, type: 'part.end', messageId: ctx.messageId, partIndex: index }
    } else {
      yield { ...base, type: 'dispatch.plan', runId: ctx.runId, plan: step.plan }
    }
  }

  yield { ...base, type: 'message.end', messageId: ctx.messageId }
}

async function* streamToolCall(
  toolName: string,
  args: unknown,
  result: unknown,
  ctx: ScriptTurnContext,
  signal: AbortSignal,
  newCallId: () => string,
  instant: boolean,
): AsyncIterable<StreamEvent> {
  const base = { conversationId: ctx.conversationId, timestamp: Date.now() }
  const callId = newCallId()
  yield {
    ...base,
    type: 'tool.call',
    messageId: ctx.messageId,
    callId,
    toolName,
    args,
  }
  await sleep(300, instant)
  if (signal.aborted) return
  yield {
    ...base,
    type: 'tool.result',
    messageId: ctx.messageId,
    callId,
    result: result ?? { ok: true },
    isError: false,
  }
}

function chunkText(text: string, size: number): string[] {
  const chunks: string[] = []
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size))
  }
  return chunks
}

function sleep(ms: number, instant = false): Promise<void> {
  if (instant) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, ms))
}
