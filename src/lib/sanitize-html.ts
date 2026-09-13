/**
 * 富文本 HTML 白名单清洗（纯字符串实现，无 DOM 依赖，Node / 浏览器通用）。
 *
 * 用于经验资产等「内容可能来自不可信来源（LLM 自动提取 / 富文本编辑器输出）」的字段：
 * - 只保留白名单标签，其余标签整体移除（保留其文本内容）
 * - 只保留每个标签的白名单属性，`on*` 事件属性一律剥离
 * - `href` / `src` 仅允许 http(s) / mailto（拒绝 javascript: / data:）
 * - `style` 仅允许安全的排版声明（不含 url() / expression() / javascript:）
 *
 * 注意：这是防御性清洗，不是完整 HTML 解析器；渲染侧（dangerouslySetInnerHTML）
 * 之前必须再走一遍本函数（幂等），防存量脏数据。
 */

const ALLOWED_TAGS = new Set([
  'p', 'br', 'div', 'span', 'b', 'strong', 'i', 'em', 'u', 's', 'strike',
  'ol', 'ul', 'li', 'blockquote', 'code', 'pre', 'hr',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'a', 'img', 'font',
])

const ATTR_BY_TAG: Record<string, Set<string>> = {
  a: new Set(['href', 'title']),
  img: new Set(['src', 'alt', 'title']),
  div: new Set(['align']),
  p: new Set(['align']),
  blockquote: new Set(['align']),
  font: new Set(['color']),
  span: new Set(['style']),
}

const SAFE_URL_RE = /^(https?:|mailto:)/i
// 仅允许一条或多条纯排版声明；值内不允许 ; 与括号（挡 url() / expression() / javascript:）
const SAFE_STYLE_RE = /^((text-align|font-weight|font-style|text-decoration|color|background-color)\s*:\s*[^;()]*;?\s*)+$/i
const HEX_COLOR_RE = /^#[0-9a-f]{3,8}$/i
const NAMED_COLOR_RE = /^[a-z]{1,20}$/i
const ALIGN_RE = /^(left|center|right|justify)$/

export function sanitizeExperienceHtml(input: string): string {
  let html = String(input ?? '')

  // 注释整体剥离
  html = html.replace(/<!--[\s\S]*?-->/g, '')
  // 危险块整体剥离（含内部内容，避免嵌套绕过）
  html = html.replace(
    /<(script|style|iframe|object|embed|svg|math|form|link|meta|base|title)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
    '',
  )
  html = html.replace(/<\/?(script|style|iframe|object|embed|svg|math|form|link|meta|base|title)\b[^>]*>/gi, '')

  // 逐标签清洗
  html = html.replace(/<\/?[a-zA-Z][^>]*>/g, (tag) => {
    const m = tag.match(/^<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9-]*)([\s\S]*?)(\/?)\s*>$/)
    if (!m) return ''
    const closing = m[1]
    const rawName = m[2]
    const attrsRaw = m[3]
    const selfClose = m[4]
    const name = rawName.toLowerCase()
    if (closing) return ALLOWED_TAGS.has(name) ? `</${name}>` : ''
    if (!ALLOWED_TAGS.has(name)) return ''
    const attrs = sanitizeAttrs(name, attrsRaw)
    return selfClose ? `<${name}${attrs} />` : `<${name}${attrs}>`
  })

  return html
}

function sanitizeAttrs(tag: string, raw: string): string {
  const allowed = ATTR_BY_TAG[tag]
  if (!allowed) return ''
  const kept: string[] = []
  const re = /([a-zA-Z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g
  let m: RegExpExecArray | null
  while ((m = re.exec(raw))) {
    const name = m[1].toLowerCase()
    if (name.startsWith('on')) continue // 事件属性
    const value = m[2] ?? m[3] ?? m[4] ?? ''
    if (!allowed.has(name)) continue

    if (name === 'href' || name === 'src') {
      const v = value.trim()
      if (!SAFE_URL_RE.test(v)) continue
      kept.push(`${name}="${escapeAttr(v)}"`)
      continue
    }
    if (name === 'style') {
      const v = value.trim()
      if (!v || !SAFE_STYLE_RE.test(v)) continue
      kept.push(`style="${escapeAttr(v)}"`)
      continue
    }
    if (name === 'color') {
      const v = value.trim()
      if (!HEX_COLOR_RE.test(v) && !NAMED_COLOR_RE.test(v)) continue
      kept.push(`color="${escapeAttr(v)}"`)
      continue
    }
    if (name === 'align') {
      const v = value.trim().toLowerCase()
      if (!ALIGN_RE.test(v)) continue
      kept.push(`align="${v}"`)
      continue
    }
    kept.push(`${name}="${escapeAttr(value)}"`)
  }
  return kept.length > 0 ? ` ${kept.join(' ')}` : ''
}

function escapeAttr(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
}
