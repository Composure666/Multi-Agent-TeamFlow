import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { searchMessages } from '@/server/search-service'

const QuerySchema = z.object({
  q: z.string().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  conversationId: z.string().optional(),
  role: z.enum(['user', 'agent']).optional(),
  fallback: z.enum(['like']).optional(),
})

function envelopeOk<T>(data: T) {
  return NextResponse.json({ ok: true, data })
}

function envelopeErr(code: string, message: string, status: number) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status })
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams))
  if (!parsed.success) {
    return envelopeErr('INVALID_QUERY', parsed.error.message, 400)
  }

  const { q, limit, offset, conversationId, role, fallback } = parsed.data
  const result = await searchMessages({ query: q, limit, offset, conversationId, role, fallback })

  if (result.error === 'INVALID_QUERY') {
    return envelopeErr('INVALID_QUERY', 'Invalid search syntax', 400)
  }

  return envelopeOk({ hits: result.hits, total: result.total, tookMs: result.tookMs })
}