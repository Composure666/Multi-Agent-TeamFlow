import { z } from 'zod'

import {
  CODE_TASK_RUNNABLE_REQUIRED_EVIDENCE,
  isCodeImplementationTask,
} from '@/server/dispatch-plan'
import type { RunArtifactEvidence, RunToolEvidence } from '@/server/dispatch-run-evidence'
import type { DispatchPlanItem, TaskResultReport } from '@/shared/types'

export const REPORT_TASK_RESULT_TOOL_NAME = 'report_task_result'

export const ReportTaskResultArgsSchema = z.object({
  status: z.enum(['complete', 'failed', 'blocked']),
  summary: z.string().min(1),
  acceptanceResults: z
    .array(
      z.object({
        criterion: z.string().min(1),
        passed: z.boolean(),
        evidence: z.string().min(1),
      }),
    )
    .optional(),
  filesChanged: z
    .array(
      z.object({
        path: z.string().min(1),
        action: z.enum(['created', 'modified', 'deleted', 'verified']).optional(),
      }),
    )
    .optional(),
  commandsRun: z
    .array(
      z.object({
        command: z.string().min(1),
        exitCode: z.number().int().nullable(),
        cwd: z.string().optional(),
        timedOut: z.boolean().optional(),
        summary: z.string().optional(),
      }),
    )
    .optional(),
  tests: z
    .array(
      z.object({
        command: z.string().min(1),
        passed: z.boolean(),
        summary: z.string().optional(),
      }),
    )
    .optional(),
  blockers: z.array(z.string().min(1)).optional(),
})

type ParsedTaskResultReport = z.infer<typeof ReportTaskResultArgsSchema>

export interface TaskResultReportEvaluation {
  ok: boolean
  error?: string
}

export function normalizeTaskResultReport(data: ParsedTaskResultReport): TaskResultReport {
  const acceptanceResults = data.acceptanceResults
    ?.map((result) => ({
      criterion: result.criterion.trim(),
      passed: result.passed,
      evidence: result.evidence.trim(),
    }))
    .filter((result) => result.criterion && result.evidence)
  const blockers = data.blockers?.map((blocker) => blocker.trim()).filter(Boolean)
  const filesChanged = data.filesChanged
    ?.map((file) => ({
      path: file.path.trim(),
      ...(file.action ? { action: file.action } : {}),
    }))
    .filter((file) => file.path)
  const commandsRun = data.commandsRun
    ?.map((command) => ({
      command: command.command.trim(),
      exitCode: command.exitCode,
      ...(command.cwd?.trim() ? { cwd: command.cwd.trim() } : {}),
      ...(command.timedOut !== undefined ? { timedOut: command.timedOut } : {}),
      ...(command.summary?.trim() ? { summary: command.summary.trim() } : {}),
    }))
    .filter((command) => command.command)
  const tests = data.tests
    ?.map((test) => ({
      command: test.command.trim(),
      passed: test.passed,
      ...(test.summary?.trim() ? { summary: test.summary.trim() } : {}),
    }))
    .filter((test) => test.command)

  return {
    status: data.status,
    summary: data.summary.trim(),
    ...(acceptanceResults && acceptanceResults.length > 0 ? { acceptanceResults } : {}),
    ...(filesChanged && filesChanged.length > 0 ? { filesChanged } : {}),
    ...(commandsRun && commandsRun.length > 0 ? { commandsRun } : {}),
    ...(tests && tests.length > 0 ? { tests } : {}),
    ...(blockers && blockers.length > 0 ? { blockers } : {}),
  }
}

export function parseTaskResultReport(value: unknown): TaskResultReport | null {
  const parsed = ReportTaskResultArgsSchema.safeParse(value)
  return parsed.success ? normalizeTaskResultReport(parsed.data) : null
}

export function readTaskResultReportFromToolResult(result: unknown): TaskResultReport | null {
  return readTaskResultReportFromUnknown(result, 0)
}

export function isTaskResultReportToolName(toolName: string): boolean {
  return (
    toolName === REPORT_TASK_RESULT_TOOL_NAME ||
    toolName.endsWith(`__${REPORT_TASK_RESULT_TOOL_NAME}`) ||
    toolName.endsWith(`_${REPORT_TASK_RESULT_TOOL_NAME}`)
  )
}

