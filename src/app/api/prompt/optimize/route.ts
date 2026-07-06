import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const Body = z.object({
  prompt: z.string().trim().min(1).max(4000),
})

function optimizePromptText(prompt: string) {
  const normalized = prompt.trim()
  return [
    '请基于以下原始需求完成任务。',
    '',
    '## 原始需求',
    normalized,
    '',
    '## 执行要求',
    '1. 先识别目标、背景、输入信息和约束条件；如信息不足，先列出需要澄清的问题。',
    '2. 将任务拆解为可执行步骤，并说明每一步的预期结果。',
    '3. 优先复用现有项目结构、接口和代码风格，不引入不必要的依赖或抽象。',
    '4. 对涉及风险的操作给出边界条件和回滚/验证方式。',
    '',
    '## 输出格式',
    '- 目标理解',
    '- 执行计划',
    '- 关键实现或操作步骤',
    '- 验证方式',
  ].join('\n')
}

export async function POST(req: NextRequest) {
  try {
    const parsed = Body.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message }, { status: 400 })
    }

    return NextResponse.json({ enhancedText: optimizePromptText(parsed.data.prompt) })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Prompt optimize failed: ${message}` }, { status: 500 })
  }
}
