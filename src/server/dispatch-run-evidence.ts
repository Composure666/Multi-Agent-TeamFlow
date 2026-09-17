export interface RunFileEvidence {
  path: string
  absolutePath: string
  bytes?: number
  applied?: 'auto' | 'review'
}

export interface RunCommandEvidence {
  command: string
  cwd: string
  exitCode: number | null
  timedOut: boolean
  isError: boolean
  prepare?: boolean
  error?: string
  /**
   * 这条命令属于哪个 run（= 哪个 attempt）。由 recordRunCommand 自动填充。
   *
   * 2026-09-17 线上事故：任务被 `MAX_CHILD_TASK_ATTEMPTS` 重试时，历史 attempt 的失败
   * 证据会和当前 attempt 的合并后一起定罪，导致「当前 attempt 全部命令都成功」也判失败
   * （生图任务第 3、4 次 attempt 已 VERIFY OK，仍因第 1 次 attempt 的 pip 超时被判 4 次全灭）。
   * 验收只对当前 attempt 的失败定罪，历史失败不得毒化后续 attempt。
   */
  runId?: string
}

/**
 * 本 run 通过 write_artifact 交付的产物。
 *
 * 2026-09-14 补漏：此前验收门禁只认 fs_write / adapter 的 fileWrites，而大量任务
 * 是「bash 生成文件 → write_artifact 交付」，产物真实存在却拿不到任何证据，导致
 * targetPaths 门禁永远判不过、触发重试放大（一次生图任务被放大成 12 个 run）。
 */
export interface RunArtifactEvidence {
  artifactId: string
  title: string
  type: string
  version?: number
}

export interface RunToolEvidence {
  fileWrites: RunFileEvidence[]
  commands: RunCommandEvidence[]
  /** 本 run 创建的产物（可选，旧调用点不传即视为空）。 */
  artifacts?: RunArtifactEvidence[]
}

const evidenceByRun = new Map<string, RunToolEvidence>()

function ensureEvidence(runId: string): RunToolEvidence {
  let evidence = evidenceByRun.get(runId)
  if (!evidence) {
    evidence = { fileWrites: [], commands: [], artifacts: [] }
    evidenceByRun.set(runId, evidence)
  }
  return evidence
}

export function recordRunFileWrite(runId: string, evidence: RunFileEvidence): void {
  ensureEvidence(runId).fileWrites.push(evidence)
}

export function recordRunArtifact(runId: string, evidence: RunArtifactEvidence): void {
  const store = ensureEvidence(runId)
  store.artifacts = [...(store.artifacts ?? []), evidence]
}

export function recordRunCommand(runId: string, evidence: RunCommandEvidence): void {
  // runId 由本函数统一盖章：调用点不必逐个传，合并到 aggregate 后仍能区分 attempt。
  ensureEvidence(runId).commands.push({ ...evidence, runId })
}

export function getRunToolEvidence(runId: string): RunToolEvidence {
  return evidenceByRun.get(runId) ?? { fileWrites: [], commands: [], artifacts: [] }
}

export function clearRunToolEvidence(runId: string): void {
  evidenceByRun.delete(runId)
}
