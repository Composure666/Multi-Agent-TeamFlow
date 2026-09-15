import { and, count, desc, eq, gte, lt, min } from 'drizzle-orm'

import { db, schema } from '@/db/client'
import type { RunUsage } from '@/db/schema'

/**
 * 数据概览页的真实数据源。
 *
 * 历史背景：概览页此前把「任务列表 / 趋势 / 分布 / 成功率」全部挂在 `automationRuns`
 * （自动化任务运行记录，库里仅几十条且集中在 demo 种子）上，而 KPI 里的运行数却来自
 * `usage`（agent_runs）。两张表混用导致：
 *   - 任务列表只显示自动化任务的 20 条，真实对话里的 Agent 运行一条都不出现；
 *   - 「Agent 运行数 119」与「任务列表 4 条」自相矛盾。
 *
 * 本 service 统一以 `agent_runs` 为准 —— 它才是「Agent 实际跑过什么」的唯一真相。
 */

const DAY_MS = 24 * 60 * 60 * 1000

/** 单次返回的明细上限（防极端库撑爆响应）；`total` 仍返回范围内真实总数。 */
const MAX_RUN_ITEMS = 2000

export type RunAnalyticsStatus = 'success' | 'running' | 'failed' | 'aborted'

/** Agent 模态 → 中文标签，用于任务列表的「Agent 类型」列与筛选。 */
const MODALITY_LABELS: Record<string, string> = {
  text: '文本',
  vision: '视觉',
  image: '生图',
  code: '代码',
  audio: '语音',
  multimodal: '多模态',
}

export function modalityLabel(modality: string | null | undefined): string {
  if (!modality) return '未分类'
  return MODALITY_LABELS[modality] ?? modality
}

export interface RunAnalyticsItem {
  id: string
  conversationId: string
  agentId: string
  agentName: string
  /** 任务标题取会话标题 —— 一次 run 一定属于某个会话。 */
  title: string
  /** Agent 模态中文标签 */
  category: string
  status: RunAnalyticsStatus
  /** 结束时间为空时（运行中）为 null */
  durationMs: number | null
  startedAt: number
  finishedAt: number | null
  totalTokens: number
  /** 是否编排/子任务 run（有 parentRunId） */
  isSubRun: boolean
}

export interface RunAnalyticsTrendPoint {
  /** 横轴标签：M/D */
  label: string
  /** YYYY-MM-DD，便于前端按天定位 */
  date: string
  /** 当日运行次数 */
  value: number
  /** 当日成功次数 */
  completed: number
}

export interface AnalyticsDistributionItem {
  label: string
  /** 占比（0-100，一位小数） */
  value: number
  count: number
}

export interface RunAnalyticsStats {
  /** 选中范围内的运行总数 */
  total: number
  success: number
  running: number
  failed: number
  aborted: number
  /** 成功率：success / 已结束（success+failed+aborted），运行中不计入分母 */
  successRate: number
  /** 已结束 run 的平均耗时 */
  avgDurationMs: number
  /** 今日 00:00 起的运行数（不受选中范围影响） */
  todayCount: number
  /** 库内全部运行数（不受选中范围影响） */
  allTimeTotal: number
  /** 上一个等长周期的运行数，用于环比 */
  prevTotal: number
}

export interface RunAnalytics {
  range: { start: number; end: number; days: number }
  items: RunAnalyticsItem[]
  /** 范围内真实总数（可能 > items.length，见 truncated） */
  total: number
  /** items 是否被 MAX_RUN_ITEMS 截断 */
  truncated: boolean
  stats: RunAnalyticsStats
  trend: RunAnalyticsTrendPoint[]
  agentDistribution: AnalyticsDistributionItem[]
  statusDistribution: AnalyticsDistributionItem[]
}

export interface RunAnalyticsRange {
  start?: number
  end?: number
  days?: number
}

