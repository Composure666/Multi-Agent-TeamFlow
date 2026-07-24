import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

import { getMcpServer, recordMcpServerHealth, resolveEnvPlaceholders } from '@/server/mcp-server-service'

export interface McpConnectionTestTool {
  name: string
  description?: string
}

export interface McpConnectionTestResult {
  status: 'ok' | 'failed'
  message: string
  checkedAt: number
  tools: McpConnectionTestTool[]
}

const MCP_TEST_TIMEOUT_MS = 15_000

export async function testMcpServerConnection(serverId: string): Promise<McpConnectionTestResult> {
  const checkedAt = Date.now()
  const server = await getMcpServer(serverId)
  if (!server) throw new Error(`MCP server not found: ${serverId}`)

  if (!server.enabled) {
    const result = failedResult('MCP server is disabled', checkedAt)
    await recordMcpServerHealth(serverId, {
      status: result.status,
      message: result.message,
      toolCount: 0,
      checkedAt,
    })
    return result
  }

  let transport: StdioClientTransport | null = null
  let client: Client | null = null

  try {
    transport = new StdioClientTransport({
      command: server.command,
      args: server.args,
      env: resolveEnvPlaceholders(server.env),
      stderr: 'pipe',
    })
    client = new Client({ name: 'agenthub-mcp-test', version: '0.1.0' })

    const toolsResult = await withTimeout(
      (async () => {
        await client!.connect(transport!)
        return client!.listTools()
      })(),
      MCP_TEST_TIMEOUT_MS,
    )
    const tools = toolsResult.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
    }))
    const result: McpConnectionTestResult = {
      status: 'ok',
      message: `Connected; discovered ${tools.length} tools`,
      checkedAt,
      tools,
    }
    await recordMcpServerHealth(serverId, {
      status: result.status,
      message: result.message,
      toolCount: tools.length,
      checkedAt,
    })
    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const result = failedResult(message, checkedAt)
    await recordMcpServerHealth(serverId, {
      status: result.status,
      message: result.message,
      toolCount: null,
      checkedAt,
    })
    return result
  } finally {
    await client?.close().catch(() => undefined)
    await transport?.close().catch(() => undefined)
  }
}

function failedResult(message: string, checkedAt: number): McpConnectionTestResult {
  return {
    status: 'failed',
    message: message.slice(0, 500),
    checkedAt,
    tools: [],
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('MCP connection test timed out')), timeoutMs)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}
