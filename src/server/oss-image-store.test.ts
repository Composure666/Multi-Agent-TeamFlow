import { describe, expect, it, vi, afterEach } from 'vitest'

vi.mock('ali-oss', () => {
  const put = vi.fn().mockResolvedValue({ res: { status: 200 } })
  return {
    default: class {
      put = put
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

const CFG = {
  bucket: 'nexora-studio',
  endpoint: 'oss-cn-beijing.aliyuncs.com',
  accessKeyId: 'LTAI-test',
  accessKeySecret: 'secret-test',
  publicRead: true,
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d])

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
    process.env.OSS_BUCKET = 'nexora-studio'
    process.env.OSS_ENDPOINT = 'oss-cn-beijing.aliyuncs.com'
    process.env.OSS_ACCESS_KEY_ID = 'LTAI-x'
    process.env.OSS_ACCESS_KEY_SECRET = 'sk-y'
    const cfg = await getOssImageConfig()
    expect(cfg).toMatchObject({
      bucket: 'nexora-studio',
      endpoint: 'oss-cn-beijing.aliyuncs.com',
      accessKeyId: 'LTAI-x',
      accessKeySecret: 'sk-y',
    })
  })

  it('returns null when key fields are missing', async () => {
    process.env.OSS_BUCKET = 'nexora-studio'
    expect(await getOssImageConfig()).toBeNull()
  })
})

describe('isOssImageUrl', () => {
  it('detects OSS urls only', () => {
    expect(isOssImageUrl('https://nexora-studio.oss-cn-beijing.aliyuncs.com/a.png')).toBe(true)
    expect(isOssImageUrl('https://other.oss-cn-hangzhou.aliyuncs.com/a.png')).toBe(true)
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
    expect(url).toMatch(/^https:\/\/nexora-studio\.oss-cn-beijing\.aliyuncs\.com\/artifacts\/\d{4}-\d{2}-\d{2}\/[\w-]+\.png$/)
    const client = new OSS(CFG) as unknown as { put: ReturnType<typeof vi.fn> }
    expect(client.put).toHaveBeenCalledTimes(1)
    const [key, buf, opts] = client.put.mock.calls[0]
    expect(key.startsWith('artifacts/')).toBe(true)
    expect(Buffer.isBuffer(buf)).toBe(true)
    expect(opts?.headers?.['x-oss-object-acl']).toBe('public-read')
  })
})

describe('ensureImageStored', () => {
  it('passes through OSS urls unchanged', async () => {
    const url = 'https://nexora-studio.oss-cn-beijing.aliyuncs.com/artifacts/x.png'
    const r = await ensureImageStored(url)
    expect(r).toEqual({ ok: true, url, storage: 'oss' })
  })

  it('falls back to local store when OSS is not configured', async () => {
    const r = await ensureImageStored('http://127.0.0.1:1/definitely-dead.png')
    expect(r.ok).toBe(false) // download fails -> localize fails -> keep original (caller warns)
  })

  it('uploads to OSS when configured and returns oss url', async () => {
    process.env.OSS_BUCKET = CFG.bucket
    process.env.OSS_ENDPOINT = CFG.endpoint
    process.env.OSS_ACCESS_KEY_ID = CFG.accessKeyId
    process.env.OSS_ACCESS_KEY_SECRET = CFG.accessKeySecret

    const uri = 'data:image/png;base64,' + PNG.toString('base64')
    const r = await ensureImageStored(uri)
    expect(r.ok).toBe(true)
    expect((r as { url: string }).url).toMatch(/^https:\/\/nexora-studio\.oss-cn-beijing\.aliyuncs\.com\//)
    expect((r as { storage: string }).storage).toBe('oss')
  })
})
