import { describe, expect, it } from 'vitest'

import {
  assertOutboundUrlAllowed,
  assertOutboundUrlAllowedSync,
  extractNetworkTargets,
  findBlockedNetworkTarget,
  findBlockedOutboundUrl,
  findBlockedOutboundUrlSync,
} from './network-guard'

const PLATFORM_PORTS = new Set([3000])

const PUBLIC_LOOKUP = async (): Promise<Array<{ address: string }>> => [{ address: '93.184.216.34' }]

function lookupReturning(...addresses: string[]) {
  return async (): Promise<Array<{ address: string }>> => addresses.map((address) => ({ address }))
}

function check(command: string, lookupImpl = PUBLIC_LOOKUP) {
  return findBlockedNetworkTarget(command, { platformPorts: PLATFORM_PORTS, lookupImpl })
}

describe('findBlockedNetworkTarget —— 2026-09-17 实测漏洞场景', () => {
  it('拦下裸 curl 触达平台自身 API（线上实测返回 200 + 37KB 真实数据的写法）', async () => {
    const blocked = await check('curl -s http://127.0.0.1:3000/api/agents')
    expect(blocked).not.toBeNull()
    expect(blocked?.target).toBe('127.0.0.1:3000')
    expect(blocked?.reason).toContain('platform')
  })

  it('拦下 localhost 与 IPv6 回环上的平台端口', async () => {
    expect(await check('curl http://localhost:3000/api/conversations')).not.toBeNull()
    expect(await check('curl http://[::1]:3000/')).not.toBeNull()
  })

  it('拦下 nc 分离写法的平台端口（host 与 port 是两个参数）', async () => {
    const blocked = await check('nc -z 127.0.0.1 3000')
    expect(blocked).not.toBeNull()
    expect(blocked?.target).toBe('127.0.0.1:3000')
  })

  it('拦下语言运行时里拼出来的平台地址', async () => {
    const command =
      'python3 -c "import urllib.request; print(urllib.request.urlopen(\'http://127.0.0.1:3000/api/agents\').status)"'
    expect(await check(command)).not.toBeNull()
  })
})

describe('findBlockedNetworkTarget —— metadata / 内网 / 协议', () => {
  it('拦下云 metadata IP 与厂商域名', async () => {
    expect(await check('curl http://169.254.169.254/latest/meta-data/')).not.toBeNull()
    expect(await check('curl http://metadata.tencentyun.com/latest/meta-data/')).not.toBeNull()
    expect(await check('wget 169.254.169.254')).not.toBeNull()
  })

  it('拦下私有网段与 CGNAT', async () => {
    expect(await check('curl http://10.0.0.5/api')).not.toBeNull()
    expect(await check('curl http://192.168.1.1/')).not.toBeNull()
    expect(await check('curl http://172.20.0.1:8080/')).not.toBeNull()
    expect(await check('curl http://100.64.1.1/')).not.toBeNull()
  })

  it('拦下把主机名强行指向内网的选项（--resolve / --connect-to / --unix-socket）', async () => {
    expect(await check('curl --resolve evil.com:443:127.0.0.1 https://evil.com/')).not.toBeNull()
    expect(await check('curl --connect-to example.com:443:127.0.0.1:443 https://example.com/')).not.toBeNull()
    expect(await check('curl --unix-socket /var/run/docker.sock http://localhost/containers/json')).not.toBeNull()
  })

  it('拦下非 http(s) 协议（file:// 读本地文件）', async () => {
    const blocked = await check('curl file:///opt/agenthub/data/agenthub.db')
    expect(blocked).not.toBeNull()
    expect(blocked?.reason).toContain('http(s)')
  })

  it('拦下解析到私网地址的公网域名（DNS 预解析）', async () => {
    const blocked = await check(
      'curl https://internal.example.com/health',
      lookupReturning('10.1.2.3'),
    )
    expect(blocked).not.toBeNull()
    expect(blocked?.reason).toContain('resolves to 10.1.2.3')
  })

  it('拦下命令名不在网络清单里、但 URL 指向内网的写法', async () => {
    expect(await check('git clone http://127.0.0.1:3000/repo.git')).not.toBeNull()
    expect(await check('npm i http://10.0.0.5/pkg.tgz')).not.toBeNull()
  })

  it('拦下指向平台端口的代理选项', async () => {
    const blocked = await check('curl -x 127.0.0.1:3000 https://example.com/')
    expect(blocked).not.toBeNull()
  })

  it('DNS 查询失败时放行，不阻塞正常工作', async () => {
    const failing = async (): Promise<Array<{ address: string }>> => {
      throw new Error('ENOTFOUND')
    }
    expect(await check('curl https://nonexistent.example/', failing)).toBeNull()
  })
})

describe('findBlockedNetworkTarget —— 不应误伤的正常用法', () => {
  it('放行公网 HTTPS 请求', async () => {
    expect(await check('curl -sS https://api.github.com/repos/foo/bar')).toBeNull()
    expect(await check('curl -sS https://pypi.org/simple/ -o /dev/null')).toBeNull()
    expect(await check('wget https://example.com/file.tar.gz')).toBeNull()
  })

  it('放行本地 dev server 自测（回环的非平台端口）', async () => {
    expect(await check('curl http://127.0.0.1:8080/health')).toBeNull()
    expect(await check('curl http://localhost:5173/')).toBeNull()
    expect(await check('curl -s http://127.0.0.1:4173/api/items -H "Accept: application/json"')).toBeNull()
  })

  it('放行不含网络目标的普通命令', async () => {
    expect(await check('pnpm install')).toBeNull()
    expect(await check('node node_modules/vitest/vitest.mjs run')).toBeNull()
    expect(await check('git commit -m "fix: http handling"')).toBeNull()
    expect(await check('python3 script.py --input data.csv')).toBeNull()
  })

  it('不把选项取值误当成主机名', async () => {
    expect(
      await check('curl https://example.com/ -H "Content-Type: application/json" -d \'{"a":1}\''),
    ).toBeNull()
    expect(await check('curl --header "Authorization: Bearer abc" https://example.com/')).toBeNull()
  })
})

