import { describe, expect, it } from 'vitest'

import { detectWaveConflicts, type RunFileWrites } from './dispatch-file-writes'

function run(taskId: string, agentId: string, writes: Record<string, string>): RunFileWrites {
  return {
    taskId,
    agentId,
    runId: `run_${taskId}`,
    writes: new Map(Object.entries(writes)),
  }
}

describe('detectWaveConflicts', () => {
  it('returns no conflict when runs touch different files', () => {
    expect(
      detectWaveConflicts([
        run('t1', 'ag_pm', { '/ws/a.md': 'h1' }),
        run('t2', 'ag_fe', { '/ws/b.ts': 'h2' }),
      ]),
    ).toEqual([])
  })

  it('flags two runs writing the same file with different content', () => {
    const conflicts = detectWaveConflicts([
      run('t1', 'ag_fe', { '/ws/index.html': 'hashA' }),
      run('t2', 'ag_design', { '/ws/index.html': 'hashB' }),
    ])
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].path).toBe('/ws/index.html')
    expect(conflicts[0].contributors.map((c) => c.taskId).sort()).toEqual(['t1', 't2'])
  })

  it('does not flag identical concurrent writes (same hash)', () => {
    expect(
      detectWaveConflicts([
        run('t1', 'ag_fe', { '/ws/index.html': 'same' }),
        run('t2', 'ag_design', { '/ws/index.html': 'same' }),
      ]),
    ).toEqual([])
  })

  it('detects a conflict among three writers and lists all contributors', () => {
    const conflicts = detectWaveConflicts([
      run('t1', 'a', { '/ws/x': 'h1' }),
      run('t2', 'b', { '/ws/x': 'h2' }),
      run('t3', 'c', { '/ws/x': 'h1' }),
    ])
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].contributors).toHaveLength(3)
  })

  it('ignores a single run even if it writes many files', () => {
    expect(
      detectWaveConflicts([run('t1', 'a', { '/ws/a': 'h1', '/ws/b': 'h2', '/ws/c': 'h3' })]),
    ).toEqual([])
  })
})
