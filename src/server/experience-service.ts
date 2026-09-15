/**
 * Experience Assets（Spec 20）服务层。
 *
 * 职责：
 * - experiences 表 CRUD（跨会话、per-agent、可停用、可统计）
 * - buildExperienceBlock：按任务关键词检索命中经验并构建有界 `<relevant_experiences>` 注入块
 * - extractFromRun：run 收尾后自动反思提炼经验（LLM 输出 zod 校验，失败静默）
 *
 * 边界：经验不进入 buildHistoryFor / PromptContextSnapshot（Spec 13）；不写入 workspace 文件；
 * 不新增 StreamEvent；注入痕迹由 AgentRunner 写进 debug snapshot。
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import Anthropic from '@anthropic-ai/sdk'
import { and, desc, eq, gte, inArray, like, or, sql, type SQL } from 'drizzle-orm'
import OpenAI from 'openai'
import { z } from 'zod'

import { db, schema, DATA_DIR } from '@/db/client'
import { sqlite as defaultSqlite } from '@/db/client'
import type {
  AgentRow,
  ExperienceAttachmentRow,
  ExperienceInsert,
  ExperienceKind,
  ExperienceRevisionInsert,
  ExperienceRevisionRow,
  ExperienceRow,
  MessageRow,
} from '@/db/schema'
import { newExperienceFileId, newExperienceId, newExperienceRevisionId } from '@/server/ids'
import { sanitizeExperienceHtml } from '@/lib/sanitize-html'
import { maybeQuote } from '@/server/search-service'
import { resolveCustomProviderClientConfig } from '@/server/adapters/custom-provider-client'
import {
  getEffectiveAnthropicBaseUrl,
  getEffectiveApiKey,
  getAppSettings,
} from '@/server/settings-service'
import type { MessagePart, ModelProvider } from '@/shared/types'

export const EXPERIENCE_PROMPT_MAX_ENTRIES = 6
export const EXPERIENCE_PROMPT_TOKEN_BUDGET = 1500

const MAX_EXPERIENCE_TITLE_CHARS = 80
const MAX_EXPERIENCE_TRIGGER_CHARS = 200
const MAX_EXPERIENCE_CONTENT_CHARS = 8000
const MAX_EXPERIENCE_TAGS = 10
const MAX_TAG_CHARS = 32
const MAX_ACTIVE_EXPERIENCES_PER_AGENT = 60
const MAX_EXTRACTION_INPUT_CHARS = 60000
const MAX_RENDERED_MESSAGE_CHARS = 4000
/** 一次任务（顶层 run + 全部子 run）最多沉淀的经验条数。 */
const MAX_EXPERIENCES_PER_TASK = 3
/** 一次运行最多复盘修订多少条已注入的经验。 */
const MAX_REVIEWS_PER_TASK = 3
const MAX_REVIEW_REASON_CHARS = 200
/** 标题关键词 Jaccard 相似度达到该阈值即视为同一条教训的复述，不再重复落库。 */
const NEAR_DUPLICATE_KEYWORD_OVERLAP = 0.62
const EXTRACTION_MAX_TOKENS = 1200
/**
 * 同一会话内两次自动复盘的最小间隔。
 *
 * 复盘（经验提炼）要回放整棵 run 树，实测单次输入可达十万 token 级，还要跟用户下一条
 * 消息抢同一个 provider 的吞吐 —— 连续几句简单对话就触发同样多次全量提炼，用户看到的
 * 就是「一个简单任务都在不断复盘、越跑越久」。几分钟内的连续 run 只复盘最后一次即可，
 * 经验本身也不会因为省掉中间几次而变差。
 */
const EXTRACTION_COOLDOWN_MS = 3 * 60 * 1000
const TOKEN_TO_CHAR_RATIO = 4
const COLD_ASSET_DAYS = 30
const EXPERIENCE_FILE_MAX_SIZE = 20 * 1024 * 1024 // 单文件上限 20MB
const EXPERIENCE_FILE_DIR = 'experience-files'

const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1'
const DEFAULT_VOLCANO_ARK_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3'
const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-5'
const DEFAULT_DEEPSEEK_MODEL = 'deepseek-chat'

const STOP_WORDS: ReadonlySet<string> = new Set([
  '的', '了', '和', '是', '在', '我', '你', '他', '她', '它', '们', '请', '帮', '下',
  '个', '这', '那', '用', '把', '要', '能', '会', '对', '与', '及', '并', '或', '有', '就',
  'the', 'a', 'an', 'and', 'of', 'for', 'with', 'in', 'on', 'to', 'me', 'you', 'is', 'are',
])

// ─── 类型 ────────────────────────────────────────────────────

export interface ListExperiencesOptions {
  agentId?: string | null
  kind?: ExperienceKind | null
  active?: boolean | null
  source?: 'auto' | 'manual' | null
  q?: string | null
}

export interface CreateExperienceArgs {
  kind?: ExperienceKind
  agentId?: string | null
  scope?: 'agent' | 'global'
  conversationId?: string | null
  runId?: string | null
  title: string
  trigger: string
  content: string
  tags?: string[]
  active?: boolean
  source?: 'auto' | 'manual'
}

/** 修订留痕元信息：谁改的、因为什么、来自哪个 run。 */
export interface ExperienceRevisionMeta {
  source: 'auto' | 'manual'
  kind: 'refine' | 'confirm' | 'retire' | 'restore'
  runId?: string | null
  note?: string | null
}

export interface ExperiencePatch {
  kind?: ExperienceKind
  agentId?: string | null
  title?: string
  trigger?: string
  content?: string
  tags?: string[]
  active?: boolean
}

export interface BuildExperienceBlockOptions {
  maxEntries?: number
  tokenBudget?: number
  runId?: string
}

export interface ExperienceBlockResult {
  block: string | null
  injectedIds: string[]
}

export interface ExperienceStats {
  total: number
  active: number
  drafts: number
  frequentlyUsed: number
  cold: number
  totalUsage: number
  /** 近 7 天每天新增经验数 */
  weeklyNew: number[]
  /** 近 7 天每天注入使用次数 */
  weeklyUsage: number[]
}

export interface ExtractionCandidate {
  kind: ExperienceKind
  title: string
  trigger: string
  content: string
  tags: string[]
}

const ExtractionCandidateSchema = z
  .object({
    kind: z.enum(['experience', 'reflection', 'profile_fact']),
    title: z.string().min(1).max(MAX_EXPERIENCE_TITLE_CHARS),
    trigger: z.string().min(1).max(MAX_EXPERIENCE_TRIGGER_CHARS),
    content: z.string().min(1).max(MAX_EXPERIENCE_CONTENT_CHARS),
    tags: z.array(z.string().max(MAX_TAG_CHARS)).max(MAX_EXPERIENCE_TAGS).default([]),
  })
  .strict()

export type ExperienceReviewVerdict = 'confirmed' | 'refine' | 'retire'

/**
 * 已注入经验的复盘结论 —— 迭代闭环的输入。
 * id 必须来自本次真的注入过的经验集合，服务端会白名单过滤（防 LLM 幻觉改写无关经验）。
 */
export interface ExperienceReviewItem {
  id: string
  verdict: ExperienceReviewVerdict
  reason: string
  patch?: {
    title?: string
    trigger?: string
    content?: string
    tags?: string[]
  }
}

export interface ExperienceReviewOutcome {
  experienceId: string
  verdict: ExperienceReviewVerdict
  applied: boolean
  note: string
}

