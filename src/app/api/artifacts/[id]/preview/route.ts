import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { db, schema } from '@/db/client'
import { buildWebAppHtml } from '@/lib/artifact-preview'
import type { ArtifactContent } from '@/shared/types'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params

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

  return new NextResponse(buildWebAppHtml(content), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
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
