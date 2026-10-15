'use client'

import { ImageOff } from 'lucide-react'
import { useState } from 'react'

/**
 * 主页「界面预览」区的截图。
 *
 * 为什么单独做成客户端组件：图片加载失败要换成占位文案，必须监听 `onError`，
 * 而 `onError` 只能在客户端组件里接。其余分区仍是服务端组件。
 *
 * 图片本身是仓库内的静态资源（`public/images/app-screenshot.png`，
 * 与 `docs/images/teamflow-preview.png` 同源），不使用任何外链 ——
 * 离线打开主页也能显示。
 */
export function HomeScreenshotFigure() {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <div className="flex aspect-[16/9] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--agenthub-border)] bg-[var(--agenthub-surface-muted)] px-6 text-center">
        <ImageOff className="size-7 text-slate-400" aria-hidden="true" />
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
          界面截图加载失败
        </p>
        <p className="text-xs leading-6 text-slate-500 dark:text-slate-400">
          截图文件位于仓库 <code className="font-mono">docs/images/teamflow-preview.png</code>
          ，也可直接下载桌面端查看真实界面。
        </p>
      </div>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- 走仓库内静态资源，无需 next/image 优化
    <img
      src="/images/app-screenshot.png"
      alt="Multi-Agent TeamFlow 工作台界面：左侧为工作区导航与对话历史，右侧为新建任务入口与多 Agent 协作会话区"
      className="w-full rounded-xl border border-[var(--agenthub-border)] bg-[var(--agenthub-surface)]"
      onError={() => setFailed(true)}
      loading="lazy"
    />
  )
}
