/**
 * 一次性 schema migration：conversations 表加 pinned_at 列（用于会话置顶排序）。
 *
 * NULL = 未置顶；有值 = 置顶时间戳，排序时 pinned 永远在前，相互按 pinned_at 倒序。
 *
 * 可重入：列已存在时跳过。
 *
 * 执行：tsx src/db/migrate-add-conversation-pin.ts
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

safeAlter(`ALTER TABLE conversations ADD COLUMN pinned_at INTEGER`, 'pinned_at')

console.log('done')
