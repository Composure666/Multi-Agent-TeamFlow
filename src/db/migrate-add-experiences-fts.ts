/**
 * 一次性 schema migration：加 experiences_fts 虚拟表 + 3 触发器，回填已有行。
 *
 * 幂等：使用 IF NOT EXISTS 守卫；backfill 使用 INSERT OR IGNORE 不会重复插入。
 *
 * 执行：tsx src/db/migrate-add-experiences-fts.ts
 */
import type Database from 'better-sqlite3'

import { sqlite as defaultSqlite } from './client'

const STATEMENTS: string[] = [
  `CREATE VIRTUAL TABLE IF NOT EXISTS experiences_fts USING fts5(title, trigger, tags, content, tokenize='trigram')`,
  `CREATE TRIGGER IF NOT EXISTS experiences_fts_ai
     AFTER INSERT ON experiences
     WHEN new.active = 1
     BEGIN
       INSERT INTO experiences_fts(rowid, title, trigger, tags, content)
       VALUES (new.rowid, new.title, new.trigger, coalesce(new.tags, ''), new.content);
     END`,
  `CREATE TRIGGER IF NOT EXISTS experiences_fts_au
     AFTER UPDATE ON experiences
     BEGIN
       DELETE FROM experiences_fts WHERE rowid = old.rowid;
       INSERT INTO experiences_fts(rowid, title, trigger, tags, content)
       SELECT new.rowid, new.title, new.trigger, coalesce(new.tags, ''), new.content
       WHERE new.active = 1;
     END`,
  `CREATE TRIGGER IF NOT EXISTS experiences_fts_ad
     AFTER DELETE ON experiences
     BEGIN
       DELETE FROM experiences_fts WHERE rowid = old.rowid;
     END`,
  `INSERT OR IGNORE INTO experiences_fts(rowid, title, trigger, tags, content)
     SELECT id, title, trigger, coalesce(tags, ''), content
     FROM experiences
     WHERE active = 1`,
]

export function runExperiencesFtsMigration(target: Database.Database = defaultSqlite) {
  for (const stmt of STATEMENTS) {
    target.exec(stmt)
  }
}

// CLI entry
if (require.main === module) {
  runExperiencesFtsMigration()
  console.log('done')
}
