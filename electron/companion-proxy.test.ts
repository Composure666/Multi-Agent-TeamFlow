import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { startCompanionProxy, type CompanionProxyHandle } from './companion-proxy'

const TOKEN = 'test-mobile-device-token-xyz123'

interface UpstreamHandle {
  port: number
  close(): Promise<void>
  received: Array<{ method: string; url: string; auth: string | null; host: string | null }>
}

async function startMockUpstream(): Promise<UpstreamHandle> {
  const received: UpstreamHandle['received'] = []
  const server = createServer((req, res) => {
    received.push({
      method: req.method ?? 'GET',
      url: req.url ?? '/',
      auth: (req.headers.authorization as string | undefined) ?? null,
      host: (req.headers.host as string | undefined) ?? null,
    })
    if (req.url?.startsWith('/api/mobile/snapshot')) {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ snapshot: 'ok' }))
    } else {
      res.writeHead(404)
      res.end()
    }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  const addr = server.address() as AddressInfo
  return {
    port: addr.port,
    received,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

describe('startCompanionProxy (companion-mode reverse proxy)', () => {
  let upstream: UpstreamHandle
  let proxy: CompanionProxyHandle

  beforeEach(async () => {
    upstream = await startMockUpstream()
    proxy = await startCompanionProxy({
      mainPort: upstream.port,
      mobileDeviceToken: TOKEN,
      port: 0,
    })
  })

  afterEach(async () => {
    await proxy.close()
    await upstream.close()
  })

  it('returns 401 when Authorization header is missing', async () => {
    const resp = await fetch(`http://127.0.0.1:${proxy.port}/api/mobile/snapshot`)
    expect(resp.status).toBe(401)
    expect(upstream.received).toHaveLength(0)
  })

  it('returns 401 when Bearer token is wrong', async () => {
    const resp = await fetch(`http://127.0.0.1:${proxy.port}/api/mobile/snapshot`, {
      headers: { authorization: 'Bearer wrong-token' },
    })
    expect(resp.status).toBe(401)
    expect(upstream.received).toHaveLength(0)
  })

  it('returns 403 when path is not in /api/mobile/* whitelist (even with valid token)', async () => {
    const resp = await fetch(`http://127.0.0.1:${proxy.port}/api/conversations`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    expect(resp.status).toBe(403)
    expect(upstream.received).toHaveLength(0)
  })

  it('returns 403 for root path', async () => {
    const resp = await fetch(`http://127.0.0.1:${proxy.port}/`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    expect(resp.status).toBe(403)
  })

  it('proxies valid request to upstream and forwards Authorization header', async () => {
    const resp = await fetch(`http://127.0.0.1:${proxy.port}/api/mobile/snapshot`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    expect(resp.status).toBe(200)
    const body = (await resp.json()) as { snapshot: string }
    expect(body).toEqual({ snapshot: 'ok' })
    expect(upstream.received).toEqual([
      expect.objectContaining({
        method: 'GET',
        url: '/api/mobile/snapshot',
        auth: `Bearer ${TOKEN}`,
      }),
    ])
  })

  it('rewrites the upstream Host header to 127.0.0.1:<mainPort> (SSRF hardening)', async () => {
    await fetch(`http://127.0.0.1:${proxy.port}/api/mobile/snapshot`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    expect(upstream.received[0]?.host).toBe(`127.0.0.1:${upstream.port}`)
  })

  it('returns 401 with CORS headers when origin is capacitor://localhost', async () => {
    const resp = await fetch(`http://127.0.0.1:${proxy.port}/api/mobile/snapshot`, {
      headers: { origin: 'capacitor://localhost' },
    })
    expect(resp.status).toBe(401)
    expect(resp.headers.get('access-control-allow-origin')).toBe('capacitor://localhost')
    expect(resp.headers.get('vary')).toContain('Origin')
  })

  it('OPTIONS preflight to whitelisted path returns 204 without auth', async () => {
    const resp = await fetch(`http://127.0.0.1:${proxy.port}/api/mobile/snapshot`, {
      method: 'OPTIONS',
      headers: { origin: 'capacitor://localhost' },
    })
    expect(resp.status).toBe(204)
    expect(resp.headers.get('access-control-allow-origin')).toBe('capacitor://localhost')
    expect(upstream.received).toHaveLength(0)
  })

  it('OPTIONS preflight to non-whitelisted path returns 403', async () => {
    const resp = await fetch(`http://127.0.0.1:${proxy.port}/api/conversations`, {
      method: 'OPTIONS',
      headers: { origin: 'capacitor://localhost' },
    })
    expect(resp.status).toBe(403)
  })

  it('does not echo Access-Control-Allow-Origin when origin is not allowlisted', async () => {
    const resp = await fetch(`http://127.0.0.1:${proxy.port}/api/mobile/snapshot`, {
      headers: { origin: 'http://evil.example.com' },
    })
    expect(resp.status).toBe(401)
    expect(resp.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('forwards POST body to upstream', async () => {
    const resp = await fetch(`http://127.0.0.1:${proxy.port}/api/mobile/anything`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ foo: 'bar' }),
    })
    // upstream mock 返回 404(只有 /api/mobile/snapshot 才有 handler)
    expect(resp.status).toBe(404)
    expect(upstream.received.at(-1)).toEqual(
      expect.objectContaining({
        method: 'POST',
        url: '/api/mobile/anything',
        auth: `Bearer ${TOKEN}`,
      }),
    )
  })
})