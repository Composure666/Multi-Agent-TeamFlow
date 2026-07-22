import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { listNotifications } from '@/server/notification-service'

const Category = z.enum(['task', 'error', 'system', 'configuration'])
const Status = z.enum(['all', 'unread', 'read'])

const Query = z.object({
  status: Status.optional(),
  category: Category.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.coerce.number().int().positive().optional(),
})

export async function GET(req: NextRequest) {
  const parsed = Query.safeParse(Object.fromEntries(req.nextUrl.searchParams))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid query', issues: parsed.error.issues }, { status: 400 })
  }

  const result = await listNotifications(parsed.data)
  return NextResponse.json(result)
}
