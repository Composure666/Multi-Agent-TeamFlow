import { app } from 'electron'
import { createServer } from 'node:net'
import fs from 'node:fs'
import path from 'node:path'

import { startCompanionProxy, type CompanionProxyHandle } from './companion-proxy'

/**
 * In-process 启动 Next.js standalone server。详见 Spec 12 §4.3 + Spec 14。
 *
 * - 仅在打包后（`app.isPackaged`）使用；dev 模式跳过这里，main 直接 loadURL localhost:3000
 * - PORT 走系统分配的空闲端口，避免与 3000 / 用户已开端口冲突
 * - require 触发 standalone server.js 启动；server.js 内 createServer().listen(PORT)
 * - 探活直到 HEAD / 返回 < 500，最多 15s
 *
 * **companion mode 安全模型**（Spec 14 §4.1 / §5.4 / §11；security audit 2026-09-12 High #1）：
 * - 主 Next server **始终** listen 127.0.0.1（桌面 UI 用，行为不变）。
 * - companion mode 启用时，**额外**启独立 proxy server listen 0.0.0.0:companionPort
 *   （见 companion-proxy.ts），强制 Bearer 鉴权 + path 白名单，只把 `/api/mobile/*` 代理到主 server。
 * - 桌面 web API（`/api/conversations`、`/api/settings` 等）**不再**对 LAN 设备开放——
 *   LAN 设备要访问桌面能力，必须经过 companion proxy 且带 `/api/mobile/*` 前缀。
 */
export async function startEmbeddedServer(): Promise<EmbeddedServerHandle> {
  const companion = readCompanionConfig()
  const enabled = companion.companionMode !== 'off' && !!companion.mobileDeviceToken
  const hostname = '127.0.0.1'
  const port = await getFreePort(hostname)

  process.env.PORT = String(port)
  process.env.HOSTNAME = hostname
  process.env.AGENTHUB_INTERNAL_BASE_URL = `http://127.0.0.1:${port}`
  process.env.NEXT_TELEMETRY_DISABLED = '1'
  if (enabled && companion.mobileDeviceToken) {
    process.env.AGENTHUB_MOBILE_TOKEN = companion.mobileDeviceToken
  }

  // app.getAppPath() 在打包模式下指向 app.asar；但 Next standalone 的 server.js
  // 入口第一行就 process.chdir(__dirname)，chdir 是真实文件系统系统调用，跨不进 asar。
  // 我们已经把 .next/standalone 走 asarUnpack 解出来了，require 时直接走 .asar.unpacked
  // 路径，让 Electron asar layer 不介入 —— __dirname 才会是真实磁盘路径。
  const appPath = app.getAppPath()
  const standaloneRoot = appPath.endsWith('.asar')
    ? appPath + '.unpacked'
    : appPath
  const standaloneEntry = path.join(
    standaloneRoot,
    '.next',
    'standalone',
    'server.js',
  )

  // 用 require 触发 listen；server.js 是 Next 生成的 CommonJS 入口
  // 注意：在 ESM 上下文里要换 createRequire；当前 main 是 CJS（tsconfig module=commonjs），可直接用
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require(standaloneEntry)

  await waitUntilReady(`http://127.0.0.1:${port}/`)

  let companionHandle: CompanionProxyHandle | null = null
  if (enabled && companion.mobileDeviceToken) {
    try {
      companionHandle = await startCompanionProxy({
        mainPort: port,
        mobileDeviceToken: companion.mobileDeviceToken,
        port: companion.companionPort,
      })
      console.log(
        `[AgentHub] companion proxy listening on 0.0.0.0:${companionHandle.port} (auth + /api/mobile whitelist required)`,
      )
    } catch (err) {
      // Proxy 失败不应阻断主 server / 桌面 UI；记录并在 UI 层告知用户
      console.error('[AgentHub] failed to start companion proxy', err)
    }
  }

  return {
    mainPort: port,
    closeCompanion: async () => {
      if (companionHandle) await companionHandle.close()
      companionHandle = null
    },
  }
}

export interface EmbeddedServerHandle {
  /** 主 Next server 实际 listen 的端口（loopback）。 */
  mainPort: number
  /** 关闭 companion proxy（companion mode 关闭时调用；不抛错）。 */
  closeCompanion(): Promise<void>
}

/** 从系统拿一个 ephemeral 端口（监听 :0 → 读 actual port → close）。 */
function getFreePort(host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.unref()
    probe.on('error', reject)
    probe.listen(0, host, () => {
      const addr = probe.address()
      if (addr && typeof addr === 'object') {
        const port = addr.port
        probe.close(() => resolve(port))
      } else {
        probe.close()
        reject(new Error('Failed to allocate ephemeral port'))
      }
    })
  })
}

interface CompanionConfig {
  companionMode?: 'off' | 'lan' | 'tailnet'
  mobileDeviceToken?: string | null
  companionPort?: number
}

function readCompanionConfig(): Required<CompanionConfig> {
  const fallback: Required<CompanionConfig> = {
    companionMode: 'off',
    mobileDeviceToken: null,
    companionPort: 60646,
  }

  const dataDir = process.env.AGENTHUB_DATA_DIR
  if (!dataDir) return fallback

  try {
    const raw = fs.readFileSync(path.join(dataDir, 'companion.json'), 'utf8')
    const parsed = JSON.parse(raw) as CompanionConfig
    return {
      companionMode: parsed.companionMode ?? fallback.companionMode,
      mobileDeviceToken: parsed.mobileDeviceToken ?? null,
      companionPort: parsed.companionPort ?? fallback.companionPort,
    }
  } catch {
    return fallback
  }
}

/** 探活：每 200ms 打一次 HEAD；server 起来或超时（默认 15s）才返回。 */
async function waitUntilReady(url: string, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const resp = await fetch(url, { method: 'HEAD' })
      if (resp.status < 500) return
    } catch {
      // server 尚未起来
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`Embedded server not ready at ${url} after ${timeoutMs}ms`)
}
