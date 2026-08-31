import type { ReactNode } from 'react'

import type { AppWorkbenchView } from '@/stores/app-store'

export type WorkbenchViewRenderers = Partial<Record<AppWorkbenchView, () => ReactNode>>

export function WorkbenchViewRouter({
  view,
  renderers,
}: {
  view: AppWorkbenchView
  renderers: WorkbenchViewRenderers
}) {
  const render = renderers[view]
  return (
    <div className="agenthub-motion-enter h-full min-h-0 overflow-hidden" data-workbench-view={view}>
      {render ? render() : null}
    </div>
  )
}
