import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

let dataDir: string
let service: typeof import('./mcp-server-service')
let dbClient: typeof import('@/db/client')

beforeAll(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'agenthub-mcp-server-service-'))
  process.env.AGENTHUB_DATA_DIR = dataDir
  service = await import('./mcp-server-service')
  dbClient = await import('@/db/client')
})

afterAll(() => {
  dbClient?.sqlite.close()
  if (dataDir) rmSync(dataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  delete process.env.AGENTHUB_DATA_DIR
})

describe('mcp server service', () => {
  it('creates stdio servers and masks secrets in list output', async () => {
    const created = await service.createMcpServer({
      name: 'filesystem_test',
      command: 'node',
      args: ['server.mjs'],
      env: {
        API_TOKEN: 'secret-token-value-1234567890',
        MODE: 'readonly',
        FROM_ENV: '${MCP_TEST_TOKEN}',
      },
      trust: 'ask',
      enabled: true,
    })

    expect(created.name).toBe('filesystem_test')
    expect(created.env.API_TOKEN).toBe('****7890')
    expect(created.env.MODE).toBe('readonly')
    expect(created.env.FROM_ENV).toBe('${MCP_TEST_TOKEN}')
  })

  it('rejects invalid and reserved names', async () => {
    await expect(
      service.createMcpServer({ name: 'Bad-Name', command: 'node' }),
    ).rejects.toThrow('MCP server name must match')
    await expect(
      service.createMcpServer({ name: 'agenthub', command: 'node' }),
    ).rejects.toThrow('reserved')
  })

  it('resolves enabled agent opt-in servers with env placeholders', async () => {
    process.env.MCP_SERVICE_TEST_TOKEN = 'resolved-token'
    const enabled = await service.createMcpServer({
      name: 'enabled_test',
      command: 'node',
      args: ['enabled.mjs'],
      env: { TOKEN: '${MCP_SERVICE_TEST_TOKEN}' },
      enabled: true,
    })
    const disabled = await service.createMcpServer({
      name: 'disabled_test',
      command: 'node',
      enabled: false,
    })

    const agent = {
      id: 'ag_mcp_test',
      name: 'MCP Test',
      avatar: 'A',
      description: 'test',
      capabilities: [],
      systemPrompt: 'test',
      adapterName: 'claude-code' as const,
      modelProvider: null,
      modelId: null,
      apiKey: null,
      apiBaseUrl: null,
      toolNames: [],
      mcpServerIds: [disabled.id, enabled.id],
      skillIds: [],
      isBuiltin: false,
      isOrchestrator: false,
      supportsVision: false,
      createdAt: Date.now(),
    }

    const resolved = await service.resolveAgentMcpServers(agent)

    expect(resolved).toEqual([
      {
        id: enabled.id,
        name: 'enabled_test',
        transport: 'stdio',
        command: 'node',
        args: ['enabled.mjs'],
        env: { TOKEN: 'resolved-token' },
        trust: 'ask',
      },
    ])
    delete process.env.MCP_SERVICE_TEST_TOKEN
  })

  it('does not resolve external MCP servers for custom or orchestrator agents', async () => {
    const server = await service.createMcpServer({ name: 'ignored_test', command: 'node' })
    const baseAgent = {
      id: 'ag_ignored_test',
      name: 'Ignored',
      avatar: 'A',
      description: 'test',
      capabilities: [],
      systemPrompt: 'test',
      adapterName: 'custom' as const,
      modelProvider: 'openai' as const,
      modelId: 'gpt-test',
      apiKey: null,
      apiBaseUrl: null,
      toolNames: [],
      mcpServerIds: [server.id],
      skillIds: [],
      isBuiltin: false,
      isOrchestrator: false,
      supportsVision: false,
      createdAt: Date.now(),
    }

    await expect(service.resolveAgentMcpServers(baseAgent)).resolves.toEqual([])
    await expect(
      service.resolveAgentMcpServers({ ...baseAgent, adapterName: 'claude-code' as const, modelProvider: null, isOrchestrator: true }),
    ).resolves.toEqual([])
  })

  it('records health summary and exposes safe catalog metadata', async () => {
    const server = await service.createMcpServer({
      name: 'health_test',
      command: 'node',
      env: { SECRET_TOKEN: 'secret-token-value-1234567890' },
      trust: 'always',
    })

    const updated = await service.recordMcpServerHealth(server.id, {
      status: 'ok',
      message: 'Connected; discovered 2 tools',
      toolCount: 2,
      checkedAt: 123,
    })
    const catalog = await service.listMcpCatalogItems()
    const item = catalog.find((entry) => entry.id === server.id)

    expect(updated.lastCheckStatus).toBe('ok')
    expect(updated.lastToolCount).toBe(2)
    expect(item).toMatchObject({
      id: server.id,
      name: 'health_test',
      status: 'enabled',
      lastToolCount: 2,
    })
    expect(item?.compatibility.codex).toBe('supported')
    expect(JSON.stringify(item)).not.toContain('secret-token-value')
  })
})
