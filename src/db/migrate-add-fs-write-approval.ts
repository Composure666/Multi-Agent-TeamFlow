/**
 * 一次性 schema migration：conversations 表加 fs_write_approval_mode 列。
 *
 * 可重入：列已存在时跳过。
 *
 * 执行：tsx src/db/migrate-add-fs-write-approval.ts
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

safeAlter(
  `ALTER TABLE conversations ADD COLUMN fs_write_approval_mode TEXT NOT NULL DEFAULT 'review'`,
  'fs_write_approval_mode',
)

console.log('done')
