import { beforeEach, describe, expect, it, vi, type MockedFunction } from 'vitest'
import { NextRequest } from 'next/server'

import { GET } from './route'
import { db } from '@/db/client'
import type { ArtifactContent, ArtifactType } from '@/shared/types'

vi.mock('@/db/client', () => {
  const findFirst = vi.fn()
  return {
    db: {
      query: {
        artifacts: { findFirst },
      },
    },
    schema: {
      artifacts: { id: 'id-stub' },
    },
  }
})

type FindFirst = typeof db.query.artifacts.findFirst
const findFirstMock = db.query.artifacts.findFirst as MockedFunction<FindFirst>

function makeReq(id: string, path: string[]) {
  const url = `http://localhost/api/artifacts/${id}/preview/${path.join('/')}`
  return new NextRequest(new Request(url))
}

function makeCtx(id: string, path: string[]) {
  return { params: Promise.resolve({ id, path }) }
}

/**
 * Build a minimal artifact row that matches the schema.
 * `content` (Json) holds the type-specific payload (web_app.files lives inside).
 */
function makeArtifactRow(id: string, type: ArtifactType, files: Record<string, string>) {
  const content: ArtifactContent = type === 'web_app'
    ? { type: 'web_app', files, entry: 'index.html' }
    : { type: 'document', format: 'markdown', content: '# hello' }
  const createdAt = Date.now()
  return {
    id,
    conversationId: 'conv_1',
    type,
    title: 'Test Artifact',
    content,
    version: 1,
    parentArtifactId: null,
    mergedInto: null,
    createdByAgentId: 'agent_test',
    createdAt,
    updatedAt: createdAt,
  }
}

describe('GET /api/artifacts/[id]/preview/[...path]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 404 when artifact does not exist', async () => {
    findFirstMock.mockResolvedValueOnce(undefined as never)
    const res = await GET(makeReq('art_missing', ['index.html']), makeCtx('art_missing', ['index.html']))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Artifact not found' })
  })

  it('returns 400 when artifact type is not web_app', async () => {
    findFirstMock.mockResolvedValueOnce(makeArtifactRow('art_doc', 'document', {}))
    const res = await GET(makeReq('art_doc', ['page.html']), makeCtx('art_doc', ['page.html']))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Artifact is not a web_app' })
  })

  it('returns 404 when the requested sub-file is not in archive.files', async () => {
    findFirstMock.mockResolvedValueOnce(
      makeArtifactRow('art_web', 'web_app', { 'index.html': '<html></html>' }),
    )
    const res = await GET(makeReq('art_web', ['missing.html']), makeCtx('art_web', ['missing.html']))
    expect(res.status).toBe(404)
    expect((await res.json()).error).toContain('File not found: missing.html')
  })

  it('serves successful response with correct Content-Type for html sub-file', async () => {
    findFirstMock.mockResolvedValueOnce(
      makeArtifactRow('art_web', 'web_app', { 'page.html': '<html><body>hi</body></html>' }),
    )
    const res = await GET(makeReq('art_web', ['page.html']), makeCtx('art_web', ['page.html']))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/html; charset=utf-8')
    expect(await res.text()).toBe('<html><body>hi</body></html>')
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer')
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    const csp = res.headers.get('Content-Security-Policy') ?? ''
    expect(csp).toContain("script-src 'none'")
    expect(csp).toContain("default-src 'none'")
    expect(csp).toContain('sandbox')
    expect(csp).toContain("frame-ancestors 'none'")
  })

  it('serves correct Content-Type for css sub-resource', async () => {
    findFirstMock.mockResolvedValueOnce(
      makeArtifactRow('art_web', 'web_app', { 'styles.css': 'body{color:red}' }),
    )
    const res = await GET(makeReq('art_web', ['styles.css']), makeCtx('art_web', ['styles.css']))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/css; charset=utf-8')
  })

  it('serves correct Content-Type for js sub-resource', async () => {
    findFirstMock.mockResolvedValueOnce(
      makeArtifactRow('art_web', 'web_app', { 'app.js': 'console.log(1)' }),
    )
    const res = await GET(makeReq('art_web', ['app.js']), makeCtx('art_web', ['app.js']))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/javascript; charset=utf-8')
  })

  it('serves correct Content-Type for wasm sub-resource', async () => {
    findFirstMock.mockResolvedValueOnce(
      makeArtifactRow('art_web', 'web_app', { 'module.wasm': '\\x00asm' }),
    )
    const res = await GET(makeReq('art_web', ['module.wasm']), makeCtx('art_web', ['module.wasm']))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/wasm')
  })

  it('serves correct Content-Type for svg sub-resource', async () => {
    findFirstMock.mockResolvedValueOnce(
      makeArtifactRow('art_web', 'web_app', { 'icon.svg': '<svg/>' }),
    )
    const res = await GET(makeReq('art_web', ['icon.svg']), makeCtx('art_web', ['icon.svg']))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/svg+xml')
  })

  it('joins nested path segments with forward slashes when resolving into files map', async () => {
    findFirstMock.mockResolvedValueOnce(
      makeArtifactRow('art_web', 'web_app', {
        'assets/nested/deep/style.css': 'body{}',
      }),
    )
    const res = await GET(
      makeReq('art_web', ['assets', 'nested', 'deep', 'style.css']),
      makeCtx('art_web', ['assets', 'nested', 'deep', 'style.css']),
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/css; charset=utf-8')
    expect(await res.text()).toBe('body{}')
  })

  it('returns application/json for 404 file-not-found (does not leak permissive CSP)', async () => {
    findFirstMock.mockResolvedValueOnce(
      makeArtifactRow('art_web', 'web_app', { 'index.html': '<html/>' }),
    )
    const res = await GET(makeReq('art_web', ['nope.html']), makeCtx('art_web', ['nope.html']))
    expect(res.status).toBe(404)
    expect(res.headers.get('Content-Type')).toContain('application/json')
    expect(res.headers.get('Content-Security-Policy')).toBeNull()
  })
})
