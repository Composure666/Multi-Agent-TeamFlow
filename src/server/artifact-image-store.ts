import { randomBytes } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import { DATA_DIR } from '@/db/client'

/**
 * 图片产物本地化存储。
 *
 * 图片产物（type === 'image'）的 content.url 若直接保存 agent 给的外部 URL，
 * 链接过期后预览即失效（如 aiba-media.org 404）。这里在入库前把外部 URL /
 * data URI 下载（解码）到本地 `.agenthub-data/artifact-images/`，content.url
 * 改写为 `/api/artifact-images/<name>` —— 由本地 API 提供，长期稳定。
 */

export const LOCAL_IMAGE_PREFIX = '/api/artifact-images/'

export const IMAGE_DIR = path.join(DATA_DIR, 'artifact-images')

const MAX_BYTES = 25 * 1024 * 1024
const DOWNLOAD_TIMEOUT_MS = 20_000

export type LocalizeImageResult = { ok: true; url: string } | { ok: false; error: string }

export function isLocalImageUrl(url: string): boolean {
  return url.startsWith(LOCAL_IMAGE_PREFIX)
}

/** 从文件头嗅探图片扩展名，避免依赖 URL 后缀（可能缺失或伪装）。 */
export function sniffImageExt(buf: Buffer): string {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg'
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return 'png'
  if (
    buf.length >= 12 &&
    buf.toString('latin1', 0, 4) === 'RIFF' &&
    buf.toString('latin1', 8, 12) === 'WEBP'
  ) return 'webp'
  if (buf.length >= 6 && buf.toString('latin1', 0, 6) === 'GIF87a' || (buf.length >= 6 && buf.toString('latin1', 0, 6) === 'GIF89a')) return 'gif'
  if (
    buf.length >= 12 &&
    buf.toString('latin1', 4, 8) === 'ftyp' &&
    (buf.toString('latin1', 8, 12) === 'avif' || buf.toString('latin1', 8, 12) === 'avis')
  ) return 'avif'
  return 'bin'
}

export function decodeDataUri(uri: string): Buffer | null {
  const comma = uri.indexOf(',')
  if (comma < 0) return null
  const meta = uri.slice(5, comma)
  const payload = uri.slice(comma + 1)
  try {
    if (/;base64(?:;|$)/i.test(meta)) {
      const clean = payload.replace(/[\s\r\n]/g, '')
      // Node 的 base64 解码对非法字符过于宽容，先严格校验字符集与 padding
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) return null
      return Buffer.from(clean, 'base64')
    }
    return Buffer.from(decodeURIComponent(payload), 'utf8')
  } catch {
    return null
  }
}

async function saveBuffer(buf: Buffer, imageDir: string): Promise<LocalizeImageResult> {
  if (buf.length === 0) return { ok: false, error: 'empty image body' }
  if (buf.length > MAX_BYTES) return { ok: false, error: `image too large: ${buf.length} bytes` }
  await fs.mkdir(imageDir, { recursive: true })
  const name = `img_${randomBytes(8).toString('hex')}.${sniffImageExt(buf)}`
  await fs.writeFile(path.join(imageDir, name), buf)
  return { ok: true, url: LOCAL_IMAGE_PREFIX + name }
}

/**
 * 把图片 URL 本地化。
 * - 已是 /api/artifact-images/ 开头 → 原样返回（幂等）
 * - data URI → 解码落盘
 * - http(s) → 下载落盘（20s 超时、≤25MB）
 * 失败返回 { ok:false, error }，调用方保留原 URL 并记录警告，不阻塞写入。
 */
export async function localizeImageUrl(
  url: string,
  imageDir: string = IMAGE_DIR,
): Promise<LocalizeImageResult> {
  if (isLocalImageUrl(url)) return { ok: true, url }

  if (url.startsWith('data:')) {
    const buf = decodeDataUri(url)
    if (!buf) return { ok: false, error: 'invalid data URI' }
    return saveBuffer(buf, imageDir)
  }

  if (!/^https?:\/\//i.test(url)) {
    return { ok: false, error: `unsupported image url scheme: ${url.slice(0, 48)}` }
  }

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      redirect: 'follow',
    })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status} for ${url.slice(0, 96)}` }
    const buf = Buffer.from(await res.arrayBuffer())
    return saveBuffer(buf, imageDir)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
