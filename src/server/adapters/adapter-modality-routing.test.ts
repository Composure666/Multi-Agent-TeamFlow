import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { AgentRow } from '@/db/schema'

/**
 * 回归：线上「落地发布组」的 t4「主图重做」连续 4 次尝试全部失败，t5 被连带 skipped。
 *
 * 根因是「生图模态 + chat 适配器」这个组合：
 *  - modality='image' ⇒ AgentRunner 按 `agent:image` 解析降级链，链上是一串**生图模型**
 *    （线上实际是 bailian/z-image-turbo → bailian/qwen-image-3.0-pro → deepseek/deepseek-v4-flash）；
 *  - 但适配器是 custom（chat 协议），把 `{role:'system'}` + `{role:'user'}` 的
 *    chat completions 打到生图模型上；
 *  - 网关按模型名路由到生图处理器，按原生结构校验后回
 *    `Input should be 'user': input.messages.0.role & Input should be a valid list: input.messages.0.content`
 *    （实测是 **HTTP 200 + SSE error**，所以 classifyError 也判不出「可降级」）；
 *  - run 在 0.3s 内猝死，且 4/4 次报错逐字相同。
 *
 * 所以修复必须落在「模态 → 适配器」这条路由上，而不是生图请求本身（那条路径是对的）。
 */

let dataDir: string
let client: typeof import('@/db/client')
let registry: typeof import('./registry')
let adapter: typeof import('./custom-agent-adapter')

beforeAll(async () => {
  // 用临时数据目录，避免并发跑全量测试时去抢真实 `.agenthub-data` 的锁
  dataDir = mkdtempSync(path.join(tmpdir(), 'agenthub-adapter-modality-'))
  process.env.AGENTHUB_DATA_DIR = dataDir
  vi.resetModules()
  client = await import('@/db/client')
  registry = await import('./registry')
  adapter = await import('./custom-agent-adapter')
})

afterAll(() => {
  // 必须先关连接：Windows 上 sqlite 文件句柄未释放时删目录会 EPERM
  try {
    client?.sqlite.close()
  } catch {
    // 已关闭 / 未打开都不影响后续清理
  }
  if (dataDir) rmSync(dataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  delete process.env.AGENTHUB_DATA_DIR
})

function agentRow(overrides: Partial<AgentRow> = {}): AgentRow {
  return {
    id: 'ag_test',
    name: '主图设计师',
    avatar: '🎨',
    description: '横版主图生成与视觉风格定义',
    capabilities: [],
    systemPrompt: '',
    adapterName: 'custom',
    modelProvider: 'deepseek',
    modelId: 'deepseek-v4-flash',
    apiKey: null,
    apiBaseUrl: null,
    toolNames: [],
    mcpServerIds: [],
    skillIds: [],
    isBuiltin: false,
    isOrchestrator: false,
    supportsVision: false,
    modality: 'text',
    createdAt: 0,
    ...overrides,
  } as AgentRow
}

describe('生图模态的适配器路由', () => {
  it('生图模态挂着 chat 适配器时纠偏到 image-gen，并留下告警', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const effective = registry.resolveEffectiveAdapterName(
        agentRow({ modality: 'image', adapterName: 'custom' }),
      )
      expect(effective).toBe('image-gen')
      expect(warn).toHaveBeenCalledTimes(1)
      // 告警必须点名 Agent，便于线上定位是哪一条配置坏了
      expect(String(warn.mock.calls[0]?.[0])).toContain('ag_test')
    } finally {
      warn.mockRestore()
    }
  })

  it('生图模态 + image-gen 是正确配置，原样返回且不告警', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect(
        registry.resolveEffectiveAdapterName(agentRow({ modality: 'image', adapterName: 'image-gen' })),
      ).toBe('image-gen')
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  it('非生图模态不干扰用户显式选择的适配器', () => {
    expect(registry.resolveEffectiveAdapterName(agentRow({ modality: 'text', adapterName: 'custom' }))).toBe(
      'custom',
    )
    expect(
      registry.resolveEffectiveAdapterName(agentRow({ modality: 'code', adapterName: 'claude-code' })),
    ).toBe('claude-code')
    expect(registry.resolveEffectiveAdapterName(agentRow({ modality: 'vision', adapterName: 'custom' }))).toBe(
      'custom',
    )
  })

  it('模态判据与 normalizeModality 一致：首尾空白会被裁掉，所以仍算生图', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect(
        registry.resolveEffectiveAdapterName(agentRow({ modality: ' image ', adapterName: 'custom' })),
      ).toBe('image-gen')
    } finally {
      warn.mockRestore()
    }
  })

  it('模态判据与 normalizeModality 一致：看起来像生图但归一化后不是的值不纠偏', () => {
    // normalizeModality 只认精确的小写 'image'；别名表把 audio→text、multimodal→vision，
    // 大小写变体则落到兜底值 'text'。这些都不能触发纠偏，否则会把非生图 Agent
    // 强行改成生图适配器（它拿不到生图端点，反而更糟）。
    for (const modality of ['IMAGE', 'Image', '图文', 'multimodal', 'audio', '生图', '', null]) {
      expect(
        registry.resolveEffectiveAdapterName(
          agentRow({ modality: modality as string, adapterName: 'custom' }),
        ),
      ).toBe('custom')
    }
  })
})

describe('chat 请求被路由到生图模型时的报错翻译', () => {
  const RAW =
    "Input should be 'user': input.messages.0.role & " +
    'Input should be a valid list: input.messages.0.content & ' +
    'Input should be a valid list: input.messages.1.content'

  it('补上根因与修法，同时保留原始报错文本', () => {
    const explained = adapter.explainChatEndpointError(new Error(RAW)) as Error
    expect(explained).toBeInstanceOf(Error)
    expect(explained.message).toContain('生图')
    expect(explained.message).toContain('image-gen')
    expect(explained.message).toContain('模态')
    // 原始报错的尾巴必须留着：它含 request_id 之外的校验细节，是二次排查的唯一线索
    expect(explained.message).toContain('input.messages.0.role')
  })

  it('非 Error 形态也能识别（网关有时抛普通对象 / 字符串）', () => {
    expect((adapter.explainChatEndpointError({ message: RAW }) as Error).message).toContain('image-gen')
    expect((adapter.explainChatEndpointError(RAW) as Error).message).toContain('image-gen')
  })

  it('无关报错原样返回，不掩盖真实原因', () => {
    const other = new Error('Request timed out after 60000ms')
    expect(adapter.explainChatEndpointError(other)).toBe(other)
  })
})
