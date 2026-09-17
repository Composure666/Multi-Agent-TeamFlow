import { lookup as dnsLookup } from 'node:dns/promises'
import { isIP } from 'node:net'

/**
 * bash 网络出口守卫 —— 详见 specs/11-platform.md「bash 网络出口」。
 *
 * 背景（2026-09-17 调研）：`findBannedPattern` 只拦 `curl … | bash` / `wget … | sh`
 * 这类管道写法，**裸 `curl <任意URL>` 完全放行**。Agent 可借此访问平台自身 API
 * （回环端口无鉴权，实测 `127.0.0.1:3000/api/agents` 返回 200 + 37KB 真实数据）、
 * 云 metadata（`metadata.tencentyun.com` 实测 200）、以及内网服务，
 * 从而绕过 `web_fetch` 的全部 SSRF 防护。
 *
 * 策略（2026-09-17 与用户确认）：
 *  - metadata / link-local / 私有网段 / CGNAT / 组播 / 未指定地址：**一律拒绝**
 *  - 回环（127.0.0.0/8、::1、localhost）：**只拒平台自身服务端口**，
 *    其余端口放行 —— 保留「在沙箱里起本地 dev server 再 curl 自测」的开发流程
 *
 * 设计要点：只在命令里出现网络命令时才做提取与解析，普通文本里的 URL 不误伤；
 * DNS 解析失败/超时按放行处理（此时 curl 自身也连不上，不阻塞正常工作）。
 */

const DEFAULT_PLATFORM_PORT = 3000

/** 出现即认为命令可能发起网络请求 —— 含语言运行时（`python -c "requests.get(…)"`）。 */
const NETWORK_COMMAND_TOKENS = new Set([
  'curl', 'wget', 'nc', 'ncat', 'netcat', 'telnet', 'ssh', 'scp', 'sftp', 'rsync',
  'ping', 'ping6', 'traceroute', 'tracepath', 'dig', 'nslookup', 'host', 'ftp',
  'aria2c', 'socat', 'http', 'httpie', 'openssl',
  'python', 'python3', 'python3.10', 'python3.11', 'python3.12', 'node', 'deno', 'bun', 'php', 'ruby', 'perl',
])

/** 支持「裸 host[:port]」位置参数的命令（不含语言运行时，避免把脚本文件名当主机名）。 */
const HOST_ARG_COMMANDS = new Set([
  'curl', 'wget', 'nc', 'ncat', 'netcat', 'telnet', 'ssh', 'scp', 'sftp', 'rsync',
  'ping', 'ping6', 'traceroute', 'tracepath', 'dig', 'nslookup', 'host', 'ftp', 'aria2c', 'socat',
])

/**
 * 这些选项的作用就是「把请求强行指向别的主机 / 本地 socket」，属于明确的 SSRF 绕过手法，
 * 正常 Agent 任务用不到（直连即可），一律拒绝。
 */
const ALWAYS_BLOCKED_OPTIONS = new Set([
  '--unix-socket', '--abstract-unix-socket', '--resolve', '--connect-to',
])

/** 取值为「主机:端口」的选项 —— 取值会被送去解析（代理指向平台端口同样算触达）。 */
const OPTIONS_WITH_HOST_VALUE = new Set(['--proxy', '-x'])

/** 取值为普通字符串的选项 —— 跳过其取值，避免把取值误当主机名。 */
const OPTIONS_WITH_VALUE = new Set([
  '-H', '--header', '-d', '--data', '--data-raw', '--data-binary', '--data-urlencode',
  '-o', '--output', '-X', '--request', '-u', '--user', '-A', '--user-agent',
  '-e', '--referer', '-b', '--cookie', '-T', '--upload-file', '-F', '--form',
  '-w', '--write-out', '-m', '--max-time', '--connect-timeout', '-r', '--range',
  '--limit-rate', '--retry', '--retry-delay', '--retry-max-time', '--cacert', '--cert', '--key',
  '-E', '--cert-type', '--key-type', '-K', '--config', '-Z', '--parallel-max', '--output-dir',
])

/** metadata / 云内网域名别名。 */
const METADATA_HOSTS = new Set([
  'metadata',
  'metadata.google.internal',
  'instance-data',
  'instance-data.ec2.internal',
  'metadata.tencentyun.com',
  'metadata.tencent.internal',
  'metadata.aliyun.internal',
  '100.100.100.200',
])

