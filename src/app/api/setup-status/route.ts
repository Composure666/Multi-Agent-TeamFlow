import { NextResponse } from 'next/server'

import { resolveOssConfig } from '@/server/oss-image-store'
import { getAppSettings, getEffectiveLlmProvider } from '@/server/settings-service'

/**
 * GET /api/setup-status —— 「开箱到底能不能用」的最小状态集，供首启使用指南消费。
 *
 * 判定刻意复用运行时真正在用的那两个函数（`getEffectiveLlmProvider` / `resolveOssConfig`），
 * 而不是各写一套「字段有没有值」。否则会出现最误导人的那类 bug：
 * 指南说「已配置」，Agent 一启动却报 `<PROVIDER>_API_KEY not set`。
 *
 * 不返回任何密钥，也不返回 bucket / endpoint 原文 —— 那些归 `/api/settings/oss`。
 */
export async function GET() {
  const [provider, resolution, settings] = await Promise.all([
    getEffectiveLlmProvider(),
    resolveOssConfig(),
    getAppSettings(),
  ])

  return NextResponse.json({
    status: {
      /** 至少有一个 LLM provider 能拿到可用 key（供应商中心 / 设置页 / 环境变量三条来源任一） */
      llmConfigured: provider !== null,
      /** 实际生效的 provider，'auto' 已解析成具体值；null = 一个都没配 */
      llmProvider: provider,
      /** OSS 四项齐备（不齐则图片产物回退本地存储，不影响其他功能） */
      ossConfigured: resolution.config !== null,
      ossSource: resolution.source,
      /** 用户是否已经关过首次指南（存的是时间戳，null = 从没看过 ⇒ 应自动弹出） */
      guideDismissed: settings.userGuideDismissedAt != null,
    },
  })
}
