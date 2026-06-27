import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

const BUILTIN_ALLOWED_ORIGINS = new Set([
  'capacitor://localhost',
  'ionic://localhost',
  'https://localhost',
  'http://localhost',
])

export function mobileOptions(req: NextRequest): NextResponse {
  return withMobileCors(req, new NextResponse(null, { status: 204 }))
}

export function mobileJson(
  req: NextRequest,
  body: unknown,
  init?: ResponseInit,
): NextResponse {
  return withMobileCors(req, NextResponse.json(body, init))
}

export function withMobileCors(req: NextRequest, res: NextResponse): NextResponse {
  const origin = req.headers.get('origin')
  if (origin && isAllowedOrigin(origin)) {
    res.headers.set('Access-Control-Allow-Origin', origin)
  }
  res.headers.set('Vary', appendVaryOrigin(res.headers.get('Vary')))
  res.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept')
  res.headers.set('Access-Control-Max-Age', '600')
  return res
}

function isAllowedOrigin(origin: string): boolean {
  if (BUILTIN_ALLOWED_ORIGINS.has(origin)) return true
  if (/^http:\/\/(localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(origin)) return true

  const configured = process.env.AGENTHUB_MOBILE_ALLOWED_ORIGINS
  if (!configured) return false
  return configured
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .includes(origin)
}

function appendVaryOrigin(value: string | null): string {
  if (!value) return 'Origin'
  const parts = value.split(',').map((item) => item.trim().toLowerCase())
  return parts.includes('origin') ? value : `${value}, Origin`
}
