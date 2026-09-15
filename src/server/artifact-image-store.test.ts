import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import {
  isLocalImageUrl,
  isServableImageUrl,
  localizeImageUrl,
  resolveDataRelativeImagePath,
  sniffImageExt,
} from './artifact-image-store'

const tempDir = mkdtempSync(path.join(os.tmpdir(), 'artifact-img-'))
const workspaceDir = mkdtempSync(path.join(os.tmpdir(), 'artifact-ws-'))
mkdirSync(path.join(workspaceDir, 'scene_assets'), { recursive: true })
writeFileSync(path.join(workspaceDir, 'scene_assets', 'sheet.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
writeFileSync(path.join(tempDir, 'a.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true })
  rmSync(workspaceDir, { recursive: true, force: true })
})

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00])
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d])
const WEBP = Buffer.from('RIFF\x24\x00\x00\x00WEBPVP8 ', 'latin1')
const GIF = Buffer.from('GIF89a\x01\x00\x01\x00', 'latin1')
const AVIF = Buffer.from('\x00\x00\x00\x1cftypavif\x00\x00\x00\x00', 'latin1')

describe('sniffImageExt', () => {
  it('detects common formats from magic bytes', () => {
    expect(sniffImageExt(JPEG)).toBe('jpg')
    expect(sniffImageExt(PNG)).toBe('png')
    expect(sniffImageExt(WEBP)).toBe('webp')
    expect(sniffImageExt(GIF)).toBe('gif')
    expect(sniffImageExt(AVIF)).toBe('avif')
  })

  it('falls back to bin for unknown bytes', () => {
    expect(sniffImageExt(Buffer.from([1, 2, 3, 4, 5]))).toBe('bin')
  })
})

describe('isLocalImageUrl', () => {
  it('matches the local prefix only', () => {
    expect(isLocalImageUrl('/api/artifact-images/a.png')).toBe(true)
    expect(isLocalImageUrl('https://example.com/a.png')).toBe(false)
    expect(isLocalImageUrl('/api/other/a.png')).toBe(false)
  })
})

describe('isServableImageUrl', () => {
  it('accepts only urls the browser can render directly', () => {
    expect(isServableImageUrl('/api/artifact-images/a.png')).toBe(true)
    expect(isServableImageUrl('https://example.com/a.png')).toBe(true)
    expect(isServableImageUrl('data:image/png;base64,AAAA')).toBe(true)
    expect(isServableImageUrl('scene_assets/sheet.png')).toBe(false)
    expect(isServableImageUrl('/deployments/dep_1/infographic.png')).toBe(false)
    expect(isServableImageUrl(undefined)).toBe(false)
  })
})

describe('resolveDataRelativeImagePath', () => {
  it('resolves a root-absolute path against the data dir', () => {
    const p = resolveDataRelativeImagePath('/deployments/dep_1/infographic.png')
    expect(p).toBeTruthy()
    expect(p?.endsWith(path.join('deployments', 'dep_1', 'infographic.png'))).toBe(true)
  })

  it('rejects traversal, remote schemes and empty input', () => {
    expect(resolveDataRelativeImagePath('/../../Windows/win.ini')).toBeNull()
    expect(resolveDataRelativeImagePath('http://example.com/a.png')).toBeNull()
    expect(resolveDataRelativeImagePath('file:///etc/passwd')).toBeNull()
    expect(resolveDataRelativeImagePath('   ')).toBeNull()
  })
})

describe('localizeImageUrl', () => {
  it('passes through local urls that really exist on disk (idempotent)', async () => {
    const r = await localizeImageUrl('/api/artifact-images/a.png', tempDir)
    expect(r).toEqual({ ok: true, url: '/api/artifact-images/a.png' })
  })

  it('stores a workspace-relative path (agent 把文件路径当 url 传)', async () => {
    const r = await localizeImageUrl('scene_assets/sheet.png', tempDir, workspaceDir)
    expect(r.ok).toBe(true)
    const name = (r as { url: string }).url.replace('/api/artifact-images/', '')
    expect(readFileSync(path.join(tempDir, name))[0]).toBe(0x89)
  })

  it('recovers a fake local url whose file is missing from the workspace', async () => {
    // 早期 agent 会伪造 /api/artifact-images/xx.png，但文件其实躺在工作区里
    const r = await localizeImageUrl('/api/artifact-images/scene_assets/sheet.png', tempDir, workspaceDir)
    expect(r.ok).toBe(true)
  })

  it('decodes a data URI into a local file with sniffed extension', async () => {
    const uri = 'data:image/png;base64,' + PNG.toString('base64')
    const r = await localizeImageUrl(uri, tempDir)
    expect(r.ok).toBe(true)
    const name = (r as { url: string }).url.replace('/api/artifact-images/', '')
    expect(name.endsWith('.png')).toBe(true)
    const file = readFileSync(path.join(tempDir, name))
    expect(file[0]).toBe(0x89)
  })

  it('rejects a malformed data URI', async () => {
    const r = await localizeImageUrl('data:image/png;base64,!!!not-base64!!!', tempDir)
    expect(r.ok).toBe(false)
  })

  it('downloads an http url and stores it locally', async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'image/jpeg' })
      res.end(JPEG)
    })
    await new Promise<void>((resolve) => server.listen(0, resolve))
    const port = (server.address() as { port: number }).port
    try {
      const r = await localizeImageUrl(`http://127.0.0.1:${port}/img`, tempDir)
      expect(r.ok).toBe(true)
      const name = (r as { url: string }).url.replace('/api/artifact-images/', '')
      expect(name.endsWith('.jpg')).toBe(true)
      expect(readFileSync(path.join(tempDir, name)).equals(JPEG)).toBe(true)
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })

  it('returns a failure when download errors', async () => {
    const r = await localizeImageUrl('http://127.0.0.1:1/nope', tempDir)
    expect(r.ok).toBe(false)
  })

  it('returns a failure for unsupported schemes', async () => {
    const r = await localizeImageUrl('file:///etc/passwd', tempDir)
    expect(r.ok).toBe(false)
  })
})
