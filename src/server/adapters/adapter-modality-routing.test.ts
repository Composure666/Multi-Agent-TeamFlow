import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { AgentRow } from '@/db/schema'

/**
 * 回归：线上「落地发布组」的 t4「主图重做」连续 4 次尝试全部失败，t5 被连带 skipped。
 *
 * 根因是「模型协议 ⇄ 适配器」不匹配：
 *  - 该 Agent 的自有模型是 chat 模型（deepseek-v4-flash），却按 `agent:image` 解析出
 *    一串**生图模型**（bailian/z-image-turbo → qwen-image-3.0-pro → deepseek-v4-flash）；
 *  - 适配器是 custom（chat 协议），把 `{role:'system'}` + `{role:'user'}` 的 chat completions
 *    打到生图模型上；网关按模型名路由到生图处理器，按原生结构校验后回
 *    `Input should be 'user': input.messages.0.role & Input should be a valid list: input.messages.0.content`
 *    （实测是 **HTTP 200 + SSE error**，所以 classifyError 也判不出「可降级」）；
 *  - run 在 0.3s 内猝死，且 4/4 次报错逐字相同。
 *
 * 第一版修复判据取的是「`modality === 'image'` ⇒ 强制 image-gen 适配器 + 清空 tools」，
 * 方向错了：那把一批「chat 模型 + 工具循环」的视觉生产成员（生图师 / 视觉设计师 /
 * 图表设计师 / 主图设计师）一起改掉，它们从此只会调一个端点出一张栅格图 ——
 * 交付物从「成图 + 提示词文档 + 复现记录」缩成「一张图」，run 耗时从 97~2397s 缩到 12s。
 *
 * 现在判据是**自有模型是不是生图模型**：决定请求协议的是模型，不是成员分类。
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

describe('适配器路由：判据是「自有模型」而不是「模态」', () => {
  it('生图模型挂在 chat 适配器上时纠偏到 image-gen，并留下告警', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const effective = registry.resolveEffectiveAdapterName(
        agentRow({ modality: 'image', adapterName: 'custom', modelId: 'z-image-turbo' }),
      )
      expect(effective).toBe('image-gen')
      expect(warn).toHaveBeenCalledTimes(1)
      // 告警必须点名 Agent 与模型，便于线上定位是哪一条配置坏了
      const text = String(warn.mock.calls[0]?.[0])
      expect(text).toContain('ag_test')
      expect(text).toContain('z-image-turbo')
    } finally {
      warn.mockRestore()
    }
  })

  it('回归：生图模态 + chat 模型 + custom 适配器**保持 custom**，不被强制改成 image-gen', () => {
    // 2026-09-16 事故：旧判据只认 `modality === 'image'`，把一批「chat 模型 + 工具循环」的
    // 视觉生产成员（生图师 / 视觉设计师 / 图表设计师 / 主图设计师）连工具集一起改成了
    // image-gen —— 它们从此只会调一个端点出一张栅格图，能力反而被砍窄。
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      for (const modelId of ['deepseek-v4-flash', 'qwen3.8-flash', 'glm-5.3', 'qwen3-vl-plus']) {
        expect(
          registry.resolveEffectiveAdapterName(
            agentRow({ modality: 'image', adapterName: 'custom', modelId }),
          ),
        ).toBe('custom')
      }
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  it('生图模型 + image-gen 是正确配置，原样返回且不告警', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect(
        registry.resolveEffectiveAdapterName(
          agentRow({ modality: 'image', adapterName: 'image-gen', modelId: 'qwen-image-3.0-pro' }),
        ),
      ).toBe('image-gen')
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  it('判据与模态解耦：把生图模型配给 text 模态的成员，同样纠偏到 image-gen', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect(
        registry.resolveEffectiveAdapterName(
          agentRow({ modality: 'text', adapterName: 'custom', modelId: 'flux-1-dev' }),
        ),
      ).toBe('image-gen')
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

  it('模态取别名 / 大小写 / 空白时不影响判据（判据已与 modality 完全解耦）', () => {
    for (const modality of ['IMAGE', 'Image', '图文', 'multimodal', 'audio', '生图', ' image ', '', null]) {
      expect(
        registry.resolveEffectiveAdapterName(
          agentRow({ modality: modality as string, adapterName: 'custom', modelId: 'deepseek-v4-flash' }),
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
