import { mkdirSync } from 'node:fs'
import path from 'node:path'

import { IS_WINDOWS } from '@/server/platform'
import type { StreamEvent } from '@/shared/types'

export function createAdapterEvent(conversationId: string) {
  return <T extends Record<string, unknown>>(body: T) =>
    ({
      ...body,
      conversationId,
      timestamp: Date.now(),
    }) as unknown as StreamEvent
}

export function buildChildProcessEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value
  }
  if (IS_WINDOWS && !env.HOME && env.USERPROFILE) {
    env.HOME = env.USERPROFILE
  }
  return env
}

export function buildCodexChildProcessEnv(): Record<string, string> {
  const env = buildChildProcessEnv()
  for (const key of Object.keys(env)) {
    if (key.startsWith('CODEX_') && key !== 'CODEX_CA_CERTIFICATE') {
      delete env[key]
    }
  }

  const codexHome = path.join(getAgentHubDataDir(), 'codex-home')
  mkdirSync(codexHome, { recursive: true })
  env.CODEX_HOME = codexHome
  env.CODEX_SQLITE_HOME = codexHome
  return env
}

export function isAbortLikeError(err: unknown, signal: AbortSignal): boolean {
  return (
    signal.aborted ||
    (err instanceof Error &&
      (err.name === 'AbortError' ||
        err.message.includes('The operation was aborted') ||
        err.message.includes('aborted')))
  )
}

function getAgentHubDataDir(): string {
  return (
    process.env.AGENTHUB_DATA_DIR ??
    path.resolve(/* turbopackIgnore: true */ process.cwd(), '.agenthub-data')
  )
}
