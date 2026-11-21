import { afterEach, describe, expect, it, vi } from 'vitest'

import { deleteProviderRequest } from './provider-config-dialog'

function stubFetch(response: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response as unknown as Response))
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('deleteProviderRequest', () => {
  it('returns null when the server deletes the provider', async () => {
    stubFetch({ ok: true, status: 200, json: async () => ({ ok: true }) })

    await expect(deleteProviderRequest('provider-1')).resolves.toBeNull()
    expect(fetch).toHaveBeenCalledWith('/api/providers/provider-1', { method: 'DELETE' })
  })

  it('returns the server error when DELETE responds 4xx', async () => {
    stubFetch({ ok: false, status: 400, json: async () => ({ error: '供应商不存在' }) })

    await expect(deleteProviderRequest('provider-1')).resolves.toBe('供应商不存在')
  })

  it('falls back to the HTTP status when the error body is not JSON', async () => {
    stubFetch({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('not json')
      },
    })

    await expect(deleteProviderRequest('provider-1')).resolves.toBe('删除失败（HTTP 500）')
  })

  it('returns the network error message when fetch throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network down')),
    )

    await expect(deleteProviderRequest('provider-1')).resolves.toBe('network down')
  })
})
