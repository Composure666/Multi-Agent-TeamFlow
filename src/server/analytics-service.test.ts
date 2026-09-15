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

  it('明细字段完整：任务名、Agent 名、时长、Token、会话 id 都不为空', async () => {
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

  it('start=0（全部时间）不会生成上千个趋势桶，且起点不早于库内第一条 run', async () => {
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
