import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

import JSZip from 'jszip'

import type { ProjectFile } from '@/shared/types'

import type { RunFileEvidence } from './dispatch-run-evidence'
import { isPathWithin } from './workspace-utils'

// Build the project file list from applied fs_write evidence. absolutePath is the
// trustworthy field; the tool input path can be relative or absolute.
export function buildProjectFiles(
  fileWrites: readonly RunFileEvidence[],
  workspaceRoot: string,
): ProjectFile[] {
  const byPath = new Map<string, ProjectFile>()
  for (const fw of fileWrites) {
    if (!isPathWithin(fw.absolutePath, workspaceRoot)) continue
    const rel = toRel(fw.absolutePath, workspaceRoot)
    if (!rel) continue
    byPath.set(rel, { path: rel, sizeBytes: fw.bytes ?? byPath.get(rel)?.sizeBytes ?? 0 })
  }
  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path))
}

// Evidence 记录的是写入时刻的路径；创建产物时文件可能已被后续尝试移动/删除（如 bash mv）。
export function filterExistingProjectFiles(
  files: readonly ProjectFile[],
  workspaceRoot: string,
): ProjectFile[] {
  return files.filter((file) => {
    const abs = path.resolve(workspaceRoot, file.path)
    if (!isPathWithin(abs, workspaceRoot)) return false
    return statSync(abs, { throwIfNoEntry: false })?.isFile() ?? false
  })
}

export function buildProjectFilesFromTargetPaths(
  targetPaths: readonly string[],
  workspaceRoot: string,
): ProjectFile[] {
  const byPath = new Map<string, ProjectFile>()
  for (const targetPath of targetPaths) {
    const absoluteTarget = path.resolve(workspaceRoot, targetPath)
    if (!isPathWithin(absoluteTarget, workspaceRoot) || !existsSync(absoluteTarget)) continue
    collectProjectFiles(absoluteTarget, workspaceRoot, byPath)
  }
  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path))
}

function collectProjectFiles(
  absolutePath: string,
  workspaceRoot: string,
  out: Map<string, ProjectFile>,
): void {
  let stat: ReturnType<typeof statSync>
  try {
    stat = statSync(absolutePath)
  } catch {
    return
  }
  if (stat.isFile()) {
    const rel = toRel(absolutePath, workspaceRoot)
    if (rel) out.set(rel, { path: rel, sizeBytes: stat.size })
    return
  }
  if (!stat.isDirectory()) return
  for (const entry of readdirSync(absolutePath, { withFileTypes: true })) {
    if (entry.isDirectory() && EXCLUDED_PROJECT_SCAN_DIRS.has(entry.name)) continue
    collectProjectFiles(path.join(absolutePath, entry.name), workspaceRoot, out)
  }
}

const EXCLUDED_PROJECT_SCAN_DIRS = new Set([
  '.agenthub',
  '.git',
  '.next',
  'build',
  'dist',
  'node_modules',
  'out',
  'target',
])

function toRel(abs: string, root: string): string | null {
  const rel = path.relative(root, abs)
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null
  return rel.split(path.sep).join('/')
}

export async function zipProjectFromWorkspace(
  workspaceRoot: string,
  files: readonly ProjectFile[],
  title: string,
  exportedAtIso: string,
): Promise<Buffer> {
  const zip = new JSZip()
  for (const file of files) {
    const rel = normalizeProjectPath(file.path)
    if (!rel) continue
    const abs = path.resolve(workspaceRoot, rel)
    if (!isPathWithin(abs, workspaceRoot)) continue
    try {
      if (statSync(abs).isFile()) zip.file(rel, readFileSync(abs))
    } catch {
      // The live workspace may have changed since the artifact was created.
    }
  }
  zip.file(
    'README.txt',
    `Project artifact: ${title}\nFiles: ${files.length}\nExported at: ${exportedAtIso}\n`,
  )
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

function normalizeProjectPath(input: string): string | null {
  if (!input || path.isAbsolute(input) || /^[A-Za-z]:/.test(input)) return null
  const parts = input.split(/[\\/]+/).filter((part) => part && part !== '.')
  if (parts.length === 0 || parts.includes('..')) return null
  return parts.join('/')
}
