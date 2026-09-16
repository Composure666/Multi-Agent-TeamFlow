import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { ToolContext } from './types'

/**
 * image_generate 的端到端测试：真实 DB / 真实落盘 / 真实产物聚合，只 mock 网络边界。
 *
 * 覆盖 P1「把生图从适配器变成能力」的三件事：
 *   1) 供应商取自「设置-模型分配 → 生图 Agent」那条链，与具体 Agent 用什么模型无关；
 *   2) 交付链路齐全：尺寸修边 → 可选落盘 → 存储 → 图片产物（图集聚合）→ run 验收证据；
 *   3) 失败时给的是可操作的排查提示，而不是把 SDK 原文甩回给模型。
 */

/** 1×1 的合法 PNG（IHDR 宽高都是 1，`readImagePixelSize` 认得出）。 */
const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

let dataDir: string
let client: typeof import('@/db/client')
let evidence: typeof import('@/server/dispatch-run-evidence')
let mod: typeof import('./image-generate')

const BAILIAN_KEY = 'sk-test-bailian-image'
let agentId = ''

const originalFetch = globalThis.fetch
let healthyFetch: ReturnType<typeof vi.fn>

beforeAll(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'agenthub-image-generate-'))
  process.env.AGENTHUB_DATA_DIR = dataDir
  process.env.BAILIAN_API_KEY = BAILIAN_KEY
  vi.resetModules()

  client = await import('@/db/client')
  evidence = await import('@/server/dispatch-run-evidence')
  mod = await import('./image-generate')

  const agent = await client.db.query.agents.findFirst()
  agentId = agent?.id ?? ''

  healthyFetch = vi.fn(async (input: unknown) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : ''
    if (url.includes('/multimodal-generation/generation')) {
      return new Response(
        JSON.stringify({
          output: { choices: [{ message: { content: [{ image: 'https://cdn.example.com/gen.png' }] } }] },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }
    if (url === 'https://cdn.example.com/gen.png') {
      return new Response(new Uint8Array(ONE_PX_PNG), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      })
    }
    throw new Error(`unexpected fetch: ${url}`)
  })
  globalThis.fetch = healthyFetch as unknown as typeof fetch
})

afterAll(() => {
  globalThis.fetch = originalFetch
  client?.sqlite.close()
  if (dataDir) rmSync(dataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  delete process.env.AGENTHUB_DATA_DIR
  delete process.env.BAILIAN_API_KEY
})

/** 每个用例一个独立会话 —— 图片产物按会话聚合，共用会话会互相干扰。 */
async function newConversation(tag: string): Promise<string> {
  const id = `conv_img_${tag}`
  await client.db.insert(client.schema.conversations).values({
    id,
    title: id,
    mode: 'single',
    agentIds: [agentId],
    fsWriteApprovalMode: 'auto',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })
  return id
}

function ctx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    conversationId: 'conv_img_default',
    workspacePath: dataDir,
    agentId,
    runId: `run_img_${Math.random().toString(36).slice(2, 10)}`,
    abortSignal: new AbortController().signal,
    ...overrides,
  }
}

function valueOf(result: unknown): Record<string, unknown> {
  return (result as { value: unknown }).value as Record<string, unknown>
}

describe('normalizeRequestedSize', () => {
  it('显式参数优先于 prompt 里写的尺寸', () => {
    expect(mod.normalizeRequestedSize('1920x1080', '顺便出个 1024x1024 的方图')).toBe('1920*1080')
  })

  it('参数缺省时从 prompt 里认像素尺寸或比例', () => {
    expect(mod.normalizeRequestedSize(undefined, '封面要求 1920×1080')).toBe('1920*1080')
    expect(mod.normalizeRequestedSize(undefined, '做成 16:9 的横版海报')).toBe('1920*1080')
    expect(mod.normalizeRequestedSize('   ', '做成 1:1 的方图')).toBe('1024*1024')
  })

  it('都认不出时回落到默认尺寸', () => {
    expect(mod.normalizeRequestedSize(undefined, '画一只戴帽子的猫')).toBe('1024*1024')
  })
})

