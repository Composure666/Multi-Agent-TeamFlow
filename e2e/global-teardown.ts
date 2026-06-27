import { rmSync } from 'node:fs'
import path from 'node:path'

const E2E_DATA_DIR = path.resolve('.agenthub-data-e2e')

export default function globalTeardown() {
  try {
    rmSync(E2E_DATA_DIR, { recursive: true, force: true })
  } catch {
    // server 进程可能仍持有 db 文件句柄（Windows）；下次 globalSetup 会重清。
  }
}
