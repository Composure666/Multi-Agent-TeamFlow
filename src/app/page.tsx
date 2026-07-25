import { AppWorkbench } from '@/components/app-workbench'
import { ElectronTitleBar } from '@/components/electron-title-bar'

export default function Home() {
  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-[var(--agenthub-surface-muted)]">
      <ElectronTitleBar />
      <div className="min-h-0 flex-1 overflow-hidden">
        <AppWorkbench />
      </div>
    </div>
  )
}
