import { existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

import type { DispatchPlanItem } from '@/shared/types'

import { isCodeImplementationTask } from './dispatch-plan'
import { isPathWithin } from './workspace-utils'

export interface WorkspaceEvidenceEvaluation {
  ok: boolean
  error?: string
}

interface FileCountRequirement {
  original: string
  fragment: string
  minCount: number
}

export function evaluateWorkspaceEvidence(
  task: DispatchPlanItem,
  workspaceRoot: string,
): WorkspaceEvidenceEvaluation {
  if (!isCodeImplementationTask(task)) return { ok: true }

  for (const targetPath of task.targetPaths ?? []) {
    const absoluteTarget = safeResolve(workspaceRoot, targetPath)
    if (!absoluteTarget || !existsSync(absoluteTarget)) {
      return {
        ok: false,
        error: `Task "${task.id}" workspace evidence is incomplete: target path ${targetPath} does not exist`,
      }
    }
    const stat = statSync(absoluteTarget)
    if (!stat.isDirectory() && !stat.isFile()) {
      return {
        ok: false,
        error: `Task "${task.id}" workspace evidence is incomplete: target path ${targetPath} is not a file or directory`,
      }
    }
  }

  for (const requirement of extractFileCountRequirements(task.expectedWorkspaceChanges ?? [])) {
    const candidate = resolveRequirementPath(workspaceRoot, task.targetPaths ?? [], requirement.fragment)
    if (!candidate) {
      return {
        ok: false,
        error: `Task "${task.id}" workspace evidence is incomplete: expected at least ${requirement.minCount} file(s) under ${requirement.fragment} from expectedWorkspaceChanges "${requirement.original}", found 0`,
      }
    }
    const found = countFiles(candidate, false)
    if (found < requirement.minCount) {
      const rel = toWorkspaceRel(workspaceRoot, candidate) ?? requirement.fragment
      return {
        ok: false,
        error: `Task "${task.id}" workspace evidence is incomplete: expected at least ${requirement.minCount} file(s) under ${rel} from expectedWorkspaceChanges "${requirement.original}", found ${found}`,
      }
    }
  }

  for (const targetPath of task.targetPaths ?? []) {
    const absoluteTarget = safeResolve(workspaceRoot, targetPath)
    if (!absoluteTarget || !existsSync(absoluteTarget)) continue
    const stat = statSync(absoluteTarget)
    if (stat.isDirectory() && countFiles(absoluteTarget, true) === 0) {
      return {
        ok: false,
        error: `Task "${task.id}" workspace evidence is incomplete: target path ${targetPath} contains no files`,
      }
    }
  }

  return { ok: true }
}

function extractFileCountRequirements(changes: readonly string[]): FileCountRequirement[] {
  const requirements: FileCountRequirement[] = []
  for (const change of changes) {
    const countMatch = change.match(/(\d+)\s*\+?\s*(?:个|\+)?\s*(?:[\w\s/-]*?)?(?:文件|files?)/i)
    if (!countMatch) continue
    const minCount = Number(countMatch[1])
    if (!Number.isFinite(minCount) || minCount <= 0) continue

    const fragment = extractPathFragment(change)
    if (!fragment) continue
    requirements.push({ original: change, fragment, minCount })
  }
  return requirements
}

function extractPathFragment(change: string): string | null {
  const beforeDirectory = change.match(/([A-Za-z0-9_.\\/-]+)\s*(?:目录|dir|directory)/i)?.[1]
  const explicitPath = beforeDirectory ?? change.match(/([A-Za-z0-9_.\\/-]+\/[A-Za-z0-9_.\\/-]*)/)?.[1]
  if (!explicitPath) return null
  return normalizeRelPath(explicitPath)
}

function resolveRequirementPath(
  workspaceRoot: string,
  targetPaths: readonly string[],
  fragment: string,
): string | null {
  const direct = safeResolve(workspaceRoot, fragment)
  if (direct && existsDirectory(direct)) return direct

  const normalizedFragment = normalizeRelPath(fragment)
  const targetCandidates = targetPaths
    .map((targetPath) => normalizeRelPath(targetPath))
    .filter(Boolean)

  for (const targetPath of targetCandidates) {
    const target = safeResolve(workspaceRoot, targetPath)
    if (!target) continue
    if (targetPath.endsWith(normalizedFragment) && existsDirectory(target)) return target

    const combined = combineWithTarget(targetPath, normalizedFragment)
    if (!combined) continue
    const combinedAbs = safeResolve(workspaceRoot, combined)
    if (combinedAbs && existsDirectory(combinedAbs)) return combinedAbs
  }

  for (const targetPath of targetCandidates) {
    const target = safeResolve(workspaceRoot, targetPath)
    if (!target || !existsDirectory(target)) continue
    const found = findDirectoryBySuffix(target, workspaceRoot, normalizedFragment)
    if (found) return found
  }

  return null
}

function combineWithTarget(targetPath: string, fragment: string): string | null {
  const targetParts = targetPath.split('/')
  const fragmentParts = fragment.split('/')
  const anchor = fragmentParts[0]
  const anchorIndex = targetParts.lastIndexOf(anchor)
  if (anchorIndex === -1) return null
  return [...targetParts.slice(0, anchorIndex), ...fragmentParts].join('/')
}

function findDirectoryBySuffix(root: string, workspaceRoot: string, fragment: string): string | null {
  const entries = safeReadDir(root)
  for (const entry of entries) {
    const abs = path.join(root, entry.name)
    if (!entry.isDirectory()) continue
    const rel = toWorkspaceRel(workspaceRoot, abs)
    if (rel && rel.endsWith(fragment)) return abs
    const nested = findDirectoryBySuffix(abs, workspaceRoot, fragment)
    if (nested) return nested
  }
  return null
}

function countFiles(directory: string, recursive: boolean): number {
  let count = 0
  for (const entry of safeReadDir(directory)) {
    const abs = path.join(directory, entry.name)
    if (entry.isFile()) count++
    else if (recursive && entry.isDirectory()) count += countFiles(abs, true)
  }
  return count
}

function safeReadDir(directory: string) {
  try {
    return readdirSync(directory, { withFileTypes: true })
  } catch {
    return []
  }
}

function existsDirectory(absolutePath: string): boolean {
  try {
    return statSync(absolutePath).isDirectory()
  } catch {
    return false
  }
}

function safeResolve(workspaceRoot: string, relPath: string): string | null {
  const absolutePath = path.resolve(workspaceRoot, normalizeRelPath(relPath))
  return isPathWithin(absolutePath, workspaceRoot) ? absolutePath : null
}

function normalizeRelPath(value: string): string {
  return value.trim().replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/^\/+/, '').replace(/\/+$/, '')
}

function toWorkspaceRel(workspaceRoot: string, absolutePath: string): string | null {
  const rel = path.relative(workspaceRoot, absolutePath)
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null
  return rel.split(path.sep).join('/')
}
