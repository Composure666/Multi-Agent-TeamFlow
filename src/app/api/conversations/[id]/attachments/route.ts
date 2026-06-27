import { NextRequest, NextResponse } from 'next/server'

import { listAttachments, uploadAttachment } from '@/server/attachment-service'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params
  const attachments = await listAttachments(id)
  return NextResponse.json({ attachments })
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })
  }
  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing file' }, { status: 400 })
  }

  try {
    const attachment = await uploadAttachment({ conversationId: id, file })
    return NextResponse.json({ attachment }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
