import { readFileSync } from 'node:fs'

import OpenAI from 'openai'

import { runWithFailover, type FailoverCandidate } from '@/server/llm-failover'
import { newMessageId } from '@/server/ids'
import { toolRegistry } from '@/server/tools/registry'
import type { ToolContext } from '@/server/tools/types'
import type { DeployStatusRecord, ModelProvider, StreamEvent } from '@/shared/types'

import { resolveCustomProviderClientConfig } from './custom-provider-client'
import type { AdapterAttachment, AdapterInput, AgentPlatformAdapter } from './types'

/**
 * CustomAgentAdapter —— 自配置 Agent 的适配器。
 *
 * 通过 openai SDK 调用底层模型（OpenAI Chat Completions 兼容协议），
 * 自己实现 tool loop：流式拉模型输出 → 解析 tool_calls → 调用 ToolExecutor →
 * 把结果回灌到 messages → 续写下一轮，直到模型不再调工具。
 *
 * 降级兜底：`input.failoverChain` 给出「主模型 → 兜底模型」候选链，建立流失败时依次下探，
 * 全部失败才把错误抛给上层。切换只发生在「本轮尚未产出内容」时，避免重复输出。
 *
 * 详细规格见 specs/05-adapter-interface.md。
 */

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam

interface AccumulatingToolCall {
  id: string
  name: string
  argsBuffer: string
}

/** 防止单条 user message 塞太多图片（token 爆炸 + provider 通常有上限） */
const MAX_IMAGES_PER_MESSAGE = 5
export const CUSTOM_AGENT_MAX_TURNS = 32

/**
 * 单轮输出上限。
 *
 * 此前完全没设置 —— 由网关默认值决定，长文档 / 大 artifact 会被静默截断成
 * `finish_reason='length'`；配合下面「截断即丢弃 tool_call」的处理，保证不会把半截
 * arguments 回传给网关。主流网关（deepseek / 火山 / openai 等）都支持 8192。
 */
export const CUSTOM_AGENT_MAX_OUTPUT_TOKENS = 8192

/** 连续被长度上限截断的容忍次数；超过就终止 run，避免空转烧预算。 */
const MAX_TRUNCATION_STREAK = 2

/** 截断时回填的 assistant 占位正文（避免用 null content 触发部分网关的校验）。 */
const TRUNCATED_ASSISTANT_PLACEHOLDER = '（本条输出因达到单次长度上限被截断，正文不完整）'

/** 截断后注入的续写指令：明确「上一次调用已作废」，并给出分块产出的做法。 */
const TRUNCATION_RETRY_NOTICE = [
  '[系统提示] 你上一条输出因达到单次长度上限而被截断，其中不完整的工具调用已被全部丢弃，请重新执行。',
  '- 需要调用工具时，先发起工具调用（arguments 必须是完整、合法的 JSON），工具调用之前不要输出大段正文。',
  '- 单条正文 / 单个工具参数不要超过约 4000 token；内容很长时请拆成多次调用分块产出（例如按章节分批写 artifact）。',
  '- 不要重复已经输出过的内容。',
].join('\n')

export class CustomAgentAdapter implements AgentPlatformAdapter {
  readonly name = 'custom' as const

  async *stream(input: AdapterInput, signal: AbortSignal): AsyncIterable<StreamEvent> {
    if (!input.customConfig) {
      throw new Error('CustomAgentAdapter requires customConfig')
    }
    if (!input.modelId) {
      throw new Error('CustomAgentAdapter requires modelId')
    }
    const { modelProvider, supportsVision } = input.customConfig
    const modelId = input.modelId
    const systemPrompt = input.systemPrompt

    // 候选链：AgentRunner 解析好的「主模型 → 兜底模型」；缺省时退化成只用 agent 自己配的那一个
    // （保持旧行为：apiKey 为空时由 adapter 走环境变量兜底）。
    const chain: FailoverCandidate[] =
      input.failoverChain && input.failoverChain.length > 0
        ? input.failoverChain
        : [
            {
              providerId: null,
              provider: modelProvider,
              apiKey: input.apiKey ?? '',
              apiBaseUrl: input.apiBaseUrl,
              modelId,
            },
          ]
    const capabilityKey = input.failoverCapabilityKey ?? 'agent:default'
    /** 本 run 实际提供服务的候选（切换后会被更新），run.usage 里回报真实模型 */
    let activeModelId = modelId

    const toolDefs = toolRegistry.resolve(input.toolNames)
    const apiTools = toolDefs.map(toApiTool)

    const ctx: ToolContext = {
      conversationId: input.conversationId,
      workspacePath: input.workspacePath,
      agentId: input.agentId,
      runId: input.runId,
      abortSignal: signal,
    }

    // 构造 user message content：若 agent 声明 vision + 实际有图片，走 multimodal blocks
    const imageAttachments =
      input.attachments?.filter((a) => a.kind === 'image').slice(0, MAX_IMAGES_PER_MESSAGE) ?? []
    const useMultimodal = !!supportsVision && imageAttachments.length > 0

    const userContent: ChatMessage['content'] = useMultimodal
      ? buildMultimodalUserContent(input.prompt, imageAttachments)
      : input.prompt

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      // 跨 run 历史：spec 13 序列化的对话上下文。空数组时行为与旧版一致（向后兼容）。
      ...(input.history ?? []),
      { role: 'user', content: userContent },
    ]

