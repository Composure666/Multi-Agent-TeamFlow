import { NextResponse } from 'next/server'

import { readDeploymentAsset } from '@/server/deployment-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string; path?: string[] }>
}

export async function GET(_req: Request, ctx: RouteContext) {
  const { id, path } = await ctx.params
  const asset = readDeploymentAsset(id, path)
  if (!asset.ok) {
    return NextResponse.json({ error: asset.error }, { status: asset.status })
  }

  return new NextResponse(asset.body, {
    headers: asset.headers,
  })
}