export function evaluateTaskResultReport(
  task: DispatchPlanItem,
  report: TaskResultReport | undefined,
  evidence: RunToolEvidence = { fileWrites: [], commands: [] },
): TaskResultReportEvaluation {
  if (!report) {
    return {
      ok: false,
      error: `Task "${task.id}" completed without report_task_result`,
    }
  }

  if (report.status !== 'complete') {
    return {
      ok: false,
      error: formatReportedNonCompletion(task.id, report),
    }
  }

  const failedCommands = evidence.commands.filter(
    (command, index) =>
      !command.prepare &&
      isFailedCommand(command) &&
      !hasLaterSuccessfulCommand(command, index, evidence.commands),
  )
  if (failedCommands.length > 0) {
    return {
      ok: false,
      error: `Task "${task.id}" has failed command evidence: ${failedCommands
        .map((command) =>
          `${command.command} (${command.isError ? command.error ?? 'tool error' : command.timedOut ? 'timed out' : `exit ${command.exitCode}`})`,
        )
        .join('; ')}`,
    }
  }

  const failedAcceptance = report.acceptanceResults?.filter((result) => !result.passed) ?? []
  if (failedAcceptance.length > 0) {
    return {
      ok: false,
      error: `Task "${task.id}" did not satisfy acceptance criteria: ${failedAcceptance
        .map((result) => `${result.criterion} (${result.evidence})`)
        .join('; ')}`,
    }
  }

  const criteria = task.acceptanceCriteria ?? []
  if (criteria.length > 0) {
    const reportedCriteria = new Set(
      (report.acceptanceResults ?? []).map((result) => result.criterion.trim()),
    )
    const missing = criteria.filter((criterion) => !reportedCriteria.has(criterion.trim()))
    if (missing.length > 0) {
      return {
        ok: false,
        error: `Task "${task.id}" report is missing acceptance criteria result(s): ${missing.join('; ')}`,
      }
    }
  }

  const missingTargetPaths = (task.targetPaths ?? []).filter(
    (targetPath) => !hasPathEvidence(targetPath, report, evidence),
  )
  if (missingTargetPaths.length > 0) {
    return {
      ok: false,
      error: `Task "${task.id}" report is missing target path evidence: ${missingTargetPaths.join('; ')}. ${describeSeenEvidence(report, evidence)}${describeTargetPathExpectations(missingTargetPaths, evidence)}`,
    }
  }

  const missingCommands = (task.requiredCommands ?? []).filter(
    (required) => !hasSuccessfulCommandEvidence(required.command, report, evidence),
  )
  if (missingCommands.length > 0) {
    return {
      ok: false,
      error: `Task "${task.id}" report is missing successful command evidence: ${missingCommands
        .map((required) => required.command)
        .join('; ')}`,
    }
  }

  if (isCodeImplementationTask(task) && !hasSuccessfulVerificationCommandEvidence(evidence)) {
    return {
      ok: false,
      error: `Task "${task.id}" is missing successful runnable verification command evidence: build/compile/test/typecheck/lint command exitCode=0`,
    }
  }

  const missingEvidence = (task.requiredEvidence ?? []).filter(
    (required) => !requiredEvidenceSatisfied(required, report, evidence),
  )
  if (missingEvidence.length > 0) {
    return {
      ok: false,
      error: `Task "${task.id}" report is missing required evidence: ${missingEvidence.join('; ')}`,
    }
  }

  return { ok: true }
}

function hasPathEvidence(
  targetPath: string,
  report: TaskResultReport,
  evidence: RunToolEvidence,
): boolean {
  const candidates = [
    ...(report.filesChanged ?? []).map((file) => file.path),
    ...evidence.fileWrites.flatMap((file) => [file.path, file.absolutePath]),
  ]
  if (candidates.some((candidate) => pathsMatch(targetPath, candidate))) return true
  // 产物也算证据：交付方式常常是 bash 生成文件 + write_artifact 交付，磁盘路径未必在 workspace。
  return artifactMatchesTargetPath(targetPath, evidence.artifacts ?? [])
}

/**
 * 产物 → targetPath 的匹配。
 *
 * 只在「扩展名能对应到产物类型」或「文件名主干与产物标题互相包含」时算命中；
 * 目录型 targetPath（无扩展名）不认产物，代码类任务仍然必须落到真实文件。
 */
