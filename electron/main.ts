import fs from 'node:fs'
import path from 'node:path'

import { app, BrowserWindow, ipcMain, Menu, Notification, session, shell } from 'electron'

import { setupDataDir } from './paths'
import { startEmbeddedServer } from './server-bootstrap'

const isDev = process.env.AGENTHUB_DEV === '1'
const DEV_URL = 'http://localhost:3000'

let mainUrlPromise: Promise<string> | null = null
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let closeCompanionServer: (() => Promise<void>) | null = null

// Electron 默认用 package.json 的 `name` 字段（'multi-agent-teamflow'）作为 app 名，
// userData 会落在 ~/Library/Application Support/multi-agent-teamflow/
//（Windows: %APPDATA%\multi-agent-teamflow\）。这里覆盖成品牌名，让窗口 / 菜单 / 安装后的
// 应用显示名统一；必须在任何 app.getPath('userData') 调用之前完成。
const APP_DISPLAY_NAME = 'Multi-Agent TeamFlow'

// ⚠️ app 名同时决定 userData 目录名。历史上这个目录还叫别的名字，改名后目录名会跟着变，
// 那等于让已有桌面端用户的 DB / workspace（<userData>/data）凭空消失。所以旧目录存在就
// 继续用它，只有全新安装才落到新名字下。userData 路径属**内部标识**，别再跟着品牌改。
// 注意：这里必须写「旧目录的真实名字」才能命中历史安装，不能改成新品牌名。
const LEGACY_USER_DATA_DIR_NAME = 'Nexora Studio'

app.setName(APP_DISPLAY_NAME)
const legacyUserDataDir = path.join(app.getPath('appData'), LEGACY_USER_DATA_DIR_NAME)
if (fs.existsSync(legacyUserDataDir)) {
  app.setPath('userData', legacyUserDataDir)
}

type NativeNotificationTarget = {
  type: 'conversation' | 'automation' | 'artifact' | 'settings'
  conversationId?: string
  messageId?: string
  automationId?: string
  runId?: string
  artifactId?: string
  settingsSection?: string
}

type NativeNotificationPayload = {
  id?: string
  title: string
  body?: string
  level?: 'info' | 'success' | 'warning' | 'error'
  urgent?: boolean
  target?: NativeNotificationTarget
  conversationId?: string
  automationId?: string
  runId?: string
}

let mainWindow: BrowserWindow | null = null

function isNativeNotificationPayload(value: unknown): value is NativeNotificationPayload {
  if (!value || typeof value !== 'object') return false
  const payload = value as {
    id?: unknown
    title?: unknown
    body?: unknown
    level?: unknown
    urgent?: unknown
    target?: unknown
    conversationId?: unknown
    automationId?: unknown
    runId?: unknown
  }
  if (payload.id !== undefined && typeof payload.id !== 'string') return false
  if (typeof payload.title !== 'string' || payload.title.trim().length === 0) return false
  if (payload.body !== undefined && typeof payload.body !== 'string') return false
  if (payload.level !== undefined && !['info', 'success', 'warning', 'error'].includes(String(payload.level))) return false
  if (payload.urgent !== undefined && typeof payload.urgent !== 'boolean') return false
  if (payload.target !== undefined && !isNativeNotificationTarget(payload.target)) return false
  if (payload.conversationId !== undefined && typeof payload.conversationId !== 'string') return false
  if (payload.automationId !== undefined && typeof payload.automationId !== 'string') return false
  if (payload.runId !== undefined && typeof payload.runId !== 'string') return false
  return true
}

function isNativeNotificationTarget(value: unknown): value is NativeNotificationTarget {
  if (!value || typeof value !== 'object') return false
  const target = value as Record<string, unknown>
  if (!['conversation', 'automation', 'artifact', 'settings'].includes(String(target.type))) return false
  for (const key of ['conversationId', 'messageId', 'automationId', 'runId', 'artifactId', 'settingsSection']) {
    if (target[key] !== undefined && typeof target[key] !== 'string') return false
  }
  return true
}

function focusMainWindow(): BrowserWindow | null {
  const win = mainWindow ?? BrowserWindow.getAllWindows()[0]
  if (!win) return null
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  return win
}

function registerNotificationIpc(): void {
  ipcMain.handle('notifications:show-native', (_event, payload: unknown) => {
    if (!isNativeNotificationPayload(payload) || !Notification.isSupported()) return

    const notification = new Notification({
      title: payload.title,
      body: payload.body,
      silent: false,
    })
    notification.on('click', () => {
      const win = focusMainWindow()
      win?.webContents.send('notifications:clicked', payload)
    })
    notification.show()

    if (payload.urgent) {
      const win = mainWindow ?? BrowserWindow.getAllWindows()[0]
      win?.flashFrame(true)
    }
  })

  ipcMain.handle('notifications:flash-frame', () => {
    const win = mainWindow ?? BrowserWindow.getAllWindows()[0]
    win?.flashFrame(true)
  })

  ipcMain.handle('notifications:clear-urgent', () => {
    const win = mainWindow ?? BrowserWindow.getAllWindows()[0]
    win?.flashFrame(false)
  })
}

function getMainUrl(): Promise<string> {
  if (!mainUrlPromise) {
    mainUrlPromise = isDev
      ? Promise.resolve(DEV_URL)
      : startEmbeddedServer().then((handle) => {
          closeCompanionServer = handle.closeCompanion
          return `http://127.0.0.1:${handle.mainPort}`
        })
  }

  return mainUrlPromise
}

