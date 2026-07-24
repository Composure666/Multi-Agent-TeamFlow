import { mkdtempSync, rmSync } from 'node:fs'
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

  it('rejects skill files outside the skills directory', () => {
    expect(() => service.parseSkillFile(path.resolve(dataDir, 'outside.md'))).toThrow('inside skills directory')
  })
})
