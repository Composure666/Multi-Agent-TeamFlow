import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'

import { buildProjectFiles, zipProjectFromWorkspace } from './project-artifact'

const root = path.resolve('/ws/proj')
function fw(rel: string, bytes?: number) {
  return { path: 'whatever', absolutePath: path.join(root, rel), bytes }
}

describe('buildProjectFiles', () => {
  it('relativizes absolutePath to workspace root and sorts', () => {
    expect(buildProjectFiles([fw('src/a.ts', 10), fw('b.ts', 20)], root)).toEqual([
      { path: 'b.ts', sizeBytes: 20 },
      { path: 'src/a.ts', sizeBytes: 10 },
    ])
  })

  it('dedupes a file written multiple times (keeps last size)', () => {
    expect(buildProjectFiles([fw('a.ts', 10), fw('a.ts', 30)], root)).toEqual([
      { path: 'a.ts', sizeBytes: 30 },
    ])
  })

  it('skips paths outside the workspace root', () => {
    const outside = { path: 'x', absolutePath: path.resolve('/other/x.ts'), bytes: 9 }
    expect(buildProjectFiles([fw('a.ts', 5), outside], root)).toEqual([
      { path: 'a.ts', sizeBytes: 5 },
    ])
  })

  it('returns empty for no writes (so no project artifact is produced)', () => {
    expect(buildProjectFiles([], root)).toEqual([])
  })
})

describe('zipProjectFromWorkspace', () => {
  it('includes only normalized files inside the workspace', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'agenthub-project-'))
    try {
      mkdirSync(path.join(dir, 'src'))
      writeFileSync(path.join(dir, 'src', 'app.ts'), 'export const ok = true\n')

      const buf = await zipProjectFromWorkspace(
        dir,
        [
          { path: 'src/app.ts', sizeBytes: 23 },
          { path: '../outside.ts', sizeBytes: 1 },
          { path: 'src/../app.ts', sizeBytes: 1 },
        ],
        'project',
        '2026-01-01T00:00:00.000Z',
      )
      const zip = await JSZip.loadAsync(buf)

      expect(zip.file('src/app.ts')).toBeTruthy()
      expect(zip.file('../outside.ts')).toBeNull()
      expect(zip.file('src/../app.ts')).toBeNull()
      expect(zip.file('README.txt')).toBeTruthy()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
