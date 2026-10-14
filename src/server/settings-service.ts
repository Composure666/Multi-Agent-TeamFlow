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
import { looksMasked, maskSecret } from '@/server/secret-mask'

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
  officialWebsiteUrl: null,
  desktopDownloadUrl: null,
  userGuideDismissedAt: null,
  updatedAt: 0,
}

export async function getAppSettings(): Promise<AppSettingsRow> {
  const row = await db.query.appSettings.findFirst({
    where: eq(schema.appSettings.id, SINGLETON_ID),
  })
  return row ?? EMPTY
}

/**
 * 设置里所有「值本身即密钥」的字段。
 * 这两个列表必须与 `AppSettingsRow` 同步维护 —— 新增密钥字段时别漏。
 */
const SECRET_SETTING_KEYS = [
  'anthropicApiKey',
  'openaiApiKey',
  'deepseekApiKey',
  'arkApiKey',
  'ossAccessKeySecret',
  'ossAccessKeyId',
  'mobileDeviceToken',
] as const

/**
 * 脱敏：只留「是否已配置」+「尾 4 位」，其余用 `*` 盖掉。
 *
 * 为什么要做：`GET /api/settings` 会把 `AppSettingsRow` 原样返回给浏览器。应用自身没有
 * 登录体系（边界全在 nginx Basic 上），所以一旦 Basic 被关掉/配错，任何人 `curl` 一下
 * 就能拿到全部 LLM key 与 OSS AccessKey。脱敏把「后端机密」重新降级回后端。
 *
 * 前端只需要知道「有没有填过」和「填的是哪一把」，不需要完整值 ——
 * 要改就整把重填（`PATCH` 仍接受完整值写入）。
 */
export function maskSecrets(row: AppSettingsRow): AppSettingsRow {
  const out: AppSettingsRow = { ...row }
  for (const key of SECRET_SETTING_KEYS) {
    out[key] = maskSecret(out[key])
  }
  return out
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
  officialWebsiteUrl?: string | null
  desktopDownloadUrl?: string | null
  userGuideDismissedAt?: number | null
}

/**
 * 兜底防线：丢掉「值看起来是脱敏串」的密钥字段写入。
 *
 * 为什么要在服务端兜：GET 返回的是 `********abcd`。如果某个前端（或某个脚本、
 * 某个用户手工 curl）把这个串原样 PATCH 回来，真 key 就被星号覆盖了 ——
 * 而且**没有任何报错**，只是之后所有调用开始 401。这类不可见的自毁式写入
 * 不该依赖前端自觉，服务端必须自己拦。
 *
 * 正常输入不会命中：真实 key（`sk-…`、`LTAI…`）不以 4 个以上连续星号开头。
 */
function dropMaskedSecretWrites(patch: AppSettingsPatch): AppSettingsPatch {
  const out: AppSettingsPatch = { ...patch }
  for (const key of SECRET_SETTING_KEYS) {
    const value = out[key]
    if (typeof value === 'string' && looksMasked(value.trim())) {
      delete out[key]
    }
  }
  return out
}