const ReviewPatchSchema = z
  .object({
    title: z.string().min(1).max(MAX_EXPERIENCE_TITLE_CHARS).optional(),
    trigger: z.string().min(1).max(MAX_EXPERIENCE_TRIGGER_CHARS).optional(),
    content: z.string().min(1).max(MAX_EXPERIENCE_CONTENT_CHARS).optional(),
    tags: z.array(z.string().max(MAX_TAG_CHARS)).max(MAX_EXPERIENCE_TAGS).optional(),
  })
  .strict()

const ExperienceReviewSchema = z
  .object({
    id: z.string().min(1),
    verdict: z.enum(['confirmed', 'refine', 'retire']),
    reason: z.string().max(MAX_REVIEW_REASON_CHARS).default(''),
    patch: ReviewPatchSchema.optional(),
  })
  .strict()

interface ExperienceHitRow {
  id: string
  kind: string
  scope: string
  title: string
  trigger: string
  content: string
  tags: string
  agentId: string | null
}

// ─── CRUD ────────────────────────────────────────────────────

export async function listExperiences(opts: ListExperiencesOptions = {}): Promise<ExperienceRow[]> {
  const conditions = []
  if (opts.agentId) conditions.push(eq(schema.experiences.agentId, opts.agentId))
  if (opts.kind) conditions.push(eq(schema.experiences.kind, opts.kind))
  if (opts.active !== null && opts.active !== undefined) {
    conditions.push(eq(schema.experiences.active, opts.active))
  }
  if (opts.source) conditions.push(eq(schema.experiences.source, opts.source))
  let where = conditions.length > 0 ? and(...conditions) : undefined

  if (opts.q && opts.q.trim()) {
    const kw = `%${opts.q.trim()}%`
    const likeClause = or(
      like(schema.experiences.title, kw),
      like(schema.experiences.trigger, kw),
      like(schema.experiences.content, kw),
    )
    where = where ? and(where, likeClause) : likeClause
  }

  return db.query.experiences.findMany({
    where,
    orderBy: [desc(schema.experiences.updatedAt)],
  })
}

export async function createExperience(args: CreateExperienceArgs): Promise<ExperienceRow> {
  const title = normalizeTitle(args.title)
  const trigger = normalizeTrigger(args.trigger)
  const content = normalizeContent(args.content)
  const agentId = args.agentId ?? null
  const scope = args.scope ?? (agentId ? 'agent' : 'global')

  // 单 agent 活跃经验超限时强制转草稿（active=false）落库，交由用户校对；未超限时尊重调用方选择。
  let active = args.active ?? true
  if (agentId && scope === 'agent') {
    const count = await db.query.experiences.findMany({
      where: and(eq(schema.experiences.agentId, agentId), eq(schema.experiences.active, true)),
      columns: { id: true },
    })
    if (count.length >= MAX_ACTIVE_EXPERIENCES_PER_AGENT) active = false
  }

  const now = Date.now()
  const row: ExperienceInsert = {
    id: newExperienceId(),
    kind: args.kind ?? 'experience',
    agentId,
    scope,
    conversationId: args.conversationId ?? null,
    runId: args.runId ?? null,
    title,
    trigger,
    content,
    tags: args.tags ?? [],
    source: args.source ?? 'auto',
    active,
    usageCount: 0,
    lastUsedAt: null,
    createdAt: now,
    updatedAt: now,
  }
  await db.insert(schema.experiences).values(row)
  return row as ExperienceRow
}

/**
 * 更新经验。
 *
 * 传 `revisionMeta` 时会在写库前把**改前**的值整条存进 experience_revisions。
 * 迭代闭环的回滚依据完全依赖这份快照，所以凡是会改变注入内容的入口都必须传 ——
 * 否则用户点「回滚」时拿到的会是上一次透明修订的结果，历史就断了。
 */
export async function updateExperience(
  id: string,
  patch: ExperiencePatch,
  revisionMeta?: ExperienceRevisionMeta,
): Promise<ExperienceRow> {
  const existing = await db.query.experiences.findFirst({ where: eq(schema.experiences.id, id) })
  if (!existing) throw new Error(`Experience not found: ${id}`)

  const next = {
    kind: patch.kind === undefined ? existing.kind : patch.kind,
    agentId: patch.agentId === undefined ? existing.agentId : patch.agentId,
    scope: patch.agentId === undefined ? existing.scope : patch.agentId ? 'agent' : 'global',
    title: patch.title === undefined ? existing.title : normalizeTitle(patch.title),
    trigger: patch.trigger === undefined ? existing.trigger : normalizeTrigger(patch.trigger),
    content: patch.content === undefined ? existing.content : normalizeContent(patch.content),
    tags: patch.tags ?? existing.tags,
    active: patch.active ?? existing.active,
    updatedAt: Date.now(),
  }

  if (revisionMeta) await recordExperienceRevision(existing, revisionMeta)

  await db
    .update(schema.experiences)
    .set(next)
    .where(eq(schema.experiences.id, id))
  return { ...existing, ...next }
}

/** 落盘改前快照。失败只 warn —— 留痕失败不能阻断主流程，但必须看得见。 */
async function recordExperienceRevision(
  before: Pick<ExperienceRow, 'id' | 'title' | 'trigger' | 'content' | 'tags'>,
  meta: ExperienceRevisionMeta,
): Promise<void> {
  const row: ExperienceRevisionInsert = {
    id: newExperienceRevisionId(),
    experienceId: before.id,
    runId: meta.runId ?? null,
    source: meta.source,
    kind: meta.kind,
    title: before.title,
    trigger: before.trigger,
    content: before.content,
    tags: before.tags ?? [],
    note: meta.note ?? null,
    createdAt: Date.now(),
  }
  try {
    await db.insert(schema.experienceRevisions).values(row)
  } catch (err) {
    console.warn('[experience-service] record revision failed', err)
  }
}

export async function deleteExperience(id: string): Promise<void> {
  await db.delete(schema.experiences).where(eq(schema.experiences.id, id))
}

export async function getExperienceStats(): Promise<ExperienceStats> {
  const now = Date.now()
  const coldCutoff = now - COLD_ASSET_DAYS * 24 * 60 * 60 * 1000
  const [total, active, drafts, frequentlyUsed, cold] = await Promise.all([
    countExperiences(),
    countExperiences(eq(schema.experiences.active, true)),
    countExperiences(eq(schema.experiences.active, false)),
    countExperiences(
      and(eq(schema.experiences.active, true), gte(schema.experiences.usageCount, 5)),
    ),
    countExperiences(
      and(
        eq(schema.experiences.active, true),
        or(
          sql`${schema.experiences.lastUsedAt} IS NULL`,
          sql`${schema.experiences.lastUsedAt} < ${coldCutoff}`,
        ),
      ),
    ),
  ])
  const usageRows = await db
    .select({ u: schema.experiences.usageCount })
    .from(schema.experiences)
  const totalUsage = usageRows.reduce((sum, r) => sum + (r.u ?? 0), 0)
  // 近 7 天趋势（从 6 天前到今天）
  const dayMs = 24 * 60 * 60 * 1000
  const weeklyNew: number[] = []
  const weeklyUsage: number[] = []
  for (let i = 6; i >= 0; i--) {
    const dayStart = now - i * dayMs
    const dayEnd = dayStart + dayMs
    const newRows = await db
      .select({ n: sql<number>`count(*)` })
      .from(schema.experiences)
      .where(and(gte(schema.experiences.createdAt, dayStart), sql`${schema.experiences.createdAt} < ${dayEnd}`))
    weeklyNew.push(Number(newRows[0]?.n ?? 0))
    const usageRows = await db
      .select({ n: sql<number>`count(*)` })
      .from(schema.experienceUsages)
      .where(and(gte(schema.experienceUsages.createdAt, dayStart), sql`${schema.experienceUsages.createdAt} < ${dayEnd}`))
    weeklyUsage.push(Number(usageRows[0]?.n ?? 0))
  }
  return { total, active, drafts, frequentlyUsed, cold, totalUsage, weeklyNew, weeklyUsage }
}

