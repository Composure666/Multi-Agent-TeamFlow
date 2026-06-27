/**
 * 一次性 schema migration：新增 app_settings 表（单行存全局 API key / base URL）。
 *
 * 与 agents.api_key / api_base_url 的关系：
 *  - agents.api_key       = per-agent 自定义 key（高优先级）
 *  - app_settings.*       = 全局自填 key，UI 入口（中优先级）
 *  - process.env.*        = 兜底（dev / CI），最低优先级
 *
 * 可重入：表已存在时跳过。`pnpm db:push` 也能创建，这个脚本是给已有库的 ALTER 路径。
 *
 * 执行：tsx src/db/migrate-add-app-settings.ts
 */
import { sql } from 'drizzle-orm'

import { db } from './client'

function safeRun(stmt: string, label: string) {
  try {
    db.run(sql.raw(stmt))
    console.log(`✓ ${label}`)
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes('already exists')) {
      console.log(`= ${label}, skip`)
    } else {
      throw err
    }
  }
}

safeRun(
  `CREATE TABLE IF NOT EXISTS app_settings (
    id TEXT PRIMARY KEY,
    anthropic_api_key TEXT,
    anthropic_base_url TEXT,
    openai_api_key TEXT,
    deepseek_api_key TEXT,
    ark_api_key TEXT,
    updated_at INTEGER NOT NULL
  )`,
  'created app_settings',
)

console.log('done')
