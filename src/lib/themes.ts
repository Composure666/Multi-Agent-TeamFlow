/**
 * 主题注册表（theme-switcher，2026-11-18）—— CSS 与 TS 互相核对的单一事实来源。
 *
 * 6 套主题 × 浅/深：CSS token 值见 `src/app/globals.css`（proposal.md A 节逐字抄录）；
 * 这里只登记切换器 UI 需要的元数据：id、中文名、英文名、5 色卡片色（浅色版）。
 * 5 色卡片色 = 效果图 THEMES 数组的 bg / surface / primary / accent / ink（浅色版），
 * 与 globals.css 各主题浅色块的对应 token 值一致。
 *
 * 对比度调整（只动 Ink/muted 一侧，见 openspec/changes/theme-switcher/PROGRESS.md）不影响
 * 本文件：卡片 5 色只用 bg / surface / primary / accent / ink，muted / primaryInk /
 * accentInk 不在卡片里。
 */

export const THEME_IDS = ['ink', 'terra', 'wine', 'white-graphite', 'white-blue', 'white-ink'] as const

export type ThemeId = (typeof THEME_IDS)[number]

export const DEFAULT_THEME: ThemeId = 'white-graphite'

export const THEME_STORAGE_KEY = 'agenthub-theme'

export interface ThemeSwatch {
  /** 页面背景 */
  bg: string
  /** 卡片 / 表面 */
  surface: string
  /** 主色 */
  primary: string
  /** 点缀色 */
  accent: string
  /** 主文字色 */
  ink: string
}

export interface ThemeMeta {
  id: ThemeId
  nameZh: string
  nameEn: string
  swatch: ThemeSwatch
}

export const THEMES: readonly ThemeMeta[] = [
  {
    id: 'ink',
    nameZh: '水墨宣纸',
    nameEn: 'INK & RICE PAPER',
    swatch: { bg: '#f4eee0', surface: '#fbf8ef', primary: '#2c2822', accent: '#b03a26', ink: '#26221b' },
  },
  {
    id: 'terra',
    nameZh: '陶土暖阳',
    nameEn: 'TERRACOTTA',
    swatch: { bg: '#f6ede2', surface: '#fdf8f1', primary: '#b5502a', accent: '#8a6d1f', ink: '#33241a' },
  },
  {
    id: 'wine',
    nameZh: '勃艮第酒红',
    nameEn: 'BURGUNDY',
    swatch: { bg: '#f5eee7', surface: '#fcf8f3', primary: '#7c2233', accent: '#a4762a', ink: '#33202a' },
  },
  {
    id: 'white-graphite',
    nameZh: '白·石墨',
    nameEn: 'WHITE GRAPHITE',
    swatch: { bg: '#ffffff', surface: '#fafafa', primary: '#33312d', accent: '#b97a14', ink: '#232220' },
  },
  {
    id: 'white-blue',
    nameZh: '白·工程蓝',
    nameEn: 'WHITE BLUE',
    swatch: { bg: '#ffffff', surface: '#f7f9fd', primary: '#2f5fd0', accent: '#a37f22', ink: '#17181c' },
  },
  {
    id: 'white-ink',
    nameZh: '白·水墨',
    nameEn: 'WHITE INK',
    swatch: { bg: '#ffffff', surface: '#fbfaf7', primary: '#2c2822', accent: '#b03a26', ink: '#26221b' },
  },
] as const

export function isValidThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (THEME_IDS as readonly string[]).includes(value)
}

/** 非法 / 缺失的存值一律回退到默认主题（白·石墨）。 */
export function resolveThemeId(value: unknown): ThemeId {
  return isValidThemeId(value) ? value : DEFAULT_THEME
}
