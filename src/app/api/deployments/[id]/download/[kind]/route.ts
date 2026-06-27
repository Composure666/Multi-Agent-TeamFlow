import { NextResponse } from 'next/server'

import {
  buildDeploymentContainerZip,
  buildDeploymentSourceZip,
} from '@/server/deployment-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string; kind: string }>
}

export async function GET(_req: Request, ctx: RouteContext) {
  const { id, kind } = await ctx.params
  const download =
    kind === 'source'
      ? await buildDeploymentSourceZip(id)
      : kind === 'container'
        ? await buildDeploymentContainerZip(id)
        : null

  if (!download) {
    const status = kind === 'source' || kind === 'container' ? 404 : 400
    return NextResponse.json(
      { error: status === 404 ? 'Deployment not found' : 'Invalid download kind' },
      { status },
    )
  }

  return new NextResponse(download.body, {
    headers: {
      'Content-Type': download.contentType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(download.fileName)}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    },
  })
}
