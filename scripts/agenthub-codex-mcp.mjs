#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod/v4'

const server = new McpServer({
  name: 'agenthub',
  version: '1.0.0',
})

const baseUrl = requireEnv('AGENTHUB_INTERNAL_BASE_URL').replace(/\/+$/, '')
const token = requireEnv('AGENTHUB_INTERNAL_TOOL_TOKEN')
const conversationId = requireEnv('AGENTHUB_CONVERSATION_ID')
const agentId = requireEnv('AGENTHUB_AGENT_ID')
const runId = requireEnv('AGENTHUB_RUN_ID')
const allowedTools = parseAllowedTools(process.env.AGENTHUB_ALLOWED_TOOLS)

registerTool(
  'plan_tasks',
  {
    description:
      'Create the Multi-Agent TeamFlow Orchestrator dispatch plan. Call this exactly once when the plan is ready; Multi-Agent TeamFlow will stop the planning stage and execute the plan after user review.',
    inputSchema: {
      reasoning: z.string(),
      tasks: z
        .array(
          z.object({
            id: z.string(),
            agentId: z.string(),
            task: z.string(),
            taskKind: z.enum(['code', 'test', 'review', 'design', 'doc', 'analysis']).optional(),
            dependsOn: z.array(z.string()).optional(),
            expectedOutputs: z
              .array(
                z.object({
                  id: z.string(),
                  type: z.enum(['web_app', 'document', 'image', 'ppt', 'diagram', 'project']),
                  required: z.boolean().optional(),
                  description: z.string().optional(),
                }),
              )
              .optional(),
            inputs: z
              .array(
                z.object({
                  fromTaskId: z.string(),
                  outputId: z.string(),
                  required: z.boolean().optional(),
                  description: z.string().optional(),
                }),
              )
              .optional(),
            acceptanceCriteria: z.array(z.string()).optional(),
            targetPaths: z.array(z.string()).optional(),
            expectedWorkspaceChanges: z.array(z.string()).optional(),
            requiredCommands: z
              .array(
                z.object({
                  command: z.string(),
                  description: z.string().optional(),
                  cwd: z.string().optional(),
                  timeoutMs: z.number().int().positive().optional(),
                }),
              )
              .optional(),
            requiredEvidence: z.array(z.string()).optional(),
          }),
        )
        .min(1),
    },
  },
  async (args) => callAgentHubTool('plan_tasks', args),
)

registerTool(
  'write_artifact',
  {
    description:
      'Create a previewable Multi-Agent TeamFlow artifact in the current conversation. Supported types: web_app, document, image, ppt, diagram. Use web_app for HTML/CSS/JS bundles, ppt for structured slide decks, and diagram for Mermaid diagrams. Always pass type, title, and a complete content object in the same call; never call with empty or partial args.',
    inputSchema: {
      type: z.enum(['web_app', 'document', 'image', 'ppt', 'diagram']),
      title: z.string(),
      content: z
        .unknown()
        .describe(
          'Artifact body as a JSON OBJECT, NOT a JSON-stringified string. web_app: { files: { "index.html": "..." }, entry: "index.html" }. document: { format: "markdown", content: "..." }. image: { url, alt }. diagram: { syntax: "mermaid", source: "flowchart TD\\nA[\\"User\\"] --> B[\\"Multi-Agent TeamFlow\\"]" }. PPT: { title?, theme?, slides: [{ title?, subtitle?, layout?, blocks?: [{ type: "heading"|"paragraph"|"bullets"|"metric"|"quote"|"timeline"|"columns"|"callout"|"divider"|"spacer", ... }] }] }. Do not embed raw base64/data URI assets in ppt JSON.',
        ),
      outputKey: z
        .string()
        .optional()
        .describe('Optional Orchestrator handoff key matching the dispatched task expected output id.'),
      parentArtifactId: z.string().optional(),
    },
  },
  async (args) => callAgentHubTool('write_artifact', args),
)

registerTool(
  'read_artifact',
  {
    description: 'Read the full content of an existing Multi-Agent TeamFlow artifact by id.',
    inputSchema: {
      artifactId: z.string(),
    },
  },
  async (args) => callAgentHubTool('read_artifact', args),
)

registerTool(
  'read_attachment',
  {
    description:
      'Read a user-uploaded attachment in the current conversation by attachmentId. Use this when planning depends on uploaded file contents.',
    inputSchema: {
      attachmentId: z.string(),
    },
  },
  async (args) => callAgentHubTool('read_attachment', args),
)

registerTool(
  'fs_list',
  {
    description:
      'List files and directories inside the current Multi-Agent TeamFlow workspace. Prefer this before reading files when exploring project structure.',
    inputSchema: {
      path: z.string().optional().describe('Directory path. Omit or pass "" for the workspace root.'),
    },
  },
  async (args) => callAgentHubTool('fs_list', args),
)