describe('image_generate 工具', () => {
  it('出图并按交付链路交付：产物 + 落盘 + run 验收证据', async () => {
    const conversationId = await newConversation('happy')
    const context = ctx({ conversationId })

    const result = await mod.imageGenerateTool.handler(
      { prompt: '一只戴帽子的猫，扁平插画风格', size: '1920x1080', targetPath: 'assets/hero.png' },
      context,
    )

    expect(result.ok).toBe(true)
    const value = valueOf(result)
    // 模型取自「设置-模型分配 → 生图 Agent」的链首，与调用方 Agent 的模型无关
    expect(value.model).toBe('z-image-turbo')
    // 未配 OSS 时本地化到真实存在的 /api/artifact-images 路由（历史实现回的 /api/files/... 没有路由）
    expect(String(value.url)).toMatch(/^\/api\/artifact-images\//)
    expect(typeof value.artifactId).toBe('string')
    expect(value.requestedSize).toBe('1920*1080')
    expect(value.width).toBe(1)
    expect(value.height).toBe(1)

    // 落盘到工作区（下游成员要能按计划路径拿到真实文件）
    expect(value.savedPath).toBe('assets/hero.png')
    const onDisk = path.join(dataDir, 'assets', 'hero.png')
    expect(existsSync(onDisk)).toBe(true)
    expect(readFileSync(onDisk).equals(ONE_PX_PNG)).toBe(true)

    // 产物必须计入 run 的验收证据，否则「用 image_generate 交付」的任务过不了 targetPaths 门禁
    const runEvidence = evidence.getRunToolEvidence(context.runId)
    expect(runEvidence.artifacts).toHaveLength(1)
    expect(runEvidence.artifacts?.[0].artifactId).toBe(value.artifactId)
  })

  it('同会话连续出图合并进同一个图片产物（图集），不堆碎片卡片', async () => {
    const conversationId = await newConversation('gallery')
    const context = ctx({ conversationId })

    const first = await mod.imageGenerateTool.handler({ prompt: '第一张：封面' }, context)
    const second = await mod.imageGenerateTool.handler({ prompt: '第二张：内页' }, context)

    expect(first.ok && second.ok).toBe(true)
    const firstValue = valueOf(first)
    const secondValue = valueOf(second)

    expect(secondValue.artifactId).toBe(firstValue.artifactId)
    expect(secondValue.mergedIntoGallery).toBe(true)
    expect(secondValue.imageCount).toBe(2)
  })

  it('targetPath 越界时不落盘，但产物照常交付并说清原因', async () => {
    const conversationId = await newConversation('escape')
    const escapeName = `escape-${Date.now()}.png`

    const result = await mod.imageGenerateTool.handler(
      { prompt: '越界路径测试', targetPath: `../${escapeName}` },
      ctx({ conversationId }),
    )

    expect(result.ok).toBe(true)
    const value = valueOf(result)
    expect(value.savedPath).toBeUndefined()
    expect(String(value.savedPathError)).toContain('工作区')
    expect(existsSync(path.join(dataDir, '..', escapeName))).toBe(false)
  })

  it('生图端点不可用时给出排查顺序，而不是把 SDK 原文甩回去', async () => {
    const conversationId = await newConversation('failure')
    const failing = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })
    globalThis.fetch = failing as unknown as typeof fetch
    try {
      const result = await mod.imageGenerateTool.handler(
        { prompt: '网络故障路径' },
        ctx({ conversationId }),
      )
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toContain('image_generate 调用失败')
        expect(result.error).toContain('排查顺序')
        expect(result.error).toContain('设置-模型分配')
      }
    } finally {
      globalThis.fetch = healthyFetch as unknown as typeof fetch
      // 失败会写供应商健康状态（degraded / 冷却），别污染后续用例
      await client.db.delete(client.schema.llmProviderStatus)
    }
  })

  it('没有生图后端时指出该去哪里配（而不是静默失败）', async () => {
    const assignments = client.sqlite
      .prepare("SELECT id, model_name FROM llm_model_assignments WHERE capability_key = 'agent:image'")
      .all() as Array<{ id: string; model_name: string }>
    const provider = client.sqlite
      .prepare("SELECT api_key FROM llm_providers WHERE id = 'bailian'")
      .get() as { api_key: string | null } | undefined
    const envKey = process.env.BAILIAN_API_KEY
    const restoreAssignment = client.sqlite.prepare(
      'UPDATE llm_model_assignments SET model_name = ? WHERE id = ?',
    )
    const restoreKey = client.sqlite.prepare('UPDATE llm_providers SET api_key = ? WHERE id = ?')

    client.sqlite
      .prepare("UPDATE llm_model_assignments SET model_name = 'qwen3.8-flash' WHERE capability_key = 'agent:image'")
      .run()
    client.sqlite.prepare("UPDATE llm_providers SET api_key = NULL WHERE id = 'bailian'").run()
    delete process.env.BAILIAN_API_KEY

    try {
      const result = await mod.imageGenerateTool.handler({ prompt: '无后端' }, ctx())
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toContain('设置-模型分配')
        expect(result.error).toContain('设置-供应商')
      }
    } finally {
      for (const row of assignments) restoreAssignment.run(row.model_name, row.id)
      restoreKey.run(provider?.api_key ?? null, 'bailian')
      if (envKey !== undefined) process.env.BAILIAN_API_KEY = envKey
    }
  })
})
