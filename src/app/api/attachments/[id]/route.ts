import { readFileSync } from 'node:fs'

import { NextResponse } from 'next/server'

import { deleteAttachment, getAttachment, getAttachmentAbsolutePath } from '@/server/attachment-service'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * GET → 下载（或在浏览器内嵌预览，按 mimeType inline）
 * DELETE → 从文件库移除
 */
export async function GET(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params
  const row = await getAttachment(id)
  if (!row) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const abs = await getAttachmentAbsolutePath(id)
  if (!abs) {
    return NextResponse.json({ error: 'File missing on disk' }, { status: 410 })
  }

  const buf = readFileSync(abs)
  // 图片走 inline 直接预览；其他走 attachment 下载
  const disposition =
    row.kind === 'image'
      ? `inline; filename*=UTF-8''${encodeURIComponent(row.fileName)}`
      : `attachment; filename*=UTF-8''${encodeURIComponent(row.fileName)}`

  // Next.js 16 expects BodyInit; Buffer is acceptable
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': row.mimeType,
      'Content-Length': String(buf.length),
      'Content-Disposition': disposition,
      'Cache-Control': 'private, max-age=3600',
    },
  })
}

export async function DELETE(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params
  try {
    await deleteAttachment(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 404 })
  }
}
