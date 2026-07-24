import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { searchGithubToolCatalog } from '@/server/github-tool-catalog-service'

export const runtime = 'nodejs'

const Query = z.object({
  q: z.string().optional(),
  keyword: z.string().optional(),
  type: z.enum(['all', 'skill', 'mcp_server']).default('all'),
  source: z.enum(['github']).default('github'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
})

export async function GET(req: NextRequest) {
  const parsed = Query.safeParse(Object.fromEntries(req.nextUrl.searchParams.entries()))
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid query', code: 'invalid_query', issues: parsed.error.issues },
      { status: 400 },
    )
  }

  const keyword = (parsed.data.keyword ?? parsed.data.q ?? '').trim()
  const result = await searchGithubToolCatalog(
    {
      keyword,
      type: parsed.data.type,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
    },
    req.signal,
  )

  if (result.status !== 'ok') {
    const status = result.status === 'rate_limited' ? 429 : result.status === 'unauthorized' ? 401 : 502
    const code = result.status === 'rate_limited'
      ? 'github_rate_limited'
      : result.status === 'unauthorized'
        ? 'github_unauthorized'
        : 'github_fetch_failed'
    return NextResponse.json(
      { error: result.message ?? 'GitHub tool search failed', code },
      { status },
    )
  }

  return NextResponse.json({
    results: result.results,
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
    total: result.total,
    nextPage: result.nextPage,
    sourceStatus: { github: result.status },
  })
}
