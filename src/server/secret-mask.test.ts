import { describe, expect, it } from 'vitest'

import { looksMasked, maskSecret } from './secret-mask'

describe('maskSecret', () => {
  it('保留尾 4 位，其余打码', () => {
    expect(maskSecret('sk-1234567890abcd')).toBe('************abcd')
    expect(maskSecret('LTAI5tSomeVeryLongKeyXYZ1234')).toBe('************1234')
  })

  it('星号数量封顶 12，不泄露原始长度', () => {
    const long = 'x'.repeat(200) + 'tail'
    const masked = maskSecret(long)!
    expect(masked).toBe('************tail')
    expect(masked.length).toBeLessThan(30)
  })

  it('短值全部打码', () => {
    expect(maskSecret('abc')).toBe('****')
    expect(maskSecret('abcd')).toBe('****')
  })

  it('空值 / null / undefined 原样返回（表示「未配置」）', () => {
    expect(maskSecret('')).toBe('')
    expect(maskSecret(null)).toBeNull()
    expect(maskSecret(undefined)).toBeNull()
  })
})

describe('looksMasked —— 用来拦下「把脱敏串写回库」', () => {
  it('认得脱敏串', () => {
    expect(looksMasked('************abcd')).toBe(true)
    expect(looksMasked('****')).toBe(true)
    expect(looksMasked('****1234')).toBe(true)
  })

  it('不误伤真实密钥', () => {
    expect(looksMasked('sk-1234567890abcdef')).toBe(false)
    expect(looksMasked('LTAI5tSomeVeryLongKey')).toBe(false)
    expect(looksMasked('')).toBe(false)
  })

  it('★ 真实 key 里即使含星号也不会被误判（只会误判「以 4+ 星号开头」的）', () => {
    expect(looksMasked('sk-abcd****wxyz1234')).toBe(false)
  })
})
