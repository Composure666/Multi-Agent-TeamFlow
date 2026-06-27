import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'

import { GET } from './route'

function makeReq(url: string) {
  return new NextRequest(new Request(url))
}

describe('GET /api/search', () => {
  it('returns 400 when q is missing', async () => {
    const res = await GET(makeReq('http://localhost/api/search'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('INVALID_QUERY')
  })

  it('returns 400 when q is empty string', async () => {
    const res = await GET(makeReq('http://localhost/api/search?q='))
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('INVALID_QUERY')
  })

  it('returns 400 when q is too long', async () => {
    const res = await GET(makeReq(`http://localhost/api/search?q=${'x'.repeat(201)}`))
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('INVALID_QUERY')
  })

  it('returns 400 when limit is out of range', async () => {
    const res = await GET(makeReq('http://localhost/api/search?q=foo&limit=999'))
    expect(res.status).toBe(400)
  })
})