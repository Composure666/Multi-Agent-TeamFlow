import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { resolveOssConfig } from '@/server/oss-image-store'
import { maskSecret } from '@/server/secret-mask'
import { getAppSettings, updateAppSettings, type AppSettingsPatch } from '@/server/settings-service'

/**
 * 阿里云 OSS（图片产物远程存储）配置读写。
 *
 * 为什么不复用 `/api/settings`：那边是「整个 app_settings 一行」的通用读写，而 OSS 还额外需要
 * **算出来的**信息（当前生效来源、系统环境变量是否介入），并且两个 AccessKey 字段要单独脱敏。
 * 独立端点让「界面上显示的状态」与「运行时真正用的配置」来自同一个函数（`resolveOssConfig`），
 * 不会出现两套判定各说各话。
 *
 * 安全约定（与 `/api/settings` 一致）：
 * - 密钥回传**一律脱敏**（尾 4 位），前端只显示「配没配」；
 * - 前端**只回传用户真正改过的字段**（dirty 跟踪），留空 = 不动；
 * - 服务端另有 `dropMaskedSecretWrites` 兜底，拦下「把 `********abcd` 原样写回」这种
 *   会静默毁掉真 key 的写操作。
 */

async function buildView() {
  const [settings, resolution] = await Promise.all([getAppSettings(), resolveOssConfig()])
  return {
    // ─── 可编辑字段（密钥为脱敏串，仅用于展示「配的是哪一把」）───
    bucket: settings.ossBucket ?? '',
    endpoint: settings.ossEndpoint ?? '',
    accessKeyId: maskSecret(settings.ossAccessKeyId) ?? '',
    accessKeySecret: maskSecret(settings.ossAccessKeySecret) ?? '',
    hasAccessKeyId: Boolean(settings.ossAccessKeyId),
    hasAccessKeySecret: Boolean(settings.ossAccessKeySecret),
    publicRead: settings.ossPublicRead,
    // ─── 运行时真实状态 ───
    /** 四项齐备、图片产物确实会上传 OSS */
    configured: resolution.config !== null,
    /** 生效来源：database（界面配置）/ environment（系统环境变量兜底）/ none */
    source: resolution.source,
    /** 界面里是否填齐了四项 */
    dbProvided: resolution.dbProvided,
    /** 机器进程环境里是否存在任一 OSS_* 变量 */
    envProvided: resolution.envProvided,
  }
}

/** GET /api/settings/oss —— OSS 配置的可编辑视图 + 生效状态 */
export async function GET() {
  return NextResponse.json({ oss: await buildView() })
}

const PatchBody = z.object({
  // undefined = 不改；null / '' = 清空
  bucket: z.string().nullable().optional(),
  endpoint: z.string().nullable().optional(),
  accessKeyId: z.string().nullable().optional(),
  accessKeySecret: z.string().nullable().optional(),
  publicRead: z.boolean().optional(),
})

/** PATCH /api/settings/oss —— 只写入显式给出的字段 */
export async function PATCH(req: NextRequest) {
  const raw = await req.json().catch(() => null)
  const parsed = PatchBody.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', issues: parsed.error.issues },
      { status: 400 },
    )
  }

  const body = parsed.data
  const patch: AppSettingsPatch = {}
  if (body.bucket !== undefined) patch.ossBucket = body.bucket
  if (body.endpoint !== undefined) patch.ossEndpoint = body.endpoint
  if (body.accessKeyId !== undefined) patch.ossAccessKeyId = body.accessKeyId
  if (body.accessKeySecret !== undefined) patch.ossAccessKeySecret = body.accessKeySecret
  if (body.publicRead !== undefined) patch.ossPublicRead = body.publicRead

  await updateAppSettings(patch)
  return NextResponse.json({ oss: await buildView() })
}
