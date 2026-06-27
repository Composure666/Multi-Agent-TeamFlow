/**
 * 一次性 schema migration：workspaces 表加 mode + bound_path 列。
 *
 * 可重入：列已存在时跳过（SQLite ALTER TABLE 没有 IF NOT EXISTS for column，
 * 用 try/catch 识别 "duplicate column" 错误）。
 *
 * 执行：tsx src/db/migrate-add-workspace-mode.ts
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
  `ALTER TABLE workspaces ADD COLUMN mode TEXT NOT NULL DEFAULT 'sandbox'`,
  'mode',
)
safeAlter(`ALTER TABLE workspaces ADD COLUMN bound_path TEXT`, 'bound_path')

console.log('done')
