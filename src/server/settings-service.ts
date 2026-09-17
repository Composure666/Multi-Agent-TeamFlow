/**
 * 全局 API key / endpoint 设置。单行表，PK 固定 'singleton'。
 *
 * 读取语义（adapter 用）三层级，优先级从高到低：
 *   1. llm_providers 表 —— 「供应商中心」UI 的主入口，用户在这里填 key
 *   2. app_settings 字段 —— 旧版「设置」页写的全局 key
 *   3. process.env.<PROVIDER>_API_KEY —— 环境变量兜底
 *
 * 历史 bug：执行链路只读 2/3，用户在供应商中心配的 deepseek key 完全没被吃到，
 * 表现为「设置了 key，但 Agent 一启动就报 DEEPSEEK_API_KEY not set」。
 *
 * agents.apiKey 仍然是 per-agent override，优先级最高，由 adapter 自行处理。
 */
import { eq } from 'drizzle-orm'

import { db, schema } from '@/db/client'
import type { AppSettingsRow } from '@/db/schema'
import {
  DEFAULT_COMPANION_PORT,
  newMobileDeviceToken,
  writeCompanionConfig,
  type CompanionMode,
} from '@/server/companion-config'

const SINGLETON_ID = 'singleton'

const EMPTY: AppSettingsRow = {
  id: SINGLETON_ID,
  anthropicApiKey: null,
  anthropicBaseUrl: null,
  openaiApiKey: null,
  deepseekApiKey: null,
  arkApiKey: null,
  defaultLlmProvider: 'auto',
  companionMode: 'off',
  mobileDeviceToken: null,
  deploymentPublishEnabled: false,
  deploymentPublishDir: null,
  deploymentPublicBaseUrl: null,
  notificationTaskEnabled: true,
  notificationErrorEnabled: true,
  notificationSystemEnabled: true,
  notificationConfigurationEnabled: true,
  notificationToastEnabled: true,
  notificationNativeEnabled: true,
  notificationUrgentEnabled: true,
  experienceExtractionEnabled: true,
  ossBucket: null,
  ossEndpoint: null,
  ossAccessKeyId: null,
  ossAccessKeySecret: null,
  ossPublicRead: true,
  updatedAt: 0,
}

export async function getAppSettings(): Promise<AppSettingsRow> {
  const row = await db.query.appSettings.findFirst({
    where: eq(schema.appSettings.id, SINGLETON_ID),
  })
  return row ?? EMPTY
}

export interface AppSettingsPatch {
  anthropicApiKey?: string | null
  anthropicBaseUrl?: string | null
  openaiApiKey?: string | null
  deepseekApiKey?: string | null
  arkApiKey?: string | null
  defaultLlmProvider?: string | null
  companionMode?: CompanionMode
  mobileDeviceToken?: string | null
  deploymentPublishEnabled?: boolean
  deploymentPublishDir?: string | null
  deploymentPublicBaseUrl?: string | null
  notificationTaskEnabled?: boolean
  notificationErrorEnabled?: boolean
  notificationSystemEnabled?: boolean
  notificationConfigurationEnabled?: boolean
  notificationToastEnabled?: boolean
  notificationNativeEnabled?: boolean
  notificationUrgentEnabled?: boolean
  experienceExtractionEnabled?: boolean
  ossBucket?: string | null
  ossEndpoint?: string | null
  ossAccessKeyId?: string | null
  ossAccessKeySecret?: string | null
  ossPublicRead?: boolean
}

