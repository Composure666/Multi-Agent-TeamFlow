/**
 * 一次性 schema migration：experience_attachments 表（经验参考附件元数据）。
 *
 * 二进制存 DATA_DIR/experience-files/，不在 workspace 沙箱内（对齐 Spec 20 §10
 * 「经验内容不写 workspace 文件」的边界）。原生 SQL 增量迁移，幂等可重跑。
 *
 * 执行：tsx src/db/migrate-add-experience-attachments.ts
 */
import type Database from 'better-sqlite3'

import { sqlite as defaultSqlite } from './client'

const STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS experience_attachments (
    id text PRIMARY KEY NOT NULL,
    experience_id text NOT NULL REFERENCES experiences(id) ON DELETE CASCADE,
    file_name text NOT NULL,
    stored_name text NOT NULL,
    size integer NOT NULL,
    mime_type text NOT NULL,
    created_at integer NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_exp_attachments_experience ON experience_attachments (experience_id, created_at)`,
]

export function runExperienceAttachmentsMigration(target: Database.Database = defaultSqlite) {
  for (const stmt of STATEMENTS) {
    target.exec(stmt)
  }
}

// CLI entry
if (require.main === module) {
  runExperienceAttachmentsMigration()
  console.log('done')
}
