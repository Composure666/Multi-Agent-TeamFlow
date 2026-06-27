import { NextResponse } from 'next/server'

import { listArtifacts } from '@/server/artifact-service'

export async function GET() {
  const artifacts = await listArtifacts()
  return NextResponse.json({ artifacts })
}
