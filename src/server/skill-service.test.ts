import { mkdtempSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
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

  it('refresh does not rewrite updatedAt when nothing changed (no more "just now" on every open)', async () => {
    const first = await service.refreshSkillsFromDisk()
    const firstById = new Map(first.map((skill) => [skill.id, skill.updatedAt]))
    const second = await service.refreshSkillsFromDisk()

    expect(second.length).toBe(first.length)
    for (const skill of second) {
      expect(skill.updatedAt).toBe(firstById.get(skill.id))
    }
  })

  it('updatedAt follows the file mtime, not the scan time', async () => {
    const skills = await service.refreshSkillsFromDisk()
    const addTool = skills.find((skill) => skill.id === 'skill_add_tool')
    expect(addTool).toBeDefined()

    const mtimeMs = Math.floor(statSync(path.resolve('skills/add-tool.md')).mtimeMs)
    expect(addTool?.updatedAt).toBe(mtimeMs)
    // createdAt 同样回填 mtime（旧值是当初入库时刻），否则“本周新增”会把老文件算作新增
    expect(addTool?.createdAt).toBe(mtimeMs)
  })

  it('toggling enabled does not touch updatedAt', async () => {
    await service.refreshSkillsFromDisk()
    const before = (await service.listSkills()).find((skill) => skill.id === 'skill_add_tool')
    expect(before).toBeDefined()

    const toggled = await service.updateSkill('skill_add_tool', { enabled: !before!.enabled })
    expect(toggled.updatedAt).toBe(before!.updatedAt)
    // 恢复原状态，避免影响其他测试对 enabled 的断言
    await service.updateSkill('skill_add_tool', { enabled: before!.enabled })
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
