import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

let dataDir: string
let service: typeof import('./skill-service')
let dbClient: typeof import('@/db/client')

beforeAll(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'agenthub-skill-service-'))
  process.env.AGENTHUB_DATA_DIR = dataDir
  service = await import('./skill-service')
  dbClient = await import('@/db/client')
})

afterAll(() => {
  dbClient?.sqlite.close()
  if (dataDir) rmSync(dataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  delete process.env.AGENTHUB_DATA_DIR
})

describe('skill service', () => {
  it('refreshes local skills metadata from disk', async () => {
    const skills = await service.refreshSkillsFromDisk()

    expect(skills.length).toBeGreaterThan(0)
    expect(skills.some((skill) => skill.id === 'skill_add_tool')).toBe(true)
    expect(skills.every((skill) => !skill.sourcePath.includes('.env'))).toBe(true)
  })

  it('updates enabled state and catalog compatibility', async () => {
    await service.refreshSkillsFromDisk()
    const disabled = await service.updateSkill('skill_add_tool', { enabled: false })
    const catalog = await service.listSkillCatalogItems()
    const item = catalog.find((entry) => entry.id === 'skill_add_tool')

    expect(disabled.enabled).toBe(false)
    expect(item?.status).toBe('disabled')
    expect(item?.compatibility.custom).toBe('unsupported')
  })

  it('discovers nested workspace skills with distinct ids and rules content', async () => {
    const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'agenthub-workspace-skills-'))
    try {
      const firstDir = path.join(workspaceRoot, 'repo', 'skills', 'brainstorming')
      const secondDir = path.join(workspaceRoot, 'repo', 'skills', 'testing')
      mkdirSync(firstDir, { recursive: true })
      mkdirSync(secondDir, { recursive: true })
      writeFileSync(path.join(firstDir, 'SKILL.md'), [
        '--- ',
        'name: Brainstorming',
        'description: Requires design approval before file writes.',
        'tags: planning hard-gate',
        '---',
        '# Brainstorming',
        'Hard Gate: wait for user approval before writing files.',
      ].join('\n'))
      writeFileSync(path.join(secondDir, 'SKILL.md'), [
        '---',
        'name: Testing',
        'description: Verifies changes after implementation.',
        'tags: testing verification',
        '---',
        '# Testing',
        'Run targeted tests and summarize evidence.',
      ].join('\n'))

      const skills = await service.discoverWorkspaceSkills(workspaceRoot)

      expect(skills).toHaveLength(2)
      expect(new Set(skills.map((skill) => skill.id)).size).toBe(2)
      expect(skills.find((skill) => skill.name === 'Brainstorming')?.content).toContain('Hard Gate')
      expect(skills.find((skill) => skill.name === 'Brainstorming')?.tags).toContain('hard-gate')
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
    }
  })

  it('rejects skill files outside the skills directory', () => {
    expect(() => service.parseSkillFile(path.resolve(dataDir, 'outside.md'))).toThrow('inside skills directory')
  })
})
