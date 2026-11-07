import type { StreamEvent } from '@/shared/types'
import { newMessageId, newToolCallId } from '@/server/ids'
import { DEMO_SCRIPT_TRIGGER, DEMO_TURNS } from '@/server/demo-seed'
import type { ScriptStep } from '@/shared/scripted-stream'
import { streamScriptTurn } from '@/shared/scripted-stream'

import type { AdapterInput, AgentPlatformAdapter } from './types'

/**
 * MockAdapter — 不调用任何真实 LLM，按预设脚本吐流式事件。
 *
 * 用途：
 *   1. 开发期不烧 token
 *   2. 端到端骨架验证（SSE / store / UI 渲染）
 *   3. 演示环境备份
 *
 * 行为：
 *   - 根据 prompt 关键词选择不同响应脚本（让 demo 看起来"智能"）
 *   - 字符级流式（每 ~15ms 一个 chunk），还原真实体感
 *   - 支持 AbortSignal
 *   - prompt 含「光影造像工坊」时走演示脚本：按 agentId 取 demo-seed 里对应的
 *     那一轮（PRD → 设计稿 → 网页 → 评审），事件序列与 /demo 客户端回放同一份数据
 */
export class MockAdapter implements AgentPlatformAdapter {
  readonly name = 'mock' as const

  async *stream(input: AdapterInput, signal: AbortSignal): AsyncIterable<StreamEvent> {
    const script = pickScript(input.prompt, input.agentId)
    yield* streamScriptTurn(
      script,
      {
        conversationId: input.conversationId,
        messageId: newMessageId(),
        agentId: input.agentId,
        runId: input.runId,
      },
      signal,
      () => newToolCallId(),
    )
  }
}

// ─── 内置脚本 ─────────────────────────────────────────────
const GREETING_SCRIPT: ScriptStep[] = [
  { kind: 'thinking', content: '用户在问候，我应该礼貌回应并介绍自己。' },
  {
    kind: 'text',
    content:
      '你好！我是 Mock Agent，目前用于验证 Multi-Agent TeamFlow 的端到端骨架。我会按预设脚本流式回复，不消耗任何 LLM token。\n\n你可以试试输入「写代码」或「执行任务」看其他场景。',
  },
]

const CODE_SCRIPT: ScriptStep[] = [
  { kind: 'thinking', content: '用户希望看到代码示例，我演示一段 React 组件代码。' },
  { kind: 'text', content: '好的，这是一个简单的 React 计数器组件：' },
  {
    kind: 'code',
    language: 'tsx',
    content: `import { useState } from 'react'

export function Counter() {
  const [count, setCount] = useState(0)
  return (
    <div className="flex items-center gap-2">
      <button onClick={() => setCount(c => c - 1)}>-</button>
      <span>{count}</span>
      <button onClick={() => setCount(c => c + 1)}>+</button>
    </div>
  )
}`,
  },
  { kind: 'text', content: '这是最朴素的实现。需要扩展可以告诉我（持久化、键盘快捷键等）。' },
]

const TOOL_SCRIPT: ScriptStep[] = [
  { kind: 'thinking', content: '我需要演示工具调用流程。' },
  { kind: 'text', content: '我先调用工具收集信息：' },
  {
    kind: 'tool',
    toolName: 'read_artifact',
    args: { artifactId: 'art_demo' },
    result: { title: '示例产物', size: 1024 },
  },
  { kind: 'text', content: '已读取产物信息。这只是脚本演示，真实工具会在后续 milestone 接入。' },
]

const TERMINAL_SCRIPT: ScriptStep[] = [
  { kind: 'thinking', content: '我需要执行一条命令验证终端链路。' },
  {
    kind: 'tool',
    toolName: 'Bash',
    args: { command: 'echo agenthub-terminal-check', description: '终端链路验证' },
    result: 'agenthub-terminal-ok',
  },
  { kind: 'text', content: '命令已执行完成，终端面板应同步显示输出。' },
]

const DEFAULT_SCRIPT: ScriptStep[] = [
  { kind: 'thinking', content: '收到了用户消息，按通用模板回应。' },
  {
    kind: 'text',
    content:
      '我收到了你的消息。这是 MockAdapter 的默认响应，用于验证消息流式渲染、part 切换、tool 调用等链路。\n\n试试输入 "你好"、"写代码"、"执行任务" 触发不同脚本。',
  },
]

function pickScript(prompt: string, agentId: string): ScriptStep[] {
  if (prompt.includes(DEMO_SCRIPT_TRIGGER)) {
    const turn = DEMO_TURNS.find((t) => t.agentId === agentId) ?? DEMO_TURNS[0]
    return turn.steps
  }
  const p = prompt.toLowerCase()
  if (/(你好|hello|hi|您好)/.test(p)) return GREETING_SCRIPT
  if (/(写代码|代码|code|component|组件)/.test(p)) return CODE_SCRIPT
  if (/(终端|terminal|bash)/.test(p)) return TERMINAL_SCRIPT
  if (/(执行|工具|tool|run|跑)/.test(p)) return TOOL_SCRIPT
  return DEFAULT_SCRIPT
}