function artifactMatchesTargetPath(
  targetPath: string,
  artifacts: readonly RunArtifactEvidence[],
): boolean {
  if (artifacts.length === 0) return false

  const normalizedTarget = normalizePath(targetPath)
  const basename = normalizedTarget.split('/').pop() ?? ''
  const dotIndex = basename.lastIndexOf('.')
  if (dotIndex <= 0) return false

  const extension = basename.slice(dotIndex + 1).toLowerCase()
  const acceptedTypes = ARTIFACT_TYPES_BY_EXTENSION[extension]
  if (acceptedTypes && acceptedTypes.some((type) => artifacts.some((a) => a.type === type))) {
    return true
  }

  const stem = basename.slice(0, dotIndex)
  // CJK 文件名的信息密度远高于 ASCII：`流程图.mmd` 三个字已经足够判定归属，
  // 沿用 ASCII 的 4 字符阈值会让中文命名在这个门禁里天然吃亏（恒判不过）。
  const minStemLength = hasNonAscii(stem) ? 2 : 4
  if (stem.length < minStemLength) return false
  return artifacts.some((artifact) => {
    const title = normalizePath(artifact.title)
    return title.includes(stem) || stem.includes(title)
  })
}

function hasNonAscii(value: string): boolean {
  return /[^\x20-\x7E]/.test(value)
}

/** 该 targetPath 期望的产物 type（用于门禁失败时给出可执行诊断）。 */
function expectedArtifactTypesForPath(targetPath: string): readonly string[] {
  const basename = normalizePath(targetPath).split('/').pop() ?? ''
  const dotIndex = basename.lastIndexOf('.')
  if (dotIndex <= 0) return []
  return ARTIFACT_TYPES_BY_EXTENSION[basename.slice(dotIndex + 1).toLowerCase()] ?? []
}

/** 门禁失败时把「实际看到了什么」一并列出 —— 否则 LLM 和人都无从判断差在哪。 */
function describeSeenEvidence(report: TaskResultReport, evidence: RunToolEvidence): string {
  const files = [
    ...(report.filesChanged ?? []).map((file) => file.path),
    ...evidence.fileWrites.map((file) => file.path),
  ]
  const commands = evidence.commands.map((command) => command.command)
  const artifacts = (evidence.artifacts ?? []).map((a) => `${a.type}:${a.title}`)
  return `Evidence seen — filesChanged/fileWrites: [${
    files.slice(0, 8).join(', ') || 'none'
  }]; artifacts: [${artifacts.slice(0, 8).join(', ') || 'none'}]; commands: [${commands
    .slice(0, 8)
    .join(' | ') || 'none'}].`
}

/**
 * 门禁失败时把「期望什么 / 实际交付了什么」讲清楚。
 *
 * 只列 Evidence seen 是不够的：agent 看到 "missing target path evidence" 无从判断
 * 差在哪，只能原样重做一遍 —— 而每次 write_artifact 又生成一个全新产物，
 * 于是「验收恒失败」直接放大成「产物爆炸」。这里把 type 错位直接点名。
 */
function describeTargetPathExpectations(
  targetPaths: readonly string[],
  evidence: RunToolEvidence,
): string {
  const deliveredTypes = [...new Set((evidence.artifacts ?? []).map((a) => a.type))]
  if (deliveredTypes.length === 0) return ''
  const hints = targetPaths
    .map((targetPath) => {
      const expected = expectedArtifactTypesForPath(targetPath)
      if (expected.length === 0) return null
      return `${targetPath} expects artifact type ${expected.join(' or ')}, but delivered types are ${deliveredTypes.join(', ')}`
    })
    .filter((hint): hint is string => Boolean(hint))
  if (hints.length === 0) return ''
  return ` Type mismatch — ${hints.join('; ')}. Deliver an artifact whose type matches, or write the file to the target path with fs_write.`
}

function hasSuccessfulCommandEvidence(
  requiredCommand: string,
  report: TaskResultReport,
  evidence: RunToolEvidence,
): boolean {
  const reported = report.commandsRun?.some(
    (command) => commandsMatch(requiredCommand, command.command) && command.exitCode === 0,
  )
  const tested = report.tests?.some(
    (test) => commandsMatch(requiredCommand, test.command) && test.passed,
  )
  const recorded = evidence.commands.some(
    (command) =>
      commandsMatch(requiredCommand, command.command) &&
      !command.isError &&
      !command.timedOut &&
      command.exitCode === 0,
  )
  return Boolean(reported || tested || recorded)
}