describe('extractNetworkTargets', () => {
  it('同时提取完整 URL 与裸 host:port', () => {
    const targets = extractNetworkTargets('curl http://127.0.0.1:3000/a && wget example.com:8080/b')
    const shown = targets.map((target) => `${target.host}:${target.port ?? ''}`)
    expect(shown).toContain('127.0.0.1:3000')
    expect(shown).toContain('example.com:8080')
  })

  it('去掉 URL 里的凭据，只保留主机', () => {
    const targets = extractNetworkTargets('curl https://user:pass@example.com/x')
    expect(targets.some((target) => target.host === 'example.com')).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 用户可填的 apiBaseUrl / 生图 baseUrl 是**命令行之外**的出站口：
// 它们直接进 fetch / new OpenAI({ baseURL })，不经过 bash，因此绕开上面全部防护。
// 这两组测试锁住新增的 URL 级守卫。
// ─────────────────────────────────────────────────────────────────────────────

describe('findBlockedOutboundUrlSync —— 同步守卫（IP 字面量 / 别名）', () => {
  const opts = { platformPorts: PLATFORM_PORTS }

  it('拦下云 metadata：IP 与各厂别名', () => {
    expect(
      findBlockedOutboundUrlSync(
        'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
        opts,
      ),
    ).not.toBeNull()
    expect(findBlockedOutboundUrlSync('http://100.100.100.200/latest/meta-data/', opts)).not.toBeNull()
    expect(
      findBlockedOutboundUrlSync('https://metadata.tencentyun.com/latest/meta-data/', opts),
    ).not.toBeNull()
  })

  it('拦下回环上的平台端口（回环打自己拿设置）', () => {
    expect(findBlockedOutboundUrlSync('http://127.0.0.1:3000/api/settings', opts)).not.toBeNull()
    expect(findBlockedOutboundUrlSync('http://localhost:3000/api/settings', opts)).not.toBeNull()
  })

  it('拦下内网网段与 CGNAT', () => {
    expect(findBlockedOutboundUrlSync('http://10.0.0.5/v1', opts)).not.toBeNull()
    expect(findBlockedOutboundUrlSync('http://192.168.1.10/v1', opts)).not.toBeNull()
    expect(findBlockedOutboundUrlSync('http://172.16.0.1/v1', opts)).not.toBeNull()
    expect(findBlockedOutboundUrlSync('http://100.64.0.1/v1', opts)).not.toBeNull()
  })

  it('拦下非 http(s) 协议', () => {
    expect(findBlockedOutboundUrlSync('file:///etc/passwd', opts)).not.toBeNull()
  })

  it('放行正常公网端点', () => {
    expect(findBlockedOutboundUrlSync('https://api.deepseek.com/v1', opts)).toBeNull()
    expect(findBlockedOutboundUrlSync('https://api.siliconflow.cn/v1', opts)).toBeNull()
    expect(findBlockedOutboundUrlSync('https://dashscope.aliyuncs.com/compatible-mode/v1', opts)).toBeNull()
  })

  it('回环上的**非**平台端口放行（保留本地自测流程）', () => {
    expect(findBlockedOutboundUrlSync('http://127.0.0.1:8080/v1', opts)).toBeNull()
  })
})

describe('findBlockedOutboundUrl —— 异步守卫（含 DNS 预解析）', () => {
  it('域名解析到内网时拦下', async () => {
    const blocked = await findBlockedOutboundUrl('http://evil.example.com/v1', {
      platformPorts: PLATFORM_PORTS,
      lookupImpl: lookupReturning('10.1.2.3'),
    })
    expect(blocked).not.toBeNull()
    expect(blocked?.reason).toContain('10.1.2.3')
  })

  it('域名解析到公网时放行', async () => {
    expect(
      await findBlockedOutboundUrl('http://good.example.com/v1', {
        platformPorts: PLATFORM_PORTS,
        lookupImpl: PUBLIC_LOOKUP,
      }),
    ).toBeNull()
  })
})

describe('assertOutboundUrlAllowed* —— 抛错包装', () => {
  it('被拦时抛出带原因的错误', async () => {
    await expect(
      assertOutboundUrlAllowed('http://169.254.169.254/', '生图 baseUrl', {
        platformPorts: PLATFORM_PORTS,
        lookupImpl: PUBLIC_LOOKUP,
      }),
    ).rejects.toThrow(/生图 baseUrl/)
  })

  it('同步版被拦时抛错、放行时不抛', () => {
    expect(() =>
      assertOutboundUrlAllowedSync('http://127.0.0.1:3000/api/settings', 'apiBaseUrl', {
        platformPorts: PLATFORM_PORTS,
      }),
    ).toThrow(/apiBaseUrl/)
    expect(() =>
      assertOutboundUrlAllowedSync('https://api.deepseek.com/v1', 'apiBaseUrl', {
        platformPorts: PLATFORM_PORTS,
      }),
    ).not.toThrow()
  })
})