function startOfDay(value: number): number {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function dayKey(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function mapStatus(status: string): RunAnalyticsStatus {
  if (status === 'complete') return 'success'
  if (status === 'running' || status === 'queued') return 'running'
  if (status === 'aborted') return 'aborted'
  return 'failed'
}

/** 与 /api/usage/summary 保持同一口径：input + output + cacheRead + cacheCreation */
function sumTokens(usage: RunUsage | null): number {
  if (!usage) return 0
  return (
    (usage.inputTokens ?? 0) +
    (usage.outputTokens ?? 0) +
    (usage.cacheReadTokens ?? 0) +
    (usage.cacheCreationTokens ?? 0)
  )
}

function ratio(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : 0
}

export async function getRunAnalytics(range?: RunAnalyticsRange): Promise<RunAnalytics> {
  const now = Date.now()
  const end = range?.end && range.end > 0 ? range.end : now
  const days = range?.days && range.days > 0 ? Math.round(range.days) : 7
  const requestedStart = range?.start !== undefined && Number.isFinite(range.start) ? startOfDay(range.start) : startOfDay(end - (days - 1) * DAY_MS)
  const duration = Math.max(end - requestedStart, DAY_MS)

  // 「全部时间」时前端会传一个极早的 start；用库内最早一条 run 把起点钳住，
  // 否则按天分桶会生成上万根柱子。
  const [{ value: earliestRun }] = await db.select({ value: min(schema.agentRuns.startedAt) }).from(schema.agentRuns)
  const earliest = earliestRun ?? now
  const rangeStart = Math.max(requestedStart > 0 ? requestedStart : 0, startOfDay(earliest))
  const clampedStart = Math.min(rangeStart, end - DAY_MS)
  const prevStart = clampedStart - duration
  const todayStart = startOfDay(now)

  const inRange = and(gte(schema.agentRuns.startedAt, clampedStart), lt(schema.agentRuns.startedAt, end))

  // ── 明细（用于任务列表） ──
  const rows = await db
    .select({
      id: schema.agentRuns.id,
      conversationId: schema.agentRuns.conversationId,
      agentId: schema.agentRuns.agentId,
      agentName: schema.agents.name,
      modality: schema.agents.modality,
      conversationTitle: schema.conversations.title,
      status: schema.agentRuns.status,
      parentRunId: schema.agentRuns.parentRunId,
      usage: schema.agentRuns.usage,
      startedAt: schema.agentRuns.startedAt,
      finishedAt: schema.agentRuns.finishedAt,
    })
    .from(schema.agentRuns)
    .innerJoin(schema.conversations, eq(schema.agentRuns.conversationId, schema.conversations.id))
    .innerJoin(schema.agents, eq(schema.agentRuns.agentId, schema.agents.id))
    .where(inRange)
    .orderBy(desc(schema.agentRuns.startedAt))
    .limit(MAX_RUN_ITEMS)

  // ── 聚合计数（不受明细上限影响，保证 KPI 真实） ──
  const [{ value: total }] = await db.select({ value: count() }).from(schema.agentRuns).where(inRange)
  const [{ value: prevTotal }] = await db
    .select({ value: count() })
    .from(schema.agentRuns)
    .where(and(gte(schema.agentRuns.startedAt, prevStart), lt(schema.agentRuns.startedAt, clampedStart)))
  const [{ value: todayCount }] = await db
    .select({ value: count() })
    .from(schema.agentRuns)
    .where(gte(schema.agentRuns.startedAt, todayStart))
  const [{ value: allTimeTotal }] = await db.select({ value: count() }).from(schema.agentRuns)

  // ── 趋势：只取轻量两列，按天分桶 ──
  const trendRows = await db
    .select({ status: schema.agentRuns.status, startedAt: schema.agentRuns.startedAt })
    .from(schema.agentRuns)
    .where(inRange)

  // 天数上限保护：即便范围被拉到最大，也最多分 365 个桶
  const bucketCount = Math.min(365, Math.max(1, Math.ceil((end - clampedStart) / DAY_MS)))
  const buckets: RunAnalyticsTrendPoint[] = Array.from({ length: bucketCount }, (_, i) => {
    const dayStart = clampedStart + i * DAY_MS
    const d = new Date(dayStart)
    return {
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      date: dayKey(dayStart),
      value: 0,
      completed: 0,
    }
  })
  const bucketIndex = new Map(buckets.map((b, i) => [b.date, i]))
  for (const row of trendRows) {
    const idx = bucketIndex.get(dayKey(row.startedAt))
    if (idx === undefined) continue
    buckets[idx].value += 1
    if (row.status === 'complete') buckets[idx].completed += 1
  }

  // ── 分布：按 Agent / 按状态，均用 group-by 保证与 total 对得上 ──
  const agentRows = await db
    .select({ name: schema.agents.name, value: count() })
    .from(schema.agentRuns)
    .innerJoin(schema.agents, eq(schema.agentRuns.agentId, schema.agents.id))
    .where(inRange)
    .groupBy(schema.agents.id)
    .orderBy(desc(count()))

  const statusRows = await db
    .select({ status: schema.agentRuns.status, value: count() })
    .from(schema.agentRuns)
    .where(inRange)
    .groupBy(schema.agentRuns.status)

  const statusLabel = (s: RunAnalyticsStatus): string =>
    s === 'success' ? '成功' : s === 'running' ? '运行中' : s === 'aborted' ? '已中止' : '失败'

  const items: RunAnalyticsItem[] = rows.map((row) => {
    const status = mapStatus(row.status)
    return {
      id: row.id,
      conversationId: row.conversationId,
      agentId: row.agentId,
      agentName: row.agentName,
      title: row.conversationTitle,
      category: modalityLabel(row.modality),
      status,
      durationMs: row.finishedAt !== null ? Math.max(0, row.finishedAt - row.startedAt) : null,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      totalTokens: sumTokens(row.usage),
      isSubRun: row.parentRunId !== null,
    }
  })

  const success = items.filter((i) => i.status === 'success').length
  const running = items.filter((i) => i.status === 'running').length
  const failed = items.filter((i) => i.status === 'failed').length
  const aborted = items.filter((i) => i.status === 'aborted').length
  const finished = success + failed + aborted
  const durationSum = items
    .filter((i) => i.durationMs !== null)
    .reduce((sum, i) => sum + (i.durationMs ?? 0), 0)

  // 明细被截断时，KPI 计数改用聚合查询的结果，避免低估
  const statusTotals = new Map<string, number>()
  for (const row of statusRows) statusTotals.set(row.status, row.value)
  const pick = (...keys: string[]): number =>
    keys.reduce((sum, k) => sum + (statusTotals.get(k) ?? 0), 0)

  const successTotal = pick('complete')
  const runningTotal = pick('running', 'queued')
  const failedTotal = pick('failed')
  const abortedTotal = pick('aborted')
  const finishedTotal = successTotal + failedTotal + abortedTotal

  const agentDistribution = agentRows.map((row) => ({
    label: row.name,
    count: row.value,
    value: ratio(row.value, total),
  }))
  // 长尾合并为「其他」，避免环形图被十几个 1% 切片淹没
  const topAgents = agentDistribution.slice(0, 5)
  const restCount = agentDistribution.slice(5).reduce((sum, a) => sum + a.count, 0)
  const agentDistributionFinal =
    restCount > 0
      ? [...topAgents, { label: '其他', count: restCount, value: ratio(restCount, total) }]
      : topAgents

  return {
    range: { start: clampedStart, end, days: bucketCount },
    items,
    total,
    truncated: total > items.length,
    stats: {
      total,
      success: items.length === total ? success : successTotal,
      running: items.length === total ? running : runningTotal,
      failed: items.length === total ? failed : failedTotal,
      aborted: items.length === total ? aborted : abortedTotal,
      successRate: ratio(successTotal, finishedTotal),
      avgDurationMs: finished > 0 ? Math.round(durationSum / finished) : 0,
      todayCount,
      allTimeTotal,
      prevTotal,
    },
    trend: buckets,
    agentDistribution: agentDistributionFinal,
    statusDistribution: (['success', 'running', 'failed', 'aborted'] as RunAnalyticsStatus[])
      .map((s) => ({
        label: statusLabel(s),
        count:
          s === 'success'
            ? successTotal
            : s === 'running'
              ? runningTotal
              : s === 'aborted'
                ? abortedTotal
                : failedTotal,
        value: 0,
      }))
      .map((item) => ({ ...item, value: ratio(item.count, total) }))
      .filter((item) => item.count > 0),
  }
}
