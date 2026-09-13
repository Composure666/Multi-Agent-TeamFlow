/**
 * 一次性 schema migration：experiences 表 + app_settings.experience_extraction_enabled 列。
 *
 * drizzle-kit push 在给带 FK 的表加 NOT NULL DEFAULT 列时会把新列放进旧表 SELECT
 * （no such column 报错），故改用原生 SQL 增量迁移，幂等可重跑。
 *
 * 执行：tsx src/db/migrate-add-experiences.ts
 */
import type Database from 'better-sqlite3'

import { sqlite as defaultSqlite } from './client'

const STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS experiences (
    id text PRIMARY KEY NOT NULL,
    kind text NOT NULL,
    agent_id text REFERENCES agents(id),
    scope text NOT NULL DEFAULT 'agent',
    conversation_id text REFERENCES conversations(id) ON DELETE SET NULL,
    run_id text,
    title text NOT NULL,
    trigger text NOT NULL,
    content text NOT NULL,
    tags text NOT NULL DEFAULT '[]',
    source text NOT NULL DEFAULT 'auto',
    active integer NOT NULL DEFAULT true,
    usage_count integer NOT NULL DEFAULT 0,
    last_used_at integer,
    created_at integer NOT NULL,
    updated_at integer NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_experiences_agent_active ON experiences (agent_id, active, updated_at)`,
  `CREATE INDEX IF NOT EXISTS idx_experiences_conv ON experiences (conversation_id)`,
]

export function runExperiencesMigration(target: Database.Database = defaultSqlite) {
  for (const stmt of STATEMENTS) {
    target.exec(stmt)
  }
  // app_settings 加列（SQLite 不允许 ADD COLUMN IF NOT EXISTS，先查列）
  const cols = target.prepare('PRAGMA table_info(app_settings)').all() as { name: string }[]
  if (!cols.some((c) => c.name === 'experience_extraction_enabled')) {
    target.exec(
      `ALTER TABLE app_settings ADD COLUMN experience_extraction_enabled integer NOT NULL DEFAULT true`,
    )
  }
  // 清理 drizzle-kit 中途失败留下的临时表（若存在）
  target.exec(`DROP TABLE IF EXISTS __new_app_settings`)
}

// CLI entry
if (require.main === module) {
  runExperiencesMigration()
  console.log('done')
}
