export {}

type AgentHubPlatform = 'aix' | 'darwin' | 'freebsd' | 'linux' | 'openbsd' | 'sunos' | 'win32' | 'cygwin' | 'netbsd'

type AgentHubNotificationLevel = 'info' | 'success' | 'warning' | 'error'

interface AgentHubNativeNotificationPayload {
  title: string
  body?: string
  level?: AgentHubNotificationLevel
  urgent?: boolean
  conversationId?: string
  automationId?: string
  runId?: string
}

declare global {
  interface Window {
    agenthubWindowControls?: {
      minimize: () => Promise<void>
      maximize: () => Promise<void>
      toggleMaximize: () => Promise<void>
      close: () => Promise<void>
      isMaximized: () => Promise<boolean>
      showWindowMenu: (point: { x: number; y: number }) => Promise<void>
      platform: AgentHubPlatform
    }
    agenthubNotifications?: {
      showNative: (payload: AgentHubNativeNotificationPayload) => Promise<void>
      flashFrame: () => Promise<void>
      clearUrgent: () => Promise<void>
    }
  }
}
