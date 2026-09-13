import { randomBytes } from 'crypto'

import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { db, schema } from '@/db/client'
import { buildWebAppHtml, prepareArtifactPreviewHtml } from '@/lib/artifact-preview'
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

  // Strict CSP uses a per-request nonce so only our guard script (and any
  // LLM-authored inline <script> that happens to share the same nonce) may
  // run inside the sandboxed iframe. Dropping 'unsafe-inline' blocks the
  // "<a href=javascript:..>" path that bypasses the URL regex guard.
  const nonce = randomBytes(16).toString('base64')
  const html = prepareArtifactPreviewHtml(buildWebAppHtml(content), id, { nonce })

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': [
        'sandbox allow-scripts',
        "default-src 'none'",
        `script-src 'nonce-${nonce}' 'self'`,
        // 注意：不能把 nonce 放进 style-src——CSP3 规定指令中同时存在
        // nonce/hash 源时 'unsafe-inline' 会被忽略，产物内联 <style> 与
        // style 属性将全部被禁，导致 LLM 产出的 HTML 布局（如 PPT）完全错乱。
        // 样式无脚本执行能力，'self' + 'unsafe-inline' 已足够；脚本仍由
        // script-src 的 nonce 严格管控。
        "style-src 'self' 'unsafe-inline'",
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
