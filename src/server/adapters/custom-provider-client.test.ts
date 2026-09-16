import { afterEach, describe, expect, it } from 'vitest'

import {
  OPENAI_COMPATIBLE_API_KEY_REQUIRED_ERROR,
  OPENAI_COMPATIBLE_BASE_URL_REQUIRED_ERROR,
} from '@/shared/openai-compatible'

import { resolveCustomProviderClientConfig } from './custom-provider-client'

const ORIGINAL_ENV = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
  ARK_API_KEY: process.env.ARK_API_KEY,
}

afterEach(() => {
  restoreEnv('OPENAI_API_KEY', ORIGINAL_ENV.OPENAI_API_KEY)
  restoreEnv('DEEPSEEK_API_KEY', ORIGINAL_ENV.DEEPSEEK_API_KEY)
  restoreEnv('ARK_API_KEY', ORIGINAL_ENV.ARK_API_KEY)
})

describe('resolveCustomProviderClientConfig', () => {
  it('uses per-agent key and base URL for OpenAI-compatible providers', () => {
    expect(
      resolveCustomProviderClientConfig(
        'openai-compatible',
        '  provider-key  ',
        '  https://dashscope.aliyuncs.com/compatible-mode/v1  ',
      ),
    ).toEqual({
      apiKey: 'provider-key',
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    })
  })

  it('requires Base URL for OpenAI-compatible providers', () => {
    expect(() =>
      resolveCustomProviderClientConfig('openai-compatible', 'provider-key', null),
    ).toThrow(OPENAI_COMPATIBLE_BASE_URL_REQUIRED_ERROR)
  })

  it('requires per-agent key for OpenAI-compatible providers', () => {
    expect(() =>
      resolveCustomProviderClientConfig(
        'openai-compatible',
        null,
        'https://dashscope.aliyuncs.com/compatible-mode/v1',
      ),
    ).toThrow(OPENAI_COMPATIBLE_API_KEY_REQUIRED_ERROR)
  })

  it('keeps named provider environment fallbacks', () => {
    process.env.OPENAI_API_KEY = 'env-openai-key'

    expect(resolveCustomProviderClientConfig('openai')).toEqual({ apiKey: 'env-openai-key' })
  })

  /**
   * 回归：显式端点必须优先于厂商默认地址。
   *
   * 老逻辑对 deepseek / volcano-ark / openai **无条件**用官方默认地址、忽略 `apiBaseUrl`，
   * 于是 `model_provider=deepseek` + `api_base_url=百炼` 的成员（线上 5 个视觉类成员就这么配的）
   * 拿着百炼 key 去打 `api.deepseek.com` → 401，且被记到 deepseek 名下把兜底打进冷却。
   */
  it('deepseek：显式端点优先，没给才用官方默认地址', () => {
    expect(
      resolveCustomProviderClientConfig('deepseek', ' bailian-key ', '  https://dashscope.aliyuncs.com/compatible-mode/v1  '),
    ).toEqual({
      apiKey: 'bailian-key',
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    })

    process.env.DEEPSEEK_API_KEY = 'env-deepseek-key'
    expect(resolveCustomProviderClientConfig('deepseek')).toEqual({
      apiKey: 'env-deepseek-key',
      baseURL: 'https://api.deepseek.com/v1',
    })
  })

  it('volcano-ark：显式端点优先，没给才用官方默认地址', () => {
    process.env.ARK_API_KEY = 'env-ark-key'
    expect(resolveCustomProviderClientConfig('volcano-ark', null, 'https://gateway.example.com/v1')).toEqual({
      apiKey: 'env-ark-key',
      baseURL: 'https://gateway.example.com/v1',
    })
    expect(resolveCustomProviderClientConfig('volcano-ark')).toEqual({
      apiKey: 'env-ark-key',
      baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
    })
  })

  it('openai：给了端点就带上，没给就交给 SDK 默认', () => {
    process.env.OPENAI_API_KEY = 'env-openai-key'
    expect(resolveCustomProviderClientConfig('openai', null, ' https://proxy.example.com/v1 ')).toEqual({
      apiKey: 'env-openai-key',
      baseURL: 'https://proxy.example.com/v1',
    })
    expect(resolveCustomProviderClientConfig('openai')).toEqual({ apiKey: 'env-openai-key' })
  })
})

function restoreEnv(key: keyof typeof ORIGINAL_ENV, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key]
  } else {
    process.env[key] = value
  }
}
