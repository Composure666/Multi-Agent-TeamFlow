import { describe, expect, it } from 'vitest'

import type { StreamEvent } from '@/shared/types'

import { MockAdapter } from './mock-adapter'
import type { AdapterInput } from './types'

function demoInput(agentId: string): AdapterInput {
  return {
    agentId,
    conversationId: 'conv_demo_test',
    runId: 'run_demo_test',
    prompt: '给「光影造像工坊」做品牌落地页',
    workspacePath: '/tmp/demo-workspace',
    systemPrompt: '',
    apiKey: null,
    apiBaseUrl: null,
    modelId: null,
    toolNames: ['write_artifact'],
  }
}

async function collectEvents(input: AdapterInput): Promise<StreamEvent[]> {
  const adapter = new MockAdapter()
  const events: StreamEvent[] = []
  for await (const event of adapter.stream(input, new AbortController().signal)) {
    events.push(event)
  }
  return events
}

/**
 * 按 store.applyEvent 的方式把事件折叠成 parts：part.start 按下标落位，
 * tool.call / tool.result 依次 push。下标错位会在这里现形为空洞或覆盖。
 */
function foldParts(events: StreamEvent[]): unknown[] {
  const parts: unknown[] = []
  for (const event of events) {
    if (event.type === 'part.start') {
      parts[event.partIndex] = event.part
    } else if (event.type === 'tool.call') {
      parts.push({ type: 'tool_use', callId: event.callId })
    } else if (event.type === 'tool.result') {
      parts.push({ type: 'tool_result', callId: event.callId })
    }
  }
  return parts
}

describe('MockAdapter demo script', () => {
  it(
    'streams the PM turn with the PRD artifact chain and no terminal tool',
    async () => {
      const events = await collectEvents(demoInput('ag_pm'))

      expect(events[0].type).toBe('message.start')
      expect(events[events.length - 1].type).toBe('message.end')

      const created = events.filter((e) => e.type === 'artifact.create')
      expect(created).toHaveLength(1)
      if (created[0].type !== 'artifact.create') throw new Error('unreachable')
      expect(created[0].artifact.id).toBe('art_demo_prd')
      expect(created[0].artifact.type).toBe('document')

      const ref = events.find(
        (e) => e.type === 'part.start' && e.part.type === 'artifact_ref',
      )
      expect(ref).toBeDefined()
      if (ref?.type !== 'part.start' || ref.part.type !== 'artifact_ref') {
        throw new Error('unreachable')
      }
      expect(ref.part.artifactId).toBe('art_demo_prd')

      expect(events.some((e) => e.type === 'tool.call' && e.toolName === 'Bash')).toBe(false)

      // part 下标必须稠密：空洞或覆盖都会让 MessageList 的 for..of 在
      // undefined part 上抛错（旧 MockAdapter 按步骤数递增下标时就有这问题）。
      const parts = foldParts(events)
      expect(parts.every((p) => p !== undefined)).toBe(true)
      expect(parts.filter((p) => (p as { type?: string }).type === 'tool_result')).toHaveLength(1)
    },
    15_000,
  )

  it(
    'streams the orchestrator turn with the four-task dispatch plan',
    async () => {
      const events = await collectEvents(demoInput('ag_orchestrator'))

      const plan = events.find((e) => e.type === 'dispatch.plan')
      expect(plan).toBeDefined()
      if (plan?.type !== 'dispatch.plan') throw new Error('unreachable')
      expect(plan.plan.map((t) => t.id)).toEqual(['task-1', 'task-2', 'task-3', 'task-4'])
      expect(plan.plan.map((t) => t.agentId)).toEqual([
        'ag_pm',
        'ag_designer',
        'ag_frontend',
        'ag_reviewer',
      ])
    },
    15_000,
  )

  it('falls back to the orchestrator turn for an unknown agent id', async () => {
    const events = await collectEvents(demoInput('ag_unknown'))
    expect(events.some((e) => e.type === 'dispatch.plan')).toBe(true)
  }, 15_000)
})
