import { describe, expect, it, vi } from 'vitest'

vi.mock('node:os', () => ({
  networkInterfaces: () => ({
    en0: [{ address: '10.1.2.3', family: 'IPv4', internal: false }],
    ts0: [{ address: '100.64.1.2', family: 'IPv4', internal: false }],
    lo0: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
  }),
}))

import { getConnectionHints } from './network-hints'

describe('getConnectionHints', () => {
  it('uses companion port for remote hints and current request port for localhost', () => {
    const hints = getConnectionHints({
      protocol: 'http:',
      remotePort: '60646',
      localPort: '3000',
    })

    expect(hints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'tailscale', url: 'http://100.64.1.2:60646' }),
        expect.objectContaining({ kind: 'lan', url: 'http://10.1.2.3:60646' }),
        expect.objectContaining({ kind: 'local', url: 'http://localhost:3000' }),
      ]),
    )
  })
})
