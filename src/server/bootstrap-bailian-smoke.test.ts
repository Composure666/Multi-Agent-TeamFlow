import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * 真机 DB 冒烟：拿仓库里现有的 `.agenthub-data/agenthub.db`（真实本地库，含 99 个历史 Agent）
 * 跑一次 bootstrap，确认：
 *   - 百炼供应商被幂等补上，且不影响已存在的供应商；
 *   - 分配表按 DEFAULT_MODEL_ASSIGNMENT_PLAN 落库，链尾是 deepseek-v4-flash；
 *   - 重复 bootstrap 不产生重复行（幂等）。
 *
 * 只读不写：把真实库复制到临时目录后操作副本，避免污染开发库。
 */

let dataDir: string
let client: typeof import('@/db/client')
let llmShared: typeof import('@/lib/llm-shared')

const REAL_DB = path.resolve(process.cwd(), '.agenthub-data', 'agenthub.db')

beforeAll(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'agenthub-bootstrap-smoke-'))
  // 复制真实库（含 -wal / -shm，保证数据完整）
  const { copyFileSync, existsSync } = await import('node:fs')
  if (existsSync(REAL_DB)) {
    for (const suffix of ['', '-wal', '-shm']) {
      const src = `${REAL_DB}${suffix}`
      if (existsSync(src)) copyFileSync(src, path.join(dataDir, `agenthub.db${suffix}`))
    }
  }
  process.env.AGENTHUB_DATA_DIR = dataDir
  process.env.BAILIAN_API_KEY = 'sk-workspace-bailian-probe'
  vi.resetModules()
  client = await import('@/db/client')
  llmShared = await import('@/lib/llm-shared')
})

afterAll(() => {
  client?.sqlite.close()
  if (dataDir) rmSync(dataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  delete process.env.AGENTHUB_DATA_DIR
  delete process.env.BAILIAN_API_KEY
})

describe('真机库 bootstrap 冒烟', () => {
  it('百炼供应商已补上，且原有两个内置供应商没有被破坏', async () => {
    const { db, schema } = client
    const rows = await db.query.llmProviders.findMany()
    const byId = new Map(rows.map((r) => [r.id, r]))

    const bailian = byId.get('bailian')
    expect(bailian?.baseUrl).toBe(llmShared.BAILIAN_BASE_URL)
    expect(bailian?.models).toContain('qwen3-coder-plus')
    expect(bailian?.isConnected).toBe(true)

    // deepseek 是历史 Agent 的主力供应商，key 必须保留
    expect(byId.get('deepseek')?.apiKey).toBeTruthy()
    // 原 anthropic / openai 行还在（custom baseUrl / 空 models 都是用户自己配的）
    expect(byId.has('anthropic')).toBe(true)
    expect(byId.has('openai')).toBe(true)
  })

  it('分配表落库，且 agent:code 链是 coder-plus → deepseek-v4-flash', async () => {
    const { db, schema } = client
    const rows = await db.query.llmModelAssignments.findMany()
    const code = rows
      .filter((r) => r.capabilityKey === 'agent:code')
      .sort((a, b) => a.priority - b.priority)
    expect(code.map((r) => `${r.providerId}/${r.modelName}`)).toEqual([
      'bailian/qwen3-coder-plus',
      'deepseek/deepseek-v4-flash',
    ])
  })

  it('历史 Agent（99 个 deepseek-v4-flash）的模型配置没有被改动', async () => {
    const { db, schema } = client
    const agents = await db.query.agents.findMany()
    const deepseekAgents = agents.filter((a) => a.modelProvider === 'deepseek' && a.modelId === 'deepseek-v4-flash')
    expect(deepseekAgents.length).toBeGreaterThan(0)
    for (const a of deepseekAgents) {
      // 百炼接入只动「供应商行 / 分配表」，绝不改写历史 Agent 的 provider 与 model
      expect(a.modelProvider).toBe('deepseek')
      expect(a.modelId).toBe('deepseek-v4-flash')

      if (a.modality === 'image') {
        // 唯一例外：生图模态必须走 image-gen 适配器。挂 chat 适配器时降级链会被解析成
        // 生图模型，chat 请求被网关按模型路由拒掉（input.messages 校验失败），
        // 且该错误不触发降级 → 每次 run 都在 0.3s 内猝死。
        expect(a.adapterName).toBe('image-gen')
      } else {
        expect(a.adapterName).toBe('custom')
      }
    }
  })

  it('重复 bootstrap 幂等：供应商与分配行数不再变化', async () => {
    const { sqlite } = client
    const { bootstrapDatabase } = await import('@/db/bootstrap')
    const countProviders = () => (sqlite.prepare('SELECT COUNT(*) AS n FROM llm_providers').get() as { n: number }).n
    const countAssignments = () =>
      (sqlite.prepare('SELECT COUNT(*) AS n FROM llm_model_assignments').get() as { n: number }).n

    const before = { p: countProviders(), a: countAssignments() }
    bootstrapDatabase(sqlite)
    bootstrapDatabase(sqlite)
    expect({ p: countProviders(), a: countAssignments() }).toEqual(before)
  })
})
