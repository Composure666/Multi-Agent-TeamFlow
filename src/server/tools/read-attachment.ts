import { closeSync, openSync, readFileSync, readSync } from 'node:fs'
import path from 'node:path'

import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

import { db, schema } from '@/db/client'
import { getAttachmentAbsolutePath } from '@/server/attachment-service'

import type { ToolDef } from './types'

const ArgsSchema = z.object({
  attachmentId: z.string().min(1),
})

// 文本类附件直接读 utf-8；超过这个上限会截断（防 prompt 爆炸）
const MAX_TEXT_CHARS = 50_000

const TEXT_MIME_PREFIXES = ['text/']
const TEXT_MIME_FULL = new Set([
  'application/json',
  'application/xml',
  'application/javascript',
  'application/x-yaml',
])

function isTextLike(mime: string): boolean {
  if (TEXT_MIME_FULL.has(mime)) return true
  return TEXT_MIME_PREFIXES.some((p) => mime.startsWith(p))
}

/**
 * read_attachment —— 读取「会话文件库」里的附件内容（与用户上传相关，不要和 read_artifact 混淆）。
 *
 * - id 以 `att_` 开头的是 attachment，必须用 read_attachment
 * - id 以 `art_` 开头的是 artifact（agent 自己产出的产物），用 read_artifact
 *
 * 文本类附件直接返回内容；PDF 懒解析成文本；图片附件提示走 multimodal channel；
 * 其他二进制（docx / zip 等）只返回元信息。
 */
export const readAttachmentTool: ToolDef = {
  name: 'read_attachment',
  description:
    "Read the contents of a user-uploaded attachment (id starts with 'att_'). Use this when the user prompt mentions [图片附件: ...] or [文件附件: ...]. Returns plain text for text-like files (txt/md/json/csv/etc) and extractable PDF text. For images and unsupported binary formats only metadata is returned. Do NOT use this for ids starting with 'art_' — that's for read_artifact.",
  parameters: {
    type: 'object',
    required: ['attachmentId'],
    properties: {
      attachmentId: {
        type: 'string',
        description: 'Attachment id, format att_xxx (NOT an artifact id)',
      },
    },
  },
  async handler(args, ctx) {
    const parsed = ArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: `Invalid args: ${parsed.error.message}` }
    }

    const attachmentId = parsed.data.attachmentId

    // 防误用：如果传入的明显是 artifact id，给出更友好的提示
    if (attachmentId.startsWith('art_')) {
      return {
        ok: false,
        error: `'${attachmentId}' is an artifact id (art_*), not an attachment. Use read_artifact instead.`,
      }
    }

    const row = await db.query.attachments.findFirst({
      where: and(
        eq(schema.attachments.id, attachmentId),
        eq(schema.attachments.conversationId, ctx.conversationId),
      ),
    })
    if (!row) {
      return {
        ok: false,
        error: `Attachment not found in this conversation: ${attachmentId}`,
      }
    }

    const absPath = await getAttachmentAbsolutePath(attachmentId)
    if (!absPath) {
      return { ok: false, error: 'Attachment file missing on disk' }
    }

    const meta = {
      id: row.id,
      fileName: row.fileName,
      size: row.size,
      mimeType: row.mimeType,
      kind: row.kind,
    }

    if (isPdfLike(row.mimeType, row.fileName, absPath)) {
      if (ctx.abortSignal.aborted) {
        return { ok: false, error: 'PDF extraction aborted' }
      }
      try {
        const extracted = await extractPdfText(absPath)
        if (ctx.abortSignal.aborted) {
          return { ok: false, error: 'PDF extraction aborted' }
        }
        return { ok: true, value: { ...meta, ...extracted } }
      } catch (err) {
        return {
          ok: false,
          error: `Failed to extract PDF text: ${err instanceof Error ? err.message : String(err)}`,
        }
      }
    }

    if (isTextLike(row.mimeType)) {
      try {
        const raw = readFileSync(absPath, 'utf8')
        const { content, truncated } = truncateText(raw)
        return { ok: true, value: { ...meta, content, truncated } }
      } catch (err) {
        return {
          ok: false,
          error: `Failed to read text file: ${err instanceof Error ? err.message : String(err)}`,
        }
      }
    }

    if (row.kind === 'image') {
      return {
        ok: true,
        value: {
          ...meta,
          note: 'Image bytes are delivered through the multimodal user message (if the agent supports vision). You should already see this image in the conversation content blocks.',
        },
      }
    }

    // 其他二进制（PDF / Office / 压缩等）
    return {
      ok: true,
      value: {
        ...meta,
        note: `This is a ${row.mimeType} binary file. AgentHub does not yet extract text from this format; only metadata is available. Ask the user for a text version if you need to inspect content.`,
      },
    }
  },
}

function isPdfLike(mimeType: string, fileName: string, absPath: string): boolean {
  if (mimeType === 'application/pdf') return true
  if (path.extname(fileName).toLowerCase() === '.pdf') return true
  const fd = openSync(absPath, 'r')
  try {
    const header = Buffer.alloc(5)
    const bytesRead = readSync(fd, header, 0, header.length, 0)
    return bytesRead === header.length && header.toString('ascii') === '%PDF-'
  } catch {
    return false
  } finally {
    closeSync(fd)
  }
}

function truncateText(raw: string): { content: string; truncated: boolean } {
  const truncated = raw.length > MAX_TEXT_CHARS
  const content = truncated
    ? raw.slice(0, MAX_TEXT_CHARS) + `\n\n[TRUNCATED at ${MAX_TEXT_CHARS} chars]`
    : raw
  return { content, truncated }
}

async function extractPdfText(absPath: string): Promise<{
  content: string
  truncated: boolean
  pageCount: number
  note?: string
}> {
  const { PDFParse } = await import('pdf-parse')
  const parser = new PDFParse({ data: readFileSync(absPath) })
  try {
    const result = await parser.getText()
    const text = result.text.trim()
    const { content, truncated } = truncateText(text)
    return {
      content,
      truncated,
      pageCount: result.total,
      ...(text
        ? {}
        : {
            note: 'No extractable text was found in this PDF. It may be scanned or image-only; OCR is required to inspect its content.',
          }),
    }
  } finally {
    await parser.destroy().catch(() => undefined)
  }
}