export function hasSuccessfulVerificationCommandEvidence(evidence: RunToolEvidence): boolean {
  return evidence.commands.some(isSuccessfulVerificationCommandEvidence)
}

export function isVerificationCommand(command: string): boolean {
  const normalized = normalizeCommand(command)
  return (
    !isPrepareCommand(normalized) &&
    VERIFICATION_COMMAND_PATTERNS.some((pattern) => pattern.test(normalized))
  )
}

function isSuccessfulVerificationCommandEvidence(
  command: RunToolEvidence['commands'][number],
): boolean {
  return (
    !command.prepare &&
    !command.isError &&
    !command.timedOut &&
    command.exitCode === 0 &&
    isVerificationCommand(command.command)
  )
}

function requiredEvidenceSatisfied(
  required: string,
  report: TaskResultReport,
  evidence: RunToolEvidence,
): boolean {
  if (required.trim() === CODE_TASK_RUNNABLE_REQUIRED_EVIDENCE) {
    return hasSuccessfulVerificationCommandEvidence(evidence)
  }
  return evidenceMentions(required, report, evidence)
}

function evidenceMentions(
  required: string,
  report: TaskResultReport,
  evidence: RunToolEvidence,
): boolean {
  const haystack = [
    report.summary,
    ...(report.acceptanceResults ?? []).flatMap((result) => [result.criterion, result.evidence]),
    ...(report.filesChanged ?? []).flatMap((file) => [file.path, file.action ?? '']),
    ...(report.commandsRun ?? []).flatMap((command) => [command.command, command.summary ?? '']),
    ...(report.tests ?? []).flatMap((test) => [test.command, test.summary ?? '']),
    ...evidence.fileWrites.flatMap((file) => [file.path, file.absolutePath, String(file.bytes ?? '')]),
    ...(evidence.artifacts ?? []).flatMap((artifact) => [
      artifact.artifactId,
      artifact.title,
      artifact.type,
    ]),
    ...evidence.commands.flatMap((command) => [
      command.command,
      command.cwd,
      String(command.exitCode ?? ''),
      command.timedOut ? 'timedOut' : '',
      command.isError ? 'isError' : '',
      command.error ?? '',
      command.exitCode === 0 && !command.timedOut && !command.isError ? 'exitCode=0' : '',
    ]),
  ]
    .join('\n')
    .toLowerCase()
  return haystack.includes(required.toLowerCase())
}

function isFailedCommand(command: RunToolEvidence['commands'][number]): boolean {
  return command.isError || command.timedOut || command.exitCode !== 0
}

function hasLaterSuccessfulCommand(
  failed: RunToolEvidence['commands'][number],
  failedIndex: number,
  commands: RunToolEvidence['commands'],
): boolean {
  return commands
    .slice(failedIndex + 1)
    .some(
      (command) =>
        commandEvidenceMatches(failed, command) &&
        !command.isError &&
        !command.timedOut &&
        command.exitCode === 0,
    )
}

function commandEvidenceMatches(
  expected: RunToolEvidence['commands'][number],
  actual: RunToolEvidence['commands'][number],
): boolean {
  return commandsMatch(expected.command, actual.command) && cwdMatches(expected.cwd, actual.cwd)
}

function cwdMatches(expected: string, actual: string): boolean {
  const e = normalizePath(expected)
  const a = normalizePath(actual)
  return e === a || e.endsWith(`/${a}`) || a.endsWith(`/${e}`)
}

function pathsMatch(expected: string, actual: string): boolean {
  const e = normalizePath(expected)
  const a = normalizePath(actual)
  return a === e || a.endsWith(`/${e}`) || a.startsWith(`${e}/`)
}

function commandsMatch(expected: string, actual: string): boolean {
  const e = normalizeCommand(expected)
  const a = normalizeCommand(actual)
  return a === e || a.includes(e) || normalizedPackageScript(e) === normalizedPackageScript(a)
}

function normalizePath(value: string): string {
  return value.trim().replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/\/+$/, '').toLowerCase()
}

function normalizeCommand(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\s+2>\s*&1\s*$/i, '')
    .replace(/\s+1>\s*&2\s*$/i, '')
    .replace(/\s+>\s*\$null\s*$/i, '')
}

function normalizedPackageScript(command: string): string {
  const match = /^(?:pnpm|npm|yarn|bun)(?:\.cmd)?\s+(?:run\s+)?([\w:-]+)(?:\s|$)/i.exec(command)
  return match ? `package:${match[1].toLowerCase()}` : command
}

