import { describe, expect, it } from 'vitest'

import {
  ARTIFACT_PREVIEW_FALLBACK_MIME,
  ARTIFACT_PREVIEW_MIME_BY_EXT,
  contentTypeFor,
} from './artifact-preview-mime'

describe('contentTypeFor', () => {
  it('returns text/html for html files', () => {
    expect(contentTypeFor('index.html')).toBe('text/html; charset=utf-8')
  })

  it('returns application/javascript for js / mjs / cjs', () => {
    expect(contentTypeFor('app.js')).toBe('application/javascript; charset=utf-8')
    expect(contentTypeFor('module.mjs')).toBe('application/javascript; charset=utf-8')
    expect(contentTypeFor('legacy.cjs')).toBe('application/javascript; charset=utf-8')
  })

  it('returns font/* for woff / woff2 / ttf / otf', () => {
    expect(contentTypeFor('font.woff')).toBe('font/woff')
    expect(contentTypeFor('font.woff2')).toBe('font/woff2')
    expect(contentTypeFor('font.ttf')).toBe('font/ttf')
    expect(contentTypeFor('font.otf')).toBe('font/otf')
  })

  it('returns application/wasm for wasm and application/manifest+json for webmanifest', () => {
    expect(contentTypeFor('module.wasm')).toBe('application/wasm')
    expect(contentTypeFor('manifest.webmanifest')).toBe('application/manifest+json')
  })

  it('returns application/json for map (source map) and json', () => {
    expect(contentTypeFor('app.js.map')).toBe('application/json; charset=utf-8')
    expect(contentTypeFor('data.json')).toBe('application/json; charset=utf-8')
  })

  it('is case-insensitive on extension', () => {
    expect(contentTypeFor('IMG.PNG')).toBe('image/png')
    expect(contentTypeFor('Photo.JPG')).toBe('image/jpeg')
    expect(contentTypeFor('FONT.WOFF2')).toBe('font/woff2')
  })

  it('strips query string and hash fragment before resolving extension', () => {
    expect(contentTypeFor('app.js?v=123')).toBe('application/javascript; charset=utf-8')
    expect(contentTypeFor('image.png#anchor')).toBe('image/png')
  })

  it('uses the extension AFTER the last separator (not intermediate dots)', () => {
    // dot before last separator => no extension recognised => fallback
    expect(contentTypeFor('subdir/file_with_no_ext')).toBe(ARTIFACT_PREVIEW_FALLBACK_MIME)
    // dot inside filename WITHOUT separator: we still take the last dot
    expect(contentTypeFor('index.html.bak')).toBe(ARTIFACT_PREVIEW_FALLBACK_MIME) // `bak` not in table
  })

  it('uses fallback for unknown extensions', () => {
    expect(contentTypeFor('archive.zip')).toBe(ARTIFACT_PREVIEW_FALLBACK_MIME)
    expect(contentTypeFor('weird.xyz')).toBe(ARTIFACT_PREVIEW_FALLBACK_MIME)
    expect(ARTIFACT_PREVIEW_FALLBACK_MIME).toBe('application/octet-stream')
  })

  it('handles empty / extensionless inputs by falling back', () => {
    expect(contentTypeFor('')).toBe(ARTIFACT_PREVIEW_FALLBACK_MIME)
    expect(contentTypeFor('README')).toBe(ARTIFACT_PREVIEW_FALLBACK_MIME)
  })

  it('treats MIME table as frozen (read-only contract)', () => {
    // Mutating the table should be a TypeScript error; runtime-wise we still
    // expect Object.freeze to make assignment a no-op in strict mode.
    expect(Object.isFrozen(ARTIFACT_PREVIEW_MIME_BY_EXT)).toBe(true)
  })
})
