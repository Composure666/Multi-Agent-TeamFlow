import { askUserTool } from './ask-user'
import { bashTool } from './bash'
import { deployArtifactTool } from './deploy-artifact'
import { deployWorkspaceTool } from './deploy-workspace'
import { fsListTool } from './fs-list'
import { fsReadTool } from './fs-read'
import { fsWriteTool } from './fs-write'
import { planTasksTool } from './plan-tasks'
import { readArtifactTool } from './read-artifact'
import { readAttachmentTool } from './read-attachment'
import { reportTaskResultTool } from './report-task-result'
import type { ToolContext, ToolDef, ToolExecutionResult, ToolResult } from './types'
import { webFetchTool } from './web-fetch'
import { webSearchTool } from './web-search'
import { writeArtifactTool } from './write-artifact'

/**
 * ToolRegistry —— 工具全局注册中心。
 *
 * Agent 通过 `agent.toolNames` 引用工具名，AgentRunner 在组装 Adapter 输入
 * 时从这里查出 ToolDef。
 */

export class ToolRegistry {
  private tools = new Map<string, ToolDef>()

  register(tool: ToolDef): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`)
    }
    this.tools.set(tool.name, tool)
  }

  get(name: string): ToolDef | undefined {
    return this.tools.get(name)
  }

  resolve(names: string[]): ToolDef[] {
    const resolved: ToolDef[] = []
    for (const name of names) {
      const t = this.tools.get(name)
      if (!t) throw new Error(`Unknown tool: ${name}`)
      resolved.push(t)
    }
    return resolved
  }

  async execute(toolName: string, args: unknown, ctx: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(toolName)
    if (!tool) {
      return { ok: false, error: `Unknown tool: ${toolName}` }
    }
    try {
      return await tool.handler(args, ctx)
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  async executeStructured(toolName: string, args: unknown, ctx: ToolContext): Promise<ToolExecutionResult> {
    return normalizeToolResult(await this.execute(toolName, args, ctx))
  }
}

function normalizeToolResult(result: ToolResult): ToolExecutionResult {
  if (result.ok) {
    return {
      ok: true,
      output: result.value,
      promptText: stringifyToolPromptText(result.value),
    }
  }

  return {
    ok: false,
    output: { error: result.error },
    promptText: `Error: ${result.error}`,
    error: result.error,
    diagnostics: [{ level: 'error', message: result.error }],
  }
}

function stringifyToolPromptText(value: unknown): string {
  if (typeof value === 'string') return value
  const json = JSON.stringify(value)
  return json === undefined ? String(value) : json
}

function buildRegistry(): ToolRegistry {
  const reg = new ToolRegistry()
  reg.register(writeArtifactTool)
  reg.register(readArtifactTool)
  reg.register(deployArtifactTool)
  reg.register(deployWorkspaceTool)
  reg.register(readAttachmentTool)
  reg.register(planTasksTool)
  reg.register(reportTaskResultTool)
  reg.register(fsListTool)
  reg.register(fsReadTool)
  reg.register(fsWriteTool)
  reg.register(bashTool)
  reg.register(askUserTool)
  reg.register(webFetchTool)
  reg.register(webSearchTool)
  return reg
}

// 工具集是静态的（不持有连接 / 状态），不需要跨 HMR 保活。
// 每次模块加载重建一次即可，添加新工具后 dev 模式自动生效，不必重启。
export const toolRegistry = buildRegistry()

export type { ToolContext, ToolDef, ToolExecutionDiagnostic, ToolExecutionResult, ToolResult } from './types'
