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
      {/* 挂在根布局上：首次进入（`user_guide_dismissed_at` 为空）自动弹出。
          ❗ 侧栏那两个常驻入口（桌面侧栏 + 移动端抽屉的按钮）已按需求移除 ⇒
          用户关掉之后**当前没有手动重开的入口**，功能本体与内容真源
          （`components/user-guide-data.ts`）都还在，需要时挂到设置里即可。 */}
      <UserGuideDialog />
    </div>
  )
}
