/**
 * 一次性 schema migration：新增 agent_run_debug_events append-only 表。
 *
 * 可重入：表或索引已存在时跳过。用于 `pnpm db:push` 因 SQLite/本机
 * Electron native binding 环境失败时，仍可把运行调试事件表补到既有库。
 *
 * 执行：tsx src/db/migrate-add-agent-run-debug-events.ts
 */
import { sql } from 'drizzle-orm'

import { db } from './client'

function safeRun(stmt: string, label: string) {
  try {
    db.run(sql.raw(stmt))
    console.log(`✓ ${label}`)
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes('already exists')) {
      console.log(`= ${label}, skip`)
    } else {
      throw err
    }
  }
}

safeRun(
  `CREATE TABLE IF NOT EXISTS agent_run_debug_events (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
    parent_run_id TEXT,
    agent_id TEXT REFERENCES agents(id),
    task_id TEXT,
    step_id TEXT,
    tool_call_id TEXT,
    type TEXT NOT NULL,
    status TEXT,
    payload TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  'created agent_run_debug_events',
)

safeRun(
  'CREATE INDEX IF NOT EXISTS idx_run_debug_events_conv_run_created ON agent_run_debug_events(conversation_id, run_id, created_at)',
  'created idx_run_debug_events_conv_run_created',
)
safeRun(
  'CREATE INDEX IF NOT EXISTS idx_run_debug_events_run_agent_created ON agent_run_debug_events(run_id, agent_id, created_at)',
  'created idx_run_debug_events_run_agent_created',
)
safeRun(
  'CREATE INDEX IF NOT EXISTS idx_run_debug_events_run_task_created ON agent_run_debug_events(run_id, task_id, created_at)',
  'created idx_run_debug_events_run_task_created',
)
safeRun(
  'CREATE INDEX IF NOT EXISTS idx_run_debug_events_run_tool ON agent_run_debug_events(run_id, tool_call_id)',
  'created idx_run_debug_events_run_tool',
)

console.log('done')
