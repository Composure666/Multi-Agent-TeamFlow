/**
 * 一次性 schema migration：新建 experience_usages 表。
 *
 * 记录每次 run 注入某条经验的历史（experience_id, run_id, agent_id, created_at）。
 * 用于详情页「使用记录」和统计趋势。
 *
 * 可重入：表已存在时跳过。
 *
 * 执行：tsx src/db/migrate-add-experience-usages.ts
 */
import { sql } from 'drizzle-orm'

import { db } from './client'

try {
  db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS experience_usages (
      id TEXT PRIMARY KEY,
      experience_id TEXT NOT NULL REFERENCES experiences(id) ON DELETE CASCADE,
      run_id TEXT NOT NULL,
      agent_id TEXT,
      created_at INTEGER NOT NULL
    )
  `))
  console.log('✓ created table experience_usages')
} catch (err) {
  if (err instanceof Error && /already exists/.test(err.message)) {
    console.log('= table experience_usages already exists, skip')
  } else {
    throw err
  }
}

try {
  db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_exp_usages_experience ON experience_usages(experience_id, created_at)`))
  console.log('✓ created index idx_exp_usages_experience')
} catch (err) {
  console.log('= index idx_exp_usages_experience already exists, skip')
}

try {
  db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_exp_usages_run ON experience_usages(run_id)`))
  console.log('✓ created index idx_exp_usages_run')
} catch (err) {
  console.log('= index idx_exp_usages_run already exists, skip')
}

console.log('done')
