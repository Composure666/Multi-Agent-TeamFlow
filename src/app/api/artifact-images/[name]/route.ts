import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

interface RouteContext {
  params: Promise<{ name: string }>
}

/** 产物库本地图片目录（相对项目根） */
const IMAGE_DIR = path.join(process.cwd(), '.agenthub-data', 'artifact-images')

const MIME_BY_EXT: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
}

/** 只允许普通文件名，杜绝路径穿越 */
const SAFE_NAME_RE = /^[a-zA-Z0-9._-]+$/

export async function GET(_req: Request, ctx: RouteContext) {
  const { name } = await ctx.params

  if (!SAFE_NAME_RE.test(name)) {
    return NextResponse.json({ error: 'Invalid image name' }, { status: 400 })
  }

  const filePath = path.join(IMAGE_DIR, name)
  try {
    const buf = await fs.readFile(filePath)
    const ext = path.extname(name).slice(1).toLowerCase()
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': MIME_BY_EXT[ext] ?? 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Image not found' }, { status: 404 })
  }
}
