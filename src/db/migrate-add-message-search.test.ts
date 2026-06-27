import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'

import { runMessageSearchMigration } from './migrate-add-message-search'

function makeDb() {
  const db = new Database(':memory:')
  // Minimal messages schema required by the migration
  db.exec(`
    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      agent_id TEXT,
      parts TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `)
  return db
}

describe('runMessageSearchMigration', () => {
  let db: Database.Database
  beforeEach(() => { db = makeDb() })
  afterEach(() => { db.close() })

  it('creates messages_fts virtual table', () => {
    runMessageSearchMigration(db)
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='messages_fts'")
      .get()
    expect(row).toBeDefined()
  })

  it('creates three triggers', () => {
    runMessageSearchMigration(db)
    const triggers = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'messages_fts_%'",
      )
      .all() as { name: string }[]
    const names = triggers.map((t) => t.name).sort()
    expect(names).toEqual(['messages_fts_ad', 'messages_fts_ai', 'messages_fts_au'])
  })

  it('is idempotent (running twice does not throw)', () => {
    runMessageSearchMigration(db)
    expect(() => runMessageSearchMigration(db)).not.toThrow()
  })

  it('backfills existing text parts from messages', () => {
    db.prepare(
      `INSERT INTO messages (id, conversation_id, role, parts, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('m1', 'c1', 'user', JSON.stringify([
      { type: 'text', content: 'hello world' },
      { type: 'thinking', content: 'internal note' },
      { type: 'text', content: 'goodbye' },
    ]), 'complete', 1)

    runMessageSearchMigration(db)

    const rows = db.prepare('SELECT content FROM messages_fts ORDER BY rowid').all() as { content: string }[]
    // thinking is excluded; multiple text parts are concatenated into one FTS row per message
    expect(rows.length).toBe(1)
    expect(rows[0].content).toContain('hello world')
    expect(rows[0].content).toContain('goodbye')
    expect(rows[0].content).not.toContain('internal note')
  })
})