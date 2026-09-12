import { createServer, request as httpRequest } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { timingSafeEqual } from 'node:crypto'

const ALLOWED_PATH_PREFIXES = ['/api/mobile/']

const ALLOWED_ORIGIN_LITERALS = new Set([
  'capacitor://localhost',
  'ionic://localhost',
  'https://localhost',
  'http://localhost',
])
const ALLOWED_ORIGIN_REGEX = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\]):\d+$/

export interface CompanionProxyOptions {
  /** 主 Next server 实际 listen 的端口(loopback)。 */
  mainPort: number
  /** 设备 token(从 companion.json 读取)。 */
  mobileDeviceToken: string
  /** Proxy listen 端口(spec 14 §4.1 默认 60646)。 */
  port: number
}

export interface CompanionProxyHandle {
  /** 实际 listen 的端口(可能与传入 port 不同,如 :0 测试场景)。 */
  port: number
  close(): Promise<void>
}

/**
 * Companion Mode proxy server.
 *
 * 详见 Spec 14 §4.1 / §5.4 / §10 / §11。
 *
 * 设计意图：
 * - companion mode 启用时，主 Next server 始终 listen 127.0.0.1（桌面 UI 用，行为不变）
 * - 启独立 Node http server listen 0.0.0.0:companionPort
 * - 强制 `Authorization: Bearer <mobileDeviceToken>` 校验（timingSafeEqual）
 * - 强制 path 白名单：只允许 `/api/mobile/*` 转发到主 server；其他全拒（403）
 * - 转发的目标 URL 始终 hard-coded 到 127.0.0.1（防止 LAN 设备把请求代理到 LAN 上的其它 server，SSRF）
 *
 * 即使 `/api/mobile/*` 当前还没有任何路由实现，这个 proxy 也必须架好——
 * 它的存在把 "LAN 设备可裸奔桌面 web API" 这道门彻底关上（详见 security audit 2026-09-12 High #1）。
 */
export function startCompanionProxy(opts: CompanionProxyOptions): Promise<CompanionProxyHandle> {
  const expectedToken = Buffer.from(opts.mobileDeviceToken, 'utf8')

  const server = createServer((req, res) => {
    handleRequest(req, res, opts, expectedToken)
  })

  return new Promise((resolve, reject) => {
    const onError = (err: Error) => {
      server.removeListener('listening', onListening)
      reject(err)
    }
    const onListening = () => {
      server.removeListener('error', onError)
      const addr = server.address()
      const port = addr && typeof addr === 'object' ? addr.port : opts.port
      resolve({
        port,
        close: () =>
          new Promise<void>((resolveClose, rejectClose) => {
            server.close((err) => (err ? rejectClose(err) : resolveClose()))
          }),
      })
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(opts.port, '0.0.0.0')
  })
}

function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  opts: CompanionProxyOptions,
  expectedToken: Buffer,
): void {
  const origin = headerString(req.headers.origin)

  // 1) 路径白名单（先校验，避免给非白名单路径泄露 OPTIONS / CORS 信息）
  const url = req.url ?? '/'
  const isAllowedPath = ALLOWED_PATH_PREFIXES.some(
    (prefix) => url === prefix || url.startsWith(prefix),
  )
  if (!isAllowedPath) {
    res.writeHead(403, {
      'Content-Type': 'text/plain; charset=utf-8',
      ...corsHeaders(origin, true),
    })
    res.end('Forbidden: only /api/mobile/* paths are reachable via companion proxy')
    return
  }

  // 2) OPTIONS 预检：不要求 token，直接 204 + CORS
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(origin, true))
    res.end()
    return
  }

  // 3) Bearer token 校验
  const auth = headerString(req.headers.authorization)
  if (!auth || !auth.startsWith('Bearer ')) {
    res.writeHead(401, {
      'Content-Type': 'text/plain; charset=utf-8',
      ...corsHeaders(origin, true),
    })
    res.end('Unauthorized: Authorization: Bearer <mobileDeviceToken> required')
    return
  }
  const actual = Buffer.from(auth.slice('Bearer '.length).trim(), 'utf8')
  if (actual.length !== expectedToken.length || !timingSafeEqual(actual, expectedToken)) {
    res.writeHead(401, {
      'Content-Type': 'text/plain; charset=utf-8',
      ...corsHeaders(origin, true),
    })
    res.end('Unauthorized: invalid device token')
    return
  }

  // 4) 代理到 upstream loopback（防 SSRF：硬编 127.0.0.1）
  proxyToUpstream(req, res, opts.mainPort)
}

function proxyToUpstream(req: IncomingMessage, res: ServerResponse, mainPort: number): void {
  const targetPath = req.url ?? '/'

  // 过滤 hop-by-hop headers + 改写 host（让上游 web framework 看到正确的 host）
  const forwardHeaders = { ...req.headers }
  delete forwardHeaders.connection
  delete forwardHeaders['keep-alive']
  delete forwardHeaders['proxy-authenticate']
  delete forwardHeaders['proxy-authorization']
  delete forwardHeaders.te
  delete forwardHeaders.trailers
  delete forwardHeaders['transfer-encoding']
  delete forwardHeaders.upgrade
  forwardHeaders.host = `127.0.0.1:${mainPort}`

  const proxyReq = httpRequest(
    {
      hostname: '127.0.0.1',
      port: mainPort,
      path: targetPath,
      method: req.method,
      headers: forwardHeaders,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers)
      proxyRes.pipe(res)
    },
  )
  proxyReq.on('error', (err) => {
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end(`Bad gateway: ${err.message}`)
  })
  req.on('error', () => {
    proxyReq.destroy()
  })
  req.pipe(proxyReq)
}

function headerString(value: string | string[] | undefined): string | null {
  if (value === undefined) return null
  return Array.isArray(value) ? value.join(',') : value
}

function corsHeaders(origin: string | null, withOrigin = false): Record<string, string> {
  const headers: Record<string, string> = {
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept',
    'Access-Control-Max-Age': '600',
  }
  if (withOrigin && origin) {
    if (ALLOWED_ORIGIN_LITERALS.has(origin) || ALLOWED_ORIGIN_REGEX.test(origin)) {
      headers['Access-Control-Allow-Origin'] = origin
    }
  }
  return headers
}