import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { getAppSettings, maskSecrets, updateAppSettings } from '@/server/settings-service'

/**
 * GET /api/settings —— 返回全局设置。
 *
 * ❗ 密钥字段**必须脱敏**后再返回：应用自身没有登录体系，鉴权全在 nginx Basic 上；
 * 原样回吐等于「Basic 一关/一配错，任何人都能 curl 走全部 key」。
 * 前端只需要「填没填」，不需要完整值；要改就整把重填（PATCH 仍收完整值）。
 */
export async function GET() {
  const settings = await getAppSettings()
  return NextResponse.json({ settings: maskSecrets(settings) })
}

const PatchBody = z.object({
  // 显式 null 表示清空；undefined 表示不改
  anthropicApiKey: z.string().nullable().optional(),
  anthropicBaseUrl: z.string().nullable().optional(),
  openaiApiKey: z.string().nullable().optional(),
  deepseekApiKey: z.string().nullable().optional(),
  arkApiKey: z.string().nullable().optional(),
  defaultLlmProvider: z.enum(['auto', 'deepseek', 'openai', 'anthropic', 'ark']).nullable().optional(),
  companionMode: z.enum(['off', 'lan', 'tailnet']).optional(),
  mobileDeviceToken: z.string().nullable().optional(),
  deploymentPublishEnabled: z.boolean().optional(),
  deploymentPublishDir: z.string().nullable().optional(),
  deploymentPublicBaseUrl: z.string().nullable().optional(),
  notificationTaskEnabled: z.boolean().optional(),
  notificationErrorEnabled: z.boolean().optional(),
  notificationSystemEnabled: z.boolean().optional(),
  notificationConfigurationEnabled: z.boolean().optional(),
  notificationToastEnabled: z.boolean().optional(),
  notificationNativeEnabled: z.boolean().optional(),
  notificationUrgentEnabled: z.boolean().optional(),
  // ❗ 下面这几项曾经**不在**白名单里 —— zod object 默认 strip 未知键，
  // 于是「设置面板里改了、保存后没反应」，而且**完全不报错**。
  // 往 app_settings 加字段时，这里与 `settings-service.ts` 的 `onConflictDoUpdate.set`
  // 必须同步加，两处任一漏掉都是同一种静默失效。
  experienceExtractionEnabled: z.boolean().optional(),
  // ─── 阿里云 OSS（图片产物远程存储）───
  ossBucket: z.string().nullable().optional(),
  ossEndpoint: z.string().nullable().optional(),
  ossAccessKeyId: z.string().nullable().optional(),
  ossAccessKeySecret: z.string().nullable().optional(),
  ossPublicRead: z.boolean().optional(),
  // ─── 首次启动使用指南 ───
  // 存时间戳而不是布尔：既能当「看过没」用，也保留了「什么时候关的」。
  userGuideDismissedAt: z.number().nullable().optional(),
})

/** PATCH /api/settings —— upsert 部分字段 */
export async function PATCH(req: NextRequest) {
  const raw = await req.json().catch(() => null)
  const parsed = PatchBody.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', issues: parsed.error.issues },
      { status: 400 },
    )
  }
  const settings = await updateAppSettings(parsed.data)
  return NextResponse.json({ settings: maskSecrets(settings) })
}