/** metadata 服务 IP（各云厂商）。 */
const METADATA_IPS = new Set(['169.254.169.254', '168.63.129.16', '169.254.0.23', '100.100.100.200'])

const URL_PATTERN = /[a-z][a-z0-9+.-]*:\/\/[^\s'"`|;&<>()\\]+/gi
const DNS_TIMEOUT_MS = 2_500
const DNS_CACHE_TTL_MS = 60_000

export type BashAddressClass =
  | 'loopback'
  | 'link-local'
  | 'metadata'
  | 'private'
  | 'cgnat'
  | 'multicast'
  | 'unspecified'
  | 'public'

export interface BlockedNetworkTarget {
  target: string
  reason: string
}

interface ResolvedTarget {
  host: string
  port: number | null
  raw: string
}

type LookupImpl = (hostname: string, options: { all: true }) => Promise<Array<{ address: string }>>

const dnsCache = new Map<string, { reason: string | null; expiresAt: number }>()

/** 平台自身服务端口 —— 回环上这些端口视为平台内部入口，禁止 Agent 触达。 */
export function resolvePlatformPorts(): Set<number> {
  const ports = new Set<number>([DEFAULT_PLATFORM_PORT])
  const rawPort = process.env.PORT?.trim()
  if (rawPort && /^\d+$/.test(rawPort)) ports.add(Number(rawPort))

  const internalBase = process.env.AGENTHUB_INTERNAL_BASE_URL?.trim()
  if (internalBase) {
    try {
      const parsedPort = new URL(internalBase).port
      if (parsedPort && /^\d+$/.test(parsedPort)) ports.add(Number(parsedPort))
    } catch {
      // 配置非法时忽略，不影响默认端口保护
    }
  }
  return ports
}

/**
 * 检查命令是否触碰被禁网络目标。返回 null 表示放行。
 * 同步判定在前（IP literal / host alias），仅对普通域名才做 DNS 预解析。
 */
export async function findBlockedNetworkTarget(
  command: string,
  options: { platformPorts?: Set<number>; lookupImpl?: LookupImpl } = {},
): Promise<BlockedNetworkTarget | null> {
  if (!shouldInspectCommand(command)) return null

  const platformPorts = options.platformPorts ?? resolvePlatformPorts()
  const lookupImpl = options.lookupImpl ?? defaultLookup

  for (const target of extractNetworkTargets(command)) {
    const blocked = await classifyTarget(target, platformPorts, lookupImpl)
    if (blocked) return blocked
  }
  return null
}

/**
 * 是否需要检查，两种触发：
 *  1. 命令里出现带协议的 URL —— 覆盖 `git clone http://…` / `npm i http://…` 这类
 *     命令名不在网络命令清单里的写法；
 *  2. 命令里出现网络类命令 token —— 覆盖 `curl 127.0.0.1:3000` 这种无协议裸 host。
 */
function shouldInspectCommand(command: string): boolean {
  if (/[a-z][a-z0-9+.-]*:\/\//i.test(command)) return true

  for (const token of command.split(/[\s|;&()<>\n]+/)) {
    const cleaned = stripToken(token)
    if (!cleaned) continue
    if (NETWORK_COMMAND_TOKENS.has(cleaned.split('/').pop() ?? cleaned)) return true
  }
  return false
}

/** 提取命令尝试访问的网络目标：完整 URL + 网络命令的裸 host[:port] + 取值为主机的选项。 */
export function extractNetworkTargets(command: string): ResolvedTarget[] {
  const targets: ResolvedTarget[] = []
  const seen = new Set<string>()
  const push = (raw: string, explicitPort: number | null | undefined) => {
    const parsed = parseTarget(raw)
    if (!parsed) return
    if (explicitPort !== undefined && explicitPort !== null) parsed.port = explicitPort
    const key = `${parsed.host}:${parsed.port ?? ''}`
    if (seen.has(key)) return
    seen.add(key)
    targets.push(parsed)
  }

  for (const match of command.matchAll(URL_PATTERN)) {
    push(match[0], undefined)
  }

  const tokens = command.split(/\s+/).filter(Boolean)
  for (let i = 0; i < tokens.length; i += 1) {
    const token = stripToken(tokens[i] ?? '')
    if (!token) continue

    // 「强行改写目标」类选项：出现即拒，直接产出一个必然被拦的哨兵目标
    if (ALWAYS_BLOCKED_OPTIONS.has(token) || ALWAYS_BLOCKED_OPTIONS.has(token.split('=')[0] ?? '')) {
      targets.push({ host: `option:${token.split('=')[0]}`, port: null, raw: token })
      continue
    }

    if (OPTIONS_WITH_HOST_VALUE.has(token)) {
      const value = tokens[i + 1]
      if (value) {
        push(stripToken(value), undefined)
        i += 1
      }
      continue
    }

    if (OPTIONS_WITH_VALUE.has(token)) {
      // 带 `=` 的写法（--header=x）已把取值合并在同一 token，无需多跳
      if (!token.includes('=') && tokens[i + 1]) i += 1
      continue
    }

    if (token.startsWith('-')) continue

    const base = token.split('/').pop() ?? token
    if (!HOST_ARG_COMMANDS.has(base)) continue

    // 网络命令后的第一个位置参数视为主机；`nc host port` 这类分离写法再看下一个纯数字 token
    for (let j = i + 1; j < tokens.length; j += 1) {
      const candidate = stripToken(tokens[j] ?? '')
      if (!candidate) continue
      if (candidate.startsWith('-')) {
        if (!candidate.includes('=') && OPTIONS_WITH_VALUE.has(candidate)) j += 1
        continue
      }
      const parsedCandidate = parseTarget(candidate)
      const nextToken = stripToken(tokens[j + 1] ?? '')
      const separatedPort =
        parsedCandidate && parsedCandidate.port === null && /^\d+$/.test(nextToken)
          ? Number(nextToken)
          : undefined
      push(candidate, separatedPort)
      break
    }
  }

  return targets
}

async function classifyTarget(
  target: ResolvedTarget,
  platformPorts: Set<number>,
  lookupImpl: LookupImpl,
): Promise<BlockedNetworkTarget | null> {
  const host = target.host

  if (host.startsWith('option:')) {
    return reject(
      target,
      `option ${host.slice('option:'.length)} can retarget the request to a local socket or private address`,
    )
  }
  if (host.startsWith('scheme:')) {
    return reject(
      target,
      `only http(s) targets are allowed; got ${host.slice('scheme:'.length)}://`,
    )
  }
  if (METADATA_HOSTS.has(host)) {
    return reject(target, `host ${host} is a cloud metadata endpoint`)
  }
  if (host === 'localhost' || host.endsWith('.localhost')) {
    return checkLoopback(target, platformPorts)
  }

  const ipVersion = isIP(host)
  if (ipVersion) {
    const cls = ipVersion === 4 ? classifyIpv4(host) : classifyIpv6(host)
    return applyClass(target, cls, platformPorts)
  }

  const cached = readDnsCache(host)
  if (cached !== undefined) {
    return cached === null ? null : reject(target, cached)
  }

  let addresses: string[]
  try {
    const records = await withTimeout(lookupImpl(host, { all: true }), DNS_TIMEOUT_MS)
    addresses = records.map((record) => record.address)
  } catch {
    // DNS 失败/超时不阻塞：此时真实请求同样会失败
    writeDnsCache(host, null)
    return null
  }

  for (const address of addresses) {
    const version = isIP(address)
    if (!version) continue
    const cls = version === 4 ? classifyIpv4(address) : classifyIpv6(address)
    if (cls === 'public') continue
    const reason = `host ${host} resolves to ${address} (${cls} address)`
    writeDnsCache(host, reason)
    return reject(target, reason)
  }

  writeDnsCache(host, null)
  return null
}

function checkLoopback(
  target: ResolvedTarget,
  platformPorts: Set<number>,
): BlockedNetworkTarget | null {
  if (target.port === null || !platformPorts.has(target.port)) return null
  return reject(
    target,
    `loopback port ${target.port} is the platform's own service port`,
  )
}

function applyClass(
  target: ResolvedTarget,
  cls: BashAddressClass,
  platformPorts: Set<number>,
): BlockedNetworkTarget | null {
  if (cls === 'public') return null
  if (cls === 'loopback') return checkLoopback(target, platformPorts)
  if (cls === 'metadata') return reject(target, 'address is a cloud metadata endpoint')
  return reject(target, `${cls} address`)
}

function reject(target: ResolvedTarget, detail: string): BlockedNetworkTarget {
  const shown = target.port === null ? target.host : `${target.host}:${target.port}`
  return { target: shown, reason: detail }
}

function parseTarget(raw: string): ResolvedTarget | null {
  let value = raw.trim()
  if (!value) return null

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    let url: URL
    try {
      url = new URL(value)
    } catch {
      return null
    }
    const scheme = url.protocol.replace(/:$/, '').toLowerCase()
    if (scheme !== 'http' && scheme !== 'https') {
      // 非 http(s) 协议（file:// 读本地文件、gopher://、dict:// …）：Agent 联网只允许 http(s)
      return { host: `scheme:${scheme}`, port: null, raw: value }
    }
    const host = normalizeHost(url.hostname)
    if (!host) return null
    const port = url.port ? Number(url.port) : null
    return { host, port, raw: value }
  }

  value = value.replace(/^(?:\/\/)/, '')
  const atIndex = value.lastIndexOf('@')
  if (atIndex >= 0) value = value.slice(atIndex + 1)
  value = value.split(/[/?#]/)[0] ?? value
  if (!value) return null

  let host = value
  let port: number | null = null

  if (value.startsWith('[')) {
    const end = value.indexOf(']')
    if (end < 0) return null
    host = value.slice(1, end)
    const rest = value.slice(end + 1)
    if (rest.startsWith(':') && /^\d+$/.test(rest.slice(1))) port = Number(rest.slice(1))
  } else {
    const lastColon = value.lastIndexOf(':')
    if (lastColon > 0 && /^\d+$/.test(value.slice(lastColon + 1))) {
      host = value.slice(0, lastColon)
      port = Number(value.slice(lastColon + 1))
    }
  }

  host = normalizeHost(host)
  if (!host) return null
  return { host, port, raw: value }
}

function stripToken(token: string): string {
  return token.replace(/^['"`]+|['"`]+$/g, '').trim()
}

function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/, '')
}

function classifyIpv4(address: string): BashAddressClass {
  if (METADATA_IPS.has(address)) return 'metadata'
  const parts = address.split('.').map(Number)
  const [a, b] = parts
  if (a === undefined || b === undefined || parts.some((part) => !Number.isFinite(part))) return 'unspecified'

  if (a === 0) return 'unspecified'
  if (a === 127) return 'loopback'
  if (a === 169 && b === 254) return 'link-local'
  if (a === 10) return 'private'
  if (a === 172 && b >= 16 && b <= 31) return 'private'
  if (a === 192 && b === 168) return 'private'
  if (a === 100 && b >= 64 && b <= 127) return 'cgnat'
  if (a === 198 && (b === 18 || b === 19)) return 'private'
  if (a >= 224) return 'multicast'
  return 'public'
}

function classifyIpv6(address: string): BashAddressClass {
  const normalized = address.toLowerCase()
  if (normalized === '::' ) return 'unspecified'
  if (normalized === '::1') return 'loopback'
  if (normalized.startsWith('::ffff:')) return classifyIpv4(normalized.slice('::ffff:'.length))

  const first = normalized.split(':', 1)[0]
  if (!first) return 'unspecified'
  const value = Number.parseInt(first, 16)
  if (!Number.isFinite(value)) return 'unspecified'
  if ((value & 0xff00) === 0xff00) return 'multicast'
  if ((value & 0xffc0) === 0xfe80) return 'link-local'
  if ((value & 0xfe00) === 0xfc00) return 'private'
  return 'public'
}

async function defaultLookup(hostname: string, options: { all: true }): Promise<Array<{ address: string }>> {
  return dnsLookup(hostname, options)
}

function readDnsCache(host: string): string | null | undefined {
  const entry = dnsCache.get(host)
  if (!entry) return undefined
  if (entry.expiresAt < Date.now()) {
    dnsCache.delete(host)
    return undefined
  }
  return entry.reason
}

function writeDnsCache(host: string, reason: string | null): void {
  if (dnsCache.size > 500) dnsCache.clear()
  dnsCache.set(host, { reason, expiresAt: Date.now() + DNS_CACHE_TTL_MS })
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('network guard DNS lookup timed out')), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
