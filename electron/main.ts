import path from 'node:path'

import { app, BrowserWindow, ipcMain, Menu, session, shell } from 'electron'

import { setupDataDir } from './paths'
import { startEmbeddedServer } from './server-bootstrap'

const isDev = process.env.AGENTHUB_DEV === '1'
const DEV_URL = 'http://localhost:3000'

let mainUrlPromise: Promise<string> | null = null

// Electron 默认用 package.json 的 `name` 字段（'bytedance-agenthub'）作为 app 名，
// 用户数据会落在 ~/Library/Application Support/bytedance-agenthub/。覆盖成 productName 'AgentHub'，
// 让 userData 路径更友好；必须在任何 app.getPath('userData') 调用之前完成。
app.setName('AgentHub')

function getMainUrl(): Promise<string> {
  if (!mainUrlPromise) {
    mainUrlPromise = isDev
      ? Promise.resolve(DEV_URL)
      : startEmbeddedServer().then((port) => `http://127.0.0.1:${port}`)
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
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 980,
    minHeight: 600,
    title: 'AgentHub',
    backgroundColor: '#0F1115',
    autoHideMenuBar: true,
    frame: false,
    ...(isMac
      ? {
          titleBarStyle: 'hiddenInset' as const,
          trafficLightPosition: { x: 14, y: 13 },
        }
      : {}),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: !app.isPackaged,
      preload: path.join(__dirname, 'preload.js'),
    },
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