registerTool(
  'deploy_artifact',
  {
    description:
      'Create a ready local preview deployment for a web_app artifact and return previewPath plus package download paths. previewPath is a relative path for the current Multi-Agent TeamFlow instance; do not invent or print a public hostname.',
    inputSchema: {
      artifactId: z.string(),
    },
  },
  async (args) => callAgentHubTool('deploy_artifact', args),
)

registerTool(
  'deploy_workspace',
  {
    description:
      'Create a deployment card from an existing static output directory inside the current workspace, such as dist, build, out, or client/dist. Use this after building a local project. It copies files only and does not run build commands.',
    inputSchema: {
      path: z.string(),
      title: z.string().optional(),
      entry: z.string().optional(),
    },
  },
  async (args) => callAgentHubTool('deploy_workspace', args),
)

registerTool(
  'web_fetch',
  {
    description:
      'Fetch a public HTTPS URL through Multi-Agent TeamFlow safety checks. Only GET is supported; localhost, private IP ranges, link-local addresses, metadata endpoints, credentials, non-HTTPS URLs, redirects to restricted addresses, and binary responses are blocked.',
    inputSchema: {
      url: z.string().describe('Public HTTPS URL to fetch.'),
      maxChars: z.number().int().positive().optional().describe('Maximum number of text characters to return.'),
      timeoutMs: z.number().int().positive().optional().describe('Request timeout in milliseconds.'),
    },
  },
  async (args) => callAgentHubTool('web_fetch', args),
)

registerTool(
  'ask_user',
  {
    description:
      'Ask the user one or more structured multiple-choice questions with 2-4 options. Prefer this over plain text when progress depends on a finite user choice, such as scope, target platform, design direction, implementation route, destructive action, or acceptance criteria. Do not use it for open-ended discussion or non-blocking details.',
    inputSchema: {
      questions: z
        .array(
          z.object({
            question: z.string(),
            header: z.string(),
            multiSelect: z.boolean().optional(),
            options: z
              .array(
                z.object({
                  label: z.string(),
                  description: z.string().optional(),
                  preview: z.string().optional(),
                }),
              )
              .min(2)
              .max(4),
          }),
        )
        .min(1)
        .max(4),
    },
  },
  async (args) => callAgentHubTool('ask_user', args),
)

registerTool(
  'report_task_result',
  {
    description:
      'Report the final semantic outcome of the current Multi-Agent TeamFlow sub-task. Call exactly once at the end of a dispatched child task. Use complete only when the assigned task is fully accomplished and every acceptance criterion passed; never report complete for partial work, failing tests, unresolved errors, or missing files/dependencies.',
    inputSchema: {
      status: z.enum(['complete', 'failed', 'blocked']),
      summary: z.string(),
      acceptanceResults: z
        .array(
          z.object({
            criterion: z.string(),
            passed: z.boolean(),
            evidence: z.string(),
          }),
        )
        .optional(),
      filesChanged: z
        .array(
          z.object({
            path: z.string(),
            action: z.enum(['created', 'modified', 'deleted', 'verified']).optional(),
          }),
        )
        .optional(),
      commandsRun: z
        .array(
          z.object({
            command: z.string(),
            exitCode: z.number().int().nullable(),
            cwd: z.string().optional(),
            timedOut: z.boolean().optional(),
            summary: z.string().optional(),
          }),
        )
        .optional(),
      tests: z
        .array(
          z.object({
            command: z.string(),
            passed: z.boolean(),
            summary: z.string().optional(),
          }),
        )
        .optional(),
      blockers: z.array(z.string()).optional(),
    },
  },
  async (args) => callAgentHubTool('report_task_result', args),
)

async function callAgentHubTool(toolName, args) {
  const response = await fetch(`${baseUrl}/api/internal/agenthub-tools`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      toolName,
      args,
      conversationId,
      agentId,
      runId,
    }),
  })

  const result = await response.json().catch(() => ({
    ok: false,
    error: `Multi-Agent TeamFlow internal tool API returned ${response.status}`,
  }))

  if (!response.ok || !result.ok) {
    const error = typeof result.error === 'string' ? result.error : `HTTP ${response.status}`
    return {
      content: [{ type: 'text', text: `Error: ${error}` }],
      isError: true,
    }
  }

  return {
    content: [{ type: 'text', text: JSON.stringify(result.value) }],
    structuredContent:
      result.value && typeof result.value === 'object' && !Array.isArray(result.value)
        ? result.value
        : undefined,
  }
}

function requireEnv(name) {
  const value = process.env[name]
  if (!value) {
    console.error(`[agenthub-codex-mcp] Missing ${name}`)
    process.exit(1)
  }
  return value
}

function parseAllowedTools(value) {
  if (!value) return null
  const tools = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  return tools.length > 0 ? new Set(tools) : null
}

function registerTool(name, config, handler) {
  if (name === 'plan_tasks' && !allowedTools?.has(name)) return
  if (allowedTools && !allowedTools.has(name)) return
  server.registerTool(name, config, handler)
}

const transport = new StdioServerTransport()
await server.connect(transport)
console.error('[agenthub-codex-mcp] running on stdio')
