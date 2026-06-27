/**
 * 一次性 schema migration：加 messages_fts 虚拟表 + 3 触发器，回填已有 text part。
 *
 * 幂等：使用 IF NOT EXISTS 守卫；backfill 使用 INSERT OR IGNORE 不会重复插入。
 *
 * 执行：tsx src/db/migrate-add-message-search.ts
 */
import type Database from 'better-sqlite3'

import { sqlite as defaultSqlite } from './client'

const STATEMENTS: string[] = [
  `CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(content, tokenize='trigram')`,
  `CREATE TRIGGER IF NOT EXISTS messages_fts_ai
     AFTER INSERT ON messages
     WHEN new.status != 'streaming'
     BEGIN
       INSERT INTO messages_fts(rowid, content)
       SELECT new.rowid, (
         SELECT GROUP_CONCAT(json_extract(value, '$.content'), ' ')
         FROM json_each(new.parts)
         WHERE json_extract(value, '$.type') = 'text'
       );
     END`,
  `CREATE TRIGGER IF NOT EXISTS messages_fts_au
     AFTER UPDATE ON messages
     WHEN new.status != 'streaming'
     BEGIN
       DELETE FROM messages_fts WHERE rowid = old.rowid;
       INSERT INTO messages_fts(rowid, content)
       SELECT new.rowid, (
         SELECT GROUP_CONCAT(json_extract(value, '$.content'), ' ')
         FROM json_each(new.parts)
         WHERE json_extract(value, '$.type') = 'text'
       );
     END`,
  `CREATE TRIGGER IF NOT EXISTS messages_fts_ad
     AFTER DELETE ON messages
     BEGIN
       DELETE FROM messages_fts WHERE rowid = old.rowid;
     END`,
  `INSERT OR IGNORE INTO messages_fts(rowid, content)
     SELECT m.rowid, (
       SELECT GROUP_CONCAT(json_extract(value, '$.content'), ' ')
       FROM json_each(m.parts)
       WHERE json_extract(value, '$.type') = 'text'
     )
     FROM messages m`,
]

export function runMessageSearchMigration(target: Database.Database = defaultSqlite) {
  for (const stmt of STATEMENTS) {
    target.exec(stmt)
  }
}

// CLI entry
if (require.main === module) {
  runMessageSearchMigration()
  console.log('done')
}