    let turn = 0
    /** 连续被长度上限截断的轮数：正常收尾或被截断后的续写会重置。 */
    let truncationStreak = 0
    // 跨 turn 累加 token 用量；run 结束前 yield run.usage 给 AgentRunner 落库
    const runUsage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      lastInputTokens: 0,
    }

    while (turn < CUSTOM_AGENT_MAX_TURNS) {
      if (signal.aborted) return
      turn++

      const messageId = newMessageId()
      yield baseEvent(input, {
        type: 'message.start',
        messageId,
        agentId: input.agentId,
        runId: input.runId,
      })

      let textPartIndex = -1
      let textBuffer = ''
      let thinkingPartIndex = -1
      let reasoningBuffer = ''
      let nextPartIndex = 0
      const toolCallBuffer = new Map<number, AccumulatingToolCall>()

      // 本轮「是否已经产出内容」——决定还能不能换候选。建立流阶段恒为 false，
      // 因此 429 / 402 / 5xx / 超时这类「握手就失败」的错误都能就地降级。
      let emittedThisTurn = false
      let stream: Awaited<ReturnType<OpenAI['chat']['completions']['create']>>
      try {
        const opened = await runWithFailover(
          chain,
          (candidate) =>
            buildClient(candidate.provider, candidate.apiKey, candidate.apiBaseUrl).chat.completions.create(
              {
                model: candidate.modelId,
                messages,
                tools: apiTools.length > 0 ? apiTools : undefined,
                stream: true,
                stream_options: { include_usage: true },
                max_tokens: CUSTOM_AGENT_MAX_OUTPUT_TOKENS,
              },
              { signal },
            ),
          { capabilityKey, signal, canSwitch: () => !emittedThisTurn },
        )
        stream = opened.value
        activeModelId = opened.candidate.modelId
      } catch (err) {
        yield baseEvent(input, { type: 'message.end', messageId })
        throw err
      }

      let finishReason: string | null = null
      // 本 turn 单条 message 的 usage（per-message）；与 runUsage 同时维护
      const msgUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 }

      for await (const chunk of stream as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>) {
        if (signal.aborted) return
        // Final usage chunk (stream_options.include_usage)：choices 通常空，只携 usage。
        // DeepSeek 还附带 prompt_cache_hit_tokens / prompt_cache_miss_tokens。
        const usage = (chunk as { usage?: Record<string, number> | null }).usage
        if (usage) {
          const inp = usage.prompt_tokens ?? 0
          const out = usage.completion_tokens ?? 0
          const cached = usage.prompt_cache_hit_tokens ?? usage.cached_tokens ?? 0
          msgUsage.inputTokens += inp
          msgUsage.outputTokens += out
          msgUsage.cacheReadTokens += cached
          runUsage.inputTokens += inp
          runUsage.outputTokens += out
          runUsage.cacheReadTokens += cached
          runUsage.lastInputTokens = inp
        }
        const choice = chunk.choices[0]
        if (!choice) continue
        // DeepSeek V4/R1 等 thinking-mode 模型在 delta 上加了 reasoning_content
        // 字段，OpenAI SDK 的官方类型不含，这里宽放成扩展形态。
        const delta = choice.delta as OpenAI.Chat.Completions.ChatCompletionChunk['choices'][number]['delta'] & {
          reasoning_content?: string
        }

        // —— reasoning_content (thinking mode) —— 先 yield 出来让 UI 渲染 thinking part
        if (typeof delta.reasoning_content === 'string' && delta.reasoning_content.length > 0) {
          emittedThisTurn = true
          if (thinkingPartIndex < 0) {
            thinkingPartIndex = nextPartIndex++
            yield baseEvent(input, {
              type: 'part.start',
              messageId,
              partIndex: thinkingPartIndex,
              part: { type: 'thinking', content: '' },
            })
          }
          reasoningBuffer += delta.reasoning_content
          yield baseEvent(input, {
            type: 'part.delta',
            messageId,
            partIndex: thinkingPartIndex,
            delta: { type: 'thinking.append', text: delta.reasoning_content },
          })
        }

        if (typeof delta.content === 'string' && delta.content.length > 0) {
          emittedThisTurn = true
          if (textPartIndex < 0) {
            textPartIndex = nextPartIndex++
            yield baseEvent(input, {
              type: 'part.start',
              messageId,
              partIndex: textPartIndex,
              part: { type: 'text', content: '' },
            })
          }
          textBuffer += delta.content
          yield baseEvent(input, {
            type: 'part.delta',
            messageId,
            partIndex: textPartIndex,
            delta: { type: 'text.append', text: delta.content },
          })
        }

        if (delta.tool_calls) {
          if (delta.tool_calls.length > 0) emittedThisTurn = true
          for (const tcd of delta.tool_calls) {
            const idx = tcd.index
            let entry = toolCallBuffer.get(idx)
            if (!entry) {
              entry = { id: '', name: '', argsBuffer: '' }
              toolCallBuffer.set(idx, entry)
            }
            if (tcd.id) entry.id = tcd.id
            if (tcd.function?.name) entry.name = tcd.function.name
            if (tcd.function?.arguments) entry.argsBuffer += tcd.function.arguments
          }
        }

        if (choice.finish_reason) finishReason = choice.finish_reason
      }

      if (thinkingPartIndex >= 0) {
        yield baseEvent(input, { type: 'part.end', messageId, partIndex: thinkingPartIndex })
      }
      if (textPartIndex >= 0) {
        yield baseEvent(input, { type: 'part.end', messageId, partIndex: textPartIndex })
      }

      const toolCalls = Array.from(toolCallBuffer.values()).filter((tc) => tc.id && tc.name)

      // ── 输出被长度上限截断：本轮 tool_call 的 arguments 必然不完整 ──
      // 这里绝不能"照常执行"：现场事故就是把半截 arguments 原样回传，网关直接
      // 400 `function.arguments must be in JSON format`，整个 run 猝死、已产出产物一并作废。
      if (finishReason === 'length') {
        truncationStreak += 1
        if (truncationStreak > MAX_TRUNCATION_STREAK) {
          yield baseEvent(input, { type: 'message.end', messageId })
          throw new Error(
            `模型输出连续 ${truncationStreak} 次达到单次长度上限（max_tokens=${CUSTOM_AGENT_MAX_OUTPUT_TOKENS}）。` +
              '请把任务拆得更小，或让 Agent 分块产出内容后再试。',
          )
        }
        console.warn(
          `[CustomAgentAdapter] finish_reason=length：丢弃本轮 ${toolCalls.length} 个不完整 tool_call（第 ${truncationStreak} 次）`,
        )
        // 只保留已完整产出的正文；不带 tool_calls（半截参数回传会被网关拒绝）
        messages.push({
          role: 'assistant',
          content: textBuffer || TRUNCATED_ASSISTANT_PLACEHOLDER,
          ...(reasoningBuffer ? { reasoning_content: reasoningBuffer } : {}),
        } as ChatMessage)
        messages.push({ role: 'user', content: TRUNCATION_RETRY_NOTICE })
        if (msgUsage.inputTokens > 0 || msgUsage.outputTokens > 0) {
          yield baseEvent(input, { type: 'message.usage', messageId, usage: msgUsage })
        }
        yield baseEvent(input, { type: 'message.end', messageId })
        continue
      }
      truncationStreak = 0

      // 写回 assistant message
      // DeepSeek thinking-mode 模型要求把 reasoning_content 一起回传到下一轮，
      // 否则 API 返回 "The reasoning_content in the thinking mode must be passed back".
      // OpenAI SDK 类型不识 reasoning_content，用扩展 cast。
      const assistantMsg = {
        role: 'assistant' as const,
        content: textBuffer || null,
        tool_calls:
          toolCalls.length > 0
            ? toolCalls.map((tc) => ({
                id: tc.id,
                type: 'function' as const,
                function: { name: tc.name, arguments: safeArgumentsJson(tc.argsBuffer) },
              }))
            : undefined,
        ...(reasoningBuffer ? { reasoning_content: reasoningBuffer } : {}),
      }
      messages.push(assistantMsg as ChatMessage)

      if (toolCalls.length === 0 || finishReason === 'stop') {
        if (msgUsage.inputTokens > 0 || msgUsage.outputTokens > 0) {
          yield baseEvent(input, { type: 'message.usage', messageId, usage: msgUsage })
        }
        yield baseEvent(input, { type: 'message.end', messageId })
        yield baseEvent(input, {
          type: 'run.usage',
          runId: input.runId,
          usage: { ...runUsage, model: activeModelId },
        })
        return
      }

      // 执行工具
      for (const tc of toolCalls) {
        // 参数不是合法 JSON：不回传原始片段（网关会 400 打死整个 run），
        // 改为产出一条明确的工具错误，让模型重新发起一次完整调用。
        const invalidArgs = describeInvalidToolArguments(tc.argsBuffer)
        if (invalidArgs) {
          const errorText =
            `工具参数不是合法 JSON（${invalidArgs}）。收到的原始参数片段：${truncateForPrompt(tc.argsBuffer, 300)}。` +
            `请重新调用 ${tc.name}，确保 arguments 是完整、合法的 JSON 对象；内容过长时请拆成多次调用分批产出。`
          yield baseEvent(input, {
            type: 'tool.call',
            messageId,
            callId: tc.id,
            toolName: tc.name,
            args: {},
          })
          yield baseEvent(input, {
            type: 'tool.result',
            messageId,
            callId: tc.id,
            result: { error: errorText },
            isError: true,
          })
          messages.push({ role: 'tool', tool_call_id: tc.id, content: `Error: ${errorText}` })
          continue
        }

        let args: unknown
        try {
          args = tc.argsBuffer ? JSON.parse(tc.argsBuffer) : {}
        } catch {
          args = {}
        }

        yield baseEvent(input, {
          type: 'tool.call',
          messageId,
          callId: tc.id,
          toolName: tc.name,
          args,
        })

        const result = await toolRegistry.executeStructured(tc.name, args, {
          ...ctx,
          toolCallId: tc.id,
        })
        const value = result.output

        yield baseEvent(input, {
          type: 'tool.result',
          messageId,
          callId: tc.id,
          result: value,
          isError: !result.ok,
        })

        // 工具结果含 artifactId 视为「创建了产物」的约定，统一由 adapter 发布
        // artifact.create 事件，让上层 AgentRunner 注入 artifact_ref part。
        if (tc.name === 'write_artifact' && result.ok && hasArtifactId(value)) {
          const artifactId = (value as { artifactId: string }).artifactId
          const { db, schema } = await import('@/db/client')
          const { eq } = await import('drizzle-orm')
          const artifact = await db.query.artifacts.findFirst({
            where: eq(schema.artifacts.id, artifactId),
          })
          if (artifact) {
            yield baseEvent(input, {
              type: 'artifact.create',
              artifact: {
                id: artifact.id,
                conversationId: artifact.conversationId,
                type: artifact.type,
                title: artifact.title,
                content: artifact.content,
                version: artifact.version,
                parentArtifactId: artifact.parentArtifactId ?? undefined,
                createdByAgentId: artifact.createdByAgentId,
                createdAt: artifact.createdAt,
              },
            })
          }
        }

        if (
          (tc.name === 'deploy_artifact' || tc.name === 'deploy_workspace') &&
          result.ok &&
          isDeployStatusRecord(value)
        ) {
          yield baseEvent(input, {
            type: 'deploy.status',
            messageId,
            deployment: value,
          })
        }

        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: result.promptText,
        })
      }

      if (msgUsage.inputTokens > 0 || msgUsage.outputTokens > 0) {
        yield baseEvent(input, { type: 'message.usage', messageId, usage: msgUsage })
      }
      yield baseEvent(input, { type: 'message.end', messageId })
      // 继续下一轮
    }
    // 到达 MAX_TURNS 兜底：把累计 usage emit 一下（正常路径在 line 232 已 emit 过 + return）
    yield baseEvent(input, {
      type: 'run.usage',
      runId: input.runId,
      usage: { ...runUsage, model: activeModelId },
    })
  }
}

