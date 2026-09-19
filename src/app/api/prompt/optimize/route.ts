import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { z } from 'zod'

import { PROMPT_ENHANCE_SYSTEM_PROMPT, buildEnhanceUserMessage, extractUserInput, resolveEnhancedPrompt } from '@/server/prompt-enhance'
import { getProvider } from '@/server/provider-service'
import {
  classifyError,
  getFailoverConfig,
  recordFailoverEvent,
  recordProviderFailure,
  recordProviderSuccess,
  resolveProvider,
} from '@/server/provider-router'
import type { PromptEnhanceContext } from '@/shared/prompt-enhance'

const ContextSchema = z
  .object({
    participants: z.array(z.string().trim().min(1)).max(20).optional(),
    attachments: z.array(z.string().trim().min(1)).max(20).optional(),
    planRevision: z.boolean().optional(),
    quote: z.string().trim().max(200).optional(),
    title: z.string().trim().max(200).optional(),
    description: z.string().trim().max(1000).optional(),
    schedule: z.string().trim().max(200).optional(),
  })
  .optional()

const Body = z.object({
  prompt: z.string().trim().min(1).max(4000),
  context: ContextSchema,
})

const PROMPT_OPTIMIZE_TEMPERATURE = 0.7
const CAPABILITY_KEY = 'prompt_optimize'

// 各 provider 的默认模型（优先级列表里没指定 model 时用）
const DEFAULT_MODELS: Record<string, string> = {
  deepseek: process.env.PROMPT_OPTIMIZE_MODEL ?? 'deepseek-v4-flash',
  openai: process.env.PROMPT_OPTIMIZE_OPENAI_MODEL ?? 'gpt-4o-mini',
  anthropic: process.env.PROMPT_OPTIMIZE_ANTHROPIC_MODEL ?? 'gpt-4o-mini',
  ark: process.env.PROMPT_OPTIMIZE_ARK_MODEL ?? 'doubao-1-5-pro-32k',
}

/** 根据 provider 配置创建 OpenAI 兼容 client。 */
function createClientForProvider(provider: { providerType: string; apiKey: string | null; baseUrl: string | null }): OpenAI {
  const baseURL = provider.baseUrl ?? undefined
  return new OpenAI({ apiKey: provider.apiKey ?? '', baseURL, maxRetries: 0 })
}

/**
 * 调用 LLM 优化提示词，带故障转移。
 *
 * 逻辑：
 * 1. resolveProvider 根据优先级 + 状态选当前可用的 provider
 * 2. 调用成功 → recordProviderSuccess，返回结果
 * 3. 调用失败 → recordProviderFailure
 *    - 触发故障转移（达到重试阈值）→ recordFailoverEvent，重试（resolveProvider 会跳过冷却期内的）
 *    - 不触发故障转移（参数错误等）→ 直接抛出
 * 4. 最多尝试 3 个 provider，都失败则抛出最后一个错误
 * 5. 没有配置优先级/供应商 → 返回 null，走本地兜底
 *
 * 注意入参:`rawPrompt` 是已经抽出来的用户原文,`context` 只是「仅供理解」的素材,
 * 两者在消息里分开摆放 —— 这样模型不会把背景当成任务内容,也便于定位输出漂移。
 */
async function optimizePromptWithModel(
  rawPrompt: string,
  context: PromptEnhanceContext | undefined,
  signal: AbortSignal,
): Promise<string | null> {
  const config = await getFailoverConfig()
  const maxAttempts = config.enabled ? 3 : 1
  let lastError: unknown = null
  let previousProviderId: string | null = null

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const resolved = await resolveProvider(CAPABILITY_KEY)
    if (!resolved) break

    const provider = await getProvider(resolved.providerId)
    if (!provider?.apiKey) {
      // 没有 key，标记失败继续下一个
      await recordProviderFailure(resolved.providerId, new Error('API Key not configured'))
      previousProviderId = resolved.providerId
      continue
    }

    const client = createClientForProvider(provider)
    const model = resolved.modelName ?? DEFAULT_MODELS[provider.providerType] ?? 'gpt-4o-mini'
    const startTime = Date.now()

    try {
      const result = await client.chat.completions.create(
        {
          model,
          temperature: PROMPT_OPTIMIZE_TEMPERATURE,
          messages: [
            { role: 'system', content: PROMPT_ENHANCE_SYSTEM_PROMPT },
            { role: 'user', content: buildEnhanceUserMessage(rawPrompt, context) },
          ],
        },
        { signal },
      )

      const content = result.choices[0]?.message.content?.trim()
      if (content) {
        await recordProviderSuccess(resolved.providerId, Date.now() - startTime)
        return content
      }
      // 空内容不算故障转移错误，继续下一个
      lastError = new Error('Empty response')
    } catch (err) {
      lastError = err
      const triggerType = classifyError(err)
      const { triggered } = await recordProviderFailure(resolved.providerId, err)

      if (triggered && previousProviderId && previousProviderId !== resolved.providerId) {
        // 记录切换事件
        await recordFailoverEvent(
          CAPABILITY_KEY,
          previousProviderId,
          resolved.providerId,
          triggerType ? `${triggerType} triggered failover` : 'provider unavailable',
          triggerType ?? undefined,
        )
      }
      previousProviderId = resolved.providerId

      // 不触发故障转移的错误（参数错误、业务错误等），直接抛出
      if (!config.enabled || !triggerType) {
        throw err
      }
    }
  }

  if (lastError) throw lastError
  return null
}

export async function POST(req: NextRequest) {
  try {
    const parsed = Body.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message }, { status: 400 })
    }

    // 旧客户端会把「原始输入 + 系统上下文」拼成一整段发过来，这里先取出真正的用户原文，
    // 保证即便走降级路径，输出里也不会出现会话模式/审批模式这类系统上下文。
    const rawPrompt = extractUserInput(parsed.data.prompt)
    if (!rawPrompt) {
      return NextResponse.json({ error: 'prompt is empty' }, { status: 400 })
    }

    const modelOutput = await optimizePromptWithModel(rawPrompt, parsed.data.context, req.signal)
    const { text, source } = resolveEnhancedPrompt({ rawPrompt, modelOutput })

    return NextResponse.json({ enhancedText: text, source })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Prompt optimize failed: ${message}` }, { status: 500 })
  }
}
