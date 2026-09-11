import { NextRequest, NextResponse } from 'next/server'

import { testProviderConnection } from '@/server/provider-service'

/** POST /api/providers/[id]/test —— 测试供应商连接 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await testProviderConnection(id)
  return NextResponse.json(result)
}
