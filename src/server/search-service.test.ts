import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'

import { runMessageSearchMigration } from '../db/migrate-add-message-search'
import { searchMessages } from './search-service'

function makeDb() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL
    );
    CREATE TABLE agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      avatar TEXT NOT NULL
    );
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
  db.prepare(`INSERT INTO conversations (id, title) VALUES (?, ?)`)
    .run('c1', 'First conv')
  db.prepare(`INSERT INTO conversations (id, title) VALUES (?, ?)`)
    .run('c2', 'Second conv')
  db.prepare(`INSERT INTO agents (id, name, avatar) VALUES (?, ?, ?)`)
    .run('a1', 'Claude', '🤖')
  runMessageSearchMigration(db)
  return db
}

function insertMessage(
  db: Database.Database,
  id: string, convId: string, role: string,
  parts: unknown[], status = 'complete', agentId: string | null = null,
) {
  db.prepare(
    `INSERT INTO messages (id, conversation_id, role, agent_id, parts, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, convId, role, agentId, JSON.stringify(parts), status, Date.now())
}

describe('searchMessages (FTS5 path)', () => {
  let db: Database.Database
  beforeEach(() => { db = makeDb() })
  afterEach(() => { db.close() })

  it('returns empty result for empty query', async () => {
    const r = await searchMessages({ query: '', db: db as Database.Database })
    expect(r.hits).toEqual([])
    expect(r.total).toBe(0)
  })

  it('returns empty result for whitespace query', async () => {
    const r = await searchMessages({ query: '   ', db: db as Database.Database })
    expect(r.hits).toEqual([])
    expect(r.total).toBe(0)
  })

  it('matches English prefix with snippet', async () => {
    insertMessage(db, 'm1', 'c1', 'user', [
      { type: 'text', content: 'rendering pipeline discussion' },
    ])
    const r = await searchMessages({ query: 'render*', db: db as Database.Database })
    expect(r.total).toBe(1)
    expect(r.hits[0].messageId).toBe('m1')
    expect(r.hits[0].snippetHtml).toContain('<mark>')
  })

  it('matches Chinese substring (3+ chars)', async () => {
    insertMessage(db, 'm1', 'c1', 'user', [
      { type: 'text', content: '渲染管线优化方案' },
    ])
    const r = await searchMessages({ query: '渲染管', db: db as Database.Database })
    expect(r.total).toBe(1)
  })

  it('returns conversationTitle and agentName via JOIN', async () => {
    insertMessage(db, 'm1', 'c2', 'agent', [
      { type: 'text', content: 'switching to opus model' },
    ], 'complete', 'a1')
    const r = await searchMessages({ query: 'opus', db: db as Database.Database })
    expect(r.hits[0].conversationTitle).toBe('Second conv')
    expect(r.hits[0].agentName).toBe('Claude')
    expect(r.hits[0].agentAvatar).toBe('🤖')
  })

  it('filters by conversationId', async () => {
    insertMessage(db, 'm1', 'c1', 'user', [{ type: 'text', content: 'shared term' }])
    insertMessage(db, 'm2', 'c2', 'user', [{ type: 'text', content: 'shared term' }])
    const r = await searchMessages({ query: 'shared', conversationId: 'c1', db: db as Database.Database })
    expect(r.total).toBe(1)
    expect(r.hits[0].conversationId).toBe('c1')
  })

  it('respects limit', async () => {
    for (let i = 0; i < 5; i++) {
      insertMessage(db, `m${i}`, 'c1', 'user', [{ type: 'text', content: 'bulk' }])
    }
    const r = await searchMessages({ query: 'bulk', limit: 2, db: db as Database.Database })
    expect(r.hits.length).toBe(2)
  })

  it('returns error code for invalid FTS5 syntax', async () => {
    const r = await searchMessages({ query: '(unclosed', db: db as Database.Database })
    expect(r.hits).toEqual([])
    expect(r.error).toBe('INVALID_QUERY')
  })

  it('LIKE fallback matches short Chinese query', async () => {
    insertMessage(db, 'm1', 'c1', 'user', [
      { type: 'text', content: '模型切换问题' },
    ])
    const r = await searchMessages({ query: '模型', fallback: 'like', db: db as Database.Database })
    expect(r.total).toBe(1)
    // LIKE path snippet marks the match, like the FTS path
    expect(r.hits[0].snippetHtml).toContain('<mark>')
  })

  it('LIKE fallback snippet renders parts as plain text, not raw JSON', async () => {
    insertMessage(db, 'm1', 'c1', 'user', [
      { type: 'text', content: '渲染管线优化方案需要重构' },
    ])
    const r = await searchMessages({ query: '渲染', fallback: 'like', db: db as Database.Database })
    expect(r.total).toBe(1)
    expect(r.hits[0].snippetHtml).toContain('<mark>渲染</mark>管线优化方案')
    expect(r.hits[0].snippetHtml).not.toContain('[{"type"')
    expect(r.hits[0].snippetHtml).not.toContain('"type":"text"')
  })

  it('LIKE fallback snippet shows tool_use / artifact_ref as structured labels', async () => {
    insertMessage(db, 'm1', 'c1', 'agent', [
      { type: 'thinking', content: '先想想渲染方案' },
      { type: 'tool_use', callId: 'call_1', toolName: 'bash', args: { command: 'pnpm test' } },
      { type: 'text', content: '渲染管线已重构完成' },
      { type: 'artifact_ref', artifactId: 'art_w4' },
    ], 'complete', 'a1')
    const r = await searchMessages({ query: '渲染', fallback: 'like', db: db as Database.Database })
    expect(r.total).toBe(1)
    const snippet = r.hits[0].snippetHtml
    expect(snippet).toContain('渲染管线已重构完成')
    expect(snippet).toContain('[调用 执行命令]')
    expect(snippet).toContain('pnpm test')
    expect(snippet).toContain('[产物: art_w4]')
    expect(snippet).not.toContain('[{"type"')
    expect(snippet).not.toContain('"toolName"')
  })

  it('LIKE fallback snippet for a tool_use-only message is a label, not JSON', async () => {
    insertMessage(db, 'm1', 'c1', 'agent', [
      { type: 'tool_use', callId: 'call_1', toolName: 'bash', args: { command: 'pnpm build' } },
    ], 'complete', 'a1')
    const r = await searchMessages({ query: 'bash', fallback: 'like', db: db as Database.Database })
    expect(r.total).toBe(1)
    expect(r.hits[0].snippetHtml).toContain('[调用 执行命令]')
    expect(r.hits[0].snippetHtml).not.toContain('[{"type"')
    expect(r.hits[0].snippetHtml).not.toContain('"toolName"')
  })

  it('LIKE fallback snippet escapes HTML in message text', async () => {
    insertMessage(db, 'm1', 'c1', 'user', [
      { type: 'text', content: '渲染<b>加粗</b>方案' },
    ])
    const r = await searchMessages({ query: '渲染', fallback: 'like', db: db as Database.Database })
    expect(r.hits[0].snippetHtml).toContain('&lt;b&gt;')
    expect(r.hits[0].snippetHtml).not.toContain('<b>加粗</b>')
  })

  it('LIKE fallback filters by conversationId', async () => {
    insertMessage(db, 'm1', 'c1', 'user', [{ type: 'text', content: '共同' }])
    insertMessage(db, 'm2', 'c2', 'user', [{ type: 'text', content: '共同' }])
    const r = await searchMessages({
      query: '共同', fallback: 'like', conversationId: 'c2', db: db as Database.Database,
    })
    expect(r.total).toBe(1)
    expect(r.hits[0].conversationId).toBe('c2')
  })

  it('defaultSqlite is a raw better-sqlite3 connection with .prepare()', async () => {
    // Regression test: production path must work without injecting db.
    // The Drizzle wrapper has .run()/.all() but NOT .prepare(); a previous
    // version used `as unknown as Database.Database` and crashed at runtime.
    const { sqlite } = await import('@/db/client')
    expect(typeof (sqlite as unknown as { prepare?: unknown }).prepare).toBe('function')
  })
})