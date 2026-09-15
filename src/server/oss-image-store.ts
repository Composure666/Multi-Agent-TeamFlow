import OSS from 'ali-oss'
import { randomBytes } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import { db } from '@/db/client'
import {
  IMAGE_DIR,
  LOCAL_IMAGE_PREFIX,
  OSS_IMAGE_URL_RE,
  decodeDataUri,
  imageContentTypeForBuffer,
  isLocalImageUrl,
  isOssImageUrl,
  isOssUrlWithBadExtension,
  localizeImageUrl,
  resolveWorkspaceImagePath,
  sniffImageExt,
} from '@/server/artifact-image-store'

// 正则与判定连同 store 一起对外暴露（历史调用方从这里 import）
export { OSS_IMAGE_URL_RE, isOssImageUrl }

/**
 * 阿里云 OSS —— 图片产物的稳定远程存储。
 *
 * 原则（用户要求）：能不存本地就不存本地；远程必须稳定。
 * OSS 对象一旦存在，URL 即永久可用（bucket 不删）→ 满足稳定远程。
 *
 * 策略：
 * - 已配置 OSS → 图片产物统一上传 OSS（无论来源是远程 URL / data URI / 本地文件），
 *   content.url 存 OSS 公开 URL，本地副本上传成功后删除；
 * - 未配置 OSS / 上传失败 → 回退本地 artifact-images（保持可用性兜底）。
 */

export interface OssImageConfig {
  bucket: string
  endpoint: string
  accessKeyId: string
  accessKeySecret: string
  publicRead: boolean
}

/** 从 app_settings（UI/DB 自填）读取，环境变量（.env.local）优先。四项齐备才算已配置。 */
export async function getOssImageConfig(): Promise<OssImageConfig | null> {
  const row = await db.query.appSettings.findFirst()
  const bucket = process.env.OSS_BUCKET ?? row?.ossBucket ?? undefined
  const endpoint = process.env.OSS_ENDPOINT ?? row?.ossEndpoint ?? undefined
  const accessKeyId = process.env.OSS_ACCESS_KEY_ID ?? row?.ossAccessKeyId ?? undefined
  const accessKeySecret = process.env.OSS_ACCESS_KEY_SECRET ?? row?.ossAccessKeySecret ?? undefined
  if (!bucket || !endpoint || !accessKeyId || !accessKeySecret) return null
  return { bucket, endpoint, accessKeyId, accessKeySecret, publicRead: row?.ossPublicRead ?? true }
}

export type UploadImageResult = { ok: true; url: string } | { ok: false; error: string }

/**
 * OSS 写入统一带的响应头。
 *
 * **必须显式声明 Content-Type**：只靠 key 后缀时，OSS 对 `.bin` 之类的后缀会给出
 * `application/octet-stream` + `Content-Disposition: attachment`，浏览器 <img> 拒渲染。
 * 按字节嗅探比按后缀可靠 —— 历史上 SVG 就被存成了 `.bin`。
 */
function ossObjectHeaders(buf: Buffer, publicRead: boolean): Record<string, string> {
  return {
    'Content-Type': imageContentTypeForBuffer(buf),
    'Content-Disposition': 'inline',
    ...(publicRead ? { 'x-oss-object-acl': 'public-read' } : {}),
  }
}

function ossClient(cfg: OssImageConfig): OSS {
  return new OSS({
    bucket: cfg.bucket,
    endpoint: cfg.endpoint,
    accessKeyId: cfg.accessKeyId,
    accessKeySecret: cfg.accessKeySecret,
    secure: true,
  })
}

