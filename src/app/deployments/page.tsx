import type { Metadata } from 'next'
import Link from 'next/link'

import { ArrowLeft } from 'lucide-react'
import { DeploymentCopyButton } from '@/components/deployment-copy-button'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/workbench-primitives'
import { cn } from '@/lib/utils'
import { deploymentPreviewPath, listDeployments } from '@/server/deployment-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '部署列表 · Multi-Agent TeamFlow',
  description: '本机已发布的静态部署列表。',
}

/**
 * /deployments：本机已发布部署的简单列表（标题、版本、时间、打开/复制）。
 *
 * 数据源是磁盘上的部署 manifest（见 deployment-service.listDeployments），
 * 没有 DB 表、不新增 API。删除操作没有对应接口，故不提供。
 */
export default function DeploymentsPage() {
  const deployments = listDeployments()

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-6">
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
      >
        <ArrowLeft className="size-4" />
        返回工作台
      </Link>
      <h1 className="font-heading text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
        部署列表
      </h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        本机已发布的静态部署，共 {deployments.length} 个。部署由工作台里的网页产物发布产生，预览地址只在当前实例内有效。
      </p>

      {deployments.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="暂无已发布的部署"
            description="在工作台里把一个网页产物发布为部署后，会出现在这里。"
          />
        </div>
      ) : (
        <ul className="mt-8 flex flex-col gap-3">
          {deployments.map((deployment) => {
            const previewPath = deploymentPreviewPath(deployment.id)
            return (
              <li
                key={deployment.id}
                className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--agenthub-border)] bg-[var(--agenthub-surface)] px-4 py-3.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {deployment.title}
                  </p>
                  <p className="mt-0.5 truncate font-mono text-xs text-slate-500 dark:text-slate-400">
                    {deployment.id} · v{deployment.version} ·{' '}
                    {new Date(deployment.createdAt).toLocaleString('zh-CN', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <a
                    href={previewPath}
                    className={cn(buttonVariants({ variant: 'default', size: 'sm' }), 'h-8')}
                  >
                    打开
                  </a>
                  <DeploymentCopyButton path={previewPath} />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
