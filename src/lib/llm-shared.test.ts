import { describe, expect, it } from 'vitest'

import {
  BAILIAN_BASE_URL,
  BAILIAN_MODELS,
  DEFAULT_MODEL_ASSIGNMENT_PLAN,
  FALLBACK_MODEL_NAME,
  FALLBACK_PROVIDER_ID,
  GLOBAL_PRIORITY_KEY,
  providerIdToModelProvider,
  resolveImageApiProtocol,
  scopeForCapability,
  toDashScopeSize,
} from '@/lib/llm-shared'

describe('providerIdToModelProvider', () => {
  it('内置供应商按运行时协议族映射（ark 要换名）', () => {
    expect(providerIdToModelProvider('deepseek')).toBe('deepseek')
    expect(providerIdToModelProvider('openai')).toBe('openai')
    expect(providerIdToModelProvider('anthropic')).toBe('anthropic')
    expect(providerIdToModelProvider('ark')).toBe('volcano-ark')
  })

  it('自定义供应商（含百炼）统一走 openai-compatible 协议', () => {
    expect(providerIdToModelProvider('bailian')).toBe('openai-compatible')
    expect(providerIdToModelProvider('prov_abc123')).toBe('openai-compatible')
    expect(providerIdToModelProvider(null)).toBe('openai-compatible')
  })
})

describe('resolveImageApiProtocol', () => {
  it('百炼接入点走原生 multimodal-generation 协议', () => {
    expect(resolveImageApiProtocol(BAILIAN_BASE_URL)).toBe('dashscope')
    expect(resolveImageApiProtocol('https://dashscope.aliyuncs.com/compatible-mode/v1/')).toBe('dashscope')
  })

  it('其它网关仍走 OpenAI 兼容的 /images/generations', () => {
    expect(resolveImageApiProtocol('https://api.siliconflow.cn/v1')).toBe('openai-compatible')
    expect(resolveImageApiProtocol('https://ai.example.com/openai/v1')).toBe('openai-compatible')
  })

  it('空值 / 非法 URL 不抛异常，按 OpenAI 兼容处理', () => {
    expect(resolveImageApiProtocol(null)).toBe('openai-compatible')
    expect(resolveImageApiProtocol('')).toBe('openai-compatible')
    expect(resolveImageApiProtocol('not-a-url')).toBe('openai-compatible')
  })
})

describe('toDashScopeSize', () => {
  it('把 1024x1024 转成百炼要求的 1024*1024', () => {
    expect(toDashScopeSize('1024x1024')).toBe('1024*1024')
    expect(toDashScopeSize('1024X768')).toBe('1024*768')
    expect(toDashScopeSize(' 512x512 ')).toBe('512*512')
  })
})

describe('模型分配默认方案', () => {
  it('每个能力链的最后一位都是 deepseek + deepseek-v4-flash', () => {
    for (const [capabilityKey, items] of Object.entries(DEFAULT_MODEL_ASSIGNMENT_PLAN)) {
      const last = [...items].sort((a, b) => a.priority - b.priority).at(-1)
      expect(`${capabilityKey}:${last?.providerId}/${last?.modelName}`).toBe(
        `${capabilityKey}:${FALLBACK_PROVIDER_ID}/${FALLBACK_MODEL_NAME}`,
      )
    }
  })

  it('四类 Agent 模态 + 四个系统能力 + 全局优先级都配齐了', () => {
    expect(Object.keys(DEFAULT_MODEL_ASSIGNMENT_PLAN).sort()).toEqual(
      [
        GLOBAL_PRIORITY_KEY,
        'agent:code',
        'agent:image',
        'agent:text',
        'agent:vision',
        'context_summary',
        'prompt_optimize',
        'system_chat',
        'task_planning',
        'global:default_provider',
        'global:fallback_provider',
      ].sort(),
    )
  })

  it('priority 从 0 连续递增，且同一链里没有重复的 provider+model', () => {
    for (const items of Object.values(DEFAULT_MODEL_ASSIGNMENT_PLAN)) {
      const sorted = [...items].sort((a, b) => a.priority - b.priority)
      expect(sorted.map((i) => i.priority)).toEqual(sorted.map((_, idx) => idx))
      const keys = sorted.map((i) => `${i.providerId}/${i.modelName}`)
      expect(new Set(keys).size).toBe(keys.length)
    }
  })

  it('scopeForCapability 按前缀区分 global / agent / system', () => {
    expect(scopeForCapability('global:default')).toBe('global')
    expect(scopeForCapability('agent:code')).toBe('agent')
    expect(scopeForCapability('prompt_optimize')).toBe('system')
  })
})

describe('百炼精选模型清单', () => {
  it('覆盖四类模态所需的能力位（通用 / 代码 / 视觉 / 生图）', () => {
    const models = new Set<string>(BAILIAN_MODELS)
    expect(models.has('qwen3.8-flash')).toBe(true)
    expect(models.has('qwen3-coder-plus')).toBe(true)
    expect(models.has('qwen3-vl-plus')).toBe(true)
    expect(models.has('z-image-turbo')).toBe(true)
    expect(models.has('qwen-image-3.0-pro')).toBe(true)
  })

  it('不包含已知不可用的模型（免费额度耗尽 / 未开通）', () => {
    const models = new Set<string>(BAILIAN_MODELS)
    // 实测这些走不通：免费额度耗尽或产品未开通
    for (const unusable of ['qwen-max', 'qwen-plus', 'qwen-turbo', 'kimi/kimi-k3', 'ZHIPU/GLM-5.3-Flash']) {
      expect(models.has(unusable)).toBe(false)
    }
  })
})
