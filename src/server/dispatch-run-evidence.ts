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

export interface RunToolEvidence {
  fileWrites: RunFileEvidence[]
  commands: RunCommandEvidence[]
}

const evidenceByRun = new Map<string, RunToolEvidence>()

function ensureEvidence(runId: string): RunToolEvidence {
  let evidence = evidenceByRun.get(runId)
  if (!evidence) {
    evidence = { fileWrites: [], commands: [] }
    evidenceByRun.set(runId, evidence)
  }
  return evidence
}

export function recordRunFileWrite(runId: string, evidence: RunFileEvidence): void {
  ensureEvidence(runId).fileWrites.push(evidence)
}

export function recordRunCommand(runId: string, evidence: RunCommandEvidence): void {
  ensureEvidence(runId).commands.push(evidence)
}

export function getRunToolEvidence(runId: string): RunToolEvidence {
  return evidenceByRun.get(runId) ?? { fileWrites: [], commands: [] }
}

export function clearRunToolEvidence(runId: string): void {
  evidenceByRun.delete(runId)
}
