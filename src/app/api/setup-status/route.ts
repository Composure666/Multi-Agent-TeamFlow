import { NextResponse } from 'next/server'

import { resolveOssConfig } from '@/server/oss-image-store'
import { getAppSettings, resolveLlmAvailability } from '@/server/settings-service'

/**
 * GET /api/setup-status —— 「开箱到底能不能用」的最小状态集，供首启使用指南消费。
 *
 * 判定刻意复用**运行时真正在用的那两条路径**，而不是各写一套「字段有没有值」：
 *  - LLM：`resolveLlmAvailability()` → 内部走 `getEffectiveApiKey()` 的三级优先链
 *    （llm_providers → app_settings → env），这正是 adapter 取 key 的地方；
 *  - OSS：`resolveOssConfig()`，与图片上传同源。
 *
 * 口径不一致就会出现最误导人的那类 bug：指南说「已配置」，Agent 一启动却报
 * `<PROVIDER>_API_KEY not set`；或者反过来 —— 机器明明能跑，界面却说「未配置」。
 * 两种都真实踩过，所以这里不做任何自创判定。
 *
 * 不返回任何密钥，也不返回 bucket / endpoint 原文 —— 那些归 `/api/settings/oss`。
 */
export async function GET() {
  const [llm, resolution, settings] = await Promise.all([
    resolveLlmAvailability(),
    resolveOssConfig(),
    getAppSettings(),
  ])

  return NextResponse.json({
    status: {
      /** 至少有一个 LLM provider 能拿到可用 key（供应商中心 / 设置页 / 环境变量三条来源任一） */
      llmConfigured: llm.provider !== null,
      /** 实际生效的 provider；null = 一个都没配 */
      llmProvider: llm.provider,
      /** key 来自哪一层。自部署时常见「界面里没配却能跑」，靠它把原因说清楚 */
      llmSource: llm.source,
      /** OSS 四项齐备（不齐则图片产物回退本地存储，不影响其他功能） */
      ossConfigured: resolution.config !== null,
      ossSource: resolution.source,
      /** 用户是否已经关过首次指南（存的是时间戳，null = 从没看过 ⇒ 应自动弹出） */
      guideDismissed: settings.userGuideDismissedAt != null,
    },
  })
}
