import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { and, desc, eq } from 'drizzle-orm'

import { db, schema } from '@/db/client'
import type { AttachmentRow } from '@/db/schema'
import { newAttachmentId } from '@/server/ids'
import { isPathWithin } from '@/server/workspace-utils'

/**
 * 会话文件库。
 *
 * 元数据存 attachments 表，二进制存 workspace.rootPath/uploads/{id}{ext}。
 * 文件路径都走 workspace 沙箱，绝不外溢。
 */

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB

export interface UploadFileArgs {
  conversationId: string
  file: File
}

export async function uploadAttachment(args: UploadFileArgs): Promise<AttachmentRow> {
  if (args.file.size === 0) throw new Error('Empty file')
  if (args.file.size > MAX_FILE_SIZE) {
    throw new Error(`File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`)
  }

  const workspace = await db.query.workspaces.findFirst({
    where: eq(schema.workspaces.conversationId, args.conversationId),
  })
  if (!workspace) throw new Error(`Workspace not found for conversation: ${args.conversationId}`)

  const uploadDir = path.join(workspace.rootPath, 'uploads')
  mkdirSync(uploadDir, { recursive: true })

  const id = newAttachmentId()
  const ext = sanitizeExt(args.file.name)
  const storedName = `${id}${ext}`
  const absPath = path.join(uploadDir, storedName)

  // 沙箱检查：解析后必须仍在 workspace 内
  const resolved = path.resolve(absPath)
  if (!isPathWithin(resolved, workspace.rootPath)) {
    throw new Error('Path traversal detected')
  }

  const buffer = Buffer.from(await args.file.arrayBuffer())
  writeFileSync(absPath, buffer)

  const mimeType = args.file.type || guessMime(ext)
  const kind = mimeType.startsWith('image/') ? 'image' : 'file'

  const row: AttachmentRow = {
    id,
    conversationId: args.conversationId,
    kind,
    fileName: args.file.name,
    filePath: path.posix.join('uploads', storedName), // 相对路径，跨平台用 posix 风格
    size: args.file.size,
    mimeType,
    createdAt: Date.now(),
  }

  await db.insert(schema.attachments).values(row)
  return row
}

export async function listAttachments(conversationId: string): Promise<AttachmentRow[]> {
  return db.query.attachments.findMany({
    where: eq(schema.attachments.conversationId, conversationId),
    orderBy: [desc(schema.attachments.createdAt)],
  })
}

export async function getAttachment(attachmentId: string): Promise<AttachmentRow | null> {
  const row = await db.query.attachments.findFirst({
    where: eq(schema.attachments.id, attachmentId),
  })
  return row ?? null
}

export async function getAttachmentAbsolutePath(attachmentId: string): Promise<string | null> {
  const row = await getAttachment(attachmentId)
  if (!row) return null
  const workspace = await db.query.workspaces.findFirst({
    where: eq(schema.workspaces.conversationId, row.conversationId),
  })
  if (!workspace) return null
  const abs = path.join(workspace.rootPath, row.filePath)
  const resolved = path.resolve(abs)
  if (!isPathWithin(resolved, workspace.rootPath)) return null
  return existsSync(resolved) ? resolved : null
}

export async function deleteAttachment(attachmentId: string): Promise<void> {
  const row = await getAttachment(attachmentId)
  if (!row) throw new Error(`Attachment not found: ${attachmentId}`)

  const absPath = await getAttachmentAbsolutePath(attachmentId)

  const deleted = await db
    .delete(schema.attachments)
    .where(and(eq(schema.attachments.id, attachmentId)))
    .returning({ id: schema.attachments.id })

  if (deleted.length === 0) {
    throw new Error(`Failed to delete attachment: ${attachmentId}`)
  }

  if (absPath) {
    try {
      rmSync(absPath, { force: true })
    } catch (err) {
      console.warn('[deleteAttachment] file remove failed', err)
    }
  }
}

// ─── 工具 ────────────────────────────────────────────────
function sanitizeExt(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase()
  // 允许字母数字 + 短横，限制长度
  if (!/^\.[a-z0-9]{1,8}$/.test(ext)) return ''
  return ext
}

function guessMime(ext: string): string {
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.json': 'application/json',
    '.pdf': 'application/pdf',
    '.csv': 'text/csv',
  }
  return map[ext] ?? 'application/octet-stream'
}