/** UPSERT 全部字段：传 null 清空，undefined 不动。 */
export async function updateAppSettings(patch: AppSettingsPatch): Promise<AppSettingsRow> {
  const current = await getAppSettings()
  const cleaned = dropMaskedSecretWrites(patch)
  const next: AppSettingsRow = {
    ...current,
    ...Object.fromEntries(
      Object.entries(cleaned).map(([k, v]) => [k, normalize(v)]),
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
        // ❗ 下面这一组是「显式逐字段白名单」：往 app_settings 加新字段时**必须同时加到这里**。
        // 漏了不会报错，只会「首次 insert 带上值、之后每次更新都被静默丢弃」——
        // OSS 四件套就曾长期栽在这里（UI/类型/脱敏列表全都有它，唯独这里没有）。
        ossBucket: next.ossBucket,
        ossEndpoint: next.ossEndpoint,
        ossAccessKeyId: next.ossAccessKeyId,
        ossAccessKeySecret: next.ossAccessKeySecret,
        ossPublicRead: next.ossPublicRead,
        officialWebsiteUrl: next.officialWebsiteUrl,
        desktopDownloadUrl: next.desktopDownloadUrl,
        userGuideDismissedAt: next.userGuideDismissedAt,
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
function normalize(
  v: string | number | boolean | null | undefined,
): string | number | boolean | null | undefined {
  if (v === undefined) return undefined
  if (v === null) return null
  // ❗ 数字必须显式放行：`userGuideDismissedAt` 存的是时间戳（number）。
  // 少了这一支就会掉到下面的 `v.trim()` 上抛 `TypeError: v.trim is not a function`，
  // 而调用方（如 `UserGuideDialog.dismiss`）把它 try/catch 掉了 ⇒ **静默失效**：
  // 界面无报错、只有 console 一条 error，表现为「关了指南下次启动又弹」。
  // 往 app_settings 加**非字符串**字段时，务必确认这里能放行。
  if (typeof v === 'number') return v
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

/** key 是从哪一层拿到的。只为「配置体检」如实说明来源，不参与取值逻辑。 */
export type LlmKeySource = 'provider-row' | 'app-settings' | 'environment' | 'none'

/**
 * 取 key 的**唯一实现**：llm_providers（供应商中心）→ app_settings → env var → null。
 *
 * 刻意把「值」和「来源」一起返回，并让 `getEffectiveApiKey()` 与
 * `resolveLlmAvailability()` 都走这一个函数 —— 优先级链一旦被复制成两份，
 * 迟早会出现「能跑」与「说没配好」互相矛盾。
 * 本轮就踩过：`getEffectiveLlmProvider()` 只读 app_settings 里用户显式选的默认供应商，
 * 既不看供应商中心也不看环境变量，于是配置体检在一台本来能跑的机器上返回「未配置」。
 */
export async function resolveEffectiveApiKey(
  provider: EffectiveApiKeyProvider,
): Promise<{ key: string | null; source: LlmKeySource }> {
  const [settings, providerRowKey] = await Promise.all([
    getAppSettings(),
    getProviderRowApiKey(provider),
  ])
  if (providerRowKey) return { key: providerRowKey, source: 'provider-row' }

  const fromSettings =
    provider === 'anthropic' ? settings.anthropicApiKey
    : provider === 'openai' ? settings.openaiApiKey
    : provider === 'deepseek' ? settings.deepseekApiKey
    : settings.arkApiKey
  if (fromSettings) return { key: fromSettings, source: 'app-settings' }

  const fromEnv =
    provider === 'anthropic' ? process.env.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_AUTH_TOKEN
    : provider === 'openai' ? process.env.OPENAI_API_KEY
    : provider === 'deepseek' ? process.env.DEEPSEEK_API_KEY
    : process.env.ARK_API_KEY
  return fromEnv ? { key: fromEnv, source: 'environment' } : { key: null, source: 'none' }
}

/**
 * 给 adapter 用的 helper：拿一个 provider 的 effective key。
 * 顺序：llm_providers（供应商中心）→ app_settings → env var → null。
 */
export async function getEffectiveApiKey(
  provider: EffectiveApiKeyProvider,
): Promise<string | null> {
  return (await resolveEffectiveApiKey(provider)).key
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

/** 配置体检结果：现在到底能不能调模型，以及第一个可用的 provider。 */
export interface LlmAvailability {
  provider: EffectiveApiKeyProvider | null
  source: LlmKeySource
}

/**
 * 「现在到底能不能调模型」——按**运行时真正取 key 的那条路径**逐家判定。
 *
 * 与 `getEffectiveLlmProvider()` 的分工必须区分清楚：
 *  - 那个函数回答「用户想用哪家」，只认 app_settings 里的显式选择；
 *  - 本函数回答「实际能不能拿到 key」，必须把供应商中心（面板里配 key 的主入口）
 *    与环境变量都算上 —— 否则配置体检会在一台本来能跑的机器上判「未配置」。
 *
 * 顺序刻意与 `getEffectiveLlmProvider()` 的 auto 分支一致（用户显式选定的排最前，
 * 其余按 deepseek → openai → anthropic → ark），这样「用哪个」与「有没有配好」
 * 两个答案不会互相矛盾。
 *
 * 注：`agent-runner` 给 codex 适配器额外认一个 `CODEX_API_KEY`，那是适配器专属兜底，
 * 刻意不在这里复刻 —— 本函数只如实反映 `getEffectiveApiKey()` 的口径。
 */
export async function resolveLlmAvailability(): Promise<LlmAvailability> {
  const settings = await getAppSettings()
  const chosen = normalizeDefaultLlmProvider(settings.defaultLlmProvider)
  const all: EffectiveApiKeyProvider[] = ['deepseek', 'openai', 'anthropic', 'ark']
  const order: EffectiveApiKeyProvider[] =
    chosen === 'auto' ? all : [chosen, ...all.filter((provider) => provider !== chosen)]

  for (const provider of order) {
    const { source } = await resolveEffectiveApiKey(provider)
    if (source !== 'none') return { provider, source }
  }
  return { provider: null, source: 'none' }
}
