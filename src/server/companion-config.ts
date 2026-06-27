import { randomBytes } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export type CompanionMode = 'off' | 'lan' | 'tailnet'

export const DEFAULT_COMPANION_PORT = 60646

export interface CompanionConfig {
  companionMode: CompanionMode
  mobileDeviceToken: string | null
  companionPort: number
}

export function newMobileDeviceToken(): string {
  return randomBytes(24).toString('base64url')
}

export function writeCompanionConfig(config: CompanionConfig): void {
  const dataDir =
    process.env.AGENTHUB_DATA_DIR ??
    path.resolve(/* turbopackIgnore: true */ process.cwd(), '.agenthub-data')
  mkdirSync(dataDir, { recursive: true })
  writeFileSync(
    path.join(dataDir, 'companion.json'),
    JSON.stringify(config, null, 2),
  )
}
