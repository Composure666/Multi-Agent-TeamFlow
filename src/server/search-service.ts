import type Database from 'better-sqlite3'

import { sqlite as defaultSqlite } from '@/db/client'
import { getToolDisplayName } from '@/lib/tool-display'

import type { MessagePart, SearchHit } from '@/shared/types'

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
  /** LIKE path only: raw parts JSON, snippet is built from it in JS. */
  partsJson?: string
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
export function maybeQuote(s: string): string {
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
  // 匹配条件仍是 m.parts LIKE（查询逻辑不动）；snippet 不再从 SQL 里直接切
  // parts JSON（旧写法 substr(m.parts, instr-30, 80) 会把
  // [{"type":"text","content":...}] 原文吐给前端），改取回 parts 在 JS 里按
  // parts 渲染口径转纯文本后再取命中窗口。
  const rows = target.prepare(`
    SELECT
      m.id AS messageId,
      m.conversation_id AS conversationId,
      m.role AS role,
      m.agent_id AS agentId,
      m.created_at AS createdAt,
      m.parts AS partsJson,
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
    q,
    opts.conversationId ?? null, opts.conversationId ?? null,
    opts.role ?? null, opts.role ?? null,
    limit, offset,
  ) as HitRow[]

  const hits = rows.map((row) => {
    const { partsJson, ...rest } = row
    return { ...rest, snippetHtml: buildLikeSnippet(partsJson, q) }
  })
  return { hits, total: rows.length, tookMs: Date.now() - start }
}

/**
 * LIKE 兜底路径的 snippet：把 parts 按消息渲染口径转成一行纯文本
 *（spec 03 的历史拼接映射 + message-parts.tsx 的展示口径：text 取 content，
 * tool_use 用 ToolUsePart 同款展示名、artifact_ref 用 [产物: id]），再取命中
 * 前后窗口并标 <mark>。命中只落在 JSON 字段名/工具名原文里时（如搜 "bash"
 * 只匹配到 "toolName":"bash"），窗口从文本开头取、不标 mark——行内仍是正常文本。
 */
function buildLikeSnippet(partsJson: string | undefined, query: string): string {
  let plain = ''
  if (partsJson) {
    try {
      const parts = JSON.parse(partsJson) as MessagePart[]
      if (Array.isArray(parts)) plain = partsToSnippetText(parts)
    } catch {
      plain = ''
    }
  }
  if (!plain) return ''
  // 旧 SQL 窗口：命中前 30 字、共 80 字；保持同款窗口，只换成纯文本。
  const idx = plain.toLowerCase().indexOf(query.toLowerCase())
  const start = idx === -1 ? 0 : Math.max(0, idx - 30)
  const end = idx === -1
    ? Math.min(plain.length, 80)
    : Math.min(plain.length, idx + query.length + 50)
  const windowText = plain.slice(start, end)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < plain.length ? '…' : ''
  if (idx === -1) return prefix + escapeHtml(windowText) + suffix
  const rel = idx - start
  return (
    prefix +
    escapeHtml(windowText.slice(0, rel)) +
    '<mark>' + escapeHtml(windowText.slice(rel, rel + query.length)) + '</mark>' +
    escapeHtml(windowText.slice(rel + query.length)) +
    suffix
  )
}

function partsToSnippetText(parts: MessagePart[]): string {
  const chunks: string[] = []
  for (const p of parts) {
    switch (p.type) {
      case 'text':
      case 'thinking':
      case 'code':
        if (p.content) chunks.push(p.content)
        break
      case 'tool_use': {
        // ToolUsePart 同款展示名；bash 命令像终端块一样单列（只取字符串 command，不 dump args JSON）
        const label = `[调用 ${getToolDisplayName(p.toolName)}]`
        const command = extractBashCommand(p.args)
        chunks.push(command ? `${label} ${command}` : label)
        break
      }
      case 'tool_result': {
        // PartList 把 tool_result 合并进 ToolUsePart；snippet 里只留可读的字符串结果
        const text = toolResultText(p.result)
        if (text) chunks.push(text)
        break
      }
      case 'artifact_ref':
        chunks.push(`[产物: ${p.artifactId}]`)
        break
      case 'deploy_status':
        chunks.push(
          p.deployment.status === 'ready'
            ? `[部署预览：${p.deployment.title}]`
            : `[部署失败：${p.deployment.error ?? p.deployment.title}]`,
        )
        break
      case 'deploy_candidates':
        chunks.push(`[部署候选：${p.candidates.map((c) => c.title).join('、')}]`)
        break
      case 'image_attachment':
        chunks.push(`[图片附件：${p.fileName}]`)
        break
      case 'file_attachment':
        chunks.push(`[文件附件：${p.fileName}]`)
        break
    }
  }
  if (chunks.length === 0 && parts.some((p) => p.type === 'tool_result')) {
    chunks.push('[工具结果]')
  }
  return chunks.join(' ').replace(/\s+/g, ' ').trim()
}

function extractBashCommand(args: unknown): string | null {
  if (args === null || typeof args !== 'object' || Array.isArray(args)) return null
  const command = (args as Record<string, unknown>).command
  if (typeof command !== 'string' || !command.trim()) return null
  return command.length > 80 ? `${command.slice(0, 80)}…` : command
}

function toolResultText(result: unknown): string | null {
  if (typeof result === 'string') return result
  if (result !== null && typeof result === 'object' && !Array.isArray(result)) {
    const output = (result as Record<string, unknown>).output
    if (typeof output === 'string') return output
  }
  return null
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export async function countSearchMatches(query: string): Promise<number> {
  const r = await searchMessages({ query })
  return r.total
}