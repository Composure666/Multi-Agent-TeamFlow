import { describe, expect, it, vi, afterEach } from 'vitest'

// app_settings 里的真实 OSS 配置会让「未配置应返回 null」永远失败 —— 显式 mock 掉，
// 让这个文件只验证自己的判定逻辑（否则哪台机器填过 UI 配置，哪台就红）
vi.mock('@/db/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/db/client')>()
  return {
    ...actual,
    db: { ...actual.db, query: { appSettings: { findFirst: async () => null } } },
  }
})

vi.mock('ali-oss', () => {
  const put = vi.fn().mockResolvedValue({ res: { status: 200 } })
  const get = vi.fn().mockResolvedValue({ content: Buffer.alloc(0) })
  return {
    default: class {
      put = put
      get = get
    },
  }
})

import OSS from 'ali-oss'
import {
  ensureImageStored,
  getOssImageConfig,
  isOssImageUrl,
  uploadImageToOss,
} from './oss-image-store'

// 假样例：bucket / endpoint / 凭据都必须是明显的占位值，不要填任何真实资源名。
const CFG = {
  bucket: 'test-bucket',
  endpoint: 'oss-cn-hangzhou.aliyuncs.com',
  accessKeyId: 'LTAI-test',
  accessKeySecret: 'secret-test',
  publicRead: true,
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d])
const BAD_EXT_URL = 'https://test-bucket.oss-cn-hangzhou.aliyuncs.com/artifacts/2026-09-15/1789483314465-fed57599d394.bin'

function useEnvCfg(): void {
  process.env.OSS_BUCKET = CFG.bucket
  process.env.OSS_ENDPOINT = CFG.endpoint
  process.env.OSS_ACCESS_KEY_ID = CFG.accessKeyId
  process.env.OSS_ACCESS_KEY_SECRET = CFG.accessKeySecret
}

function clientMock(): { put: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> } {
  return new OSS(CFG) as unknown as { put: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> }
}

afterEach(() => {
  vi.clearAllMocks()
  delete process.env.OSS_BUCKET
  delete process.env.OSS_ENDPOINT
  delete process.env.OSS_ACCESS_KEY_ID
  delete process.env.OSS_ACCESS_KEY_SECRET
})

describe('getOssImageConfig', () => {
  it('returns null when nothing is configured', async () => {
    expect(await getOssImageConfig()).toBeNull()
  })

  it('reads from environment variables (four fields required)', async () => {
    process.env.OSS_BUCKET = 'test-bucket'
    process.env.OSS_ENDPOINT = 'oss-cn-hangzhou.aliyuncs.com'
    process.env.OSS_ACCESS_KEY_ID = 'LTAI-x'
    process.env.OSS_ACCESS_KEY_SECRET = 'sk-y'
    const cfg = await getOssImageConfig()
    expect(cfg).toMatchObject({
      bucket: 'test-bucket',
      endpoint: 'oss-cn-hangzhou.aliyuncs.com',
      accessKeyId: 'LTAI-x',
      accessKeySecret: 'sk-y',
    })
  })

  it('returns null when key fields are missing', async () => {
    process.env.OSS_BUCKET = 'test-bucket'
    expect(await getOssImageConfig()).toBeNull()
  })
})

describe('isOssImageUrl', () => {
  it('detects OSS urls only', () => {
    expect(isOssImageUrl('https://test-bucket.oss-cn-hangzhou.aliyuncs.com/a.png')).toBe(true)
    expect(isOssImageUrl('https://another-bucket.oss-cn-shanghai.aliyuncs.com/a.png')).toBe(true)
    expect(isOssImageUrl('https://example.com/a.png')).toBe(false)
    expect(isOssImageUrl('/api/artifact-images/a.png')).toBe(false)
  })
})

describe('uploadImageToOss', () => {
  it('uploads buffer with public-read ACL and returns stable url', async () => {
    const r = await uploadImageToOss(PNG, CFG)
    console.log('upload result:', JSON.stringify(r))
    expect(r.ok).toBe(true)
    const url = (r as { url: string }).url
    expect(url).toMatch(/^https:\/\/test-bucket\.oss-cn-hangzhou\.aliyuncs\.com\/artifacts\/\d{4}-\d{2}-\d{2}\/[\w-]+\.png$/)
    const client = clientMock()
    expect(client.put).toHaveBeenCalledTimes(1)
    const [key, buf, opts] = client.put.mock.calls[0]
    expect(key.startsWith('artifacts/')).toBe(true)
    expect(Buffer.isBuffer(buf)).toBe(true)
    expect(opts?.headers?.['x-oss-object-acl']).toBe('public-read')
  })

  it('always declares Content-Type explicitly (SVG must not land as octet-stream)', async () => {
    const svg = Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>", 'utf8')
    const r = await uploadImageToOss(svg, CFG)
    expect(r.ok).toBe(true)
    expect((r as { url: string }).url.endsWith('.svg')).toBe(true)
    const client = clientMock()
    const [, , opts] = client.put.mock.calls[0]
    expect(opts?.headers?.['Content-Type']).toBe('image/svg+xml')
    expect(opts?.headers?.['Content-Disposition']).toBe('inline')
  })
})

describe('ensureImageStored', () => {
  it('passes through OSS urls unchanged', async () => {
    const url = 'https://test-bucket.oss-cn-hangzhou.aliyuncs.com/artifacts/x.png'
    const r = await ensureImageStored(url)
    expect(r).toEqual({ ok: true, url, storage: 'oss' })
  })

  it('falls back to local store when OSS is not configured', async () => {
    const r = await ensureImageStored('http://127.0.0.1:1/definitely-dead.png')
    expect(r.ok).toBe(false) // download fails -> localize fails -> keep original (caller warns)
  })

  it('uploads to OSS when configured and returns oss url', async () => {
    useEnvCfg()

    const uri = 'data:image/png;base64,' + PNG.toString('base64')
    const r = await ensureImageStored(uri)
    expect(r.ok).toBe(true)
    expect((r as { url: string }).url).toMatch(/^https:\/\/test-bucket\.oss-cn-hangzhou\.aliyuncs\.com\//)
    expect((r as { storage: string }).storage).toBe('oss')
  })

  it('re-uploads an OSS url with a bad suffix to a fresh key (cache-bust)', async () => {
    useEnvCfg()
    // 原地修字节不变 → ETag 不变 → 浏览器 304 沿用旧 octet-stream 缓存，SVG 永远裂着。
    // 必须换新地址，让所有浏览器强制重新拉取。
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>', 'utf8')
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => svg.buffer.slice(svg.byteOffset, svg.byteOffset + svg.byteLength),
    })))
    try {
      const client = clientMock()
      const r = await ensureImageStored(BAD_EXT_URL)
      expect(r.ok).toBe(true)
      if (r.ok) {
        expect(r.url).not.toBe(BAD_EXT_URL)
        expect(r.url.endsWith('.svg')).toBe(true)
        expect(r.storage).toBe('oss')
      }
      expect(client.put).toHaveBeenCalledTimes(1)
      const [, , opts] = client.put.mock.calls[0]
      expect(opts?.headers?.['Content-Type']).toBe('image/svg+xml')
      expect(opts?.headers?.['Content-Disposition']).toBe('inline')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
