import { count, min } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { db, schema } from '@/db/client'
import { getRunAnalytics, modalityLabel } from '@/server/analytics-service'

/**
 * 数据概览页的数据完整性验收（只读，不写库）。
 *
 * 这里守的是 v3 那次的教训：概览页曾经把「任务列表 / 趋势 / 分布 / 成功率」
 * 接在 automation_runs（几十条 demo 种子）上，而 KPI 接在 agent_runs 上，
 * 于是同一屏里出现「运行 119 次 / 任务列表 4 条」这种自相矛盾的显示。
 * 下面每条断言都在校验「同一份数据源、四组视图互相自洽」。
 */

async function rawCount(): Promise<number> {
  const [row] = await db.select({ value: count() }).from(schema.agentRuns)
  return Number(row.value)
}

async function rawMinStartedAt(): Promise<number> {
  const [row] = await db.select({ value: min(schema.agentRuns.startedAt) }).from(schema.agentRuns)
  return Number(row.value ?? 0)
}

/**
 * 下面两个用例断言的是「真实 run 数据上的自洽性」，库里没数据时它们无意义。
 *
 * 本项目的单测是**直连真实库**的集成测试（没有 setup 文件、不自建 fixture），
 * 而 `pnpm db:seed` 只种内置 Agent、不造 run。CI 上是全新空库，硬跑只会得到
 * `expected 0 to be greater than 0` 这种**假失败**。
 * ⇒ 无数据时显式 skip：报告里显示为 skipped 而非 passed，欠 fixture 这件事不会被藏起来。
 */
async function skipIfNoRunData(ctx: { skip: (note?: string) => void }): Promise<void> {
  if ((await rawCount()) === 0) {
    ctx.skip('库里没有 run 数据（本项目尚无 run 的 fixture），跳过依赖真实数据的断言')
  }
}

