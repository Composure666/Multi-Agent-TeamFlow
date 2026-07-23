/**
 * Tool 系统的类型定义。
 *
 * 详细规格见 specs/01-core-entities.md §6 Tool。
 */

export interface ToolContext {
  conversationId: string
  workspacePath: string
  agentId: string
  runId: string
  abortSignal: AbortSignal
}

export type ToolResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string }

export interface ToolExecutionDiagnostic {
  level: 'info' | 'warning' | 'error'
  message: string
  code?: string
  details?: unknown
}

export interface ToolExecutionArtifactRef {
  artifactId: string
  outputKey?: string
}

export type ToolExecutionEvent =
  | { type: 'artifact.create'; artifactId: string }
  | { type: 'deploy.status'; deployment: unknown }

export type ToolExecutionResult =
  | {
      ok: true
      output: unknown
      promptText: string
      events?: ToolExecutionEvent[]
      artifacts?: ToolExecutionArtifactRef[]
      diagnostics?: ToolExecutionDiagnostic[]
    }
  | {
      ok: false
      output: unknown
      promptText: string
      error: string
      events?: ToolExecutionEvent[]
      artifacts?: ToolExecutionArtifactRef[]
      diagnostics?: ToolExecutionDiagnostic[]
    }

export interface ToolDef {
  name: string
  description: string
  /** JSON Schema —— 同时用于 LLM API 的 tool 声明和我们自己的运行时校验 */
  parameters: Record<string, unknown>
  handler: (args: unknown, ctx: ToolContext) => Promise<ToolResult>
}
