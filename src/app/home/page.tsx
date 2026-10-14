import type { Metadata } from 'next'

import { HomeContact } from '@/components/home/home-contact'
import { HomeDownload } from '@/components/home/home-download'
import { HomeGuide } from '@/components/home/home-guide'
import { HomeHeader } from '@/components/home/home-header'
import {
  HomeAgents,
  HomeFeatures,
  HomeFooter,
  HomeHero,
  HomeQuickstart,
  HomeStack,
  HomeWorkflow,
} from '@/components/home/home-sections'
import { BRAND_NAME, BRAND_TAGLINE_EN, BRAND_TAGLINE_ZH } from '@/lib/brand'
import { resolveSiteLinks } from '@/server/site-links-service'

/**
 * 项目主页（/home）。
 *
 * 为什么是独立路由而不是直接占用 `/`：`/` 是同名工作台的应用入口
 * （Electron 外壳与线上部署都指过去），改成介绍页等于换掉产品入口。
 * 需要把它变成站点首页时，只要把本文件内容搬到 `src/app/page.tsx`
 * 并把工作台挪到 `src/app/workbench/page.tsx` 即可，其余文件不用动。
 */
export const metadata: Metadata = {
  title: `${BRAND_NAME} · 把 AI 协作做成一场群聊`,
  description: `${BRAND_TAGLINE_ZH} —— ${BRAND_TAGLINE_EN}。本地优先的多 Agent 协作工作空间：调度 Agent 拆解目标、派发给不同专长的 Agent，再把交付物收拢成可预览、可留存、可复用的一等公民对象。无需注册账号，数据全部留在本机。`,
  keywords: ['multi-agent', 'ai-agent', 'agent-orchestration', 'nextjs', 'electron', 'sqlite', '本地优先'],
}

export default async function HomePage() {
  // 在服务端解析「下载地址」—— 公开页也必须能拿到这个值，所以走的是服务端函数
  // 而不是需要鉴权的接口（口径与 `/api/site-links` 完全一致）。
  const { desktopDownload, localInstallerPath } = await resolveSiteLinks()

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-60 focus:rounded-lg focus:border focus:border-[var(--agenthub-border)] focus:bg-[var(--agenthub-surface)] focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-slate-900 focus:shadow-md dark:focus:text-slate-100"
      >
        跳到主要内容
      </a>

      <HomeHeader />

      <main id="main" className="home-anchor flex-1">
        <HomeHero />
        <HomeWorkflow />
        <HomeFeatures />
        <HomeAgents />
        <HomeStack />
        <HomeQuickstart />
        <HomeDownload download={desktopDownload} localInstallerPath={localInstallerPath} />
        <HomeGuide />
        <HomeContact />
      </main>

      <HomeFooter />
    </div>
  )
}