function getWindow(event: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender)
}

function isMenuPoint(value: unknown): value is { x: number; y: number } {
  if (!value || typeof value !== 'object') return false

  const point = value as { x?: unknown; y?: unknown }
  return typeof point.x === 'number' && typeof point.y === 'number' && Number.isFinite(point.x) && Number.isFinite(point.y)
}

function registerWindowControlIpc(): void {
  ipcMain.handle('window:minimize', (event) => {
    getWindow(event)?.minimize()
  })

  ipcMain.handle('window:maximize', (event) => {
    const win = getWindow(event)
    if (!win) return

    if (win.isMaximized()) {
      win.unmaximize()
      return
    }

    win.maximize()
  })

  ipcMain.handle('window:toggle-maximize', (event) => {
    const win = getWindow(event)
    if (!win) return

    if (win.isMaximized()) {
      win.unmaximize()
      return
    }

    win.maximize()
  })

  ipcMain.handle('window:close', (event) => {
    getWindow(event)?.close()
  })

  ipcMain.handle('window:is-maximized', (event) => {
    return getWindow(event)?.isMaximized() ?? false
  })

  ipcMain.handle('window:show-menu', (event, point: unknown) => {
    const win = getWindow(event)
    if (!win || !isMenuPoint(point)) return

    const isMac = process.platform === 'darwin'
    const isMaximized = win.isMaximized()
    const menu = Menu.buildFromTemplate([
      {
        label: isMac ? '缩放' : isMaximized ? '还原' : '最大化',
        click: () => {
          if (win.isMaximized()) {
            win.unmaximize()
            return
          }

          win.maximize()
        },
      },
      {
        label: '最小化',
        click: () => win.minimize(),
      },
      { type: 'separator' },
      {
        label: '关闭',
        click: () => win.close(),
      },
    ])

    menu.popup({
      window: win,
      x: Math.round(point.x),
      y: Math.round(point.y),
    })
  })
}

async function createMainWindow(): Promise<void> {
  let url: string
  try {
    url = await getMainUrl()
  } catch (err) {
    console.error('[AgentHub] failed to start server', err)
    app.quit()
    return
  }

  const isMac = process.platform === 'darwin'
  // Window icon: in dev we read from source public/icons; in a packaged build
  // electron-builder copies electron/build/* into dist-electron/, so __dirname/icon.png works.
  // (macOS uses the bundled app icon set by electron-builder; calling setIcon on a
  // frameless hidden-titleBarStyle window would error, so we skip it there.)
  const windowIcon = (() => {
    const candidates = [
      path.join(__dirname, 'icon.png'),
      path.resolve(__dirname, '..', 'electron', 'build', 'icon-256.png'),
      path.resolve(__dirname, '..', 'public', 'icons', 'icon.png'),
    ]
    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate)) return candidate
      } catch {
        // ignore
      }
    }
    return candidates[candidates.length - 1]
  })()
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 980,
    minHeight: 600,
    title: APP_DISPLAY_NAME,
    backgroundColor: '#0F1115',
    autoHideMenuBar: true,
    frame: false,
    ...(isMac
      ? {
          titleBarStyle: 'hiddenInset' as const,
          trafficLightPosition: { x: 14, y: 13 },
        }
      : {}),
    ...(isMac ? {} : { icon: windowIcon }),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: !app.isPackaged,
      preload: path.join(__dirname, 'preload.js'),
    },
  })
  if (!isMac) {
    try {
      win.setIcon(windowIcon)
    } catch (err) {
      console.warn('[AgentHub] setIcon failed', err)
    }
  }
  mainWindow = win
  win.on('focus', () => win.flashFrame(false))
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })
  win.setMenuBarVisibility(false)

  // a) 外链交给 OS 默认浏览器，不在窗口里新开
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    shell.openExternal(target).catch(() => {})
    return { action: 'deny' }
  })

  // b) 拦截站外导航；本地 server origin 通过
  win.webContents.on('will-navigate', (event, target) => {
    const origin = new URL(target).origin
    if (origin !== new URL(url).origin) {
      event.preventDefault()
      shell.openExternal(target).catch(() => {})
    }
  })

  await win.loadURL(url)
}

// Single-instance lock：第二次启动 focus 已开的窗口，不开新进程
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const wins = BrowserWindow.getAllWindows()
    if (wins.length > 0) {
      const w = wins[0]
      if (w.isMinimized()) w.restore()
      w.focus()
    }
  })

  // 关键时序：DATA_DIR 必须在 server require 业务代码之前注入
  setupDataDir()
  registerWindowControlIpc()
  registerNotificationIpc()

  app.whenReady().then(async () => {
    // 用户 shell 里若设了 http_proxy / HTTPS_PROXY，Chromium 会继承它去代理 localhost 请求，
    // 导致 BrowserWindow 加载 dev URL 时被代理拦截。强制 direct（proxyRules 空）并显式 bypass 本地。
    await session.defaultSession
      .setProxy({ proxyRules: 'direct://', proxyBypassRules: '<local>' })
      .catch((err) => console.error('[AgentHub] setProxy failed', err))

    await createMainWindow()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow()
    }
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}
