import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * 真实 LLM 打通的活体测试（默认跳过）。
 *
 * 它不是 CI 的一部分 —— 需要真实网络 + 真实密钥，跑法：
 *
 *   AGENTHUB_LIVE_LLM=1 "D:/work space/NodeJS/node.exe" node_modules/vitest/vitest.mjs run src/server/bailian-live.test.ts
 *
 * 验证两件事：
 *   1) 百炼主模型可用时，链路真的由百炼模型出流；
 *   2) 百炼主模型不可用（这里故意给一个坏 key）时，自动降级到 deepseek-v4-flash，
 *      并留下一条 from=bailian → to=deepseek 的切换记录。
 */

const LIVE = process.env.AGENTHUB_LIVE_LLM === '1'

function readEnvLocal(): Record<string, string> {
  const out: Record<string, string> = {}
  try {
    const raw = readFileSync(path.resolve(process.cwd(), '.env.local'), 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m) out[m[1]] = m[2]
    }
  } catch {
    // 没有 .env.local 就只看 process.env
  }
  return out
}

let dataDir: string
let client: typeof import('@/db/client')
let providerService: typeof import('./provider-service')
let failover: typeof import('./llm-failover')
let router: typeof import('./provider-router')
let CustomAgentAdapter: typeof import('./adapters/custom-agent-adapter').CustomAgentAdapter
let bailianKey = ''
let deepseekKey = ''

beforeAll(async () => {
  if (!LIVE) return
  const envLocal = readEnvLocal()
  bailianKey = process.env.BAILIAN_API_KEY || envLocal.BAILIAN_API_KEY || ''
  deepseekKey = process.env.DEEPSEEK_API_KEY || envLocal.DEEPSEEK_API_KEY || ''
  if (!bailianKey || !deepseekKey) {
    throw new Error('活体测试需要 BAILIAN_API_KEY 与 DEEPSEEK_API_KEY（.env.local 或环境变量）')
  }

  dataDir = mkdtempSync(path.join(tmpdir(), 'agenthub-bailian-live-'))
  process.env.AGENTHUB_DATA_DIR = dataDir
  process.env.BAILIAN_API_KEY = bailianKey
  vi.resetModules()

  client = await import('@/db/client')
  providerService = await import('./provider-service')
  router = await import('./provider-router')
  failover = await import('./llm-failover')
  CustomAgentAdapter = (await import('./adapters/custom-agent-adapter')).CustomAgentAdapter

  await providerService.upsertProvider({ id: 'deepseek', apiKey: deepseekKey, isConnected: true })
})

afterAll(() => {
  if (!LIVE) return
  client?.sqlite.close()
  if (dataDir) rmSync(dataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  delete process.env.AGENTHUB_DATA_DIR
  delete process.env.BAILIAN_API_KEY
})

async function runOnce(chain: Awaited<ReturnType<typeof failover.buildAgentFailoverChain>>, label: string) {
  const adapter = new CustomAgentAdapter()
  const input = {
    agentId: 'ag_live',
    conversationId: 'conv_live',
    runId: `run_${label}`,
    prompt: '用一句话说明什么是递归，不要用工具。',
    workspacePath: dataDir,
    systemPrompt: '你是一个简洁的助手。直接回答，不要调用工具。',
    apiKey: chain[0]?.apiKey ?? null,
    apiBaseUrl: chain[0]?.apiBaseUrl ?? null,
    modelId: chain[0]?.modelId ?? null,
    toolNames: [],
    customConfig: { modelProvider: 'openai-compatible' as const, supportsVision: false },
    failoverChain: chain,
    failoverCapabilityKey: 'agent:text',
  }

  const text: string[] = []
  let servedModel: string | null = null
  let failure: string | null = null
  for await (const ev of adapter.stream(input, new AbortController().signal)) {
    if (ev.type === 'part.delta' && ev.delta.type === 'text.append') text.push(ev.delta.text)
    if (ev.type === 'run.usage') servedModel = ev.usage.model ?? null
    if (ev.type === 'run.end' && ev.status === 'failed') failure = ev.error ?? 'unknown'
  }
  return { answer: text.join(''), servedModel, failure }
}

describe.skipIf(!LIVE)('百炼活体联通 + 降级兜底（真实网络）', () => {
  it('主模型可用：由百炼 qwen3.8-flash 出流，且没有发生切换', async () => {
    const chain = await failover.buildAgentFailoverChain({
      modelProvider: 'openai-compatible',
      modelId: 'qwen3.8-flash',
      apiKey: bailianKey,
      apiBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      modality: 'text',
    })
    expect(chain.map((c) => c.modelId)).toEqual(['qwen3.8-flash', 'deepseek-v4-flash'])

    const result = await runOnce(chain, 'happy')
    expect(result.failure).toBeNull()
    expect(result.servedModel).toBe('qwen3.8-flash')
    expect(result.answer.length).toBeGreaterThan(0)
    expect(await router.getFailoverEvents(5)).toHaveLength(0)
  }, 120_000)

  it('主模型不可用：自动降级到 deepseek-v4-flash，并留下切换记录', async () => {
    // 故意用坏 key 让百炼必失败（401 invalid_api_key）
    const chain = await failover.buildAgentFailoverChain({
      modelProvider: 'openai-compatible',
      modelId: 'qwen3.8-flash',
      apiKey: 'sk-invalid-probe-key',
      apiBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      modality: 'text',
    })
    expect(chain[0]?.modelId).toBe('qwen3.8-flash')
    expect(failover.hasBaselineFallback(chain)).toBe(true)

    const result = await runOnce(chain, 'failover')
    expect(result.failure).toBeNull()
    expect(result.servedModel).toBe('deepseek-v4-flash')
    expect(result.answer.length).toBeGreaterThan(0)

    const events = await router.getFailoverEvents(5)
    expect(events.length).toBeGreaterThan(0)
    expect(events[0].capabilityKey).toBe('agent:text')
    expect(events[0].fromProviderId).toBe('bailian')
    expect(events[0].toProviderId).toBe('deepseek')
  }, 120_000)
})
