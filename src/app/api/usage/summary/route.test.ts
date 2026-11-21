import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * D-P1-5 回归：usage/summary 的「今日」必须按客户端时区切分。
 *
 * 旧实现用服务端本地时区（容器为 UTC）算当日 00:00，于是 CST 02:00 的运行
 * （UTC 前一日 18:00）被划到昨天，与数据概览页「今日 X 次」（已传时区）互相矛盾。
 * 本文件用独立临时库，不碰真实库。
 */

const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000
const CST_SHIFT_MS = 8 * HOUR_MS

function cstStartOfDay(ts: number): number {
  const d = new Date(ts + CST_SHIFT_MS)
  d.setUTCHours(0, 0, 0, 0)
  return d.getTime() - CST_SHIFT_MS
}

function makeReq(url: string) {
  return new NextRequest(new Request(url))
}

let dataDir: string
let route: typeof import('./route')
let dbClient: typeof import('@/db/client')

beforeAll(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'agenthub-usage-summary-tz-'))
  process.env.AGENTHUB_DATA_DIR = dataDir
  vi.resetModules()
  route = await import('./route')
  dbClient = await import('@/db/client')
})

afterAll(() => {
  dbClient?.sqlite.close()
  if (dataDir) rmSync(dataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  delete process.env.AGENTHUB_DATA_DIR
  vi.resetModules()
})

async function seedRuns() {
  const [agent] = await dbClient.db.select().from(dbClient.schema.agents).limit(1)
  expect(agent).toBeDefined()
  const now = Date.now()
  const todayStartCst = cstStartOfDay(now)
  await dbClient.db.insert(dbClient.schema.conversations).values({
    id: 'conv_usage_tz',
    title: '时区回归测试会话',
    mode: 'single',
    agentIds: [agent!.id],
    archived: false,
    createdAt: now,
    updatedAt: now,
  })
  const usage = { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheCreationTokens: 0, model: 'test' }
  const rows = [
    // CST 今天 02:00 = UTC 前一日 18:00：UTC 口径下是昨天，CST 口径下是今天
    { id: 'run_usage_cst_today_0200', startedAt: todayStartCst + 2 * HOUR_MS },
    // CST 今天 10:00：两种口径下都是今天（对照组）
    { id: 'run_usage_cst_today_1000', startedAt: todayStartCst + 10 * HOUR_MS },
    // CST 昨天 02:00：两种口径下都是昨天（对照组）
    { id: 'run_usage_cst_yesterday_0200', startedAt: todayStartCst - DAY_MS + 2 * HOUR_MS },
    // 7 天前中午：滚动 7 天口径下在周内，日历 7 天口径下在周外
    { id: 'run_usage_7d_ago_noon', startedAt: todayStartCst - 7 * DAY_MS + 12 * HOUR_MS },
  ]
  for (const row of rows) {
    await dbClient.db.insert(dbClient.schema.agentRuns).values({
      id: row.id,
      conversationId: 'conv_usage_tz',
      agentId: agent!.id,
      triggerMessageId: null,
      status: 'complete',
      error: null,
      parentRunId: null,
      usage,
      startedAt: row.startedAt,
      finishedAt: row.startedAt + 1000,
    })
  }
}

describe('GET /api/usage/summary · D-P1-5 时区口径', () => {
  it('传 tzOffsetMinutes=-480 时，CST 02:00 的运行计入「今日」', async () => {
    await seedRuns()

    const res = await route.GET(makeReq('http://localhost/api/usage/summary?tzOffsetMinutes=-480'))
    expect(res.status).toBe(200)
    const summary = await res.json()

    expect(summary.today.runs).toBe(2)
    expect(summary.today.totalTokens).toBe(300)
    expect(summary.week.runs).toBe(3)
  })

  it('传 tzOffsetMinutes=0（UTC）时，同一条 CST 02:00 的运行不计入「今日」', async () => {
    // UTC 午夜 = CST 08:00：只有现在过了 CST 08:00，UTC 口径才会把这条运行划到昨天；
    // CST 00:00–08:00 时段内它仍在 UTC 的今天里（两口径重叠），期望值随当前时刻而定。
    const cstHour = new Date(Date.now() + CST_SHIFT_MS).getUTCHours()
    const res = await route.GET(makeReq('http://localhost/api/usage/summary?tzOffsetMinutes=0'))
    expect(res.status).toBe(200)
    const summary = await res.json()

    expect(summary.today.runs).toBe(cstHour >= 8 ? 1 : 2)
    expect(summary.today.totalTokens).toBe(cstHour >= 8 ? 150 : 300)
    // UTC 口径的周窗口也随 UTC 午夜滑动：CST 00:00–08:00 时，UTC 的“今天 + 前 6 天”
    // 会把 7 天前中午那条运行含进来（它在 UTC 日历里仍在周内），周计数为 4；
    // CST 08:00 之后 UTC 周窗口后移一位，它掉出周外，周计数为 3。这不是口径漂移，
    // 是同一条运行在两种时区的日历周里位置不同。
    expect(summary.week.runs).toBe(cstHour >= 8 ? 3 : 4)
  })

  it('「本周」是今天 + 之前 6 个日历日：7 天前中午的运行不在周内', async () => {
    const res = await route.GET(makeReq('http://localhost/api/usage/summary?tzOffsetMinutes=-480'))
    const summary = await res.json()
    expect(summary.allTime.runs).toBe(4)
    expect(summary.week.runs).toBe(3)
  })
})
