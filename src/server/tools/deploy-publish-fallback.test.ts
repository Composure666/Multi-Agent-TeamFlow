import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { DeployStatusRecord } from '@/shared/types'

// 回归背景（2026-09-17 线上事故）：外部静态发布开关打开但发布目录 / 公网基址没配齐时，
// maybePublishExternally 曾把本地已成功的部署打成 failed，导致 deploy_workspace / deploy_artifact
// 连续三次返回同一句配置错误。规格（specs/08-db-schema.md「约束」、openspec/specs/tools）要求：
// 配置不齐 ⇒ 仍只生成本地静态部署。

let dataDir: string
let mod: typeof import('./deploy-artifact')
let settings: typeof import('@/server/settings-service')
let dbClient: typeof import('@/db/client')

beforeAll(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'agenthub-deploy-publish-fallback-'))
  process.env.AGENTHUB_DATA_DIR = dataDir
  const vitest = await import('vitest')
  vitest.vi.resetModules()
  mod = await import('./deploy-artifact')
  settings = await import('@/server/settings-service')
  dbClient = await import('@/db/client')
})

afterAll(() => {
  dbClient?.sqlite.close()
  if (dataDir) rmSync(dataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  delete process.env.AGENTHUB_DATA_DIR
})

function localRecord(): DeployStatusRecord {
  return {
    id: 'dep_fallback01',
    artifactId: 'workspace:landing/dist',
    title: '落地页预览',
    version: 0,
    previewPath: '/api/deployments/dep_fallback01/index.html',
    status: 'ready',
    sourceType: 'workspace',
    workspacePath: 'landing/dist',
    createdAt: 1,
  }
}

async function setPublishTarget(patch: {
  deploymentPublishEnabled?: boolean
  deploymentPublishDir?: string | null
  deploymentPublicBaseUrl?: string | null
}) {
  await settings.updateAppSettings(patch)
}

describe('maybePublishExternally', () => {
  it('开关关闭时原样返回本地部署', async () => {
    await setPublishTarget({ deploymentPublishEnabled: false })
    const local = localRecord()
    const result = await mod.maybePublishExternally(local)
    expect(result).toEqual(local)
    expect(result.status).toBe('ready')
    expect(result.error).toBeUndefined()
  })

  it('开关打开但目录或基址缺失时回落本地部署，不再置 failed', async () => {
    await setPublishTarget({
      deploymentPublishEnabled: true,
      deploymentPublishDir: null,
      deploymentPublicBaseUrl: null,
    })
    const result = await mod.maybePublishExternally(localRecord())
    expect(result.status).toBe('ready')
    expect(result.error).toBeUndefined()
    expect(result.previewPath).toBe('/api/deployments/dep_fallback01/index.html')
    expect(result.deploymentType).toBeUndefined()

    await setPublishTarget({
      deploymentPublishDir: '/tmp/teamflow-published',
      deploymentPublicBaseUrl: null,
    })
    const half = await mod.maybePublishExternally(localRecord())
    expect(half.status).toBe('ready')
    expect(half.error).toBeUndefined()
  })

  it('配置齐全但发布失败时保留 failed 与原因', async () => {
    await setPublishTarget({
      deploymentPublishEnabled: true,
      deploymentPublishDir: '/tmp/teamflow-published',
      deploymentPublicBaseUrl: 'not-a-url',
    })
    const result = await mod.maybePublishExternally(localRecord())
    expect(result.status).toBe('failed')
    expect(result.error).toContain('External static publish failed')
    expect(result.localPreviewPath).toBe('/api/deployments/dep_fallback01/index.html')
  })
})
