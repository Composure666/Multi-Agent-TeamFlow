import { createHash } from 'node:crypto'

/**
 * Orchestrator 同波次「代码冲突」检测的写入追踪。
 *
 * 记录每个子 run 经 fs_write 写过的 workspace 文件（绝对路径 → 内容 hash），
 * 供 AgentRunner 在一波并行子任务结束后检测「多个子 agent 写了同一文件」。
 *
 * 盲区（见 specs/06 「代码冲突检测」）：bash 工具与 Claude Code SDK 自带写盘工具
 * 不经过 fs_write，因此不在此记录，这类并发写当前不检测。
 */

const writesByRun = new Map<string, Map<string, string>>()

export function recordFileWrite(runId: string, absolutePath: string, content: string): void {
  let files = writesByRun.get(runId)
  if (!files) {
    files = new Map()
    writesByRun.set(runId, files)
  }
  files.set(absolutePath, createHash('sha1').update(content).digest('hex'))
}

export function getFileWrites(runId: string): Map<string, string> {
  return writesByRun.get(runId) ?? new Map()
}

export function clearFileWrites(runId: string): void {
  writesByRun.delete(runId)
}

export interface RunFileWrites {
  taskId: string
  agentId: string
  runId: string
  /** absolutePath → 内容 hash */
  writes: Map<string, string>
}

export interface FileWriteConflict {
  /** 冲突文件的绝对路径 */
  path: string
  contributors: Array<{ taskId: string; agentId: string; runId: string }>
}

/**
 * 检测同一波并行子任务的写冲突：≥2 个子 run 写了同一文件且内容不同（hash 不同）。
 * 内容相同的并发写不算冲突（两个 agent 恰好写出一样的东西）。纯函数，便于单测。
 */
export function detectWaveConflicts(runs: RunFileWrites[]): FileWriteConflict[] {
  const byPath = new Map<
    string,
    Array<{ taskId: string; agentId: string; runId: string; hash: string }>
  >()
  for (const run of runs) {
    for (const [absPath, hash] of run.writes) {
      const writers = byPath.get(absPath) ?? []
      writers.push({ taskId: run.taskId, agentId: run.agentId, runId: run.runId, hash })
      byPath.set(absPath, writers)
    }
  }

  const conflicts: FileWriteConflict[] = []
  for (const [absPath, writers] of byPath) {
    if (writers.length < 2) continue
    if (new Set(writers.map((w) => w.hash)).size < 2) continue
    conflicts.push({
      path: absPath,
      contributors: writers.map(({ taskId, agentId, runId }) => ({ taskId, agentId, runId })),
    })
  }
  return conflicts
}
