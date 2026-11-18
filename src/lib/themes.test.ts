import { describe, expect, it } from 'vitest'

import {
  DEFAULT_THEME,
  THEMES,
  THEME_IDS,
  THEME_STORAGE_KEY,
  isValidThemeId,
  resolveThemeId,
} from './themes'

/**
 * 主题注册表是 CSS token 的 TS 侧单一事实来源（proposal.md B 节）：
 * id 合法、默认 graphite、非法值回退 —— 任一改动都先在这里被测试拦住。
 */
describe('themes 注册表', () => {
  it('6 个 id 全部合法且唯一', () => {
    expect(THEME_IDS).toEqual(['ink', 'pine', 'terra', 'graphite', 'wine', 'obsidian'])
    expect(new Set(THEME_IDS).size).toBe(6)
    for (const id of THEME_IDS) expect(isValidThemeId(id)).toBe(true)
  })

  it('默认主题是石墨琥珀 graphite', () => {
    expect(DEFAULT_THEME).toBe('graphite')
    expect(isValidThemeId(DEFAULT_THEME)).toBe(true)
  })

  it('存储键是 agenthub-theme', () => {
    expect(THEME_STORAGE_KEY).toBe('agenthub-theme')
  })

  it('非法值回退到 graphite', () => {
    for (const bad of ['blue', 'INK', '', ' ink', 'pine ', null, undefined, 0, {}, []]) {
      expect(isValidThemeId(bad)).toBe(false)
      expect(resolveThemeId(bad)).toBe('graphite')
    }
  })

  it('合法值原样通过', () => {
    for (const id of THEME_IDS) expect(resolveThemeId(id)).toBe(id)
  })

  it('每套主题都有中文名、英文名与 5 色卡片色（浅色版 hex）', () => {
    expect(THEMES).toHaveLength(6)
    expect(THEMES.map((t) => t.id)).toEqual([...THEME_IDS])
    for (const theme of THEMES) {
      expect(theme.nameZh.length).toBeGreaterThan(0)
      expect(theme.nameEn.length).toBeGreaterThan(0)
      for (const key of ['bg', 'surface', 'primary', 'accent', 'ink'] as const) {
        expect(theme.swatch[key]).toMatch(/^#[0-9a-f]{6}$/)
      }
    }
  })

  it('ink 卡片色与效果图浅色版一致', () => {
    const ink = THEMES.find((t) => t.id === 'ink')
    expect(ink?.swatch).toEqual({
      bg: '#f4eee0',
      surface: '#fbf8ef',
      primary: '#2c2822',
      accent: '#b03a26',
      ink: '#26221b',
    })
  })
})
