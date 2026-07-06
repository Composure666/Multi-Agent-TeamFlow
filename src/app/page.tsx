import { AppWorkbench } from '@/components/app-workbench'
import { ElectronTitleBar } from '@/components/electron-title-bar'

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--agenthub-surface-muted)]">
      <ElectronTitleBar />
      <div className="flex-1">
        <AppWorkbench />
      </div>
    </div>
  )
}
