import { networkInterfaces } from 'node:os'

export type ConnectionHintKind = 'tailscale' | 'lan' | 'local'

export interface ConnectionHint {
  kind: ConnectionHintKind
  label: string
  host: string
  url: string
  interfaceName?: string
}

export function getConnectionHints({
  protocol,
  remotePort,
  localPort,
}: {
  protocol: string
  remotePort: string
  localPort: string
}): ConnectionHint[] {
  const hints: ConnectionHint[] = []
  const seen = new Set<string>()

  for (const [interfaceName, addresses] of Object.entries(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.internal || address.family !== 'IPv4') continue

      const kind = classifyIp(address.address)
      if (!kind) continue

      const host = withPort(address.address, remotePort)
      const url = `${protocol}//${host}`
      if (seen.has(url)) continue
      seen.add(url)

      hints.push({
        kind,
        label: kind === 'tailscale' ? 'Tailscale' : '局域网',
        host,
        url,
        interfaceName,
      })
    }
  }

  const localHost = withPort('localhost', localPort)
  hints.push({
    kind: 'local',
    label: '本机预览',
    host: localHost,
    url: `${protocol}//${localHost}`,
  })

  return hints.sort((a, b) => kindWeight(a.kind) - kindWeight(b.kind))
}

function classifyIp(ip: string): Exclude<ConnectionHintKind, 'local'> | null {
  const parts = ip.split('.').map((part) => Number.parseInt(part, 10))
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return null
  }

  const [first, second] = parts
  if (first === 100 && second >= 64 && second <= 127) return 'tailscale'
  if (first === 10) return 'lan'
  if (first === 172 && second >= 16 && second <= 31) return 'lan'
  if (first === 192 && second === 168) return 'lan'
  return null
}

function withPort(hostname: string, port: string): string {
  return port ? `${hostname}:${port}` : hostname
}

function kindWeight(kind: ConnectionHintKind): number {
  switch (kind) {
    case 'tailscale':
      return 0
    case 'lan':
      return 1
    case 'local':
      return 2
  }
}
