/**
 * 一次性 schema migration：agents 表加 api_base_url 列。
 *
 * 为支持第三方 API 网关（如 anyrouter）。Claude Code SDK 通过 ANTHROPIC_BASE_URL 环境变量
 * 接管 endpoint，AgentHub 将此值 per-agent 持久化。
 *
 * 可重入：列已存在时跳过。
 *
 * 执行：tsx src/db/migrate-add-api-base-url.ts
 */
import { sql } from 'drizzle-orm'

import { db } from './client'

function safeAlter(stmt: string, columnName: string) {
  try {
    db.run(sql.raw(stmt))
    console.log(`✓ added column ${columnName}`)
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes('duplicate column')) {
      console.log(`= column ${columnName} already exists, skip`)
    } else {
      throw err
    }
  }
}

safeAlter(`ALTER TABLE agents ADD COLUMN api_base_url TEXT`, 'api_base_url')

console.log('done')
