import { AppWorkbench } from '@/components/app-workbench'
import { ElectronTitleBar } from '@/components/electron-title-bar'
import { SettingsDeepLink } from '@/components/settings-deeplink'
import { UserGuideDialog } from '@/components/user-guide-dialog'

export default function Home() {
  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-[var(--agenthub-surface-muted)]">
      <ElectronTitleBar />
      <div className="min-h-0 flex-1 overflow-hidden">
        <AppWorkbench />
      </div>
      {/* 主页上「去配置 AI 模型」这类按钮带 ?setup=<分区> 进来，落地即打开设置对应页。 */}
      <SettingsDeepLink />
      {/* 挂在根布局上：首次进入自动弹出，之后可从侧栏「使用指南」再打开。 */}
      <UserGuideDialog />
    </div>
  )
}
