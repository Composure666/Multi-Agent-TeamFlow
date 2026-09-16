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

/** 取「显式给的端点」，空串/纯空白一律当没给。 */
function explicitBaseUrl(apiBaseUrl?: string | null): string | undefined {
  const trimmed = apiBaseUrl?.trim()
  return trimmed ? trimmed : undefined
}

/**
 * 解析一次 chat 调用的「key + 端点」。
 *
 * **端点优先级：显式传入的 `apiBaseUrl` ＞ 该厂商的官方默认地址。**
 *
 * ⚠️ 2026-09-16 修正（原来是无条件用官方默认地址、**忽略** `apiBaseUrl`）：
 * `model_provider` 只是一个**标签**，用户完全可能把它写成 `deepseek` 而把 base URL 指向
 * 别的网关 —— 线上就有 5 个这样的成员（视觉类成员：主图设计师 / 文案策划 / 视觉质检 /
 * 总策划 / 前端发布工程师，`model_provider=deepseek` + `api_base_url=百炼` + 百炼 key）。
 * 忽略端点后它们拿一把百炼 key 去打 `api.deepseek.com` → 401
 * `Your api key: ****xxxx is invalid`（每秒重试一次），而且这个 401 被记到「deepseek」
 * 供应商名下 → **把健康的链尾兜底打进冷却**（线上实测 `consecutive_failures=500`、
 * `status=unavailable`）。实测「百炼端点 + `deepseek-v4-flash`」本身 HTTP 200，即这些成员的
 * 配置是有效的，纯粹被硬编码端点拦住。
 *
 * 与 `buildAgentFailoverChain` 同一条不变式：**路由由端点决定，不由标签决定**。
 * 注意 `experience-service` 的复盘提炼也调本函数 —— 两边必须同一套规则，否则会出现
 * 「任务跑得通、复盘提炼必失败」。
 */
export function resolveCustomProviderClientConfig(
  provider: ModelProvider,
  overrideKey?: string | null,
  apiBaseUrl?: string | null,
): CustomProviderClientConfig {
  const baseUrl = explicitBaseUrl(apiBaseUrl)

  if (provider === 'deepseek') {
    const apiKey = overrideKey?.trim() || process.env.DEEPSEEK_API_KEY
    if (!apiKey) throw new Error('DEEPSEEK_API_KEY not set and agent has no apiKey')
    return {
      apiKey,
      baseURL: baseUrl ?? DEFAULT_DEEPSEEK_BASE_URL,
    }
  }
  if (provider === 'volcano-ark') {
    const apiKey = overrideKey?.trim() || process.env.ARK_API_KEY
    if (!apiKey) throw new Error('ARK_API_KEY not set and agent has no apiKey')
    return {
      apiKey,
      baseURL: baseUrl ?? DEFAULT_VOLCANO_ARK_BASE_URL,
    }
  }
  if (provider === 'openai') {
    const apiKey = overrideKey?.trim() || process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error('OPENAI_API_KEY not set and agent has no apiKey')
    // 没给端点时不带 baseURL，让 SDK 走 api.openai.com（保持原有行为）。
    return baseUrl ? { apiKey, baseURL: baseUrl } : { apiKey }
  }
  if (provider === 'openai-compatible') {
    const baseUrlError = validateOpenAICompatibleBaseUrl(provider, apiBaseUrl)
    if (baseUrlError) throw new Error(baseUrlError)
    const apiKeyError = validateOpenAICompatibleApiKey(provider, overrideKey)
    if (apiKeyError) throw new Error(apiKeyError)

    return {
      apiKey: overrideKey?.trim() ?? '',
      baseURL: baseUrl,
    }
  }
  throw new Error(`CustomAgentAdapter does not support provider "${provider}" yet`)
}
