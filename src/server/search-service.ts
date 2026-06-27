import type Database from 'better-sqlite3'

import { sqlite as defaultSqlite } from '@/db/client'

import type { SearchHit } from '@/shared/types'

export interface SearchOptions {
  query: string
  limit?: number
  offset?: number
  conversationId?: string
  role?: 'user' | 'agent'
  fallback?: 'like'
  /** Injected for testing. */
  db?: Database.Database
}

export interface SearchResult {
  hits: SearchHit[]
  total: number
  tookMs: number
  error?: 'INVALID_QUERY'
}

type HitRow = {
  messageId: string
  conversationId: string
  conversationTitle: string
  role: 'user' | 'agent' | 'system'
  agentId: string | null
  agentName: string | null
  agentAvatar: string | null
  createdAt: number
  snippetHtml: string
}

function rowToHit(row: HitRow): SearchHit {
  return { ...row }
}

/**
 * Conditional FTS5 quoting:
 * - ends with `*` → pass through (FTS5 prefix matching)
 * - contains `(` → pass through (let FTS5 raise a syntax error we surface as INVALID_QUERY)
 * - contains `-` → wrap in double quotes (otherwise FTS5 reads it as a column-restricted query)
 * - else → pass through
 */
function maybeQuote(s: string): string {
  if (s.endsWith('*')) return s
  if (s.includes('(')) return s
  if (s.includes('-')) return `"${s.replace(/"/g, '""')}"`
  return s
}

export async function searchMessages(opts: SearchOptions): Promise<SearchResult> {
  const trimmed = opts.query.trim()
  if (!trimmed) return { hits: [], total: 0, tookMs: 0 }

  const target = (opts.db ?? defaultSqlite)
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100)
  const offset = Math.max(opts.offset ?? 0, 0)

  if (opts.fallback === 'like') {
    return runLikePath(target, trimmed, limit, offset, opts)
  }
  return runFtsPath(target, trimmed, limit, offset, opts)
}

function runFtsPath(
  target: Database.Database,
  q: string,
  limit: number,
  offset: number,
  opts: SearchOptions,
): SearchResult {
  const start = Date.now()
  const ftsQuery = maybeQuote(q)
  const stmt = target.prepare(`
    SELECT
      m.id AS messageId,
      m.conversation_id AS conversationId,
      m.role AS role,
      m.agent_id AS agentId,
      m.created_at AS createdAt,
      snippet(messages_fts, 0, '<mark>', '</mark>', '…', 12) AS snippetHtml,
      c.title AS conversationTitle,
      a.name AS agentName,
      a.avatar AS agentAvatar
    FROM messages_fts
    JOIN messages m      ON m.rowid = messages_fts.rowid
    JOIN conversations c ON c.id = m.conversation_id
    LEFT JOIN agents a   ON a.id = m.agent_id
    WHERE messages_fts MATCH ?
      AND (? IS NULL OR m.conversation_id = ?)
      AND (? IS NULL OR m.role = ?)
    ORDER BY bm25(messages_fts)
    LIMIT ? OFFSET ?
  `)
  let rows: HitRow[]
  try {
    rows = stmt.all(
      ftsQuery,
      opts.conversationId ?? null, opts.conversationId ?? null,
      opts.role ?? null, opts.role ?? null,
      limit, offset,
    ) as HitRow[]
  } catch (err) {
       if (err instanceof Error && (/(?:fts5|SQLITE_ERROR)/.test(err.message))) {
      return { hits: [], total: 0, tookMs: 0, error: 'INVALID_QUERY' }
    }
    throw err
  }

  let total = rows.length
  if (rows.length === limit) {
    const countRow = target.prepare(`
      SELECT COUNT(*) AS n FROM messages_fts
      JOIN messages m ON m.rowid = messages_fts.rowid
      WHERE messages_fts MATCH ?
        AND (? IS NULL OR m.conversation_id = ?)
        AND (? IS NULL OR m.role = ?)
    `).get(
      ftsQuery,
      opts.conversationId ?? null, opts.conversationId ?? null,
      opts.role ?? null, opts.role ?? null,
    ) as { n: number }
    total = countRow.n
  }

  return { hits: rows.map(rowToHit), total, tookMs: Date.now() - start }
}

function runLikePath(
  target: Database.Database,
  q: string,
  limit: number,
  offset: number,
  opts: SearchOptions,
): SearchResult {
  const start = Date.now()
  const rows = target.prepare(`
    SELECT
      m.id AS messageId,
      m.conversation_id AS conversationId,
      m.role AS role,
      m.agent_id AS agentId,
      m.created_at AS createdAt,
      substr(m.parts, max(1, instr(m.parts, ?) - 30), 80) AS snippetHtml,
      c.title AS conversationTitle,
      a.name AS agentName,
      a.avatar AS agentAvatar
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    LEFT JOIN agents a   ON a.id = m.agent_id
    WHERE m.parts LIKE '%' || ? || '%'
      AND (? IS NULL OR m.conversation_id = ?)
      AND (? IS NULL OR m.role = ?)
    ORDER BY m.created_at DESC
    LIMIT ? OFFSET ?
  `).all(
    q, q,
    opts.conversationId ?? null, opts.conversationId ?? null,
    opts.role ?? null, opts.role ?? null,
    limit, offset,
  ) as HitRow[]

  return { hits: rows.map(rowToHit), total: rows.length, tookMs: Date.now() - start }
}

export async function countSearchMatches(query: string): Promise<number> {
  const r = await searchMessages({ query })
  return r.total
}