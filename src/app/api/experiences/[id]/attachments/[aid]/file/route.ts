import { readFile } from 'node:fs/promises'

import { NextResponse } from 'next/server'

import { getExperienceFile } from '@/server/experience-service'

interface RouteContext {
  params: Promise<{ id: string; aid: string }>
}

/** 下载经验参考附件（响应体为文件二进制） */
export async function GET(_req: Request, ctx: RouteContext) {
  const { id, aid } = await ctx.params
  try {
    const found = await getExperienceFile(id, aid)
    if (!found) {
      return NextResponse.json({ error: 'file_not_found' }, { status: 404 })
    }
    const buffer = await readFile(found.absPath)
    // filename 走 RFC 5987 编码，避免 CRLF / 引号注入响应头
    const encoded = encodeURIComponent(found.row.fileName)
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': found.row.mimeType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename*=UTF-8''${encoded}`,
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch (err) {
    console.error('[api/experiences/[id]/attachments/[aid]/file] GET failed', err)
    return NextResponse.json({ error: 'download_failed' }, { status: 500 })
  }
}
