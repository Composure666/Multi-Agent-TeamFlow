/**
 * 一次性 schema migration：agent_runs 表加 usage JSON 列。
 *
 * 保存每个 run 的 token 用量（输入 / 输出 / cache）。详细字段见 schema.ts RunUsage。
 *
 * 可重入：列已存在时跳过。
 *
 * 执行：tsx src/db/migrate-add-run-usage.ts
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

safeAlter(`ALTER TABLE agent_runs ADD COLUMN usage TEXT`, 'usage')

console.log('done')
