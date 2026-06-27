import { NextResponse } from 'next/server'

import { currentPlatform } from '@/server/platform'

/**
 * GET /api/platform
 *
 * 返回服务器宿主平台。前端用来做 UI 文案 / placeholder 的平台感知（详见 specs/11-platform.md）。
 * 不放敏感信息，纯 UI 提示用。
 */
export async function GET() {
  return NextResponse.json({ platform: currentPlatform() })
}
