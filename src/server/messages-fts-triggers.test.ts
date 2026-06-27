import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'

import { runMessageSearchMigration } from '../db/migrate-add-message-search'

function makeDb() {
  const db = new Database(':memory:')
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
  runMessageSearchMigration(db)
  return db
}

function insertMessage(
  db: Database.Database,
  id: string,
  parts: unknown[],
  status: string,
) {
  db.prepare(
    `INSERT INTO messages (id, conversation_id, role, parts, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, 'c1', 'user', JSON.stringify(parts), status, Date.now())
}

function ftsCount(db: Database.Database, content: string) {
  const row = db
    .prepare('SELECT COUNT(*) AS n FROM messages_fts WHERE messages_fts MATCH ?')
    .get(`"${content}"`) as { n: number }
  return row.n
}

describe('messages_fts triggers', () => {
  let db: Database.Database
  beforeEach(() => { db = makeDb() })
  afterEach(() => { db.close() })

  it('inserts one FTS row per text part', () => {
    insertMessage(db, 'm1', [
      { type: 'text', content: 'hello' },
      { type: 'text', content: 'world' },
      { type: 'thinking', content: 'private' },
    ], 'complete')
    expect(ftsCount(db, 'hello')).toBe(1)
    expect(ftsCount(db, 'world')).toBe(1)
    expect(ftsCount(db, 'private')).toBe(0)
  })

  it('skips streaming messages on insert', () => {
    insertMessage(db, 'm1', [{ type: 'text', content: 'mid-stream' }], 'streaming')
    expect(ftsCount(db, 'mid-stream')).toBe(0)
  })

  it('syncs when status transitions streaming → complete', () => {
    insertMessage(db, 'm1', [{ type: 'text', content: 'growing' }], 'streaming')
    expect(ftsCount(db, 'growing')).toBe(0)

    db.prepare(`UPDATE messages SET status = ?, parts = ? WHERE id = ?`)
      .run('complete', JSON.stringify([{ type: 'text', content: 'grown text' }]), 'm1')

    expect(ftsCount(db, 'grown text')).toBe(1)
    expect(ftsCount(db, 'growing')).toBe(0)
  })

  it('skips update while still streaming', () => {
    insertMessage(db, 'm1', [{ type: 'text', content: 'first' }], 'streaming')
    db.prepare(`UPDATE messages SET parts = ? WHERE id = ?`)
      .run(JSON.stringify([{ type: 'text', content: 'second' }]), 'm1')
    expect(ftsCount(db, 'first')).toBe(0)
    expect(ftsCount(db, 'second')).toBe(0)
  })

  it('removes FTS rows on delete', () => {
    insertMessage(db, 'm1', [{ type: 'text', content: 'todelete' }], 'complete')
    expect(ftsCount(db, 'todelete')).toBe(1)
    db.prepare(`DELETE FROM messages WHERE id = ?`).run('m1')
    expect(ftsCount(db, 'todelete')).toBe(0)
  })
})