/**
 * 文件扩展名 → 可接受的 write_artifact type 集合。
 *
 * 一个扩展名可能对应多种交付语义，必须都接受：`output/order-flow.svg` 既可能是
 * 导出的位图（image），也可能是 Mermaid 矢量图（diagram）。以前 svg 只映射到 image，
 * 于是「.svg 命名 + diagram 类型交付」恒判不过 → 门禁每次失败 → 重试放大成十几个
 * 独立产物（每次 write_artifact 都是全新 artifactId，不是新版本）。
 */
const ARTIFACT_TYPES_BY_EXTENSION: Record<string, readonly string[]> = {
  png: ['image'],
  jpg: ['image'],
  jpeg: ['image'],
  gif: ['image'],
  webp: ['image'],
  bmp: ['image'],
  avif: ['image'],
  svg: ['image', 'diagram'],
  mmd: ['diagram'],
  mermaid: ['diagram'],
  drawio: ['diagram'],
  html: ['web_app'],
  htm: ['web_app'],
  css: ['web_app'],
  js: ['web_app'],
  mjs: ['web_app'],
  jsx: ['web_app'],
  ts: ['web_app'],
  tsx: ['web_app'],
  md: ['document'],
  markdown: ['document'],
  txt: ['document'],
  doc: ['document'],
  docx: ['document'],
  pdf: ['document'],
  csv: ['document'],
  ppt: ['ppt'],
  pptx: ['ppt'],
  key: ['ppt'],
}

const VERIFICATION_COMMAND_PATTERNS = [
  /\b(?:pnpm|npm|yarn|bun)(?:\.cmd)?\b(?=.*\b(?:run\s+)?(?:build|test|lint|typecheck|check|compile)(?:\b|:))/i,
  /\b(?:tsc|tsc\.cmd)\b/i,
  /\bnext(?:\.cmd)?\s+build\b/i,
  /\bvite(?:\.cmd)?\s+build\b/i,
  /\bmvn(?:\.cmd)?\b(?=.*\b(?:compile|test|package|verify)\b)/i,
  /\b(?:gradle|gradlew|gradlew\.bat|\.\/gradlew)\b(?=.*\b(?:build|test|check)\b)/i,
  /\bgo\s+(?:test|build)\b/i,
  /\bcargo\s+(?:test|build|check)\b/i,
  /\b(?:pytest|py\.test)\b/i,
  /\bpython(?:3)?(?:\.exe)?\s+-m\s+pytest\b/i,
  /\bruff\s+check\b/i,
  /\bmypy\b/i,
  /\bdotnet\s+(?:build|test)\b/i,
]

function isPrepareCommand(command: string): boolean {
  return (
    /^\s*(?:pnpm|npm|yarn|bun)(?:\.cmd)?\s+(?:install|i|ci|add)\b/i.test(command) &&
    !/\b(?:build|test|lint|typecheck|check|compile)(?:\b|:)/i.test(command)
  )
}

function readTaskResultReportFromUnknown(
  value: unknown,
  depth: number,
): TaskResultReport | null {
  if (depth > 6) return null

  const direct = parseTaskResultReport(value)
  if (direct) return direct

  if (typeof value === 'string') {
    return readTaskResultReportFromJsonText(value, depth + 1)
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const parsed = readTaskResultReportFromUnknown(item, depth + 1)
      if (parsed) return parsed
    }
    return null
  }

  if (!isRecord(value)) return null

  if (typeof value.text === 'string') {
    const parsed = readTaskResultReportFromJsonText(value.text, depth + 1)
    if (parsed) return parsed
  }

  for (const key of ['structuredContent', 'structured_content', 'result', 'value', 'content']) {
    if (!(key in value)) continue
    const parsed = readTaskResultReportFromUnknown(value[key], depth + 1)
    if (parsed) return parsed
  }

  return null
}

function readTaskResultReportFromJsonText(text: string, depth: number): TaskResultReport | null {
  try {
    return readTaskResultReportFromUnknown(JSON.parse(text), depth)
  } catch {
    return null
  }
}

function formatReportedNonCompletion(taskId: string, report: TaskResultReport): string {
  const blockers =
    report.blockers && report.blockers.length > 0
      ? ` Blockers: ${report.blockers.join('; ')}`
      : ''
  return `Task "${taskId}" reported ${report.status}: ${report.summary}${blockers}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}
