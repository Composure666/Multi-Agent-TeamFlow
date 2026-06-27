/**
 * 全局 API key / endpoint 设置。单行表，PK 固定 'singleton'。
 *
 * 读取语义（adapter 用）：
 *   getKey(provider) → app_settings 字段 ?? process.env.<PROVIDER>_API_KEY ?? null
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
  companionMode: 'off',
  mobileDeviceToken: null,
  deploymentPublishEnabled: false,
  deploymentPublishDir: null,
  deploymentPublicBaseUrl: null,
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
  companionMode?: CompanionMode
  mobileDeviceToken?: string | null
  deploymentPublishEnabled?: boolean
  deploymentPublishDir?: string | null
  deploymentPublicBaseUrl?: string | null
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
        companionMode: next.companionMode,
        mobileDeviceToken: next.mobileDeviceToken,
        deploymentPublishEnabled: next.deploymentPublishEnabled,
        deploymentPublishDir: next.deploymentPublishDir,
        deploymentPublicBaseUrl: next.deploymentPublicBaseUrl,
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

/**
 * 给 adapter 用的 helper：拿一个 provider 的 effective key。
 * 顺序：app_settings → env var → null。
 */
export async function getEffectiveApiKey(
  provider: 'anthropic' | 'openai' | 'deepseek' | 'ark',
): Promise<string | null> {
  const settings = await getAppSettings()
  switch (provider) {
    case 'anthropic':
      return settings.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY ?? null
    case 'openai':
      return settings.openaiApiKey ?? process.env.OPENAI_API_KEY ?? null
    case 'deepseek':
      return settings.deepseekApiKey ?? process.env.DEEPSEEK_API_KEY ?? null
    case 'ark':
      return settings.arkApiKey ?? process.env.ARK_API_KEY ?? null
  }
}

/** Anthropic 的 base URL（第三方网关）；空 = 走 SDK 默认。 */
export async function getEffectiveAnthropicBaseUrl(): Promise<string | null> {
  const settings = await getAppSettings()
  return settings.anthropicBaseUrl ?? process.env.ANTHROPIC_BASE_URL ?? null
}
