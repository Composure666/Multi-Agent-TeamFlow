import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { db, schema } from '@/db/client'
import type { ArtifactContent } from '@/shared/types'

interface RouteContext {
  params: Promise<{ id: string; path: string[] }>
}

const MIME_BY_EXT: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'application/javascript; charset=utf-8',
  mjs: 'application/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  ico: 'image/x-icon',
}

function contentTypeFor(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  return MIME_BY_EXT[ext] ?? 'text/plain; charset=utf-8'
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
        'sandbox allow-scripts',
        "default-src 'none'",
        "script-src 'unsafe-inline'",
        "style-src 'unsafe-inline'",
        'img-src data: blob: http: https:',
        'font-src data:',
        "connect-src 'none'",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
        "frame-ancestors 'self'",
      ].join('; '),
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-store',
    },
  })
}
