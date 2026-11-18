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

export const THEME_IDS = ['ink', 'pine', 'terra', 'graphite', 'wine', 'obsidian'] as const

export type ThemeId = (typeof THEME_IDS)[number]

export const DEFAULT_THEME: ThemeId = 'graphite'

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
    id: 'pine',
    nameZh: '松柏深绿',
    nameEn: 'PINE & JADE',
    swatch: { bg: '#eef2e8', surface: '#fafcf5', primary: '#1e5c3a', accent: '#b98a2e', ink: '#1e2a21' },
  },
  {
    id: 'terra',
    nameZh: '陶土暖阳',
    nameEn: 'TERRACOTTA',
    swatch: { bg: '#f6ede2', surface: '#fdf8f1', primary: '#b5502a', accent: '#8a6d1f', ink: '#33241a' },
  },
  {
    id: 'graphite',
    nameZh: '石墨琥珀',
    nameEn: 'GRAPHITE & AMBER',
    swatch: { bg: '#eceae6', surface: '#f7f6f3', primary: '#33312d', accent: '#b97a14', ink: '#232220' },
  },
  {
    id: 'wine',
    nameZh: '勃艮第酒红',
    nameEn: 'BURGUNDY',
    swatch: { bg: '#f5eee7', surface: '#fcf8f3', primary: '#7c2233', accent: '#a4762a', ink: '#33202a' },
  },
  {
    id: 'obsidian',
    nameZh: '曜石黑金',
    nameEn: 'OBSIDIAN & GOLD',
    swatch: { bg: '#f3efe6', surface: '#fbf9f3', primary: '#262019', accent: '#a37f22', ink: '#221d13' },
  },
] as const

export function isValidThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (THEME_IDS as readonly string[]).includes(value)
}

/** 非法 / 缺失的存值一律回退到默认主题（石墨琥珀）。 */
export function resolveThemeId(value: unknown): ThemeId {
  return isValidThemeId(value) ? value : DEFAULT_THEME
}
