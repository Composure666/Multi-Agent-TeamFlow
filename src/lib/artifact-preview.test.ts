import { describe, expect, it } from 'vitest'

import { isUnsafeArtifactLink, prepareArtifactPreviewHtml } from './artifact-preview'

describe('artifact preview helpers', () => {
  describe('isUnsafeArtifactLink', () => {
    it('blocks file:// URLs', () => {
      expect(isUnsafeArtifactLink('file:///etc/passwd')).toBe(true)
      expect(isUnsafeArtifactLink('FILE://C:/Windows/system.ini')).toBe(true)
    })

    it('blocks protocol-relative URLs', () => {
      expect(isUnsafeArtifactLink('//evil.example.com/x.html')).toBe(true)
    })

    it('blocks Windows drive paths', () => {
      expect(isUnsafeArtifactLink('C:\\Users\\he\\Desktop\\index.html')).toBe(true)
      expect(isUnsafeArtifactLink('D:/temp/a.html')).toBe(true)
    })

    it('blocks URLs that resolve into the .agenthub-data workspace directory', () => {
      expect(isUnsafeArtifactLink('/.agenthub-data/workspaces/conv_xxx/file.html')).toBe(true)
      expect(isUnsafeArtifactLink('.agenthub-data/workspaces/conv_xxx/index.html')).toBe(true)
      // Subdirectories of workspaces/ also matched
      expect(isUnsafeArtifactLink('/workspaces/conv_xxx/xiaomi-su7-ppt.html')).toBe(true)
      expect(isUnsafeArtifactLink('workspaces/conv_xxx/index.html')).toBe(true)
    })

    it('allows relative and absolute non-workspace paths to be navigated', () => {
      // Normal http(s) URL — never blocked, must always navigate freely.
      expect(isUnsafeArtifactLink('https://example.com/about')).toBe(false)
      expect(isUnsafeArtifactLink('http://example.com/about')).toBe(false)
      // Relative paths into the artifact itself should be safe (they will be
      // resolved by the <base href> we set and hit the catch-all preview route).
      expect(isUnsafeArtifactLink('page2.html')).toBe(false)
      expect(isUnsafeArtifactLink('/page2.html')).toBe(false)
      // Hash / query fragments alone never navigate anywhere.
      expect(isUnsafeArtifactLink('#section-2')).toBe(false)
      expect(isUnsafeArtifactLink('?foo=bar')).toBe(false)
    })
  })

  describe('prepareArtifactPreviewHtml', () => {
    const ARTIFACT_ID = 'art_abc123'

    it('replaces any existing <base> tag with the preview route base', () => {
      const input = [
        '<!doctype html>',
        '<html>',
        '<head>',
        '<base href=".agenthub-data/workspaces/conv_xyz/">',
        '<meta charset="utf-8">',
        '</head>',
        '<body><a href="nested/page.html">link</a></body>',
        '</html>',
      ].join('\n')

      const out = prepareArtifactPreviewHtml(input, ARTIFACT_ID)
      expect(out).not.toContain('.agenthub-data/workspaces/conv_xyz')
      expect(out).toMatch(
        new RegExp(`<base href="/api/artifacts/${ARTIFACT_ID}/preview/">`),
      )
    })

    it('injects the base tag inside <head> when none is present', () => {
      const input = [
        '<!doctype html>',
        '<html>',
        '<head>',
        '<meta charset="utf-8">',
        '</head>',
        '<body><p>hi</p></body>',
        '</html>',
      ].join('\n')

      const out = prepareArtifactPreviewHtml(input, ARTIFACT_ID)
      expect(out).toContain(`<base href="/api/artifacts/${ARTIFACT_ID}/preview/">`)
      // base tag should come before any <meta> within <head>
      const baseIdx = out.indexOf('<base href')
      const metaIdx = out.indexOf('<meta charset')
      expect(baseIdx).toBeGreaterThan(-1)
      expect(metaIdx).toBeGreaterThan(baseIdx)
    })

    it('encodes artifact id so it can be safely embedded in the base href', () => {
      // contains characters that would otherwise be unsafe in href attributes
      const weirdId = 'art/with space&symbols?'
      const input = '<html><head></head><body></body></html>'
      const out = prepareArtifactPreviewHtml(input, weirdId)
      expect(out).toContain(
        '<base href="/api/artifacts/art%2Fwith%20space%26symbols%3F/preview/">',
      )
    })

    it('always appends a click-guard script that blocks unsafe <a> clicks', () => {
      const input = '<html><head></head><body></body></html>'
      const out = prepareArtifactPreviewHtml(input, ARTIFACT_ID)
      // The guard script listens on document for <a> clicks and blocks any
      // href matching the unsafe regex. We just check the structural pieces.
      expect(out).toMatch(/<script>[\s\S]*?<\/script>/)
      expect(out).toContain('document.addEventListener')
      expect(out).toContain("'a[href]'")
      // It must use the same regex we expose via isUnsafeArtifactLink so the
      // behaviour stays in sync between runtime and tests. We string-search
      // for one of the regex's concrete literals — when .toString()'d it
      // shows up unescaped inside the inline script.
      expect(out).toContain('.agenthub-data')
    })

    it('produces a fragment the iframe can consume even when the input has no <head>', () => {
      const input = '<div>oops, no doctype</div>'
      const out = prepareArtifactPreviewHtml(input, ARTIFACT_ID)
      expect(out).toContain('<head>')
      expect(out).toContain(`<base href="/api/artifacts/${ARTIFACT_ID}/preview/">`)
    })

    it('attaches nonce="..." to the inline guard script when opts.nonce is provided', () => {
      const input = '<html><head></head><body></body></html>'
      const out = prepareArtifactPreviewHtml(input, ARTIFACT_ID, { nonce: 'abc123' })
      // guard script tag gets the nonce so it can keep running under a strict CSP
      expect(out).toMatch(/<script nonce="abc123">/)
      // no fallback inline <script> without nonce should be left over
      expect(out).not.toMatch(/<script>(?![\s\S]*nonce=)/)
    })

    it('omits nonce attribute when opts.nonce is not provided (backwards compat)', () => {
      const input = '<html><head></head><body></body></html>'
      const out = prepareArtifactPreviewHtml(input, ARTIFACT_ID)
      // legacy caller without nonce keeps the original behaviour
      expect(out).toMatch(/<script>/)
      expect(out).not.toContain('nonce=')
    })
  })

  describe('isUnsafeArtifactLink — extended hostile protocols (P0 high #2)', () => {
    it('blocks javascript: URLs (would execute inside sandboxed iframe)', () => {
      expect(isUnsafeArtifactLink('javascript:alert(1)')).toBe(true)
      expect(isUnsafeArtifactLink('JavaScript:fetch("/api/x")')).toBe(true)
    })

    it('blocks data: URLs (LLM pivot into an executed HTML context)', () => {
      expect(isUnsafeArtifactLink('data:text/html,<script>alert(1)</script>')).toBe(true)
      expect(isUnsafeArtifactLink('data:application/xhtml+xml,<svg/>')).toBe(true)
    })

    it('blocks blob: URLs (can resolve to execute HTML/JS)', () => {
      expect(isUnsafeArtifactLink('blob:https://x/abc-def')).toBe(true)
    })

    it('blocks vbscript: and about: URLs (legacy / internal-scheme abuse)', () => {
      expect(isUnsafeArtifactLink('vbscript:msgbox(1)')).toBe(true)
      expect(isUnsafeArtifactLink('about:blank')).toBe(true)
    })

    it('still permits benign https / relative / hash / query hrefs', () => {
      expect(isUnsafeArtifactLink('https://example.com/about')).toBe(false)
      expect(isUnsafeArtifactLink('mailto:hi@example.com')).toBe(false)
      expect(isUnsafeArtifactLink('tel:1234567')).toBe(false)
      expect(isUnsafeArtifactLink('page2.html')).toBe(false)
      expect(isUnsafeArtifactLink('#section-2')).toBe(false)
    })
  })
})
