import { timingSafeEqual } from 'node:crypto'

import type { NextRequest } from 'next/server'
import type { NextResponse } from 'next/server'

import { mobileJson } from './mobile-cors'

const MOBILE_DEV_TOKEN_ENV = 'AGENTHUB_MOBILE_DEV_TOKEN'
const MOBILE_TOKEN_ENV = 'AGENTHUB_MOBILE_TOKEN'

export function requireMobileAuth(req: NextRequest): NextResponse | null {
  const expectedToken =
    process.env[MOBILE_TOKEN_ENV]?.trim() ?? process.env[MOBILE_DEV_TOKEN_ENV]?.trim()
  if (!expectedToken) {
    return mobileJson(
      req,
      { error: 'Mobile companion is not configured on the desktop host' },
      { status: 503 },
    )
  }

  const actualToken = readBearerToken(req.headers.get('authorization'))
  if (!actualToken || !isSameToken(actualToken, expectedToken)) {
    return mobileJson(req, { error: 'Unauthorized' }, { status: 401 })
  }

  return null
}

function readBearerToken(header: string | null): string | null {
  if (!header) return null
  const [scheme, token] = header.trim().split(/\s+/, 2)
  if (scheme !== 'Bearer' || !token) return null
  return token
}

function isSameToken(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual)
  const expectedBuffer = Buffer.from(expected)
  if (actualBuffer.length !== expectedBuffer.length) return false
  return timingSafeEqual(actualBuffer, expectedBuffer)
}
