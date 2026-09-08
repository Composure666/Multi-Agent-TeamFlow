import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'

let dataDir: string
let service: typeof import('./github-tool-catalog-service')
let dbClient: typeof import('@/db/client')

beforeAll(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'agenthub-github-skill-'))
  process.env.AGENTHUB_DATA_DIR = dataDir
  vi.resetModules()
  service = await import('./github-tool-catalog-service')
  dbClient = await import('@/db/client')
})

afterAll(() => {
  dbClient?.sqlite.close()
  if (dataDir) rmSync(dataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  delete process.env.AGENTHUB_DATA_DIR
  vi.unstubAllGlobals()
})

beforeEach(async () => {
  vi.unstubAllGlobals()
  await dbClient.db.delete(dbClient.schema.skills)
  await dbClient.db.delete(dbClient.schema.mcpServers)
})

describe('github tool catalog service', () => {
  it('imports a GitHub MCP server from repository fallback manifest paths', async () => {
    const responses = new Map<string, unknown>([
      [
        'https://raw.githubusercontent.com/owner/web-search-mcp/main/.agenthub/mcp.json',
        { status: 404, body: 'not found' },
      ],
      [
        'https://raw.githubusercontent.com/owner/web-search-mcp/main/agenthub.mcp.json',
        {
          status: 200,
          body: JSON.stringify({
            type: 'mcp_server',
            name: 'web-search',
            description: 'Searches the web through a stdio MCP server.',
            transport: 'stdio',
            command: 'npx',
            args: ['-y', '@agenthub/web-search-mcp'],
            env: { SEARCH_API_KEY: '${SEARCH_API_KEY}' },
            trust: 'always',
            tags: ['web', 'search'],
          }),
        },
      ],
    ])

    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => {
      const key = String(url)
      const response = responses.get(key) as { status: number; body: string } | undefined
      if (!response) throw new Error(`Unexpected fetch: ${key}`)
      return new Response(response.body, { status: response.status })
    }))

    const result = await service.importGithubTool({
      type: 'mcp_server',
      remoteId: 'github:mcp_server:owner/web-search-mcp:.agenthub/mcp.json',
      githubUrl: 'https://github.com/owner/web-search-mcp',
      installUrl: 'https://github.com/owner/web-search-mcp#install',
      manifestUrl: 'https://raw.githubusercontent.com/owner/web-search-mcp/main/.agenthub/mcp.json',
    })

    const row = await dbClient.db.query.mcpServers.findFirst({ where: eq(dbClient.schema.mcpServers.id, result.id) })
    expect(row?.name).toBe('web_search')
    expect(row?.command).toBe('npx')
    expect(row?.args).toEqual(['-y', '@agenthub/web-search-mcp'])
    expect(row?.env).toEqual({ SEARCH_API_KEY: '${SEARCH_API_KEY}' })
    expect(row?.trust).toBe('always')
  })

  it('imports an MCP Registry server.json package definition', async () => {
    const responses = new Map<string, unknown>([
      [
        'https://raw.githubusercontent.com/GLips/Figma-Context-MCP/main/server.json',
        {
          status: 200,
          body: JSON.stringify({
            name: 'io.github.GLips/Figma-Context-MCP',
            description: 'Figma Context MCP server',
            packages: [{
              registryType: 'npm',
              identifier: 'figma-developer-mcp',
              version: '1.0.0',
              transport: { type: 'stdio' },
              packageArguments: [{ type: 'named', name: '--stdio' }],
              environmentVariables: [{ name: 'FIGMA_API_KEY', isSecret: true }],
            }],
          }),
        },
      ],
    ])

    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => {
      const key = String(url)
      const response = responses.get(key) as { status: number; body: string } | undefined
      if (!response) return new Response('not found', { status: 404 })
      return new Response(response.body, { status: response.status })
    }))

    const result = await service.importGithubTool({
      type: 'mcp_server',
      remoteId: 'github:mcp_server:GLips/Figma-Context-MCP:.agenthub/mcp.json',
      githubUrl: 'https://github.com/GLips/Figma-Context-MCP',
      manifestUrl: 'https://raw.githubusercontent.com/GLips/Figma-Context-MCP/main/.agenthub/mcp.json',
    })

    const row = await dbClient.db.query.mcpServers.findFirst({ where: eq(dbClient.schema.mcpServers.id, result.id) })
    expect(row?.name).toBe('figma_context_mcp')
    expect(row?.command).toBe('npx')
    expect(row?.args).toEqual(['-y', 'figma-developer-mcp', '--stdio'])
    expect(row?.env).toEqual({ FIGMA_API_KEY: '${FIGMA_API_KEY}' })
  })

  it('imports a GitHub Skill bundle from nested SKILL.md files', async () => {
    const responses = new Map<string, unknown>([
      [
        'https://raw.githubusercontent.com/owner/superpowers/main/agenthub.skill.json',
        { status: 404, body: 'not found' },
      ],
      [
        'https://raw.githubusercontent.com/owner/superpowers/main/SKILL.md',
        { status: 404, body: 'not found' },
      ],
      [
        'https://api.github.com/repos/owner/superpowers/git/trees/main?recursive=1',
        {
          status: 200,
          body: JSON.stringify({
            tree: [
              { path: 'skills/brainstorming/SKILL.md', type: 'blob' },
              { path: 'skills/testing/SKILL.md', type: 'blob' },
            ],
          }),
        },
      ],
      [
        'https://raw.githubusercontent.com/owner/superpowers/main/skills/brainstorming/SKILL.md',
        {
          status: 200,
          body: [
            '---',
            'name: Brainstorming',
            'description: Requires design approval before code or file writes.',
            'tags: planning hard-gate workflow',
            '---',
            '# Brainstorming',
            'Hard Gate: Do not write code or files before the user approves the design.',
            'Use a step-by-step design checklist before implementation.',
          ].join('\n'),
        },
      ],
      [
        'https://raw.githubusercontent.com/owner/superpowers/main/skills/testing/SKILL.md',
        {
          status: 200,
          body: [
            '---',
            'name: Testing',
            'description: Verifies changes with a reproducible test checklist.',
            'tags: testing verification',
            '---',
            '# Testing',
            'Run targeted checks and summarize verification evidence.',
          ].join('\n'),
        },
      ],
    ])

    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => {
      const key = String(url)
      const response = responses.get(key) as { status: number; body: string } | undefined
      if (!response) throw new Error(`Unexpected fetch: ${key}`)
      return new Response(response.body, { status: response.status })
    }))

    const result = await service.importGithubTool({
      type: 'skill',
      remoteId: 'github:skill:owner/superpowers:agenthub.skill.json',
      githubUrl: 'https://github.com/owner/superpowers',
      installUrl: 'https://raw.githubusercontent.com/owner/superpowers/main/SKILL.md',
      manifestUrl: 'https://raw.githubusercontent.com/owner/superpowers/main/agenthub.skill.json',
    })

    const row = await dbClient.db.query.skills.findFirst({ where: eq(dbClient.schema.skills.id, result.id) })
    expect(row?.name).toBe('superpowers')
    expect(row?.description).toContain('Requires design approval')
    expect(row?.content).toContain('Hard Gate')
    expect(row?.content).toContain('step-by-step design checklist')
    expect(row?.content).toContain('Run targeted checks')
    expect(row?.tags).toEqual(expect.arrayContaining(['github', 'skill', 'superpowers', 'planning', 'hard-gate', 'workflow']))
  })
})
