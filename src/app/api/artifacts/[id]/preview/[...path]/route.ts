import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { db, schema } from '@/db/client'
import { contentTypeFor } from '@/lib/artifact-preview-mime'
import type { ArtifactContent } from '@/shared/types'

interface RouteContext {
  params: Promise<{ id: string; path: string[] }>
}

export async function GET(_req: Request, ctx: RouteContext) {
  const { id, path } = await ctx.params
  const subPath = path.join('/')

  const row = await db.query.artifacts.findFirst({
    where: eq(schema.artifacts.id, id),
  })
  if (!row) {
    return NextResponse.json({ error: 'Artifact not found' }, { status: 404 })
  }

  const content = row.content as ArtifactContent
  if (content.type !== 'web_app') {
    return NextResponse.json({ error: 'Artifact is not a web_app' }, { status: 400 })
  }

  const fileBody = content.files[subPath]
  if (fileBody === undefined) {
    return NextResponse.json({ error: `File not found: ${subPath}` }, { status: 404 })
  }

  return new NextResponse(fileBody, {
    headers: {
      'Content-Type': contentTypeFor(subPath),
      'Content-Security-Policy': [
        // Sub-resources are not supposed to be rendered as HTML; lock everything down
        // and forbid framing / form / object / base-uri / script / style so a
        // wayward client cannot be tricked into executing content fetched from
        // this URL. Combined with X-Content-Type-Options: nosniff below, MIME
        // confusion / drive-by execution are both blocked.
        'sandbox',
        "default-src 'none'",
        "script-src 'none'",
        "style-src 'none'",
        "img-src 'none'",
        "font-src 'none'",
        "connect-src 'none'",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
        "frame-ancestors 'none'",
      ].join('; '),
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-store',
    },
  })
}
