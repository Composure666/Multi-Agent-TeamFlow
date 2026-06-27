import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'

import { eq } from 'drizzle-orm'

import { db, schema } from '@/db/client'
import type { WorkspaceRow } from '@/db/schema'

import { assertPathWithinWorkspace, getEffectiveCwd } from './workspace-utils'

/**
 * Workspace 文件系统共享 helper。
 *
 * 给 fs_read / fs_write 工具（src/server/tools/）和前端文件浏览器 API
 * （src/app/api/conversations/[id]/fs/...）共用，避免逻辑两份。
 *
 * 路径都走 assertPathWithinWorkspace 沙箱；sandbox 模式额外强制总量配额。
 */

export const MAX_READ_BYTES = 1_048_576 // 1 MB
export const MAX_READ_CHARS = 50_000
export const MAX_WRITE_BYTES = 100 * 1024 // 100 KB
export const SANDBOX_TOTAL_BYTES = 100 * 1024 * 1024 // 100 MB
export const SANDBOX_TOTAL_FILES = 1000

export async function getWorkspaceForConversation(
  conversationId: string,
): Promise<WorkspaceRow | null> {
  const row = await db.query.workspaces.findFirst({
    where: eq(schema.workspaces.conversationId, conversationId),
  })
  return row ?? null
}

/**
 * 读 workspace 内某个文件，文件不存在返回 null。
 * 用于 fs_write review 模式：拿到 oldContent 给前端 diff viewer。
 */
export function readIfExists(workspace: WorkspaceRow, target: string): string | null {
  try {
    const absPath = assertPathWithinWorkspace(workspace, target)
    if (!existsSync(absPath)) return null
    const stat = statSync(absPath)
    if (!stat.isFile()) return null
    if (stat.size > MAX_READ_BYTES) return null // 太大不 diff
    return readFileSync(absPath, 'utf8')
  } catch {
    return null
  }
}

// ─── 读文件 ─────────────────────────────────────────────
export interface ReadResult {
  path: string
  absolutePath: string
  cwd: string
  size: number
  content: string
  truncated: boolean
}

export function readFileInWorkspace(workspace: WorkspaceRow, target: string): ReadResult {
  const absPath = assertPathWithinWorkspace(workspace, target)
  const stat = statSync(absPath)
  if (!stat.isFile()) throw new Error(`Not a file: ${target}`)
  if (stat.size > MAX_READ_BYTES) {
    throw new Error(`File too large (${(stat.size / 1024 / 1024).toFixed(2)} MB > 1 MB limit)`)
  }
  const raw = readFileSync(absPath, 'utf8')
  const truncated = raw.length > MAX_READ_CHARS
  const content = truncated
    ? raw.slice(0, MAX_READ_CHARS) + `\n\n[TRUNCATED at ${MAX_READ_CHARS} chars]`
    : raw
  return {
    path: target,
    absolutePath: absPath,
    cwd: getEffectiveCwd(workspace),
    size: stat.size,
    content,
    truncated,
  }
}

// ─── 写文件 ─────────────────────────────────────────────
export interface WriteResult {
  path: string
  absolutePath: string
  cwd: string
  bytes: number
}

export function writeFileInWorkspace(
  workspace: WorkspaceRow,
  target: string,
  content: string,
): WriteResult {
  const bytes = Buffer.byteLength(content, 'utf8')
  if (bytes > MAX_WRITE_BYTES) {
    throw new Error(`Content too large (${(bytes / 1024).toFixed(1)} KB > 100 KB limit)`)
  }
  const absPath = assertPathWithinWorkspace(workspace, target)

  if (workspace.mode === 'sandbox') {
    const usage = scanWorkspaceUsage(workspace.rootPath)
    if (usage.bytes + bytes > SANDBOX_TOTAL_BYTES) {
      throw new Error(
        `Workspace quota exceeded (${(usage.bytes / 1024 / 1024).toFixed(1)} MB used + ${(bytes / 1024).toFixed(1)} KB > 100 MB cap)`,
      )
    }
    if (usage.files + 1 > SANDBOX_TOTAL_FILES) {
      throw new Error(`Workspace file count exceeded (${usage.files} + 1 > 1000 cap)`)
    }
  }

  mkdirSync(path.dirname(absPath), { recursive: true })
  writeFileSync(absPath, content, 'utf8')
  return {
    path: target,
    absolutePath: absPath,
    cwd: getEffectiveCwd(workspace),
    bytes,
  }
}

// ─── 列目录 ─────────────────────────────────────────────
export interface ListResult {
  /** 相对 workspace 的路径，'' 表示 workspace 根 */
  relPath: string
  /** 绝对路径 */
  absolutePath: string
  /** 父级的 relPath；根目录时为 null */
  parent: string | null
  entries: Array<{ name: string; isDirectory: boolean; size?: number }>
}

export function listDirInWorkspace(workspace: WorkspaceRow, target: string): ListResult {
  const relPath = target === '' ? '' : target
  const absPath = relPath === '' ? getEffectiveCwd(workspace) : assertPathWithinWorkspace(workspace, target)

  const stat = statSync(absPath)
  if (!stat.isDirectory()) throw new Error(`Not a directory: ${target || '(root)'}`)

  const raw = readdirSync(absPath, { withFileTypes: true })
  const entries = raw
    .filter((e) => !e.name.startsWith('.')) // 默认隐藏 dotfile
    .map((e) => {
      const entry: { name: string; isDirectory: boolean; size?: number } = {
        name: e.name,
        isDirectory: e.isDirectory(),
      }
      if (e.isFile()) {
        try {
          entry.size = statSync(path.join(absPath, e.name)).size
        } catch {
          // ignore
        }
      }
      return entry
    })
    .sort((a, b) => {
      // 目录优先 + 字母序
      if (a.isDirectory && !b.isDirectory) return -1
      if (!a.isDirectory && b.isDirectory) return 1
      return a.name.localeCompare(b.name)
    })

  const parent = (() => {
    if (relPath === '') return null
    const p = path.posix.dirname(relPath.replace(/\\/g, '/'))
    return p === '.' || p === '' ? '' : p
  })()

  return { relPath, absolutePath: absPath, parent, entries }
}

// ─── 沙箱用量扫描（fs_write 配额检查复用） ─────────────
function scanWorkspaceUsage(rootPath: string): { bytes: number; files: number } {
  let bytes = 0
  let files = 0
  if (!existsSync(rootPath)) return { bytes, files }
  // 用 realpath 防 symlink / junction 循环（Windows mklink /J 与 POSIX ln -s 同样会形成 cycle，详见 specs/11-platform.md）
  const visited = new Set<string>()
  const stack: string[] = [rootPath]
  while (stack.length > 0) {
    const dir = stack.pop()!
    let real: string
    try {
      real = realpathSync(dir)
    } catch {
      continue
    }
    if (visited.has(real)) continue
    visited.add(real)
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        stack.push(full)
      } else if (e.isFile()) {
        try {
          bytes += statSync(full).size
          files++
        } catch {
          // ignore
        }
      }
    }
  }
  return { bytes, files }
}
