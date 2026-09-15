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
  ensureEvidence(runId).commands.push(evidence)
}

export function getRunToolEvidence(runId: string): RunToolEvidence {
  return evidenceByRun.get(runId) ?? { fileWrites: [], commands: [], artifacts: [] }
}

export function clearRunToolEvidence(runId: string): void {
  evidenceByRun.delete(runId)
}
