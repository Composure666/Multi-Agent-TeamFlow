/**
 * 一次性 schema migration：conversations 表加 bookmarked_message_ids JSON 列。
 *
 * 与 pinned_message_ids 区分语义：
 *  - bookmarked_message_ids = 用户的 UI 书签（导航定位用，不影响 LLM 上下文）
 *  - pinned_message_ids     = 注入 LLM 长期上下文的「重要消息」（原 spec 01 设计）
 *
 * 可重入：列已存在时跳过。
 *
 * 执行：tsx src/db/migrate-add-bookmarks.ts
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
  `ALTER TABLE conversations ADD COLUMN bookmarked_message_ids TEXT NOT NULL DEFAULT '[]'`,
  'bookmarked_message_ids',
)

console.log('done')