/** UPSERT 全部字段：传 null 清空，undefined 不动。 */
export async function updateAppSettings(patch: AppSettingsPatch): Promise<AppSettingsRow> {
  const current = await getAppSettings()
  const next: AppSettingsRow = {
    ...current,
    ...Object.fromEntries(
      Object.entries(patch).map(([k, v]) => [k, normalize(v)]),
    ),
    id: SINGLETON_ID,
    updatedAt: Date.now(),
  } as AppSettingsRow

  if (next.companionMode !== 'off' && !next.mobileDeviceToken) {
    next.mobileDeviceToken = newMobileDeviceToken()
  }

  // upsert：先 delete + insert（SQLite ON CONFLICT 需要 unique constraint；PK 自带）
  await db
    .insert(schema.appSettings)
    .values(next)
    .onConflictDoUpdate({
      target: schema.appSettings.id,
      set: {
        anthropicApiKey: next.anthropicApiKey,
        anthropicBaseUrl: next.anthropicBaseUrl,
        openaiApiKey: next.openaiApiKey,
        deepseekApiKey: next.deepseekApiKey,
        arkApiKey: next.arkApiKey,
        defaultLlmProvider: next.defaultLlmProvider,
        companionMode: next.companionMode,
        mobileDeviceToken: next.mobileDeviceToken,
        deploymentPublishEnabled: next.deploymentPublishEnabled,
        deploymentPublishDir: next.deploymentPublishDir,
        deploymentPublicBaseUrl: next.deploymentPublicBaseUrl,
        notificationTaskEnabled: next.notificationTaskEnabled,
        notificationErrorEnabled: next.notificationErrorEnabled,
        notificationSystemEnabled: next.notificationSystemEnabled,
        notificationConfigurationEnabled: next.notificationConfigurationEnabled,
        notificationToastEnabled: next.notificationToastEnabled,
        notificationNativeEnabled: next.notificationNativeEnabled,
        notificationUrgentEnabled: next.notificationUrgentEnabled,
        experienceExtractionEnabled: next.experienceExtractionEnabled,
        updatedAt: next.updatedAt,
      },
    })

  syncCompanionRuntime(next)
  return next
}

export async function regenerateMobileDeviceToken(): Promise<AppSettingsRow> {
  const settings = await updateAppSettings({
    mobileDeviceToken: newMobileDeviceToken(),
    companionMode: (await getAppSettings()).companionMode,
  })
  return settings
}

export function syncCompanionRuntime(settings: AppSettingsRow): void {
  writeCompanionConfig({
    companionMode: settings.companionMode,
    mobileDeviceToken: settings.mobileDeviceToken,
    companionPort: DEFAULT_COMPANION_PORT,
  })

  if (settings.companionMode !== 'off' && settings.mobileDeviceToken) {
    process.env.AGENTHUB_MOBILE_TOKEN = settings.mobileDeviceToken
  } else {
    delete process.env.AGENTHUB_MOBILE_TOKEN
  }
}

/** 空串归一为 null，避免 "" 与 null 混杂。trim 用户输入。 */
function normalize(v: string | boolean | null | undefined): string | boolean | null | undefined {
  if (v === undefined) return undefined
  if (v === null) return null
  if (typeof v === 'boolean') return v
  const trimmed = v.trim()
  return trimmed === '' ? null : trimmed
}

export type EffectiveApiKeyProvider = 'anthropic' | 'openai' | 'deepseek' | 'ark'

/** provider 规范名 → llm_providers 内置行 id（四个内置供应商与主类型同名）。 */
const BUILTIN_PROVIDER_ROW_ID: Record<EffectiveApiKeyProvider, string> = {
  anthropic: 'anthropic',
  openai: 'openai',
  deepseek: 'deepseek',
  ark: 'ark',
}

/**
 * 供应商中心（llm_providers 表）里存的 key。
 *
 * 这是 UI 让用户配 provider key 的主入口，adapter 必须能读到，否则会出现
 * 「明明配了 key，Agent 却报 <PROVIDER>_API_KEY not set」。
 * 表缺失 / 查询失败时降级为 null（继续走 app_settings → env），不阻断运行。
 */
async function getProviderRowApiKey(provider: EffectiveApiKeyProvider): Promise<string | null> {
  try {
    const row = await db.query.llmProviders.findFirst({
      where: eq(schema.llmProviders.id, BUILTIN_PROVIDER_ROW_ID[provider]),
    })
    const key = row?.apiKey?.trim()
    return key ? key : null
  } catch (err) {
    console.warn(
      `[settings-service] read llm_providers failed for "${provider}"; falling back to app_settings/env`,
      err,
    )
    return null
  }
}

