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
import type { AgentRow, ExperienceAttachmentRow, ExperienceInsert, ExperienceKind, ExperienceRow, MessageRow } from '@/db/schema'
import { newExperienceFileId, newExperienceId } from '@/server/ids'
import { sanitizeExperienceHtml } from '@/lib/sanitize-html'
import { maybeQuote } from '@/server/search-service'
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
const MAX_ACTIVE_EXPERIENCES_PER_AGENT = 200
const MAX_EXTRACTION_INPUT_CHARS = 60000
const MAX_RENDERED_MESSAGE_CHARS = 4000
const MAX_EXTRACTION_CANDIDATES = 3
const EXTRACTION_MAX_TOKENS = 1200
const TOKEN_TO_CHAR_RATIO = 4
const COLD_ASSET_DAYS = 30
const EXPERIENCE_FILE_MAX_SIZE = 20 * 1024 * 1024 // 单文件上限 20MB
const EXPERIENCE_FILE_DIR = 'experience-files'

const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1'
const DEFAULT_VOLCANO_ARK_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3'
const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-5'

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

export async function updateExperience(id: string, patch: ExperiencePatch): Promise<ExperienceRow> {
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
  await db
    .update(schema.experiences)
    .set(next)
    .where(eq(schema.experiences.id, id))
  return { ...existing, ...next }
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
 * 门槛：run complete +（tool 调用 ≥ 3 或产出 artifact 或聚合 run）+ app_settings 开关。
 */
export async function extractFromRun(runId: string): Promise<ExperienceRow[]> {
  try {
    const settings = await getAppSettings()
    if (settings.experienceExtractionEnabled === false) return []

    const run = await db.query.agentRuns.findFirst({ where: eq(schema.agentRuns.id, runId) })
    if (!run || run.status !== 'complete') return []

    const agent = await db.query.agents.findFirst({ where: eq(schema.agents.id, run.agentId) })
    if (!agent || agent.adapterName === 'mock') return []

    const gate = await computeExtractionGate(runId)
    if (!gate.passes) return []

    const messages = await loadRunMessages(runId)
    const rendered = await renderRunForExtraction(messages)
    if (!rendered.text.trim()) return []

    const choice = await chooseExtractionModel(agent)
    if (!choice) return []

    const prompt = buildExtractionPrompt(rendered)
    const raw = await choice.extract(prompt)
    const candidates = parseExtractionOutput(raw)
    if (candidates.length === 0) return []

    const saved: ExperienceRow[] = []
    for (const candidate of candidates) {
      if (await isDuplicate(candidate, run.agentId)) continue
      try {
        saved.push(
          await createExperience({
            kind: candidate.kind,
            agentId: run.agentId,
            conversationId: run.conversationId,
            runId,
            title: candidate.title,
            trigger: candidate.trigger,
            content: candidate.content,
            tags: candidate.tags,
            source: 'auto',
          }),
        )
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

interface ExtractionGate {
  passes: boolean
  toolCount: number
  artifactProduced: boolean
  hasSubRuns: boolean
}

async function computeExtractionGate(runId: string): Promise<ExtractionGate> {
  const messages = await db.select().from(schema.messages).where(eq(schema.messages.runId, runId))
  let toolCount = 0
  let artifactProduced = false
  for (const m of messages) {
    for (const p of m.parts) {
      if (p.type === 'tool_use') toolCount++
      if (p.type === 'artifact_ref') artifactProduced = true
    }
  }
  const subRuns = await db.query.agentRuns.findMany({
    where: eq(schema.agentRuns.parentRunId, runId),
    columns: { id: true },
  })
  const hasSubRuns = subRuns.length > 0
  return { passes: toolCount >= 3 || artifactProduced || hasSubRuns, toolCount, artifactProduced, hasSubRuns }
}

async function loadRunMessages(runId: string): Promise<MessageRow[]> {
  return db.select().from(schema.messages).where(eq(schema.messages.runId, runId))
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

function buildExtractionPrompt(rendered: RenderedRunForExtraction): string {
  const lines = [
    '<run_meta>',
    `tools: ${rendered.toolNames.length > 0 ? rendered.toolNames.join(', ') : 'none'}`,
    `artifacts: ${rendered.artifactTitles.length > 0 ? rendered.artifactTitles.join(', ') : 'none'}`,
    '</run_meta>',
    '',
    '<run_messages>',
    rendered.text,
    '</run_messages>',
  ]
  return lines.join('\n')
}

export function parseExtractionOutput(raw: string): ExtractionCandidate[] {
  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim()
  if (!trimmed) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  const out: ExtractionCandidate[] = []
  for (const item of parsed) {
    const result = ExtractionCandidateSchema.safeParse(item)
    if (result.success) out.push(result.data)
  }
  return out.slice(0, MAX_EXTRACTION_CANDIDATES)
}

async function isDuplicate(candidate: ExtractionCandidate, agentId: string): Promise<boolean> {
  const existing = await db.query.experiences.findMany({
    where: and(eq(schema.experiences.agentId, agentId), eq(schema.experiences.active, true)),
    columns: { title: true },
  })
  const key = normalizeKey(candidate.title)
  return existing.some((row) => normalizeKey(row.title) === key)
}

// ─── 提取模型选择（镜像 context-compaction 的 chooseSummaryModel） ───

interface ExtractionModelChoice {
  provider: ModelProvider | null
  modelId: string | null
  extract(prompt: string, signal?: AbortSignal): Promise<string>
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
  const baseURL =
    apiBaseUrl ??
    (provider === 'deepseek'
      ? DEFAULT_DEEPSEEK_BASE_URL
      : provider === 'volcano-ark'
        ? DEFAULT_VOLCANO_ARK_BASE_URL
        : undefined)
  const client = new OpenAI({ apiKey, baseURL, maxRetries: 2 })
  return {
    provider,
    modelId,
    extract: async (prompt, signal) => {
      const result = await client.chat.completions.create(
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
      return result.choices[0]?.message.content ?? ''
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
  '你是 AgentHub 的经验提炼器。根据下面一次 Agent 运行记录，提炼 0-3 条值得沉淀的经验。',
  '',
  '输出要求：',
  '- 只输出一个 JSON 数组，不要 markdown 代码块，不要任何其他文字。',
  '- 每条形如 {"kind":"experience"|"reflection"|"profile_fact","title":"短标题<=80字","trigger":"一句话说明何时适用<=200字","content":"经验正文<=8000字","tags":["标签"]}。',
  '- experience：可复用的做法、避坑方法；reflection：本次运行过程本身的反思；profile_fact：关于该 agent 的稳定画像事实。',
  '- 没有值得沉淀的内容就输出 []。',
  '- 不要虚构运行记录里没有的事实；不要包含密钥、敏感信息或完整工具输出。',
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
