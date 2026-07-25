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
})

describe('github tool catalog service', () => {
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