// ─── 辅助 ────────────────────────────────────────────────

/**
 * OpenAI SDK 默认 maxRetries=2，对 408 / 429 / >= 500 / APIConnectionError 自动指数退避重试。
 * 这里显式声明同样的 2 次重试，让 spec 05 §「错误处理」承诺的「网络/速率限制重试」在代码层
 * 可见且可调（未来按 provider 调整时只动这一个常量）。
 *
 * 注意：重试只对「初始连接」生效；stream 一旦开始 emit chunks 就不会再重试。
 */
const MAX_API_RETRIES = 2

function buildClient(
  provider: ModelProvider,
  overrideKey?: string | null,
  apiBaseUrl?: string | null,
): OpenAI {
  return new OpenAI({
    ...resolveCustomProviderClientConfig(provider, overrideKey, apiBaseUrl),
    maxRetries: MAX_API_RETRIES,
  })
}

function toApiTool(t: {
  name: string
  description: string
  parameters: Record<string, unknown>
}): OpenAI.Chat.Completions.ChatCompletionTool {
  return {
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }
}

/**
 * 回传给网关的 tool_call arguments 必须是合法 JSON 字符串。
 *
 * 模型偶发输出半截 JSON（输出被截断、生成中止）时，原样回传会被网关直接
 * 400（`function.arguments ... must be in JSON format` 之类）。
 * 解析不了就退化成空对象 `{}` —— 对应的工具会因缺少必填参数报错，模型据此自我修正。
 */
