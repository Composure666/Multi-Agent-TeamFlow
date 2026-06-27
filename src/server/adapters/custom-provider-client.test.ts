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
})

function restoreEnv(key: keyof typeof ORIGINAL_ENV, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key]
  } else {
    process.env[key] = value
  }
}
