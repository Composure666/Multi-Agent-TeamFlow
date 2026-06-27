import { randomBytes, timingSafeEqual } from 'node:crypto'

const TOKEN_BYTES = 32

export function getInternalToolToken(): string {
  const store = globalThis as typeof globalThis & {
    __agenthubInternalToolToken?: string
  }
  if (!store.__agenthubInternalToolToken) {
    store.__agenthubInternalToolToken = randomBytes(TOKEN_BYTES).toString('hex')
  }
  return store.__agenthubInternalToolToken
}

export function verifyInternalToolToken(token: string | null): boolean {
  if (!token) return false
  const expected = getInternalToolToken()
  const actual = token.startsWith('Bearer ') ? token.slice('Bearer '.length) : token
  const expectedBuffer = Buffer.from(expected)
  const actualBuffer = Buffer.from(actual)
  return (
    expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer)
  )
}
