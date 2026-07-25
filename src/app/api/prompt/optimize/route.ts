import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { z } from 'zod'

import { getEffectiveApiKey } from '@/server/settings-service'

const Body = z.object({
  prompt: z.string().trim().min(1).max(4000),
})

const PROMPT_OPTIMIZE_TEMPERATURE = 0.7
type PromptOptimizeModel = 'deepseek-v4-flash' | 'deepseek-v4-pro'

const DEFAULT_PROMPT_OPTIMIZE_MODEL: PromptOptimizeModel = 'deepseek-v4-flash'
const PROMPT_OPTIMIZE_MODEL = resolvePromptOptimizeModel(
  process.env.PROMPT_OPTIMIZE_MODEL ?? process.env.DEEPSEEK_MODEL,
)
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1'

const PROMPT_OPTIMIZE_SYSTEM_PROMPT = `你是一个通用提示词优化助手。你的任务是把用户提供的原始提示词改写成更清晰、可执行、可直接复制使用的提示词。

工作原则：
1. 先判断原始提示词的真实任务类型，例如：文案创作、代码开发、数据分析、学习辅导、产品设计、翻译润色、通用问答、自动化任务、研究分析等。
2. 必须保留用户的原始意图，不要把非开发需求改写成软件工程任务。
3. 根据任务类型补充必要的上下文、目标、受众、约束、输入信息、输出格式和质量标准。
4. 只有当用户明确要求软件开发、代码实现、调试、重构、技术方案或工程交付时，才加入技术方案、代码结构、测试、验证、风险控制等开发相关要求。
5. 避免无关术语、固定模板和空泛套话；不要输出“复用项目结构”“接口定义”“回滚验证”等与原始需求无关的内容。
6. 如果原始提示词信息不足，可以在优化后的提示词中加入少量需要补充的占位信息，但不要先反问用户。
7. 只输出优化后的提示词本身，不解释优化过程，不添加前后寒暄。

输出要求：
- 使用 Markdown，让结构清晰，列表和分段自然。
- 语言与原始提示词保持一致；原始提示词是中文则输出中文。
- 内容应能直接复制给 AI 使用。`

function resolvePromptOptimizeModel(model: string | undefined): PromptOptimizeModel {
  if (model === 'deepseek-v4-pro' || model === 'deepseek-v4-flash') return model
  return DEFAULT_PROMPT_OPTIMIZE_MODEL
}

function optimizePromptText(prompt: string) {
  const normalized = prompt.trim()
  return [
    '请根据以下原始需求完成任务。',
    '',
    '## 原始需求',
    normalized,
    '',
    '## 任务要求',
    '- 先判断这属于哪类任务，并严格围绕原始意图展开。',
    '- 补充必要的背景、目标、受众、约束、输出格式和质量标准。',
    '- 如果这是文案、翻译、学习、分析、产品设计或通用问答，不要加入软件开发模板。',
    '- 只有当需求明确涉及代码或工程实现时，才加入技术方案、代码结构、测试和验证要求。',
    '- 输出一段可直接复制使用的优化后提示词。',
  ].join('\n')
}

async function optimizePromptWithModel(prompt: string, signal: AbortSignal): Promise<string | null> {
  const apiKey = await getEffectiveApiKey('deepseek')
  if (!apiKey) return null

  const client = new OpenAI({
    apiKey,
    baseURL: DEEPSEEK_BASE_URL,
    maxRetries: 1,
  })

  const result = await client.chat.completions.create(
    {
      model: PROMPT_OPTIMIZE_MODEL,
      temperature: PROMPT_OPTIMIZE_TEMPERATURE,
      messages: [
        { role: 'system', content: PROMPT_OPTIMIZE_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
    },
    { signal },
  )

  const content = result.choices[0]?.message.content?.trim()
  return content || null
}

export async function POST(req: NextRequest) {
  try {
    const parsed = Body.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message }, { status: 400 })
    }

    const enhancedText =
      (await optimizePromptWithModel(parsed.data.prompt, req.signal)) ?? optimizePromptText(parsed.data.prompt)

    return NextResponse.json({ enhancedText })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Prompt optimize failed: ${message}` }, { status: 500 })
  }
}
