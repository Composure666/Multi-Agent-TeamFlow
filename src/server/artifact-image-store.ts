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
 * 把 agent 给的「路径」解析成工作区内的真实文件绝对路径。
 *
 * agent 经常把工作区里的文件当成图片 url 写进 write_artifact，两种常见形态：
 *   scene_assets/00_sheet.png          裸相对路径
 *   /api/artifact-images/xx.jpg        模仿本地化前缀，但文件其实躺在工作区
 * 两者都不是可访问 URL。以前 localizeImageUrl 直接判 unsupported 并保留原值落库，
 * 前端 <img src> 于是 404 —— 产物库里全是裂图。
 *
 * 解析规则：剥掉本地化前缀与前导斜杠后，按相对路径解析到工作区内；
 * 越出工作区（含路径穿越）一律返回 null。
 */
export function resolveWorkspaceImagePath(workspaceDir: string, rawUrl: string): string | null {
  let rel = rawUrl.trim()
  if (!rel) return null

  if (rel.startsWith(LOCAL_IMAGE_PREFIX)) rel = rel.slice(LOCAL_IMAGE_PREFIX.length)
  rel = rel.replace(/^[/\\]+/, '')
  if (!rel) return null

  // 带协议前缀的一律不认（http 走下载分支、data 走解码分支，其余如 file:/ 直接拒）。
  // Windows 盘符（C:\ / C:/）单独放行。
  if (/^[a-z][a-z0-9+.-]*:/i.test(rel) && !/^[a-z]:[/\\]/i.test(rel)) return null

  const abs = path.isAbsolute(rel) ? path.resolve(rel) : path.resolve(workspaceDir, rel)
  const root = path.resolve(workspaceDir)
  const norm = (p: string) => (process.platform === 'win32' ? p.toLowerCase() : p)
  const absKey = norm(abs)
  const rootKey = norm(root)
  if (absKey !== rootKey && !absKey.startsWith(rootKey + path.sep)) return null
  return abs
}

/** 前端 <img> 能直接用的 url 形态；其余（工作区相对路径、/deployments/… 等）都算坏链。 */
export function isServableImageUrl(url: string | undefined | null): boolean {
  if (!url) return false
  if (url.startsWith('data:')) return true
  if (/^https?:\/\//i.test(url)) return true
  return isLocalImageUrl(url)
}

/**
 * 解析「数据目录相对路径」形态的图片 url，如 `/deployments/dep_xxx/infographic.png`。
 *
 * 部署产物 / 经验附件等文件躺在 `.agenthub-data/` 下，agent 直接把磁盘路径写进
 * content.url，而前端并没有 `/deployments/*` 路由 —— 必然 404。这里按 DATA_DIR 解析，
 * 越出数据目录一律返回 null（防穿越读任意磁盘文件）。
 */
export function resolveDataRelativeImagePath(rawUrl: string): string | null {
  const rel = rawUrl.trim().replace(/^[/\\]+/, '')
  if (!rel) return null
  if (/^[a-z][a-z0-9+.-]*:/i.test(rel) && !/^[a-z]:[/\\]/i.test(rel)) return null

  const abs = path.isAbsolute(rel) ? path.resolve(rel) : path.resolve(DATA_DIR, rel)
  const root = path.resolve(DATA_DIR)
  const norm = (p: string) => (process.platform === 'win32' ? p.toLowerCase() : p)
  const absKey = norm(abs)
  const rootKey = norm(root)
  if (absKey !== rootKey && !absKey.startsWith(rootKey + path.sep)) return null
  return abs
}

/** 本地化目录里是否真的有这个文件（用于幂等判断 —— 只有文件在才算已本地化）。 */
async function hasLocalImageFile(url: string, imageDir: string): Promise<boolean> {
  const name = url.slice(LOCAL_IMAGE_PREFIX.length)
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) return false
  try {
    const st = await fs.stat(path.join(imageDir, name))
    return st.isFile()
  } catch {
    return false
  }
}

/**
 * 把图片 URL 本地化。
 * - 已是 /api/artifact-images/ 开头**且文件存在** → 原样返回（幂等）
 * - data URI → 解码落盘
 * - http(s) → 下载落盘（20s 超时、≤25MB）
 * - 工作区相对路径 / 伪 API 路径 → 从工作区读文件落盘（需传 workspaceDir）
 * 失败返回 { ok:false, error }，调用方保留原 URL 并记录警告，不阻塞写入。
 */
export async function localizeImageUrl(
  url: string,
  imageDir: string = IMAGE_DIR,
  workspaceDir?: string,
): Promise<LocalizeImageResult> {
  if (isLocalImageUrl(url) && (await hasLocalImageFile(url, imageDir))) {
    return { ok: true, url }
  }

  if (url.startsWith('data:')) {
    const buf = decodeDataUri(url)
    if (!buf) return { ok: false, error: 'invalid data URI' }
    return saveBuffer(buf, imageDir)
  }

  if (/^https?:\/\//i.test(url)) {
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

  // 下面两个分支都只是「同名文件可能躺在哪个根目录」的猜测，解析出路径不等于文件存在；
  // 读不到必须继续往下试，否则 /deployments/… 这类会被工作区分支提前判死。
  const errors: string[] = []

  // 工作区相对路径：agent 把脚本生成的文件路径当 url 传的常见形态
  if (workspaceDir) {
    const abs = resolveWorkspaceImagePath(workspaceDir, url)
    if (abs) {
      try {
        const buf = await fs.readFile(abs)
        return saveBuffer(buf, imageDir)
      } catch (err) {
        errors.push(`workspace(${abs}): ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }

  // .agenthub-data 相对路径：/deployments/xxx/infographic.png 之类
  const dataAbs = resolveDataRelativeImagePath(url)
  if (dataAbs) {
    try {
      const buf = await fs.readFile(dataAbs)
      return saveBuffer(buf, imageDir)
    } catch (err) {
      errors.push(`data-dir(${dataAbs}): ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return {
    ok: false,
    error: errors.length > 0 ? errors.join(' | ') : `unsupported image url scheme: ${url.slice(0, 48)}`,
  }
}
