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