export async function uploadImageToOss(buf: Buffer, cfg: OssImageConfig): Promise<UploadImageResult> {
  const key = `artifacts/${new Date().toISOString().slice(0, 10)}/${Date.now()}-${randomBytes(6).toString('hex')}.${sniffImageExt(buf)}`
  try {
    await ossClient(cfg).put(key, buf, { headers: ossObjectHeaders(buf, cfg.publicRead) })
    return { ok: true, url: `https://${cfg.bucket}.${cfg.endpoint}/${key}` }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * 把图片 URL 解析为 Buffer（本地已存 / data URI / 远程下载 / 工作区文件），失败返回 null。
 *
 * 工作区分支是必须的：agent 常用脚本把图写到工作区，然后把这个相对路径当 url 传进
 * write_artifact（例如 scene_assets/xx.png，或模仿本地化前缀的 /api/artifact-images/xx.jpg）。
 * 不认这类路径 → 改不了可访问 URL → 产物库全是裂图。
 */
async function resolveImageBuffer(url: string, workspaceDir?: string): Promise<Buffer | null> {
  if (url.startsWith('data:')) {
    const buf = decodeDataUri(url)
    if (buf) return buf
  }

  if (isLocalImageUrl(url)) {
    const name = url.slice(LOCAL_IMAGE_PREFIX.length)
    if (/^[a-zA-Z0-9._-]+$/.test(name)) {
      try {
        const buf = await fs.readFile(path.join(IMAGE_DIR, name))
        if (buf.length > 0) return buf
      } catch {
        // 本地目录里没有 —— 可能只是借用了这个前缀、文件其实在工作区，继续往下试
      }
    }
  } else if (/^https?:\/\//i.test(url)) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000), redirect: 'follow' })
      if (!res.ok) return null
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length === 0 || buf.length > 25 * 1024 * 1024) return null
      return buf
    } catch {
      return null
    }
  }

  if (workspaceDir) {
    const abs = resolveWorkspaceImagePath(workspaceDir, url)
    if (abs) {
      try {
        const buf = await fs.readFile(abs)
        if (buf.length > 0 && buf.length <= 25 * 1024 * 1024) return buf
      } catch {
        return null
      }
    }
  }

  return null
}

export type EnsureImageStoredResult =
  | { ok: true; url: string; storage: 'oss' | 'local' }
  | { ok: false; error: string }

/**
 * 图片产物的统一存储入口（写库前调用）：
 * - 已是 OSS URL → 原样（幂等）
 * - 已配置 OSS → 解析图片 → 上传 OSS；本地来源上传成功后删除本地副本
 * - 未配置 OSS → 回退本地化
 *
 * workspaceDir 用于兜住「agent 把工作区文件路径当 url」的情况，不传则退化为旧行为。
 */
export async function ensureImageStored(
  url: string,
  workspaceDir?: string,
): Promise<EnsureImageStoredResult> {
  const cfg = await getOssImageConfig()

  if (isOssImageUrl(url)) {
    // 后缀正常的 OSS 地址直接幂等返回
    if (!isOssUrlWithBadExtension(url)) return { ok: true, url, storage: 'oss' }
    // 后缀异常（历史 .bin）→ 必须换地址，不能原地补元数据：
    // 原地覆盖字节不变 → ETag 不变 → 已缓存旧响应的浏览器带 If-None-Match 重校验拿到 304，
    // 会继续沿用缓存的 octet-stream MIME，SVG 永远裂着（2026-09-15 线上实测）。
    // 落到下面的「下载 + 重新上传」拿后缀正确的新 URL；旧地址的所有引用由
    // artifact-image-repair 的 propagateReplacedUrl 全局替换（产物 / 消息 / 经验）。
    if (!cfg) return { ok: true, url, storage: 'oss' }
  } else if (!cfg) {
    // 未配置 OSS → 本地化兜底
    const loc = await localizeImageUrl(url, undefined, workspaceDir)
    if (loc.ok) return { ok: true, url: loc.url, storage: 'local' }
    return { ok: false, error: loc.error }
  }

  if (!cfg) return { ok: false, error: 'oss is not configured' }

  const buf = await resolveImageBuffer(url, workspaceDir)
  if (!buf) return { ok: false, error: 'image unreachable and not stored locally' }
  const up = await uploadImageToOss(buf, cfg)
  if (up.ok) {
    // 本地来源转传 OSS 成功后删除本地副本（能不存本地就不存本地）
    if (isLocalImageUrl(url)) {
      const name = url.slice(LOCAL_IMAGE_PREFIX.length)
      await fs.rm(path.join(IMAGE_DIR, name), { force: true }).catch(() => {})
    }
    return { ok: true, url: up.url, storage: 'oss' }
  }
  return { ok: false, error: `oss upload failed: ${up.error}` }
}
