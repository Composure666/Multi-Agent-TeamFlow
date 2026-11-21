import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * G4 回归测试：成功率分母必须与平均耗时同口径 —— 只计「已结束且 finishedAt 非 null」的行。
 *
 * 种子：1 条干净 complete（耗时 1000ms）、1 条干净 failed（耗时 2000ms）、
 * 1 条脏 complete（已结束但 finishedAt 为 null）、1 条 running。
 * 干净人口：成功率 = 1/2 = 50%，平均耗时 = (1000+2000)/2 = 1500ms。
 * 若脏行进了分母/分子，成功率会变成 2/3 ≈ 66.7%；KPI 的成功计数口径不动，仍含脏行（= 2）。
 *
 * 独立临时库，不碰真实库；时间全部取相对值（相对 now 的偏移），全天候通过。
 */

const DAY_MS = 24 * 60 * 60 * 1000

let dataDir: string
let service: typeof import('./analytics-service')
let dbClient: typeof import('@/db/client')

beforeAll(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'agenthub-analytics-success-rate-'))
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

describe('analytics-service · G4 成功率与平均耗时同口径', () => {
  it('已结束但 finishedAt 为 null 的脏行不进成功率分子/分母，KPI 计数仍含该行', async () => {
    const [agent] = await dbClient.db.select().from(dbClient.schema.agents).limit(1)
    expect(agent).toBeDefined()
    const now = Date.now()
    await dbClient.db.insert(dbClient.schema.conversations).values({
      id: 'conv_success_rate',
      title: '成功率口径回归测试会话',
      mode: 'single',
      agentIds: [agent!.id],
      archived: false,
      createdAt: now,
      updatedAt: now,
    })

    const base = now - 2 * DAY_MS
    await dbClient.db.insert(dbClient.schema.agentRuns).values([
      {
        id: 'run_sr_clean_complete',
        conversationId: 'conv_success_rate',
        agentId: agent!.id,
        triggerMessageId: null,
        status: 'complete' as const,
        error: null,
        parentRunId: null,
        usage: null,
        startedAt: base,
        finishedAt: base + 1_000,
      },
      {
        id: 'run_sr_clean_failed',
        conversationId: 'conv_success_rate',
        agentId: agent!.id,
        triggerMessageId: null,
        status: 'failed' as const,
        error: 'boom',
        parentRunId: null,
        usage: null,
        startedAt: base + 60_000,
        finishedAt: base + 62_000,
      },
      {
        // 脏行：已结束但 finishedAt 为 null
        id: 'run_sr_dirty_complete',
        conversationId: 'conv_success_rate',
        agentId: agent!.id,
        triggerMessageId: null,
        status: 'complete' as const,
        error: null,
        parentRunId: null,
        usage: null,
        startedAt: base + 120_000,
        finishedAt: null,
      },
      {
        id: 'run_sr_running',
        conversationId: 'conv_success_rate',
        agentId: agent!.id,
        triggerMessageId: null,
        status: 'running' as const,
        error: null,
        parentRunId: null,
        usage: null,
        startedAt: base + 180_000,
        finishedAt: null,
      },
    ])

    const a = await service.getRunAnalytics({ days: 7 })

    expect(a.total).toBe(4)
    expect(a.truncated).toBe(false)
    // 同一人口：干净 complete 1 条 / 干净已结束 2 条
    expect(a.stats.successRate).toBe(50)
    expect(a.stats.avgDurationMs).toBe(1500)
    // KPI 计数口径不动：成功计数仍含脏的 complete 行
    expect(a.stats.success).toBe(2)
    expect(a.stats.failed).toBe(1)
    expect(a.stats.running).toBe(1)
  })
})