export function safeArgumentsJson(buffer: string): string {
  const trimmed = buffer.trim()
  if (!trimmed) return '{}'
  try {
    JSON.parse(trimmed)
    return trimmed
  } catch {
    return '{}'
  }
}

/** 参数能解析时返回 null；不能解析时返回错误描述（供工具错误信息使用）。 */
export function describeInvalidToolArguments(buffer: string): string | null {
  const trimmed = buffer.trim()
  if (!trimmed) return null
  try {
    JSON.parse(trimmed)
    return null
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

/** 把可能是超长半截 JSON 的参数压成一行短摘要放进错误信息。 */
function truncateForPrompt(value: string, max: number): string {
  const flat = value.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max)}…` : flat
}

function hasArtifactId(value: unknown): value is { artifactId: string } {
  return (
    value !== null &&
    typeof value === 'object' &&
    'artifactId' in value &&
    typeof (value as { artifactId: unknown }).artifactId === 'string'
  )
}

function isDeployStatusRecord(value: unknown): value is DeployStatusRecord {
  return (
    value !== null &&
    typeof value === 'object' &&
    'id' in value &&
    typeof (value as { id: unknown }).id === 'string' &&
    'artifactId' in value &&
    typeof (value as { artifactId: unknown }).artifactId === 'string' &&
    'previewPath' in value &&
    typeof (value as { previewPath: unknown }).previewPath === 'string' &&
    'status' in value &&
    ((value as { status: unknown }).status === 'ready' ||
      (value as { status: unknown }).status === 'failed') &&
    'createdAt' in value &&
    typeof (value as { createdAt: unknown }).createdAt === 'number'
  )
}

/**
 * 构造 OpenAI 风格的多模态 user message content：
 *   [{ type: 'text', text: ... }, { type: 'image_url', image_url: { url: 'data:...' } }, ...]
 *
 * DeepSeek 兼容 OpenAI schema；Anthropic 的 image block 形态不同，目前 CustomAgentAdapter
 * 走 openai SDK + OpenAI-compatible endpoint，先只支持这一套。
 */
function buildMultimodalUserContent(
  prompt: string,
  images: AdapterAttachment[],
): OpenAI.Chat.Completions.ChatCompletionContentPart[] {
  const blocks: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    { type: 'text', text: prompt },
  ]
  for (const img of images) {
    try {
      const data = readFileSync(img.absPath).toString('base64')
      blocks.push({
        type: 'image_url',
        image_url: {
          url: `data:${img.mimeType};base64,${data}`,
        },
      })
    } catch (err) {
      console.warn('[CustomAgentAdapter] failed to read image', img.absPath, err)
    }
  }
  return blocks
}

function baseEvent<T extends Omit<StreamEvent, 'conversationId' | 'timestamp'>>(
  input: AdapterInput,
  body: T,
): StreamEvent {
  return {
    ...body,
    conversationId: input.conversationId,
    timestamp: Date.now(),
  } as StreamEvent
}