async function countExperiences(where?: SQL | undefined): Promise<number> {
  const builder = db
    .select({ n: sql<number>`count(*)` })
    .from(schema.experiences)
  const rows = where ? await builder.where(where) : await builder
  return Number(rows[0]?.n ?? 0)
}

export interface ExperienceUsageRecord {
  id: string
  experienceId: string
  runId: string
  agentId: string | null
  createdAt: number
}

export async function getExperienceUsage(experienceId: string, limit = 20): Promise<ExperienceUsageRecord[]> {
  const rows = await db
    .select()
    .from(schema.experienceUsages)
    .where(eq(schema.experienceUsages.experienceId, experienceId))
    .orderBy(desc(schema.experienceUsages.createdAt))
    .limit(limit)
  return rows
}

// ─── 修订历史（迭代闭环的可追溯性）───────────────────────────

export interface ExperienceRevisionRecord {
  id: string
  experienceId: string
  runId: string | null
  source: 'auto' | 'manual'
  kind: 'refine' | 'confirm' | 'retire' | 'restore'
  title: string
  trigger: string
  content: string
  tags: string[]
  note: string | null
  createdAt: number
}

function toRevisionRecord(row: ExperienceRevisionRow): ExperienceRevisionRecord {
  return {
    id: row.id,
    experienceId: row.experienceId,
    runId: row.runId,
    source: row.source,
    kind: row.kind,
    title: row.title,
    trigger: row.trigger,
    content: row.content,
    tags: Array.isArray(row.tags) ? row.tags : [],
    note: row.note,
    createdAt: row.createdAt,
  }
}

export async function listExperienceRevisions(
  experienceId: string,
  limit = 30,
): Promise<ExperienceRevisionRecord[]> {
  const rows = await db
    .select()
    .from(schema.experienceRevisions)
    .where(eq(schema.experienceRevisions.experienceId, experienceId))
    .orderBy(desc(schema.experienceRevisions.createdAt))
    .limit(limit)
  return rows.map(toRevisionRecord)
}

/**
 * 回滚到某个快照：先把「当前这一版」存成 kind='restore' 的新快照，再用目标快照覆盖。
 * 这样回滚本身也是一次可追溯的修订，用户可以一路回滚回去。
 */
export async function rollbackExperienceRevision(
  experienceId: string,
  revisionId: string,
): Promise<ExperienceRow> {
  const target = await db.query.experienceRevisions.findFirst({
    where: and(
      eq(schema.experienceRevisions.id, revisionId),
      eq(schema.experienceRevisions.experienceId, experienceId),
    ),
  })
  if (!target) throw new Error(`Experience revision not found: ${revisionId}`)
  return updateExperience(
    experienceId,
    { title: target.title, trigger: target.trigger, content: target.content, tags: target.tags },
    { source: 'manual', kind: 'restore', note: `回滚到 ${formatRevisionStamp(target.createdAt)} 的版本` },
  )
}

/** 列表页用的一次性批量计数：每条经验累计被修订过几次（含自动迭代）。 */
export async function getRevisionCounts(experienceIds: readonly string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  const ids = [...new Set(experienceIds)].filter(Boolean)
  if (ids.length === 0) return out
  try {
    const rows = await db
      .select({ id: schema.experienceRevisions.experienceId, n: sql<number>`count(*)` })
      .from(schema.experienceRevisions)
      .where(inArray(schema.experienceRevisions.experienceId, ids))
      .groupBy(schema.experienceRevisions.experienceId)
    for (const row of rows) out[row.id] = Number(row.n ?? 0)
  } catch (err) {
    console.warn('[experience-service] getRevisionCounts failed', err)
  }
  return out
}

