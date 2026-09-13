import { NextRequest, NextResponse } from 'next/server'

import {
  listExperienceFiles,
  uploadExperienceFile,
} from '@/server/experience-service'

interface RouteContext {
  params: Promise<{ id: string }>
}

const MAX_FILES_PER_REQUEST = 10

/** 经验参考附件：列表 */
export async function GET(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params
  try {
    const items = await listExperienceFiles(id)
    return NextResponse.json({ items })
  } catch (err) {
    console.error('[api/experiences/[id]/attachments] GET failed', err)
    return NextResponse.json({ error: 'failed_to_list_files' }, { status: 500 })
  }
}

/** 经验参考附件：上传（multipart/form-data，字段名 file，可多文件） */
export async function POST(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'invalid_form' }, { status: 400 })
  }

  const files = form
    .getAll('file')
    .filter((v): v is File => v instanceof File && v.size > 0)
  if (files.length === 0) {
    return NextResponse.json({ error: 'no_file' }, { status: 400 })
  }
  if (files.length > MAX_FILES_PER_REQUEST) {
    return NextResponse.json({ error: 'too_many_files' }, { status: 400 })
  }

  try {
    const uploaded: Awaited<ReturnType<typeof uploadExperienceFile>>[] = []
    for (const file of files) {
      uploaded.push(await uploadExperienceFile(id, file))
    }
    return NextResponse.json({ items: uploaded }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
