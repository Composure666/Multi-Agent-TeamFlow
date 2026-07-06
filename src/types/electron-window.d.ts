export {}

type AgentHubPlatform = 'aix' | 'darwin' | 'freebsd' | 'linux' | 'openbsd' | 'sunos' | 'win32' | 'cygwin' | 'netbsd'

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
  }
}
