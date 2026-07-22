import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { markNotificationsRead } from '@/server/notification-service'

const Category = z.enum(['task', 'error', 'system', 'configuration'])

const Body = z.object({
  ids: z.array(z.string().trim().min(1)).optional(),
  all: z.boolean().optional(),
  category: Category.optional(),
})

export async function POST(req: NextRequest) {
  const raw = await req.json().catch(() => null)
  const parsed = Body.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 })
  }

  const result = await markNotificationsRead(parsed.data)
  return NextResponse.json(result)
}