function formatRevisionStamp(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ─── Prompt 注入块 ───────────────────────────────────────────

export async function buildExperienceBlock(
  agentId: string,
  taskText: string,
  options: BuildExperienceBlockOptions = {},
): Promise<ExperienceBlockResult> {
  const maxEntries = options.maxEntries ?? EXPERIENCE_PROMPT_MAX_ENTRIES
  const charBudget = (options.tokenBudget ?? EXPERIENCE_PROMPT_TOKEN_BUDGET) * TOKEN_TO_CHAR_RATIO
  if (maxEntries <= 0 || charBudget <= 0 || !taskText.trim()) {
    return { block: null, injectedIds: [] }
  }

  const keywords = tokenizeKeywords(taskText)
  if (keywords.length === 0) return { block: null, injectedIds: [] }

  let rows: ExperienceHitRow[] = []
  try {
    rows = runFtsQuery(keywords, agentId, maxEntries * 4)
  } catch (err) {
    if (err instanceof Error && /(?:fts5|SQLITE_ERROR|no such table)/.test(err.message)) {
      // FTS 未迁移 / 查询语法错 → 退化为 LIKE，再失败则静默无块
      rows = runLikeQuery(keywords, agentId, maxEntries * 4)
    } else {
      throw err
    }
  }
  if (rows.length === 0 && keywords.some((k) => k.length < 3)) {
    // trigram 分词器对 <3 字符的中文关键词不索引，短词时用 LIKE 兜底提升召回
    rows = runLikeQuery(keywords, agentId, maxEntries * 4)
  }

  const picked = clipByBudget(rows, charBudget, maxEntries)
  if (picked.length === 0) return { block: null, injectedIds: [] }

  const entries = picked.map((r) =>
    [
      `  <experience id="${escapeXml(r.id)}" kind="${escapeXml(r.kind)}" title="${escapeXml(r.title)}" trigger="${escapeXml(r.trigger)}">`,
      `    ${escapeXml(r.content)}`,
      '  </experience>',
    ].join('\n'),
  )
  const block = ['<relevant_experiences>', ...entries, '</relevant_experiences>'].join('\n')

  void bumpExperienceUsage(picked.map((r) => r.id), options.runId, agentId)

  return { block, injectedIds: picked.map((r) => r.id) }
}

function runFtsQuery(keywords: string[], agentId: string, limit: number): ExperienceHitRow[] {
  const ftsQuery = keywords.map((k) => maybeQuote(k)).join(' OR ')
  return defaultSqlite
    .prepare(
      `
      SELECT e.id, e.kind, e.scope, e.title, e.trigger, e.content, e.tags, e.agent_id AS agentId
      FROM experiences_fts
      JOIN experiences e ON e.rowid = experiences_fts.rowid
      WHERE experiences_fts MATCH ?
        AND e.active = 1
        AND (e.agent_id = ? OR e.scope = 'global')
      ORDER BY bm25(experiences_fts)
      LIMIT ?
      `,
    )
    .all(ftsQuery, agentId, limit) as ExperienceHitRow[]
}

function runLikeQuery(keywords: string[], agentId: string, limit: number): ExperienceHitRow[] {
  const clauses: string[] = []
  const params: string[] = []
  for (const kw of keywords) {
    const like = `%${escapeLikePattern(kw)}%`
    clauses.push('(e.title LIKE ? ESCAPE \'\\\' OR e.trigger LIKE ? ESCAPE \'\\\' OR e.content LIKE ? ESCAPE \'\\\')')
    params.push(like, like, like)
  }
  return defaultSqlite
    .prepare(
      `
      SELECT e.id, e.kind, e.scope, e.title, e.trigger, e.content, e.tags, e.agent_id AS agentId
      FROM experiences e
      WHERE e.active = 1
        AND (e.agent_id = ? OR e.scope = 'global')
        AND (${clauses.join(' OR ')})
      ORDER BY e.usage_count DESC, e.updated_at DESC
      LIMIT ?
      `,
    )
    .all(agentId, ...params, limit) as ExperienceHitRow[]
}

export function clipByBudget(
  rows: ExperienceHitRow[],
  charBudget: number,
  maxEntries: number,
): ExperienceHitRow[] {
  let used = 0
  const out: ExperienceHitRow[] = []
  for (const row of rows) {
    if (out.length >= maxEntries) break
    const content = row.content.trim()
    if (!content) continue
    if (content.length > charBudget - used) break // 放不下整条则停止（行按相关性排序）
    used += content.length
    out.push(row)
  }
  return out
}

async function bumpExperienceUsage(ids: string[], runId?: string, agentId?: string): Promise<void> {
  if (ids.length === 0) return
  const now = Date.now()
  for (const id of ids) {
    await db
      .update(schema.experiences)
      .set({ usageCount: sql`${schema.experiences.usageCount} + 1`, lastUsedAt: now })
      .where(eq(schema.experiences.id, id))
    if (runId) {
      await db.insert(schema.experienceUsages).values({
        id: `expu_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
        experienceId: id,
        runId,
        agentId,
        createdAt: now,
      })
    }
  }
}

// ─── 自动反思提取 ────────────────────────────────────────────

/**
 * run 收尾后异步调用（fire-and-forget）。任何失败只 warn，不 throw。
 * 一次用户任务通常由 orchestrator 顶层 run + 若干子 run 组成。早期实现对每个 run 各自反思，
 * 结果重试越多经验越膨胀 —— 实测「小米手环信息图」一次任务沉淀 39 条，其中「PowerShell 用
 * 单行命令」这同一条教训重复了 6 次。现在默认只对顶层 run 提炼一次，并把整棵 run 树的消息
 * 合并喂给提炼器；子 run 单独反思需显式 force（手动反思 API）。
 */
export async function extractFromRun(
  runId: string,
  opts: { force?: boolean } = {},
): Promise<ExperienceRow[]> {
  try {
    const settings = await getAppSettings()
    if (settings.experienceExtractionEnabled === false) return []

    const run = await db.query.agentRuns.findFirst({ where: eq(schema.agentRuns.id, runId) })
    if (!run || run.status !== 'complete') return []

    if (run.parentRunId && !opts.force) return []

    // 冷却：手动触发（force）不受限，自动复盘按会话节流
    if (
      !opts.force &&
      Date.now() - (lastExtractionAtByConversation.get(run.conversationId) ?? 0) < EXTRACTION_COOLDOWN_MS
    ) {
      return []
    }

    const agent = await db.query.agents.findFirst({ where: eq(schema.agents.id, run.agentId) })
    if (!agent || agent.adapterName === 'mock') return []

    const rootRunId = run.parentRunId ?? run.id
    const gate = await computeExtractionGate(rootRunId)
    if (!gate.passes) return []

    const runTreeIds = await collectRunTreeIds(rootRunId)
    const messages = await loadRunMessages(runTreeIds)
    const rendered = await renderRunForExtraction(messages)
    if (!rendered.text.trim()) return []

    const choices = await chooseExtractionModels(agent)
    if (choices.length === 0) return []

    // 时间戳记在「真要花 token 了」这一刻，而不是入口：否则一次因 gate 不通过而提前
    // 返回的 run 也会把下一次复盘一起挡掉。
    if (!opts.force) lastExtractionAtByConversation.set(run.conversationId, Date.now())

    // 本次注入过的经验要一并喂回去：让 LLM 给出「用上了 / 要修订 / 过时了」的结论，
    // 形成 注入 → 执行 → 复盘 → 改写 → 下次更好注入 的闭环。
    const injected = await loadInjectedExperiences(runTreeIds)
    const prompt = buildExtractionPrompt(rendered, injected)
    // 同一时刻只允许一次提炼在跑：多个会话同时收尾时，并发提炼只会互相拖慢
    const raw = await runExtractionExclusive(() => extractWithFallback(choices, prompt))
    if (!raw.trim()) return []

    const reviews = parseExtractionReviews(raw)
    if (injected.length > 0 && reviews.length > 0) {
      const outcomes = await applyExperienceReviews(reviews, injected, { runId: rootRunId })
      const appliedCount = outcomes.filter((item) => item.applied).length
      if (outcomes.length > 0) {
        console.info(
          `[experience-service] ${rootRunId} reviewed ${outcomes.length} injected experiences, applied ${appliedCount}`,
        )
      }
    }

    const candidates = parseExtractionOutput(raw)
    if (candidates.length === 0) return []

    // 去重基线：该 agent 已有的活跃经验；落库成功后即时并入，实现批次内互相去重。
    const existingTitles = await loadActiveExperienceTitles(agent.id)
    const saved: ExperienceRow[] = []
    for (const candidate of candidates) {
      if (saved.length >= MAX_EXPERIENCES_PER_TASK) break
      if (isDuplicate(candidate, existingTitles)) continue
      try {
        const row = await createExperience({
          kind: candidate.kind,
          agentId: run.agentId,
          conversationId: run.conversationId,
          runId: rootRunId,
          title: candidate.title,
          trigger: candidate.trigger,
          content: candidate.content,
          tags: candidate.tags,
          source: 'auto',
        })
        saved.push(row)
        existingTitles.push(row.title)
      } catch (err) {
        console.warn('[experience-service] persist candidate failed; skipping', err)
      }
    }
    return saved
  } catch (err) {
    console.warn('[experience-service] extractFromRun failed', err)
    return []
  }
}

/** 会话 → 上次自动复盘的起始时刻（内存态即可：进程重启后重跑一次无副作用）。 */
const lastExtractionAtByConversation = new Map<string, number>()

/** 提炼串行队列：保证同一时刻只有一个提炼在跟执行期抢 provider。 */
let extractionQueue: Promise<unknown> = Promise.resolve()

function runExtractionExclusive<T>(task: () => Promise<T>): Promise<T> {
  const next = extractionQueue.then(task, task)
  extractionQueue = next.catch(() => {})
  return next
}

interface ExtractionGate {
  passes: boolean
  toolCount: number
  artifactProduced: boolean
  hasSubRuns: boolean
}

async function computeExtractionGate(rootRunId: string): Promise<ExtractionGate> {
  const runIds = await collectRunTreeIds(rootRunId)
  const messages = await loadRunMessages(runIds)
  let toolCount = 0
  let artifactProduced = false
  for (const m of messages) {
    for (const p of m.parts) {
      if (p.type === 'tool_use') toolCount += 1
      if (p.type === 'artifact_ref') artifactProduced = true
    }
  }
  const hasSubRuns = runIds.length > 1
  return { passes: toolCount >= 3 || artifactProduced || hasSubRuns, toolCount, artifactProduced, hasSubRuns }
}

/** 从 root run 出发收集整棵 run 树（含 root）的 id，宽度优先。 */
async function collectRunTreeIds(rootRunId: string): Promise<string[]> {
  const ids: string[] = [rootRunId]
  const seen = new Set<string>([rootRunId])
  const queue: string[] = [rootRunId]
  while (queue.length > 0) {
    const current = queue.shift() as string
    const children = await db.query.agentRuns.findMany({
      where: eq(schema.agentRuns.parentRunId, current),
      columns: { id: true },
    })
    for (const child of children) {
      if (seen.has(child.id)) continue
      seen.add(child.id)
      ids.push(child.id)
      queue.push(child.id)
    }
  }
  return ids
}

async function loadRunMessages(runIds: string[]): Promise<MessageRow[]> {
  if (runIds.length === 0) return []
  const rows = await db
    .select()
    .from(schema.messages)
    .where(inArray(schema.messages.runId, runIds))
  return rows.sort((a, b) => a.createdAt - b.createdAt)
}

interface RenderedRunForExtraction {
  text: string
  toolNames: string[]
  artifactTitles: string[]
}

async function renderRunForExtraction(messages: MessageRow[]): Promise<RenderedRunForExtraction> {
  const artifactIds = new Set<string>()
  const toolNames = new Set<string>()
  for (const m of messages) {
    for (const p of m.parts) {
      if (p.type === 'tool_use') toolNames.add(p.toolName)
      if (p.type === 'artifact_ref') artifactIds.add(p.artifactId)
    }
  }
  const titleById = await loadArtifactTitles([...artifactIds])

  const chunks: string[] = []
  let totalChars = 0
  for (const m of messages) {
    const content = renderPublicParts(m.parts, titleById)
    if (!content.trim()) continue
    const from = m.role === 'user' ? 'user' : 'agent'
    const chunk = [
      `<message from="${escapeXml(from)}">`,
      limitChars(content, MAX_RENDERED_MESSAGE_CHARS),
      '</message>',
    ].join('\n')
    if (totalChars + chunk.length > MAX_EXTRACTION_INPUT_CHARS) break
    chunks.push(chunk)
    totalChars += chunk.length
  }

  return {
    text: chunks.join('\n\n'),
    toolNames: [...toolNames],
    artifactTitles: [...titleById.values()],
  }
}

function renderPublicParts(parts: MessagePart[], titleById: Map<string, string>): string {
  const out: string[] = []
  for (const part of parts) {
    switch (part.type) {
      case 'text':
        if (part.content) out.push(part.content)
        break
      case 'code':
        if (part.content) out.push(['```' + part.language, part.content, '```'].join('\n'))
        break
      case 'artifact_ref': {
        const title = titleById.get(part.artifactId)
        out.push(
          title
            ? `[artifact: ${title} (id=${part.artifactId})]`
            : `[artifact id=${part.artifactId}]`,
        )
        break
      }
      default:
        break // thinking / tool_use / tool_result / deploy_status / attachment 一律不进提取输入
    }
  }
  return out.join('\n').trim()
}

async function loadArtifactTitles(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (ids.length === 0) return out
  const rows = await db
    .select({ id: schema.artifacts.id, title: schema.artifacts.title })
    .from(schema.artifacts)
    .where(inArray(schema.artifacts.id, ids))
  for (const row of rows) out.set(row.id, row.title)
  return out
}

function buildExtractionPrompt(
  rendered: RenderedRunForExtraction,
  injected: readonly InjectedExperienceEntry[],
): string {
  const lines = [
    '<run_meta>',
    `tools: ${rendered.toolNames.length > 0 ? rendered.toolNames.join(', ') : 'none'}`,
    `artifacts: ${rendered.artifactTitles.length > 0 ? rendered.artifactTitles.join(', ') : 'none'}`,
    '</run_meta>',
  ]
  const reviewBlock = buildReviewSection(injected)
  if (reviewBlock) lines.push('', reviewBlock)
  lines.push('', '<run_messages>', rendered.text, '</run_messages>')
  return lines.join('\n')
}

/** 容忍 ```json 代码块围栏，解析失败返回 null（提炼模型偶尔很随性）。 */
function parseJsonPayload(raw: string): unknown {
  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed)
  } catch {
    return null
  }
}

/**
 * 解析新沉淀的候选经验。
 * 兼容两种形态：裸数组（老模型可能仍这么输出）与 {"candidates": [...]}（当前要求的对象形态）。
 */
export function parseExtractionOutput(raw: string): ExtractionCandidate[] {
  const parsed = parseJsonPayload(raw)
  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object'
      ? (parsed as { candidates?: unknown }).candidates
      : null
  if (!Array.isArray(list)) return []
  const out: ExtractionCandidate[] = []
  for (const item of list) {
    const result = ExtractionCandidateSchema.safeParse(item)
    if (result.success) out.push(result.data)
  }
  return out.slice(0, MAX_EXPERIENCES_PER_TASK)
}

/** 解析对已注入经验的复盘结论（对象形态里的 reviews 字段）。 */
export function parseExtractionReviews(raw: string): ExperienceReviewItem[] {
  const parsed = parseJsonPayload(raw)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return []
  const list = (parsed as { reviews?: unknown }).reviews
  if (!Array.isArray(list)) return []
  const out: ExperienceReviewItem[] = []
  for (const item of list) {
    const result = ExperienceReviewSchema.safeParse(item)
    if (result.success) out.push({ ...result.data, patch: result.data.patch ?? undefined })
  }
  return out.slice(0, MAX_REVIEWS_PER_TASK)
}

async function loadActiveExperienceTitles(agentId: string): Promise<string[]> {
  const rows = await db.query.experiences.findMany({
    where: and(eq(schema.experiences.agentId, agentId), eq(schema.experiences.active, true)),
    columns: { title: true },
  })
  return rows.map((row) => row.title)
}

/**
 * 标题级去重：先做归一化精确比对，再退化为关键词 Jaccard 相似度比对。
 *
 * 后者是必要的 —— LLM 对同一条教训会换措辞重写（「避免多行 python -c」 vs
 * 「验收证据用单行命令」），精确比对拦不住，于是重复-反思-再重复。
 */
function isDuplicate(
  candidate: ExtractionCandidate,
  existingTitles: readonly string[],
): boolean {
  const key = normalizeKey(candidate.title)
  if (existingTitles.some((title) => normalizeKey(title) === key)) return true

  const keywords = keywordSet(candidate.title)
  if (keywords.size === 0) return false
  return existingTitles.some((title) => {
    const other = keywordSet(title)
    if (other.size === 0) return false
    let shared = 0
    for (const keyword of keywords) if (other.has(keyword)) shared += 1
    const union = new Set([...keywords, ...other]).size
    return union > 0 && shared / union >= NEAR_DUPLICATE_KEYWORD_OVERLAP
  })
}

function keywordSet(text: string): Set<string> {
  return new Set(tokenizeKeywords(text))
}

// ─── 已注入经验的复盘回复（迭代闭环）────────────────────────

export interface InjectedExperienceEntry {
  id: string
  kind: string
  source: string
  title: string
  trigger: string
  content: string
  /** 回滚需要完整快照，所以 tags 也要带上 */
  tags: string[]
}

/**
 * 本次 run 树真正注入过哪些经验。复盘只对它们生效 —— LLM 改不了没注入的东西，
 * 否则一次幻觉 id 就能改写用户的任意经验。
 */
async function loadInjectedExperiences(runTreeIds: readonly string[]): Promise<InjectedExperienceEntry[]> {
  if (runTreeIds.length === 0) return []
  try {
    const usages = await db
      .select({ experienceId: schema.experienceUsages.experienceId })
      .from(schema.experienceUsages)
      .where(inArray(schema.experienceUsages.runId, [...runTreeIds]))
    const ids = [...new Set(usages.map((row) => row.experienceId))].slice(0, EXPERIENCE_PROMPT_MAX_ENTRIES)
    if (ids.length === 0) return []
    return await db
      .select({
        id: schema.experiences.id,
        kind: schema.experiences.kind,
        source: schema.experiences.source,
        title: schema.experiences.title,
        trigger: schema.experiences.trigger,
        content: schema.experiences.content,
        tags: schema.experiences.tags,
      })
      .from(schema.experiences)
      .where(inArray(schema.experiences.id, ids))
  } catch (err) {
    console.warn('[experience-service] loadInjectedExperiences failed', err)
    return []
  }
}

function buildReviewSection(entries: readonly InjectedExperienceEntry[]): string {
  if (entries.length === 0) return ''
  const items = entries.map((entry) =>
    [
      `  <experience id="${escapeXml(entry.id)}" kind="${escapeXml(entry.kind)}" source="${escapeXml(entry.source)}">`,
      `    <trigger>${escapeXml(entry.trigger)}</trigger>`,
      `    <title>${escapeXml(entry.title)}</title>`,
      `    <content>${escapeXml(entry.content)}</content>`,
      '  </experience>',
    ].join('\n'),
  )
  return ['<injected_experiences>', ...items, '</injected_experiences>'].join('\n')
}

/** 把 review 的 patch 收敛成真正要落库的字段：去空、去重复值和未变化的字段。 */
function buildReviewPatch(
  patch: ExperienceReviewItem['patch'],
  target: InjectedExperienceEntry,
): ExperiencePatch | null {
  if (!patch) return null
  const out: ExperiencePatch = {}
  if (patch.title && patch.title.trim() && patch.title.trim() !== target.title) {
    out.title = patch.title.trim()
  }
  if (patch.trigger && patch.trigger.trim() && patch.trigger.trim() !== target.trigger) {
    out.trigger = patch.trigger.trim()
  }
  if (patch.content && patch.content.trim() && patch.content.trim() !== target.content) {
    out.content = patch.content.trim()
  }
  if (Array.isArray(patch.tags) && patch.tags.length > 0) {
    const tags = [...new Set(patch.tags.map((tag) => tag.trim()).filter(Boolean))].slice(0, MAX_EXPERIENCE_TAGS)
    if (tags.length > 0) out.tags = tags
  }
  return Object.keys(out).length > 0 ? out : null
}

/**
 * 把精炼器对「已注入经验」的验证结论写回，形成注入 → 执行 → 复盘 → 改写的闭环。
 * 任何一步失败都只影响本条经验，不向上抛。
 */
export interface ReviewFilterResult {
  accepted: ExperienceReviewItem[]
  rejected: ExperienceReviewItem[]
}

/**
 * 白名单过滤：只允许复盘本次真的注入过的经验。
 * 这是迭代闭环的安全边界 —— LLM 可能凭印象给出一个真实存在的经验 id，
 * 但它这次根本没被注入，没有「用了之后怎么样」的依据，改了就是无根据覆盖。
 */
export function filterReviewTargets(
  reviews: readonly ExperienceReviewItem[],
  injected: readonly InjectedExperienceEntry[],
): ReviewFilterResult {
  const allowed = new Set(injected.map((entry) => entry.id))
  const accepted: ExperienceReviewItem[] = []
  const rejected: ExperienceReviewItem[] = []
  for (const review of reviews.slice(0, MAX_REVIEWS_PER_TASK)) {
    if (allowed.has(review.id)) accepted.push(review)
    else rejected.push(review)
  }
  return { accepted, rejected }
}

export async function applyExperienceReviews(
  reviews: readonly ExperienceReviewItem[],
  injected: readonly InjectedExperienceEntry[],
  meta: { runId: string },
): Promise<ExperienceReviewOutcome[]> {
  const byId = new Map(injected.map((entry) => [entry.id, entry]))
  const { accepted, rejected } = filterReviewTargets(reviews, injected)
  const outcomes: ExperienceReviewOutcome[] = rejected.map((review) => ({
    experienceId: review.id,
    verdict: review.verdict,
    applied: false,
    note: 'id 不在本次注入集合内，已丢弃',
  }))
  if (rejected.length > 0) {
    const available = injected.map((entry) => entry.id).join(', ') || '(本次没有注入任何经验)'
    console.warn(
      `[experience-service] dropped ${rejected.length} review(s) whose id was not injected this run. ` +
        `rejected: ${rejected.map((item) => item.id).join(', ')} | available: ${available}`,
    )
  }
  for (const review of accepted) {
    const target = byId.get(review.id)
    if (!target) continue
    const note = review.reason.trim() || undefined
    try {
      if (review.verdict === 'confirmed') {
        await recordExperienceRevision(target, {
          source: 'auto',
          kind: 'confirm',
          runId: meta.runId,
          note: note ?? '本次注入后被验证为仍然有效',
        })
        outcomes.push({ experienceId: target.id, verdict: review.verdict, applied: true, note: '已记录一次有效验证' })
        continue
      }
      if (review.verdict === 'retire') {
        if (target.source === 'manual') {
          outcomes.push({
            experienceId: target.id,
            verdict: review.verdict,
            applied: false,
            note: '手工创建的经验不会被自动停用，请人工确认',
          })
          continue
        }
        await updateExperience(
          target.id,
          { active: false },
          { source: 'auto', kind: 'retire', runId: meta.runId, note: note ?? '自动复盘判定为过时，转草稿待人工确认' },
        )
        outcomes.push({ experienceId: target.id, verdict: review.verdict, applied: true, note: '已转草稿待人工确认' })
        continue
      }
      const patch = buildReviewPatch(review.patch, target)
      if (!patch) {
        outcomes.push({
          experienceId: target.id,
          verdict: review.verdict,
          applied: false,
          note: 'patch 为空或与现值一致，未改动',
        })
        continue
      }
      await updateExperience(target.id, patch, {
        source: 'auto',
        kind: 'refine',
        runId: meta.runId,
        note: note ?? '根据本次运行自动修订',
      })
      outcomes.push({ experienceId: target.id, verdict: review.verdict, applied: true, note: '已自动修订' })
    } catch (err) {
      console.warn('[experience-service] apply review failed', err)
      outcomes.push({
        experienceId: target.id,
        verdict: review.verdict,
        applied: false,
        note: err instanceof Error ? err.message : String(err),
      })
    }
  }
  return outcomes
}

// ─── 提取模型选择（镜像 context-compaction 的 chooseSummaryModel） ───

interface ExtractionModelChoice {
  provider: ModelProvider | null
  modelId: string | null
  extract(prompt: string, signal?: AbortSignal): Promise<string>
}

/**
 * 提炼模型的候选链：agent 自己的配置优先，全局 provider 配置兜底。
 * 目的：agent 侧 endpoint 配错（很常见，比如填了中转站首页而不是 /v1）时，
 * 复盘提炼不至于整条链路静默失效。
 */
async function chooseExtractionModels(agent: AgentRow): Promise<ExtractionModelChoice[]> {
  const list: ExtractionModelChoice[] = []
  const seen = new Set<string>()
  const push = (choice: ExtractionModelChoice | null) => {
    if (!choice) return
    const key = `${choice.provider ?? 'unknown'}/${choice.modelId ?? 'default'}`
    if (seen.has(key)) return
    seen.add(key)
    list.push(choice)
  }
  push(await chooseExtractionModel(agent))
  for (const fallback of await buildGlobalExtractionFallbacks()) push(fallback)
  return list
}

async function buildGlobalExtractionFallbacks(): Promise<ExtractionModelChoice[]> {
  const out: ExtractionModelChoice[] = []
  const deepseekKey = await getEffectiveApiKey('deepseek')
  if (deepseekKey) {
    out.push(buildOpenAICompatibleExtractionChoice('deepseek', DEFAULT_DEEPSEEK_MODEL, deepseekKey, null))
  }
  const anthropicKey = await getEffectiveApiKey('anthropic')
  if (anthropicKey) {
    out.push(buildAnthropicExtractionChoice(anthropicKey, await getEffectiveAnthropicBaseUrl(), DEFAULT_CLAUDE_MODEL))
  }
  return out
}

async function extractWithFallback(
  choices: ExtractionModelChoice[],
  prompt: string,
  signal?: AbortSignal,
): Promise<string> {
  const failures: string[] = []
  for (const choice of choices) {
    const label = `${choice.provider ?? 'unknown'}/${choice.modelId ?? 'default'}`
    try {
      const raw = await choice.extract(prompt, signal)
      if (raw && raw.trim()) return raw
      failures.push(`${label}: 返回空内容`)
    } catch (err) {
      failures.push(`${label}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  if (failures.length > 0) {
    console.warn(`[experience-service] 提炼模型全部失败，跳过本次复盘：\n- ${failures.join('\n- ')}`)
  }
  return ''
}

async function chooseExtractionModel(agent: AgentRow): Promise<ExtractionModelChoice | null> {
  if (agent.adapterName === 'custom' && agent.modelProvider && agent.modelId) {
    if (agent.modelProvider === 'anthropic') {
      const key = agent.apiKey ?? (await getEffectiveApiKey('anthropic'))
      if (!key) return null
      return buildAnthropicExtractionChoice(
        key,
        agent.apiBaseUrl ?? (await getEffectiveAnthropicBaseUrl()),
        agent.modelId,
      )
    }
    if (agent.modelProvider === 'openai-compatible') {
      if (!agent.apiKey || !agent.apiBaseUrl) return null
      return buildOpenAICompatibleExtractionChoice(
        agent.modelProvider,
        agent.modelId,
        agent.apiKey,
        agent.apiBaseUrl,
      )
    }
    const key =
      agent.apiKey ??
      (await getEffectiveApiKey(agent.modelProvider === 'volcano-ark' ? 'ark' : agent.modelProvider))
    if (!key) return null
    return buildOpenAICompatibleExtractionChoice(
      agent.modelProvider,
      agent.modelId,
      key,
      agent.apiBaseUrl,
    )
  }

  // Claude Code / Codex agent：用全局 anthropic key 兜底
  const anthropicKey = await getEffectiveApiKey('anthropic')
  if (anthropicKey) {
    return buildAnthropicExtractionChoice(
      anthropicKey,
      await getEffectiveAnthropicBaseUrl(),
      DEFAULT_CLAUDE_MODEL,
    )
  }
  return null
}

function buildOpenAICompatibleExtractionChoice(
  provider: Exclude<ModelProvider, 'anthropic'>,
  modelId: string,
  apiKey: string,
  apiBaseUrl: string | null,
): ExtractionModelChoice {
  // endpoint 必须与执行期（resolveCustomProviderClientConfig）用同一套规则解析：
  // 已知厂商（deepseek / volcano-ark / openai）走官方默认地址，忽略 agent.apiBaseUrl。
  // 否则会出现「任务跑得通、复盘提炼必失败」——执行期忽略了那个地址，提炼期却拿它当 OpenAI 根。
  let resolved: { apiKey: string; baseURL?: string }
  try {
    resolved = resolveCustomProviderClientConfig(provider, apiKey, apiBaseUrl)
  } catch {
    resolved = {
      apiKey,
      baseURL:
        apiBaseUrl ??
        (provider === 'deepseek'
          ? DEFAULT_DEEPSEEK_BASE_URL
          : provider === 'volcano-ark'
            ? DEFAULT_VOLCANO_ARK_BASE_URL
            : undefined),
    }
  }
  const client = new OpenAI({ apiKey: resolved.apiKey, baseURL: resolved.baseURL, maxRetries: 2 })
  return {
    provider,
    modelId,
    extract: async (prompt, signal) => {
      let result: unknown
      try {
        result = await client.chat.completions.create(
          {
            model: modelId,
            temperature: 0.2,
            messages: [
              { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
              { role: 'user', content: prompt },
            ],
          },
          { signal },
        )
      } catch (err) {
        throw new Error(
          `调用失败（baseURL=${resolved.baseURL ?? 'SDK 默认'}）：${
            err instanceof Error ? err.message : String(err)
          }`,
        )
      }
      const text = (result as { choices?: Array<{ message?: { content?: unknown } }> } | undefined)?.choices?.[0]
        ?.message?.content
      if (typeof text !== 'string' || !text.trim()) {
        let snippet = ''
        try {
          snippet = JSON.stringify(result ?? null).slice(0, 300)
        } catch {
          snippet = '<unserializable>'
        }
        throw new Error(
          `返回体没有 choices[0].message.content（baseURL=${resolved.baseURL ?? 'SDK 默认'}）。` +
            ` 这通常意味着 base URL 不是 OpenAI-compatible 的 Chat Completions 地址（例如填成了中转站首页）。` +
            ` 响应片段：${snippet}`,
        )
      }
      return text
    },
  }
}

function buildAnthropicExtractionChoice(
  apiKey: string,
  apiBaseUrl: string | null,
  modelId: string,
): ExtractionModelChoice {
  const client = new Anthropic(
    apiBaseUrl
      ? { apiKey: null, authToken: apiKey, baseURL: apiBaseUrl, maxRetries: 2 }
      : { apiKey, maxRetries: 2 },
  )
  return {
    provider: 'anthropic',
    modelId,
    extract: async (prompt, signal) => {
      const result = await client.messages.create(
        {
          model: modelId,
          max_tokens: EXTRACTION_MAX_TOKENS,
          temperature: 0.2,
          system: EXTRACTION_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: prompt }],
        },
        { signal },
      )
      return result.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
    },
  }
}

const EXTRACTION_SYSTEM_PROMPT = [
  '你是 AgentHub 的经验提炼器。你的产出会在下一次相似任务里被注入 Agent 的系统提示，直接改变它做事的方式。',
  '下面是一次完整任务的运行记录（可能包含多个子 Agent 与多次重试）。',
  '',
  '## 你提炼的不是任务总结，而是「换个任务还成立、并能改变下一次执行」的信息',
  '',
  '三类各管一件事：',
  '- experience（经验）：可复用的做事顺序、检查清单、避坑手法、工具 / 环境 / 项目规则、交付质量标准。写清楚「先做什么、再做什么、注意什么」。',
  '- reflection（反思）：这次踩的坑 —— 失败或返工的直接原因及其对应改进做法，必须写清「因为什么导致什么」。',
  '- profile_fact（画像）：用户或该 Agent 表现出的稳定偏好与行为特征，需要多次出现才成立，只出现一次不算。',
  '',
  '一句话区分：经验回答「怎么做对」，反思回答「为什么会做错」，画像回答「这个用户习惯怎么要」。',
  '',
  '## 沉淀前先回答 6 个问题',
  '1. 这次有没有发现以后还能复用的方法？有 → experience',
  '2. 这次有没有踩坑、为什么？有 → reflection',
  '3. 有没有找到成功或失败的因果？有 → experience / reflection',
  '4. 用户有没有表现出稳定偏好？有 → profile_fact',
  '5. 有没有形成环境 / 项目 / 工具层面的规则？有 → experience',
  '6. 这条内容出现在下一次类似任务里，真的会让执行更好吗？',
  '',
  '第 6 问答「否」就丢弃。宁缺毋滥 —— 输出 0 条是完全正常的。',
  '',
  '## 绝对不要沉淀',
  '- 任务结果与流水账：本次任务已完成、生成了 3 个文件、调用了 5 个工具、耗时 23 秒。',
  '- 只在本次成立的一次性细节：某个具体文件名、某次的具体数值、某个 URL。',
  '- 对运行日志的复述 —— 数据模型里已有 runId 与工具调用记录，不需要再说一遍。',
  '- 运行记录里读不到的事实：不要补脑，不要虚构工具输出。',
  '- 密钥、token、敏感信息与敏感路径。',
  '',
  '## 写法要求',
  '- trigger 必须写成「什么情况下拿出来用」的条件句，例如「当执行代码审查、PR Review 或合并前检查时」；不要写成名词短语，也不要重复标题。',
  '- title 是 8-20 字的结论短句，不要写成提醒事项（不要写「注意处理 xxx」，要写「xxx 先本地校验再交付」）。',
  '- content 是可直接执行的做法，2-5 句、动词开头，不要堆评价性形容词。',
  '- 严格去重合并：同一条教训在整个任务里只写一条，即使在多次重试里反复出现；措辞相近的候选必须先合并。',
  '',
  '## 已注入经验的复盘（reviews）',
  '<injected_experiences> 里的经验本次真的注入了这个 Agent。只针对它们给出验证后的结论：',
  '- confirmed：确实用上了且有效（最常见的结果，占多数是好事）',
  '- refine：确实命中，但本次拿到了更准或更完整的做法 —— 此时必须在 patch 里给出改后的完整值',
  '- retire：内容已过时或本次证明是错的，不再适合注入',
  'patch 里给的是完整替换值而不是 diff，不修改的字段不要出现。',
  'id 必须原样取自 <injected_experiences>，绝不编造 —— 编造的 id 会被直接丢弃。',
  '拿不准就写 confirmed。',
  '',
  '## 输出格式',
  '只输出一个 JSON 对象，不要 markdown 代码块，不要任何解释文字：',
  '{"candidates":[{"kind":"experience|reflection|profile_fact","title":"...","trigger":"...","content":"...","tags":["..."]}],"reviews":[{"id":"exp_xxx","verdict":"confirmed|refine|retire","reason":"一句话原因","patch":{"title":"...","trigger":"...","content":"..."}}]}',
  'candidates 最多 3 条，reviews 最多 3 条，两个字段都可以是 []。',
].join('\n')

// ─── 纯函数辅助 ──────────────────────────────────────────────

export function tokenizeKeywords(text: string): string[] {
  const tokens = text
    .toLowerCase()
    .split(/[\s，。；、！？（）\[\]{}"''""!?.,;:()\[\]{}…·\-—/\\|]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && !STOP_WORDS.has(t))
  return [...new Set(tokens)].slice(0, 12)
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '').slice(0, 60)
}

function normalizeTitle(value: string): string {
  const title = value.trim()
  if (!title) throw new Error('Experience title is required')
  if (title.length > MAX_EXPERIENCE_TITLE_CHARS) {
    throw new Error(`Experience title must be <= ${MAX_EXPERIENCE_TITLE_CHARS} characters`)
  }
  return title
}

function normalizeTrigger(value: string): string {
  const trigger = value.trim()
  if (!trigger) throw new Error('Experience trigger is required')
  if (trigger.length > MAX_EXPERIENCE_TRIGGER_CHARS) {
    throw new Error(`Experience trigger must be <= ${MAX_EXPERIENCE_TRIGGER_CHARS} characters`)
  }
  return trigger
}

function normalizeContent(value: string): string {
  const content = value.trim()
  if (!content) throw new Error('Experience content is required')
  if (content.length > MAX_EXPERIENCE_CONTENT_CHARS) {
    throw new Error(`Experience content must be <= ${MAX_EXPERIENCE_CONTENT_CHARS} characters`)
  }
  // 富文本内容含 LLM 输出等不可信来源，落库前白名单清洗（渲染侧同样清洗，防存量脏数据）
  return sanitizeExperienceHtml(content)
}

function limitChars(value: string, limit: number): string {
  if (value.length <= limit) return value
  return value.slice(0, limit) + '\n[truncated]'
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`)
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

// ─── 经验参考附件 ────────────────────────────────────────────

/**
 * 上传经验参考文件：二进制存 DATA_DIR/experience-files/，元数据落 experience_attachments。
 * 不写 workspace 沙箱（对齐 Spec 20 §10「经验不写 workspace 文件」的边界）。
 */
export async function uploadExperienceFile(
  experienceId: string,
  file: File,
): Promise<ExperienceAttachmentRow> {
  const existing = await db.query.experiences.findFirst({
    where: eq(schema.experiences.id, experienceId),
    columns: { id: true },
  })
  if (!existing) throw new Error(`Experience not found: ${experienceId}`)
  if (file.size === 0) throw new Error('Empty file')
  if (file.size > EXPERIENCE_FILE_MAX_SIZE) {
    throw new Error(`File too large (max ${EXPERIENCE_FILE_MAX_SIZE / 1024 / 1024}MB)`)
  }

  const id = newExperienceFileId()
  const ext = sanitizeExt(file.name)
  const storedName = `${id}${ext}`
  // 原始文件名仅用于展示与下载头；剥离控制字符，防注入与乱码
  const fileName = file.name.replace(/[\u0000-\u001f\u007f]/g, '').trim() || 'unnamed'
  const dir = path.join(DATA_DIR, EXPERIENCE_FILE_DIR)
  mkdirSync(dir, { recursive: true })
  const absPath = path.join(dir, storedName)
  writeFileSync(absPath, Buffer.from(await file.arrayBuffer()))

  const row: ExperienceAttachmentRow = {
    id,
    experienceId,
    fileName,
    storedName,
    size: file.size,
    mimeType: file.type || 'application/octet-stream',
    createdAt: Date.now(),
  }
  await db.insert(schema.experienceAttachments).values(row)
  return row
}

export async function listExperienceFiles(experienceId: string): Promise<ExperienceAttachmentRow[]> {
  return db.query.experienceAttachments.findMany({
    where: eq(schema.experienceAttachments.experienceId, experienceId),
    orderBy: desc(schema.experienceAttachments.createdAt),
  })
}

export async function deleteExperienceFile(experienceId: string, fileId: string): Promise<void> {
  const row = await db.query.experienceAttachments.findFirst({
    where: and(
      eq(schema.experienceAttachments.id, fileId),
      eq(schema.experienceAttachments.experienceId, experienceId),
    ),
  })
  if (!row) throw new Error(`Experience file not found: ${fileId}`)
  const absPath = path.join(DATA_DIR, EXPERIENCE_FILE_DIR, row.storedName)
  if (existsSync(absPath)) rmSync(absPath)
  await db.delete(schema.experienceAttachments).where(eq(schema.experienceAttachments.id, fileId))
}

export async function getExperienceFile(
  experienceId: string,
  fileId: string,
): Promise<{ row: ExperienceAttachmentRow; absPath: string } | null> {
  const row = await db.query.experienceAttachments.findFirst({
    where: and(
      eq(schema.experienceAttachments.id, fileId),
      eq(schema.experienceAttachments.experienceId, experienceId),
    ),
  })
  if (!row) return null
  const absPath = path.join(DATA_DIR, EXPERIENCE_FILE_DIR, row.storedName)
  if (!existsSync(absPath)) return null
  return { row, absPath }
}

function sanitizeExt(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  if (dot <= 0) return ''
  const ext = fileName.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '')
  return ext ? `.${ext.slice(0, 10)}` : ''
}
