import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * D-P2-1 鉴别测试：平均耗时必须是全量聚合，不能是「最近 2000 条」明细的样本均值。
 *
 * 种子故意让两者拉开：最旧的 100 条耗时 100_000ms，最新 2000 条耗时 1_000ms。
 * 明细上限 2000 条时样本均值 ≈ 1000ms，全量均值 = (100×100000 + 2000×1000) / 2100 ≈ 5714ms。
 * 旧实现（样本均值）在这里会稳定失败。
 *
 * 独立临时库，不碰真实库；不能放进 analytics-service.test.ts（那个文件约定只读不写库）。
 */

const DAY_MS = 24 * 60 * 60 * 1000

let dataDir: string
let service: typeof import('./analytics-service')
let dbClient: typeof import('@/db/client')

beforeAll(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'agenthub-analytics-avg-duration-'))
  process.env.AGENTHUB_DATA_DIR = dataDir
  vi.resetModules()
  service = await import('./analytics-service')
  dbClient = await import('@/db/client')
})

afterAll(() => {
  dbClient?.sqlite.close()
  if (dataDir) rmSync(dataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  delete process.env.AGENTHUB_DATA_DIR
  vi.resetModules()
})

describe('analytics-service · D-P2-1 平均耗时全量聚合', () => {
  it('超过 2000 条时平均耗时仍是全量均值（5714ms），成功率同为全量口径', async () => {
    const [agent] = await dbClient.db.select().from(dbClient.schema.agents).limit(1)
    expect(agent).toBeDefined()
    const now = Date.now()
    await dbClient.db.insert(dbClient.schema.conversations).values({
      id: 'conv_avg_duration',
      title: '平均耗时回归测试会话',
      mode: 'single',
      agentIds: [agent!.id],
      archived: false,
      createdAt: now,
      updatedAt: now,
    })

    const base = now - 5 * DAY_MS
    const rows = Array.from({ length: 2100 }, (_, i) => {
      const startedAt = base + i * 60_000
      // 最旧 100 条耗时 100 秒，其余 2000 条耗时 1 秒
      const durationMs = i < 100 ? 100_000 : 1_000
      return {
        id: `run_avg_${String(i).padStart(4, '0')}`,
        conversationId: 'conv_avg_duration',
        agentId: agent!.id,
        triggerMessageId: null,
        status: 'complete' as const,
        error: null,
        parentRunId: null,
        usage: null,
        startedAt,
        finishedAt: startedAt + durationMs,
      }
    })
    for (let i = 0; i < rows.length; i += 50) {
      await dbClient.db.insert(dbClient.schema.agentRuns).values(rows.slice(i, i + 50))
    }

    const a = await service.getRunAnalytics({ days: 7 })

    expect(a.total).toBe(2100)
    expect(a.items.length).toBe(2000)
    expect(a.truncated).toBe(true)
    expect(a.stats.avgDurationMs).toBe(5714)
    expect(a.stats.successRate).toBe(100)
  })
})
