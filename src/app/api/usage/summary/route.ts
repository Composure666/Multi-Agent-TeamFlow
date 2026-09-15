import { inArray, isNotNull } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'

import { db, schema } from '@/db/client'
import type { RunUsage } from '@/db/schema'

/** GET /api/usage/summary —— 全局 token 用量聚合（今日 / 本周 / 全部 + per-agent / per-model / per-conversation top）。 */

const DAY_MS = 24 * 60 * 60 * 1000

/** 当日 00:00 —— 「今日」口径必须与数据概览页的「今日 X 次」一致，不能用滚动 24 小时。 */
function startOfDay(value: number): number {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

export interface UsageBucket {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  totalTokens: number
  runs: number
}

export interface UsageSummary {
  today: UsageBucket
  week: UsageBucket
  allTime: UsageBucket
  selected: UsageBucket
  prevSelected: UsageBucket
  topConversations: Array<{
    id: string
    title: string
    totalTokens: number
    runs: number
    updatedAt: number
  }>
  byAgent: Array<{ agentId: string; name: string; totalTokens: number; runs: number }>
  byModel: Array<{ model: string; totalTokens: number; runs: number }>
}

function empty(): UsageBucket {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    totalTokens: 0,
    runs: 0,
  }
}

function accumulate(b: UsageBucket, u: RunUsage) {
  b.inputTokens += u.inputTokens
  b.outputTokens += u.outputTokens
  b.cacheReadTokens += u.cacheReadTokens
  b.cacheCreationTokens += u.cacheCreationTokens
  // totalTokens = 所有处理过的 token（含 cache 读写）；与 ChatPanel UsageBadge 口径一致
  b.totalTokens +=
    u.inputTokens + u.outputTokens + u.cacheReadTokens + u.cacheCreationTokens
  b.runs++
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const rangeStart = params.get('start') ? Number(params.get('start')) : undefined
  const rangeEnd = params.get('end') ? Number(params.get('end')) : undefined

  const runs = await db.query.agentRuns.findMany({
    where: isNotNull(schema.agentRuns.usage),
  })

  const now = Date.now()
  const todayStart = startOfDay(now)
  const weekStart = now - 7 * DAY_MS

  const today = empty()
  const week = empty()
  const allTime = empty()
  const selected = empty()
  const prevSelected = empty()
  const byAgentMap = new Map<string, UsageBucket>()
  const byModelMap = new Map<string, UsageBucket>()
  const byConvMap = new Map<string, UsageBucket>()

  for (const row of runs) {
    const u = row.usage as RunUsage | null
    if (!u) continue
    accumulate(allTime, u)
    if (row.startedAt >= weekStart) accumulate(week, u)
    if (row.startedAt >= todayStart) accumulate(today, u)
    if (rangeStart !== undefined && row.startedAt >= rangeStart && (rangeEnd === undefined || row.startedAt < rangeEnd)) accumulate(selected, u)
    if (rangeStart !== undefined) {
      const rangeDuration = (rangeEnd ?? now) - rangeStart
      if (row.startedAt >= rangeStart - rangeDuration && row.startedAt < rangeStart) accumulate(prevSelected, u)
    }

    let agentB = byAgentMap.get(row.agentId)
    if (!agentB) {
      agentB = empty()
      byAgentMap.set(row.agentId, agentB)
    }
    accumulate(agentB, u)

    if (u.model) {
      let modelB = byModelMap.get(u.model)
      if (!modelB) {
        modelB = empty()
        byModelMap.set(u.model, modelB)
      }
      accumulate(modelB, u)
    }

    let convB = byConvMap.get(row.conversationId)
    if (!convB) {
      convB = empty()
      byConvMap.set(row.conversationId, convB)
    }
    accumulate(convB, u)
  }

  // 拉 agent 名称
  const agentRows =
    byAgentMap.size > 0
      ? await db.query.agents.findMany({
          where: inArray(schema.agents.id, Array.from(byAgentMap.keys())),
        })
      : []
  const agentNameById = new Map(agentRows.map((a) => [a.id, a.name]))

  // 拉 conversation 标题 + 排序按 totalTokens 取 top 10
  const topConvIds = Array.from(byConvMap.entries())
    .sort((a, b) => b[1].totalTokens - a[1].totalTokens)
    .slice(0, 10)
    .map(([id]) => id)
  const convRows =
    topConvIds.length > 0
      ? await db.query.conversations.findMany({
          where: inArray(schema.conversations.id, topConvIds),
        })
      : []
  const convById = new Map(convRows.map((c) => [c.id, c]))

  const summary: UsageSummary = {
    today,
    week,
    allTime,
    selected: rangeStart !== undefined ? selected : week,
    prevSelected: rangeStart !== undefined ? prevSelected : empty(),
    topConversations: topConvIds
      .map((id) => {
        const c = convById.get(id)
        const b = byConvMap.get(id)
        if (!c || !b) return null
        return {
          id,
          title: c.title,
          totalTokens: b.totalTokens,
          runs: b.runs,
          updatedAt: c.updatedAt,
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null),
    byAgent: Array.from(byAgentMap.entries())
      .map(([agentId, b]) => ({
        agentId,
        name: agentNameById.get(agentId) ?? agentId,
        totalTokens: b.totalTokens,
        runs: b.runs,
      }))
      .sort((a, b) => b.totalTokens - a.totalTokens),
    byModel: Array.from(byModelMap.entries())
      .map(([model, b]) => ({ model, totalTokens: b.totalTokens, runs: b.runs }))
      .sort((a, b) => b.totalTokens - a.totalTokens),
  }

  return NextResponse.json(summary)
}
