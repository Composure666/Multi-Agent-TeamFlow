import { describe, expect, it } from 'vitest'

import { ToolRegistry } from './registry'
import type { ToolContext, ToolDef } from './types'

const ctx: ToolContext = {
  conversationId: 'conv_test',
  workspacePath: 'C:/tmp/workspace',
  agentId: 'ag_test',
  runId: 'run_test',
  abortSignal: new AbortController().signal,
}

function tool(name: string, value: unknown): ToolDef {
  return {
    name,
    description: `${name} test tool`,
    parameters: { type: 'object', properties: {} },
    handler: async () => ({ ok: true, value }),
  }
}

describe('ToolRegistry structured execution', () => {
  it('keeps object output structured and exposes JSON prompt text', async () => {
    const registry = new ToolRegistry()
    const value = { artifactId: 'art_test', title: 'Demo' }
    registry.register(tool('object_result', value))

    const result = await registry.executeStructured('object_result', {}, ctx)

    expect(result.ok).toBe(true)
    expect(result.output).toEqual(value)
    expect(result.promptText).toBe(JSON.stringify(value))
  })

  it('keeps string output as prompt text', async () => {
    const registry = new ToolRegistry()
    registry.register(tool('string_result', 'plain result'))

    const result = await registry.executeStructured('string_result', {}, ctx)

    expect(result.ok).toBe(true)
    expect(result.output).toBe('plain result')
    expect(result.promptText).toBe('plain result')
  })

  it('normalizes handler errors for output, prompt text, and diagnostics', async () => {
    const registry = new ToolRegistry()
    registry.register({
      name: 'failing_result',
      description: 'failing test tool',
      parameters: { type: 'object', properties: {} },
      handler: async () => ({ ok: false, error: 'failed to execute tool' }),
    })

    const result = await registry.executeStructured('failing_result', {}, ctx)

    expect(result.ok).toBe(false)
    expect(result.output).toEqual({ error: 'failed to execute tool' })
    expect(result.promptText).toBe('Error: failed to execute tool')
    expect(result.diagnostics).toEqual([{ level: 'error', message: 'failed to execute tool' }])
  })

  it('normalizes unknown tools as structured errors', async () => {
    const registry = new ToolRegistry()

    const result = await registry.executeStructured('missing_tool', {}, ctx)

    expect(result.ok).toBe(false)
    expect(result.output).toEqual({ error: 'Unknown tool: missing_tool' })
    expect(result.promptText).toBe('Error: Unknown tool: missing_tool')
    expect(result.diagnostics).toEqual([{ level: 'error', message: 'Unknown tool: missing_tool' }])
  })
})
