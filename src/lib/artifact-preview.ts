import type { ArtifactContent } from '@/shared/types'

const UNSAFE_HREF_RE =
  /^(?:file:|\/\/|[a-zA-Z]:[\\\/]|\/\.agenthub-data(?:[\\\/]|$)|\/workspaces(?:[\\\/]|$)|\.agenthub-data(?:[\\\/]|$)|workspaces(?:[\\\/]|$)|javascript:|vbscript:|data:|blob:|about:)/i

export function artifactPreviewPath(artifactId: string): string {
  return `/api/artifacts/${encodeURIComponent(artifactId)}/preview`
}

export function buildWebAppHtml(
  content: Extract<ArtifactContent, { type: 'web_app' }>,
): string {
  return buildIframeHtml(content.files, content.entry)
}

export function buildIframeHtml(files: Record<string, string>, entry: string): string {
  const html = files[entry] ?? files['index.html'] ?? ''
  const css = files['style.css'] ?? files['styles.css'] ?? ''
  const js = files['script.js'] ?? files['main.js'] ?? files['app.js'] ?? ''

  const styleTag = css ? `<style>\n${css}</style>` : ''
  const scriptTag = js ? `<script>(function(){\n${js}})();<` + '/script>' : ''

  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${styleTag}\n</head>`).replace(/<\/body>/i, `${scriptTag}\n</body>`)
  }

  return [
    '<!doctype html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    styleTag,
    '</head>',
    '<body>',
    html,
    scriptTag,
    '</body>',
    '</html>',
  ].join('\n')
}

/**
 * 将 LLM 生成的 web_app HTML 改造为可安全预览的版本。
 *
 * 修复 LLM 常见的多类错误：
 * 1. 在 `<base href="...">` 里写死 workspace 路径（如 .agenthub-data/workspaces/xxx），
 *    导致相对/绝对链接被解析到文件系统路径，触发 Next.js 静态文件 fallback 的 ENOENT 500。
 * 2. 直接写 `<a href="/workspaces/xxx/file.html">`、`file://...` 或 Windows 本地路径，
 *    这类在 sandbox iframe 内无法访问、也不应访问。
 * 3. 直接写 `<a href="javascript:...">`、`data:text/html,...`、`vbscript:...`、`blob:...`
 *    等可执行协议，可绕过 iframe sandbox 在 iframe 内直接执行 JS，因此也必须拦截。
 *
 * 处理策略：
 * - 移除所有已有的 `<base>` 标签
 * - 注入正确的 `<base href="/api/artifacts/<id>/preview/">`
 * - 注入一段带 nonce 的 inline JS，拦截 `<a>` 点击：
 *   阻止跳向 workspace/agenthub-data/Windows 盘符/javascript:/data: 等 unsafe 路径。
 *   nonce 由路由侧按 strict CSP 生成，使我们可以彻底丢掉 `'unsafe-inline'`。
 * - 其余链接允许正常导航（iframe sandbox 已限制 top-navigation/popups）
 */
export interface PrepareArtifactPreviewHtmlOptions {
  /**
   * Per-request CSP nonce. The guard script tag will carry `nonce="<value>"`,
   * so it can keep running under a strict `script-src 'nonce-...' 'self'` CSP
   * that drops `'unsafe-inline'`. Recommended by `route.ts` for the artifact
   * preview endpoint.
   */
  nonce?: string
}

export function prepareArtifactPreviewHtml(
  html: string,
  artifactId: string,
  opts?: PrepareArtifactPreviewHtmlOptions,
): string {
  const baseHref = `/api/artifacts/${encodeURIComponent(artifactId)}/preview/`
  const baseTag = `<base href="${baseHref}">`
  const nonceAttr = opts?.nonce ? ` nonce="${opts.nonce}"` : ''
  const guardScript = `<script${nonceAttr}>
(function() {
  var unsafe = ${UNSAFE_HREF_RE.toString()};
  function isUnsafe(href) {
    try { return unsafe.test(href); } catch (e) { return false; }
  }
  document.addEventListener('click', function(e) {
    var a = e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || !a.href) return;
    if (isUnsafe(a.getAttribute('href') || '')) {
      e.preventDefault();
      e.stopPropagation();
      console.warn('[artifact-preview] blocked unsafe link:', a.href);
    }
  }, true);
})();
<` + '/script>'

  // 1. 去掉已有的 <base> 标签
  let sanitized = html.replace(/<base[^>]*>/gi, '')

  // 2. 在 <head> 顶部注入正确的 base 标签 + 链接守护脚本
  if (/<head[^>]*>/i.test(sanitized)) {
    sanitized = sanitized.replace(/<head[^>]*>/i, (match) => `${match}\n${baseTag}\n${guardScript}`)
  } else {
    // 没有 head 时，放到文档最前面（前面 buildIframeHtml 兜底会生成 head，这里仅做防御）
    sanitized = `<head>\n${baseTag}\n${guardScript}\n</head>\n${sanitized}`
  }

  return sanitized
}

/**
 * 检查一个 href 是否属于 artifact preview 沙箱内应被阻止的路径。
 * 仅用于测试和日志。
 */
export function isUnsafeArtifactLink(href: string): boolean {
  return UNSAFE_HREF_RE.test(href)
}
