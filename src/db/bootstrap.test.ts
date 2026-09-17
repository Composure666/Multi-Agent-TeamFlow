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

/**
 * 回归：messages_fts 必须随 bootstrap 自愈。
 *
 * 线上事故：这张虚拟表的建表语句原先只躺在手工脚本 `migrate-add-message-search.ts` 里，
 * 运行时没有任何调用点 → 线上库一直没有它，`/api/search` 恒 500
 * （`SqliteError: no such table: messages_fts`）。对照 `experiences_fts` 因为写进了 DDL 所以一直正常。
 */
function insertMessage(sqlite: Database.Database, id: string, text: string, status = 'complete') {
  // messages.conversation_id 有外键约束，先把宿主会话补上
  const now = Date.now()
  sqlite
    .prepare(
      `INSERT OR IGNORE INTO conversations (id, title, mode, agent_ids, created_at, updated_at)
       VALUES ('conv_fts', 'fts test', 'chat', '[]', ?, ?)`,
    )
    .run(now, now)
  sqlite
    .prepare(
      `INSERT INTO messages (id, conversation_id, role, agent_id, parts, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, 'conv_fts', 'user', null, JSON.stringify([{ type: 'text', content: text }]), status, now)
}

function ftsRows(sqlite: Database.Database, term: string) {
  return sqlite
    .prepare('SELECT rowid, content FROM messages_fts WHERE messages_fts MATCH ?')
    .all(term) as Array<{ rowid: number; content: string }>
}

describe('messages_fts self-heal', () => {
  it('creates the virtual table and its three triggers on a fresh database', () => {
    withTempDb((sqlite) => {
      bootstrapDatabase(sqlite)

      const table = sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='messages_fts'")
        .get()
      expect(table).toBeDefined()

      const triggers = sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'messages_fts_%'")
        .all() as { name: string }[]
      expect(triggers.map((t) => t.name).sort()).toEqual(['messages_fts_ad', 'messages_fts_ai', 'messages_fts_au'])
    })
  })

  it('repairs a legacy database that has messages but no messages_fts', () => {
    withTempDb((sqlite) => {
      bootstrapDatabase(sqlite)

      // 还原线上现状：表不存在、触发器不存在、回填标记也没打过
      sqlite.exec(`
        DROP TRIGGER IF EXISTS messages_fts_ai;
        DROP TRIGGER IF EXISTS messages_fts_au;
        DROP TRIGGER IF EXISTS messages_fts_ad;
        DROP TABLE IF EXISTS messages_fts;
      `)
      sqlite.prepare('DELETE FROM bootstrap_migrations').run()
      insertMessage(sqlite, 'm_legacy', 'alpha bravo charlie')

      // 老库里的存量消息只有在建表之前就存在，才需要靠回填补上
      bootstrapDatabase(sqlite)

      expect(ftsRows(sqlite, 'bravo')).toEqual([
        expect.objectContaining({ content: expect.stringContaining('alpha bravo charlie') }),
      ])
    })
  })

  it('indexes new messages through the trigger and never duplicates rows on restart', () => {
    withTempDb((sqlite) => {
      bootstrapDatabase(sqlite)
      expect(sqlite.prepare('SELECT 1 AS one FROM bootstrap_migrations WHERE key = ?').get('messages_fts_backfill_v1')).toBeDefined()

      // 落定后的消息由 AFTER INSERT 触发器接管
      insertMessage(sqlite, 'm_new', 'delta echo foxtrot')

      // 重启（再 bootstrap 一次）不应重复回填，也不应报错
      expect(() => bootstrapDatabase(sqlite)).not.toThrow()

      expect(ftsRows(sqlite, 'echo').length).toBe(1)
    })
  })

  it('skips streaming messages, which are indexed on the follow-up update instead', () => {
    withTempDb((sqlite) => {
      bootstrapDatabase(sqlite)
      insertMessage(sqlite, 'm_stream', 'golf hotel india', 'streaming')
      expect(ftsRows(sqlite, 'hotel')).toEqual([])

      sqlite
        .prepare(`UPDATE messages SET status = 'complete' WHERE id = 'm_stream'`)
        .run()
      expect(ftsRows(sqlite, 'hotel').length).toBe(1)
    })
  })
})
