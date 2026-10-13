import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { looksMasked, maskSecret } from './secret-mask'

/**
 * `app_settings` 的写入链路有一条**静默失效**通道，值得专门钉住：
 *
 * 1. `updateAppSettings` 的 `onConflictDoUpdate.set` 是**逐字段白名单**。
 *    漏字段不报错，只表现为「第一次 insert 带上了值、之后每次更新都被丢弃」。
 *    OSS 四件套曾长期栽在这里。
 * 2. `normalize()` 原先只认 string/boolean，**number 会掉到 `v.trim()` 上抛 TypeError**。
 *    `userGuideDismissedAt` 是时间戳（数字），而调用方把它 try/catch 掉了
 *    ⇒ 界面无报错、只有 console 一条 error，表现为「关了用户指南下次启动又弹」。
 *
 * 这两类都只会「安静地不生效」，所以必须有断言而不是靠手点。
 */

let dataDir: string
let service: typeof import('./settings-service')
let dbClient: typeof import('@/db/client')

beforeAll(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'agenthub-settings-service-'))
  process.env.AGENTHUB_DATA_DIR = dataDir
  vi.resetModules()
  service = await import('./settings-service')
  dbClient = await import('@/db/client')
})

afterAll(() => {
  dbClient?.sqlite.close()
  if (dataDir) rmSync(dataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  delete process.env.AGENTHUB_DATA_DIR
})

describe('updateAppSettings 写入链路', () => {
  it('数字字段（时间戳）能往返，且连续两次写入第二次生效', async () => {
    const first = await service.updateAppSettings({ userGuideDismissedAt: 1_700_000_000_000 })
    expect(first.userGuideDismissedAt).toBe(1_700_000_000_000)
    expect((await service.getAppSettings()).userGuideDismissedAt).toBe(1_700_000_000_000)

    // 第二次走的是 onConflictDoUpdate 分支 —— 「更新被静默丢弃」就发生在这里
    const second = await service.updateAppSettings({ userGuideDismissedAt: 1_700_000_001_234 })
    expect(second.userGuideDismissedAt).toBe(1_700_000_001_234)
    expect((await service.getAppSettings()).userGuideDismissedAt).toBe(1_700_000_001_234)
  })

  it('OSS 字段更新不会被静默丢弃，且未提及的字段保持不变', async () => {
    await service.updateAppSettings({
      ossBucket: 'bucket-a',
      ossEndpoint: 'oss-cn-hangzhou.aliyuncs.com',
      ossAccessKeyId: 'LTAI-demo-id',
      ossAccessKeySecret: 'demo-secret',
      ossPublicRead: true,
    })

    // 只改 bucket：其余 OSS 字段必须原地不动（undefined = 不改）
    await service.updateAppSettings({ ossBucket: 'bucket-b', ossPublicRead: false })

    const row = await service.getAppSettings()
    expect(row.ossBucket).toBe('bucket-b')
    expect(row.ossPublicRead).toBe(false)
    expect(row.ossEndpoint).toBe('oss-cn-hangzhou.aliyuncs.com')
    expect(row.ossAccessKeyId).toBe('LTAI-demo-id')
    expect(row.ossAccessKeySecret).toBe('demo-secret')
  })

  it('脱敏串被回写时不会覆盖真密钥', async () => {
    await service.updateAppSettings({ ossAccessKeySecret: 'real-secret-value-1234' })

    // 模拟前端把 GET 回来的脱敏串原样 PATCH 回来
    const masked = maskSecret('real-secret-value-1234')
    expect(masked).not.toBeNull()
    expect(looksMasked(masked as string)).toBe(true)
    await service.updateAppSettings({ ossAccessKeySecret: masked })

    expect((await service.getAppSettings()).ossAccessKeySecret).toBe('real-secret-value-1234')
  })
})

describe('maskSecrets', () => {
  it('OSS 两个密钥都脱敏（只留尾 4 位）', async () => {
    const row = await service.getAppSettings()
    const masked = service.maskSecrets({
      ...row,
      ossAccessKeyId: 'LTAIabcdefgh',
      ossAccessKeySecret: 'verysecretvalue',
    })

    // 星号数量刻意不写死（`maskSecret` 会限制最多 12 个），只断言「前缀被盖住 + 尾 4 位保留」
    expect(masked.ossAccessKeyId).toMatch(/^\*+efgh$/)
    expect(masked.ossAccessKeySecret).toMatch(/^\*+alue$/)
    expect(masked.ossAccessKeyId).not.toContain('LTAI')
    expect(masked.ossAccessKeySecret).not.toContain('verysecret')
    expect(looksMasked(masked.ossAccessKeyId as string)).toBe(true)
    expect(looksMasked(masked.ossAccessKeySecret as string)).toBe(true)
  })
})

describe('LLM key 解析链（三级优先，口径必须只有一份）', () => {
  /** 直接写 llm_providers 行：这是 UI 配 provider key 的主入口。 */
  const upsertRow = (id: string, apiKey: string | null) => {
    const now = Date.now()
    dbClient.sqlite
      .prepare(
        `insert into llm_providers (id, provider_type, display_name, api_key, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?)
         on conflict(id) do update set api_key = excluded.api_key`,
      )
      .run(id, id, id, apiKey, now, now)
  }

  const ENV_KEYS = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'OPENAI_API_KEY',
    'DEEPSEEK_API_KEY', 'ARK_API_KEY'] as const

  /** 把四个 provider 的 key 全部清干净（含环境变量），供「全都没配」类断言用。 */
  async function clearAllKeys() {
    const saved: Record<string, string | undefined> = {}
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k]
      delete process.env[k]
    }
    for (const id of ['anthropic', 'openai', 'deepseek', 'ark']) upsertRow(id, null)
    await service.updateAppSettings({
      anthropicApiKey: null,
      openaiApiKey: null,
      deepseekApiKey: null,
      arkApiKey: null,
    })
    return () => {
      for (const k of ENV_KEYS) {
        if (saved[k] === undefined) delete process.env[k]
        else process.env[k] = saved[k]
      }
    }
  }

  it('第一优先：供应商中心（llm_providers）的 key，并如实报告来源', async () => {
    upsertRow('deepseek', 'row-key')
    const r = await service.resolveEffectiveApiKey('deepseek')
    expect(r.key).toBe('row-key')
    expect(r.source).toBe('provider-row')
  })

  it('第二优先：供应商中心为空时回退 app_settings', async () => {
    upsertRow('openai', null)
    process.env.OPENAI_API_KEY = 'should-be-shadowed'
    await service.updateAppSettings({ openaiApiKey: 'settings-key' })
    try {
      const r = await service.resolveEffectiveApiKey('openai')
      expect(r.key).toBe('settings-key')
      expect(r.source).toBe('app-settings')
    } finally {
      delete process.env.OPENAI_API_KEY
    }
  })

  it('第三优先：前两层都没有时回退环境变量', async () => {
    upsertRow('ark', null)
    await service.updateAppSettings({ arkApiKey: null })
    process.env.ARK_API_KEY = 'env-key'
    try {
      const r = await service.resolveEffectiveApiKey('ark')
      expect(r.key).toBe('env-key')
      expect(r.source).toBe('environment')
    } finally {
      delete process.env.ARK_API_KEY
    }
  })

  it('getEffectiveApiKey 与 resolveEffectiveApiKey 同源（不允许各判一套）', async () => {
    upsertRow('deepseek', 'row-key')
    const [key, resolved] = await Promise.all([
      service.getEffectiveApiKey('deepseek'),
      service.resolveEffectiveApiKey('deepseek'),
    ])
    expect(key).toBe(resolved.key)
    expect(key).toBe('row-key')
  })

  // ⚠️ 本轮真实踩到的回归：旧口径（只看 app_settings 的默认供应商）会把
  // 「key 写在环境变量里、实际能跑」判成「未配置」，于是界面提示用户去配置一个
  // 本来就已经有东西的项。这条断言就是为了钉住它。
  it('resolveLlmAvailability 认环境变量（旧口径会误报「未配置」）', async () => {
    const restore = await clearAllKeys()
    process.env.DEEPSEEK_API_KEY = 'env-only-key'
    try {
      const availability = await service.resolveLlmAvailability()
      expect(availability.provider).toBe('deepseek')
      expect(availability.source).toBe('environment')
    } finally {
      delete process.env.DEEPSEEK_API_KEY
      restore()
    }
  })

  it('四条来源全无时如实返回 none', async () => {
    const restore = await clearAllKeys()
    try {
      const availability = await service.resolveLlmAvailability()
      expect(availability.provider).toBeNull()
      expect(availability.source).toBe('none')
    } finally {
      restore()
    }
  })
})
