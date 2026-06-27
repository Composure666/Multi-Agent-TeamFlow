import {
  validateOpenAICompatibleApiKey,
  validateOpenAICompatibleBaseUrl,
} from '@/shared/openai-compatible'
import type { ModelProvider } from '@/shared/types'

const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1'
const DEFAULT_VOLCANO_ARK_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3'

export interface CustomProviderClientConfig {
  apiKey: string
  baseURL?: string
}

export function resolveCustomProviderClientConfig(
  provider: ModelProvider,
  overrideKey?: string | null,
  apiBaseUrl?: string | null,
): CustomProviderClientConfig {
  if (provider === 'deepseek') {
    const apiKey = overrideKey?.trim() || process.env.DEEPSEEK_API_KEY
    if (!apiKey) throw new Error('DEEPSEEK_API_KEY not set and agent has no apiKey')
    return {
      apiKey,
      baseURL: DEFAULT_DEEPSEEK_BASE_URL,
    }
  }
  if (provider === 'volcano-ark') {
    const apiKey = overrideKey?.trim() || process.env.ARK_API_KEY
    if (!apiKey) throw new Error('ARK_API_KEY not set and agent has no apiKey')
    return {
      apiKey,
      baseURL: DEFAULT_VOLCANO_ARK_BASE_URL,
    }
  }
  if (provider === 'openai') {
    const apiKey = overrideKey?.trim() || process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error('OPENAI_API_KEY not set and agent has no apiKey')
    return { apiKey }
  }
  if (provider === 'openai-compatible') {
    const baseUrlError = validateOpenAICompatibleBaseUrl(provider, apiBaseUrl)
    if (baseUrlError) throw new Error(baseUrlError)
    const apiKeyError = validateOpenAICompatibleApiKey(provider, overrideKey)
    if (apiKeyError) throw new Error(apiKeyError)

    return {
      apiKey: overrideKey?.trim() ?? '',
      baseURL: apiBaseUrl?.trim(),
    }
  }
  throw new Error(`CustomAgentAdapter does not support provider "${provider}" yet`)
}
