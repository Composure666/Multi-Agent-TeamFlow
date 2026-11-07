import type { Metadata } from 'next'

import { BRAND_NAME } from '@/lib/brand'

import { DemoShowcase } from './demo-showcase'

export const metadata: Metadata = {
  title: `${BRAND_NAME} · 在线演示`,
  description:
    '无需注册、不用登录，看五位 Agent 如何把一句话需求变成可预览的品牌落地页：PRD → 设计稿 → 网页 → 评审，全程 Mock 回放，不消耗模型额度。',
  keywords: ['multi-agent', 'ai-agent', 'demo', '在线演示', '多智能体'],
}

/**
 * 公开演示页（/demo）。
 *
 * 与 /home 一样是免鉴权的访客面（nginx 里 `location = /demo` 精确放行），
 * 因此本页不得读数据库、不得调任何 API、不得碰终端：全部内容来自
 * src/server/demo-seed.ts 的静态种子，在浏览器里用 MockAdapter 同款
 * 脚本流式回放。静态预渲染即可，不需要 force-dynamic。
 */
export default function DemoPage() {
  return <DemoShowcase />
}
