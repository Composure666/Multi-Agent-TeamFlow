import { NextResponse } from 'next/server'

import { resolveSiteLinks } from '@/server/site-links-service'

/**
 * GET /api/site-links —— 官网入口 + 桌面端安装包地址。
 *
 * 工作台的「官网」按钮与设置面板的「当前生效地址」都读这里，与主页服务端组件调用的是
 * 同一个 `resolveSiteLinks()`。
 *
 * 返回内容不含任何密钥（bucket / endpoint 只在被推导进 url 时出现，且那本来就是公网可读的
 * 地址），所以即使将来 Basic 鉴权被关掉，也不会从这里漏出机密。
 */
export async function GET() {
  return NextResponse.json({ links: await resolveSiteLinks() })
}