/**
 * 给 adapter 用的 helper：拿一个 provider 的 effective key。
 * 顺序：llm_providers（供应商中心）→ app_settings → env var → null。
 */
export async function getEffectiveApiKey(
  provider: EffectiveApiKeyProvider,
): Promise<string | null> {
  const [settings, providerRowKey] = await Promise.all([
    getAppSettings(),
    getProviderRowApiKey(provider),
  ])
  switch (provider) {
    case 'anthropic':
      return (
        providerRowKey ??
        settings.anthropicApiKey ??
        process.env.ANTHROPIC_API_KEY ??
        process.env.ANTHROPIC_AUTH_TOKEN ??
        null
      )
    case 'openai':
      return providerRowKey ?? settings.openaiApiKey ?? process.env.OPENAI_API_KEY ?? null
    case 'deepseek':
      return providerRowKey ?? settings.deepseekApiKey ?? process.env.DEEPSEEK_API_KEY ?? null
    case 'ark':
      return providerRowKey ?? settings.arkApiKey ?? process.env.ARK_API_KEY ?? null
  }
}

/**
 * Anthropic 的 base URL（第三方网关）；空 = 走 SDK 默认。
 *
 * 顺序与 `getEffectiveApiKey` 对齐：llm_providers（供应商中心，UI 主入口）→ app_settings → env。
 * 供应商中心那一行是主入口 —— 否则用户在那里把 anthropic 指向 DeepSeek 的 Anthropic 兼容端点，
 * cc adapter 仍会去请求官方端点，表现为「key 对但 401 / model not found」。
 */
export async function getEffectiveAnthropicBaseUrl(): Promise<string | null> {
  try {
    const providerRow = await db.query.llmProviders.findFirst({
      where: eq(schema.llmProviders.id, BUILTIN_PROVIDER_ROW_ID.anthropic),
    })
    const rowBaseUrl = providerRow?.baseUrl?.trim()
    if (rowBaseUrl) return rowBaseUrl
  } catch (err) {
    console.warn(
      '[settings-service] read anthropic provider row base URL failed; falling back to app_settings/env',
      err,
    )
  }
  const settings = await getAppSettings()
  return settings.anthropicBaseUrl ?? process.env.ANTHROPIC_BASE_URL ?? null
}

/** 用户可选的默认 LLM Provider。 */
export type DefaultLlmProvider = 'auto' | 'deepseek' | 'openai' | 'anthropic' | 'ark'

const VALID_DEFAULT_LLM_PROVIDERS: ReadonlySet<string> = new Set(['auto', 'deepseek', 'openai', 'anthropic', 'ark'])

function normalizeDefaultLlmProvider(value: unknown): DefaultLlmProvider {
  if (typeof value === 'string' && VALID_DEFAULT_LLM_PROVIDERS.has(value)) return value as DefaultLlmProvider
  return 'auto'
}

/**
 * 解析用户设置的默认 LLM Provider。
 * - 用户选了具体 provider 且配了 key → 返回该 provider
 * - 选了具体 provider 但没配 key → 回退到 auto（按已配置 key 选第一个可用的）
 * - 'auto' → 按 DeepSeek → OpenAI → Anthropic → Ark 顺序选第一个已配置 key 的
 * - 都没配 → 返回 null（调用方应走本地模板兜底，不调 LLM）
 */
export async function getEffectiveLlmProvider(): Promise<DefaultLlmProvider | null> {
  const settings = await getAppSettings()
  const chosen = normalizeDefaultLlmProvider(settings.defaultLlmProvider)

  if (chosen !== 'auto') {
    const hasKey =
      chosen === 'deepseek' ? settings.deepseekApiKey
      : chosen === 'openai' ? settings.openaiApiKey
      : chosen === 'anthropic' ? settings.anthropicApiKey
      : settings.arkApiKey
    if (hasKey) return chosen
    // 选了但没配 key → 回退 auto
  }

  if (settings.deepseekApiKey) return 'deepseek'
  if (settings.openaiApiKey) return 'openai'
  if (settings.anthropicApiKey) return 'anthropic'
  if (settings.arkApiKey) return 'ark'
  return null
}