describe('analytics-service · 数据概览数据完整性', () => {
  it('全部时间：total 与库内 run 数一致，且明细不被截断', async () => {
    const expected = await rawCount()
    const analytics = await getRunAnalytics({ start: 0 })

    expect(analytics.total).toBe(expected)
    expect(analytics.items.length).toBe(expected)
    expect(analytics.truncated).toBe(false)
    expect(analytics.stats.allTimeTotal).toBe(expected)
  })

  it('趋势、Agent 分布、状态分布、状态计数四者与 total 自洽', async () => {
    const a = await getRunAnalytics({ start: 0 })

    expect(a.trend.reduce((sum, p) => sum + p.value, 0)).toBe(a.total)
    expect(a.agentDistribution.reduce((sum, item) => sum + item.count, 0)).toBe(a.total)
    expect(a.statusDistribution.reduce((sum, item) => sum + item.count, 0)).toBe(a.total)

    const stats = a.stats
    expect(stats.success + stats.running + stats.failed + stats.aborted).toBe(a.total)
  })

  it('各状态计数与库内 group by 结果逐项对齐', async () => {
    const a = await getRunAnalytics({ start: 0 })
    const rows = await db
      .select({ status: schema.agentRuns.status, value: count() })
      .from(schema.agentRuns)
      .groupBy(schema.agentRuns.status)
    const byStatus = new Map(rows.map((row) => [row.status, Number(row.value)]))

    expect(a.stats.success).toBe(byStatus.get('complete') ?? 0)
    expect(a.stats.failed).toBe(byStatus.get('failed') ?? 0)
    expect(a.stats.aborted).toBe(byStatus.get('aborted') ?? 0)
    expect(a.stats.running).toBe((byStatus.get('running') ?? 0) + (byStatus.get('queued') ?? 0))
  })

  it('明细字段完整：任务名、Agent 名、时长、Token、会话 id 都不为空', async (ctx) => {
    await skipIfNoRunData(ctx)

    const a = await getRunAnalytics({ days: 30 })
    expect(a.items.length).toBeGreaterThan(0)

    for (const item of a.items.slice(0, 30)) {
      expect(item.id).toMatch(/^run_/)
      expect(item.conversationId.length).toBeGreaterThan(0)
      expect(item.title.length).toBeGreaterThan(0)
      expect(item.agentName.length).toBeGreaterThan(0)
      expect(item.category.length).toBeGreaterThan(0)
      expect(item.startedAt).toBeGreaterThan(0)
      expect(item.totalTokens).toBeGreaterThanOrEqual(0)
      // 已结束的 run 必须有耗时；运行中的才允许为 null
      if (item.status !== 'running') expect(item.durationMs).not.toBeNull()
    }
  })

  it('明细按开始时间倒序，且都在请求范围内', async () => {
    const a = await getRunAnalytics({ days: 7 })
    for (let i = 1; i < a.items.length; i += 1) {
      expect(a.items[i - 1].startedAt).toBeGreaterThanOrEqual(a.items[i].startedAt)
      expect(a.items[i].startedAt).toBeGreaterThanOrEqual(a.range.start)
      expect(a.items[i].startedAt).toBeLessThan(a.range.end)
    }
  })

  it('start=0（全部时间）不会生成上千个趋势桶，且起点不早于库内第一条 run', async (ctx) => {
    await skipIfNoRunData(ctx)

    const a = await getRunAnalytics({ start: 0 })
    const earliest = await rawMinStartedAt()

    expect(a.trend.length).toBeLessThanOrEqual(365)
    expect(a.range.start).toBeGreaterThan(0)
    // 起点被钳制在「最早一条 run 所在日」附近（同一天内）
    expect(a.range.start).toBeLessThanOrEqual(earliest)
    expect(a.range.start).toBeGreaterThan(earliest - 2 * 86400000)
  })

  it('时间窗越窄，条数不会反而变多', async () => {
    const wide = await getRunAnalytics({ days: 90 })
    const narrow = await getRunAnalytics({ days: 7 })
    expect(narrow.total).toBeLessThanOrEqual(wide.total)
  })

  it('成功率分母只算已结束的 run（运行中不计入）', async () => {
    const a = await getRunAnalytics({ start: 0 })
    const finished = a.stats.success + a.stats.failed + a.stats.aborted
    const expected = finished > 0 ? Math.round((a.stats.success / finished) * 1000) / 10 : 0
    expect(a.stats.successRate).toBe(expected)
  })

  it('趋势桶起点对齐当日 00:00 —— 否则按日期 key 查桶会把当天数据整条丢掉', async () => {
    // 线上容器 TZ=UTC 时，旧实现拿 end - 1 天 当起点（非零点），
    // 于是「最近 7 天」只画出 9/14 一根柱子且恒为 0，当天的数据全部查不到桶。
    const end = Date.now()
    const forShanghai = await getRunAnalytics({ start: end - 6 * 86400000, end, days: 7, tzOffsetMinutes: -480 })
    const shift = 8 * 3600_000
    const startAsLocal = new Date(forShanghai.range.start + shift)
    expect(startAsLocal.getUTCHours()).toBe(0)
    expect(startAsLocal.getUTCMinutes()).toBe(0)
    expect(startAsLocal.getUTCSeconds()).toBe(0)
    // 桶不能丢数据：所有落在范围内的 run 都必须能找到自己的那一格
    expect(forShanghai.trend.reduce((sum, p) => sum + p.value, 0)).toBe(forShanghai.total)

    // 不传时区时按服务端本地时区算，同样要对齐
    const serverTz = await getRunAnalytics({ start: end - 6 * 86400000, end, days: 7 })
    expect(new Date(serverTz.range.start).getHours()).toBe(0)
    expect(serverTz.trend.reduce((sum, p) => sum + p.value, 0)).toBe(serverTz.total)
  })

  it('modalityLabel 覆盖四种业务模态并保留未知值', () => {
    expect(modalityLabel('text')).toBe('文本')
    expect(modalityLabel('vision')).toBe('视觉')
    expect(modalityLabel('image')).toBe('生图')
    expect(modalityLabel('code')).toBe('代码')
    expect(modalityLabel(null)).toBe('未分类')
    expect(modalityLabel(undefined)).toBe('未分类')
    expect(modalityLabel('audio')).toBe('语音')
  })
})
