import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'

import { bootstrapDatabase } from './bootstrap'

/**
 * 回归：内置自动化任务必须「默认暂停」。
 *
 * 线上事故：老种子把内置任务写成 enabled / running，且 next_run_at 按「上次演示运行 + 1 天」
 * 预排（演示时间在过去）→ 服务一启动，调度器首个 tick 就当它们已到期，开箱即真跑了一轮。
 */
function withTempDb<T>(run: (sqlite: Database.Database) => T): T {
  const dir = mkdtempSync(path.join(tmpdir(), 'agenthub-bootstrap-'))
  const sqlite = new Database(path.join(dir, 'agenthub.db'))
  try {
    return run(sqlite)
  } finally {
    sqlite.close()
    rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  }
}

describe('built-in automation seed', () => {
  it('seeds every built-in automation as paused with no scheduled next run', () => {
    withTempDb((sqlite) => {
      bootstrapDatabase(sqlite)

      const rows = sqlite
        .prepare('SELECT id, status, next_run_at FROM automations')
        .all() as Array<{ id: string; status: string; next_run_at: number | null }>

      expect(rows.length).toBeGreaterThan(0)
      for (const row of rows) {
        expect({ id: row.id, status: row.status }).toEqual({ id: row.id, status: 'paused' })
        expect({ id: row.id, next_run_at: row.next_run_at }).toEqual({ id: row.id, next_run_at: null })
      }
    })
  })

  it('pauses legacy enabled built-ins on upgrade, but only once', () => {
    withTempDb((sqlite) => {
      bootstrapDatabase(sqlite)

      // 造出「老版本库」的样子：内置任务处于 enabled/running 且预排了下一次运行
      sqlite
        .prepare(
          `UPDATE automations
           SET status = 'enabled', next_run_at = ?
           WHERE id = 'auto_daily_ai_news'`,
        )
        .run(Date.now() - 60_000)
      sqlite
        .prepare(`UPDATE automations SET status = 'running' WHERE id = 'auto_classic_movie'`)
        .run()
      // 迁移标记还不在 → 下次启动应执行一次性修复
      sqlite.prepare('DELETE FROM bootstrap_migrations').run()

      bootstrapDatabase(sqlite)

      const afterUpgrade = sqlite
        .prepare(`SELECT id, status, next_run_at FROM automations WHERE id IN ('auto_daily_ai_news','auto_classic_movie')`)
        .all() as Array<{ id: string; status: string; next_run_at: number | null }>
      for (const row of afterUpgrade) {
        expect({ id: row.id, status: row.status }).toEqual({ id: row.id, status: 'paused' })
        expect({ id: row.id, next_run_at: row.next_run_at }).toEqual({ id: row.id, next_run_at: null })
      }

      // 用户随后手动启用：再次启动不能被反复暂停（迁移只跑一次）
      sqlite
        .prepare(`UPDATE automations SET status = 'enabled', next_run_at = ? WHERE id = 'auto_daily_ai_news'`)
        .run(Date.now() + 60_000)
      bootstrapDatabase(sqlite)

      const afterManualEnable = sqlite
        .prepare(`SELECT status, next_run_at FROM automations WHERE id = 'auto_daily_ai_news'`)
        .get() as { status: string; next_run_at: number | null }
      expect(afterManualEnable.status).toBe('enabled')
      expect(afterManualEnable.next_run_at).not.toBeNull()
    })
  })
})
