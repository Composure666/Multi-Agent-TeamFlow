import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * 覆盖「验收重试 → 产物爆炸」的兜底：同一派单子任务里重复交付同标题同类型的产物时，
 * write_artifact 必须把后一次交付挂成新版本，而不是再建一个独立产物。
 *
 * 背景：验收门禁不通过时 runChildTask 会重试（最多 4 次），补救轮再跑（最多 3 轮）。
 * 以前每一次重做都是全新 artifactId，一次交付物能堆出十几个同标题卡片。
 */
let dataDir: string
let dbClient: typeof import('@/db/client')
let tool: typeof import('./write-artifact').writeArtifactTool

const conversationId = 'conv_write_artifact_test'
let agentId = ''

function ctx(overrides: { taskId?: string | null } = {}) {
  return {
    conversationId,
    workspacePath: dataDir,
    agentId,
    runId: 'run_write_artifact_test',
    taskId: overrides.taskId === undefined ? 'task_retry' : overrides.taskId,
    abortSignal: new AbortController().signal,
  }
}

const documentArgs = {
  type: 'document' as const,
  title: '重试幂等测试报告',
  content: { format: 'markdown', content: '# hello' },
}

beforeAll(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'agenthub-write-artifact-'))
  process.env.AGENTHUB_DATA_DIR = dataDir
  vi.resetModules()

  dbClient = await import('@/db/client')
  // bootstrap 会 seed 内置 agent，借一个来满足 artifacts 的外键
  const agent = await dbClient.db.query.agents.findFirst()
  agentId = agent?.id ?? ''
  await dbClient.db.insert(dbClient.schema.conversations).values({
    id: conversationId,
    title: 'write_artifact 幂等测试',
    mode: 'single',
    agentIds: [agentId],
    // 默认是 review —— 不设成 auto 的话每次 write_artifact 都会挂住等人工审批
    fsWriteApprovalMode: 'auto',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })

  tool = (await import('./write-artifact')).writeArtifactTool
})

afterAll(() => {
  dbClient?.sqlite.close()
  if (dataDir) rmSync(dataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  delete process.env.AGENTHUB_DATA_DIR
})

describe('writeArtifactTool', () => {
  it('returns actionable guidance for empty tool calls', async () => {
    const result = await tool.handler(
      {},
      {
        conversationId: 'conv_test',
        workspacePath: 'C:/tmp/workspace',
        agentId: 'ag_test',
        runId: 'run_test',
        abortSignal: new AbortController().signal,
      },
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('write_artifact requires complete args')
      expect(result.error).toContain('type')
      expect(result.error).toContain('title')
      expect(result.error).toContain('content')
      expect(result.error).toContain('document')
    }
  })
})

describe('writeArtifactTool redelivery idempotency', () => {
  it('turns a repeated delivery inside one task into a new version, not a new artifact', async () => {
    const first = await tool.handler({ ...documentArgs, title: '信息图 A' }, ctx())
    expect(first.ok).toBe(true)
    const firstId = (first as { ok: true; value: { artifactId: string } }).value.artifactId

    const second = await tool.handler({ ...documentArgs, title: '信息图 A' }, ctx())
    expect(second.ok).toBe(true)
    const secondValue = (second as { ok: true; value: { artifactId: string; version: number; parentArtifactId: string | null } }).value

    // 关键：重做挂成 v2 并链到 v1，而不是又一个 version=1 的孤立产物
    expect(secondValue.version).toBe(2)
    expect(secondValue.parentArtifactId).toBe(firstId)
    expect(secondValue.artifactId).not.toBe(firstId)
  })

  it('keeps top-level conversation deliveries standalone', async () => {
    const first = await tool.handler({ ...documentArgs, title: '信息图 B' }, ctx({ taskId: null }))
    const second = await tool.handler({ ...documentArgs, title: '信息图 B' }, ctx({ taskId: null }))
    const secondValue = (second as { ok: true; value: { version: number; parentArtifactId: string | null } }).value

    // 非派单场景不受影响：用户主动创建同名产物不应被自动合并成版本链
    expect(secondValue.version).toBe(1)
    expect(secondValue.parentArtifactId).toBeNull()
    expect(first.ok).toBe(true)
  })

  it('still honours an explicit parentArtifactId', async () => {
    const first = await tool.handler({ ...documentArgs, title: '信息图 C' }, ctx())
    const firstId = (first as { ok: true; value: { artifactId: string } }).value.artifactId

    const second = await tool.handler(
      { ...documentArgs, title: '信息图 D', parentArtifactId: firstId },
      ctx(),
    )
    const secondValue = (second as { ok: true; value: { version: number; parentArtifactId: string | null } }).value

    expect(secondValue.version).toBe(2)
    expect(secondValue.parentArtifactId).toBe(firstId)
  })
})
