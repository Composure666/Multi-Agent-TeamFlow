import { normaliseMermaidSource } from '@/shared/mermaid-normalize'
import { normalizeBlocks } from '@/shared/ppt-normalize'
import type { ArtifactContent, ArtifactType, DiffHunk, MermaidTheme, PptLayout, PptSlide, PptTheme } from '@/shared/types'

const MAX_DIAGRAM_SOURCE_CHARS = 50_000

/**
 * 把 LLM 或用户给的松散 content 规整成强类型 ArtifactContent;非法返回 null。
 *
 * write_artifact 工具(agent 路径)与 artifact-service.createArtifactVersion(用户面板路径)
 * 共用本函数,保证产物内容的校验/规整是单一来源。
 */
export function buildArtifactContent(type: ArtifactType, rawInput: unknown): ArtifactContent | null {
  // 模型有时把整个 content 对象 JSON.stringify 成字符串(典型 LLM 工具调用毛病),
  // 先保守解包一层:仅当字符串「看起来像被字符串化的 content 包装对象」时才解。
  const raw = unwrapStringifiedContent(rawInput)

  if (type === 'web_app') {
    // 情况 1: 标准 { files, entry }
    if (raw && typeof raw === 'object') {
      const obj = raw as Record<string, unknown>

      if (obj.files && typeof obj.files === 'object' && !Array.isArray(obj.files)) {
        const files = obj.files as Record<string, unknown>
        const normalised: Record<string, string> = {}
        for (const [k, v] of Object.entries(files)) {
          if (typeof v === 'string') normalised[k] = v
        }
        if (Object.keys(normalised).length === 0) return null
        return {
          type: 'web_app',
          files: normalised,
          entry: typeof obj.entry === 'string' ? obj.entry : 'index.html',
        }
      }

      // 情况 2: 扁平 { html, css, js }
      if (
        typeof obj.html === 'string' ||
        typeof obj.css === 'string' ||
        typeof obj.js === 'string'
      ) {
        const files: Record<string, string> = {}
        if (typeof obj.html === 'string') files['index.html'] = obj.html
        if (typeof obj.css === 'string') files['style.css'] = obj.css
        if (typeof obj.js === 'string') files['script.js'] = obj.js
        return { type: 'web_app', files, entry: 'index.html' }
      }

      // 情况 3: { content: '<html>...</html>' } 或 { code: '...' }
      if (typeof obj.content === 'string') {
        return {
          type: 'web_app',
          files: { 'index.html': obj.content },
          entry: 'index.html',
        }
      }
      if (typeof obj.code === 'string') {
        return {
          type: 'web_app',
          files: { 'index.html': obj.code },
          entry: 'index.html',
        }
      }
    }

    // 情况 4: 直接传 HTML 字符串
    if (typeof raw === 'string') {
      return { type: 'web_app', files: { 'index.html': raw }, entry: 'index.html' }
    }

    return null
  }

  if (type === 'document') {
    if (raw && typeof raw === 'object') {
      const obj = raw as Record<string, unknown>
      if (typeof obj.content === 'string') {
        return { type: 'document', format: 'markdown', content: obj.content }
      }
      if (typeof obj.markdown === 'string') {
        return { type: 'document', format: 'markdown', content: obj.markdown }
      }
      if (typeof obj.text === 'string') {
        return { type: 'document', format: 'markdown', content: obj.text }
      }
    }
    if (typeof raw === 'string') {
      return { type: 'document', format: 'markdown', content: raw }
    }
    return null
  }

  if (type === 'diagram') {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const obj = raw as Record<string, unknown>
      const syntax = readString(obj.syntax) ?? readString(obj.format) ?? 'mermaid'
      if (syntax.toLowerCase() !== 'mermaid') return null
      const source =
        readString(obj.source) ??
        readString(obj.mermaid) ??
        readString(obj.code) ??
        readString(obj.content)
      if (!source) return null
      const normalised = normaliseDiagramSourceForContent(source)
      if (!normalised) return null
      const theme = normaliseMermaidTheme(obj.theme)
      return {
        type: 'diagram',
        syntax: 'mermaid',
        source: normalised,
        ...(theme ? { theme } : {}),
      }
    }
    if (typeof raw === 'string') {
      const source = normaliseDiagramSourceForContent(raw)
      if (!source) return null
      return { type: 'diagram', syntax: 'mermaid', source }
    }
    return null
  }

  if (type === 'image') {
    if (raw && typeof raw === 'object') {
      const obj = raw as Record<string, unknown>
      if (typeof obj.url === 'string') {
        return {
          type: 'image',
          url: obj.url,
          alt: typeof obj.alt === 'string' ? obj.alt : '',
        }
      }
    }
    if (typeof raw === 'string') {
      return { type: 'image', url: raw, alt: '' }
    }
    return null
  }

  if (type === 'diff') {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
    const obj = raw as Record<string, unknown>
    const targetArtifactId = readString(obj.targetArtifactId) ?? readString(obj.targetId)
    if (!targetArtifactId) return null

    const hunks = Array.isArray(obj.hunks)
      ? normaliseHunks(obj.hunks)
      : parseUnifiedDiff(readString(obj.diff) ?? readString(obj.patch))

    if (hunks.length === 0) return null
    return {
      type: 'diff',
      targetArtifactId,
      hunks,
      applied: typeof obj.applied === 'boolean' ? obj.applied : false,
    }
  }

  if (type === 'code_file') {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
    const obj = raw as Record<string, unknown>
    const workspacePath = readString(obj.workspacePath) ?? readString(obj.path)
    if (!workspacePath) return null
    return {
      type: 'code_file',
      workspacePath,
      language: readString(obj.language) ?? guessLanguage(workspacePath),
      sizeBytes: readNonNegativeNumber(obj.sizeBytes) ?? 0,
      checksum: readString(obj.checksum) ?? '',
    }
  }

  if (type === 'ppt') {
    const obj =
      raw && typeof raw === 'object' && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : null
    if (containsUnboundedBinaryPayload(raw)) return null
    const rawSlides = Array.isArray(raw)
      ? raw
      : Array.isArray(obj?.slides)
        ? (obj!.slides as unknown[])
        : null
    if (!rawSlides) return null

    const slides: PptSlide[] = []
    for (const item of rawSlides) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue
      const s = item as Record<string, unknown>
      const title = readString(s.title) ?? undefined
      const subtitle = readString(s.subtitle) ?? undefined
      let bullets: string[] | undefined
      if (Array.isArray(s.bullets)) {
        bullets = s.bullets.filter((b): b is string => typeof b === 'string')
      } else if (typeof s.bullets === 'string') {
        bullets = s.bullets.split('\n').map((x) => x.trim()).filter(Boolean)
      } else if (Array.isArray(s.points)) {
        bullets = s.points.filter((b): b is string => typeof b === 'string')
      }
      const blocks = normalizeBlocks(s.blocks)
      const notes = readString(s.notes) ?? undefined
      const layout = normalisePptLayout(s.layout)
      if (
        !title &&
        !subtitle &&
        (!bullets || bullets.length === 0) &&
        blocks.length === 0 &&
        layout !== 'blank'
      ) continue
      slides.push({
        ...(title ? { title } : {}),
        ...(subtitle ? { subtitle } : {}),
        ...(bullets && bullets.length > 0 ? { bullets } : {}),
        ...(blocks.length > 0 ? { blocks } : {}),
        ...(notes ? { notes } : {}),
        ...(layout ? { layout } : {}),
      })
    }
    if (slides.length === 0) return null

    const deckTitle = obj ? (readString(obj.title) ?? undefined) : undefined
    const theme = obj ? normalisePptTheme(obj.theme) : undefined
    return {
      type: 'ppt',
      ...(deckTitle ? { title: deckTitle } : {}),
      ...(theme ? { theme } : {}),
      slides,
    }
  }

  return null
}

export function describeArtifactContentError(type: ArtifactType, rawInput: unknown): string | null {
  if (type !== 'diagram') return null
  const raw = unwrapStringifiedContent(rawInput)
  const source =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? readString((raw as Record<string, unknown>).source) ??
        readString((raw as Record<string, unknown>).mermaid) ??
        readString((raw as Record<string, unknown>).code) ??
        readString((raw as Record<string, unknown>).content)
      : typeof raw === 'string'
        ? raw
        : null
  if (!source) return 'Invalid diagram content: missing Mermaid source.'
  if (source.trim().length > MAX_DIAGRAM_SOURCE_CHARS) {
    return `Invalid diagram content: Mermaid source exceeds ${MAX_DIAGRAM_SOURCE_CHARS} characters.`
  }
  const result = normaliseMermaidSource(source)
  if (!result.ok) return `Invalid Mermaid diagram: ${result.error}`
  return null
}

function normaliseDiagramSourceForContent(source: string): string | null {
  if (source.trim().length > MAX_DIAGRAM_SOURCE_CHARS) return null
  const result = normaliseMermaidSource(source)
  return result.ok ? result.source : null
}

const CONTENT_WRAPPER_KEYS = [
  'format',
  'content',
  'markdown',
  'text',
  'files',
  'entry',
  'html',
  'css',
  'js',
  'code',
  'url',
  'source',
  'mermaid',
  'targetArtifactId',
  'targetId',
  'hunks',
  'diff',
  'patch',
  'workspacePath',
  'path',
  'language',
  'sizeBytes',
  'checksum',
  'slides',
  'blocks',
  'subtitle',
]

/**
 * 若 raw 是「被整个字符串化的 content 包装对象」,解开一层返回该对象;否则原样返回。
 *
 * - 合法 JSON 包装:直接 JSON.parse 解开(常见情形)。
 * - 非法 JSON 但带包装签名(模型转义不干净:`\|` / 未转义引号 / 尾部杂字符):
 *   修非法转义 + 花括号配平截取首个对象后再解析,尽量在写入时救回。
 *
 * 保守门槛:必须 trim 后以 `{` 开头、且解析结果是「含已知 content 键的对象」才采用;
 * 否则原样返回——真 HTML(`<` 开头)、真 markdown(非 `{` 开头)、普通字符串均不受影响。
 */
function unwrapStringifiedContent(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw
  const trimmed = raw.trim()
  if (!trimmed.startsWith('{')) return raw

  // 1) 合法 JSON 包装 → 直接解开
  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (isWrapperObject(parsed)) return parsed
  } catch {
    // 落到容错分支
  }

  // 2) 非法 JSON 但带包装签名 → 容错救回(修转义 + 配平截取)
  if (hasWrapperSignature(trimmed)) {
    const candidate =
      firstBalancedObject(fixInvalidJsonEscapes(trimmed)) ?? firstBalancedObject(trimmed)
    if (candidate) {
      try {
        const parsed: unknown = JSON.parse(candidate)
        if (isWrapperObject(parsed)) return parsed
      } catch {
        // 放弃,原样返回(落回字面兜底)
      }
    }
  }
  return raw
}

function isWrapperObject(v: unknown): v is Record<string, unknown> {
  return (
    v !== null &&
    typeof v === 'object' &&
    !Array.isArray(v) &&
    CONTENT_WRAPPER_KEYS.some((k) => k in (v as Record<string, unknown>))
  )
}

/** content 串里出现包装字段名 —— 用于决定是否值得做容错解析(避免误伤正常内容)。 */
function hasWrapperSignature(s: string): boolean {
  return /"(?:format|content|markdown|text|files|entry|html|source|mermaid|targetArtifactId|targetId|hunks|diff|patch|workspacePath|path|slides|blocks|subtitle)"\s*:/.test(s)
}

/** 把非法 JSON 转义 `\X`(X ∉ `"\/bfnrtu`)改成合法的 `\\X`,修掉模型常见的 `\|` 等。 */
function fixInvalidJsonEscapes(s: string): string {
  return s.replace(/\\(.)/g, (full, ch: string) => (/["\\/bfnrtu]/.test(ch) ? full : '\\\\' + ch))
}

/** 取首个花括号配平的 `{...}`(正确处理字符串字面与转义),丢弃尾部杂字符。 */
function firstBalancedObject(s: string): string | null {
  const start = s.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < s.length; i++) {
    const ch = s[i]
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
    } else if (ch === '"') {
      inStr = true
    } else if (ch === '{') {
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0) return s.slice(start, i + 1)
    }
  }
  return null
}

function normaliseHunks(rawHunks: unknown[]): DiffHunk[] {
  const out: DiffHunk[] = []
  for (const raw of rawHunks) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const obj = raw as Record<string, unknown>
    const lines = Array.isArray(obj.lines)
      ? obj.lines
          .filter((line): line is string => typeof line === 'string')
          .filter((line) => !isUnifiedDiffMetadataLine(line))
      : []
    if (lines.length === 0) continue
    out.push({
      oldStart: readPositiveNumber(obj.oldStart) ?? 1,
      oldLines: readNonNegativeNumber(obj.oldLines) ?? countHunkLines(lines, '+'),
      newStart: readPositiveNumber(obj.newStart) ?? 1,
      newLines: readNonNegativeNumber(obj.newLines) ?? countHunkLines(lines, '-'),
      lines,
    })
  }
  return out
}

function parseUnifiedDiff(rawDiff: string | null): DiffHunk[] {
  if (!rawDiff) return []
  const hunks: DiffHunk[] = []
  let current: DiffHunk | null = null

  for (const line of rawDiff.replace(/\r\n/g, '\n').split('\n')) {
    const header = line.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/)
    if (header) {
      current = {
        oldStart: Number(header[1]),
        oldLines: header[2] ? Number(header[2]) : 1,
        newStart: Number(header[3]),
        newLines: header[4] ? Number(header[4]) : 1,
        lines: [],
      }
      hunks.push(current)
      continue
    }
    if (!current) continue
    if (line.startsWith('\\ No newline') || isUnifiedDiffMetadataLine(line)) continue
    if (line.startsWith('+') || line.startsWith('-') || line.startsWith(' ')) {
      current.lines.push(line)
    }
  }

  return hunks.filter((h) => h.lines.length > 0)
}

function countHunkLines(lines: string[], excludedPrefix: '+' | '-'): number {
  return lines.filter((line) => !line.startsWith(excludedPrefix)).length
}

function isUnifiedDiffMetadataLine(line: string): boolean {
  return /^@@\s+-\d+(?:,\d+)?\s+\+\d+(?:,\d+)?\s+@@/.test(line)
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function readNonNegativeNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null
}

function readPositiveNumber(value: unknown): number | null {
  const n = readNonNegativeNumber(value)
  return n && n > 0 ? n : null
}

function guessLanguage(workspacePath: string): string {
  const ext = workspacePath.split('.').pop()?.toLowerCase() ?? ''
  const aliases: Record<string, string> = {
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    md: 'markdown',
    markdown: 'markdown',
    html: 'html',
    css: 'css',
    json: 'json',
    yml: 'yaml',
    yaml: 'yaml',
  }
  return aliases[ext] ?? (ext || 'text')
}

function normalisePptLayout(value: unknown): PptLayout | null {
  const v = readString(value)
  return v === 'title' ||
    v === 'title-bullets' ||
    v === 'section' ||
    v === 'blank' ||
    v === 'content' ||
    v === 'two-column' ||
    v === 'metrics' ||
    v === 'timeline' ||
    v === 'quote'
    ? v
    : null
}

function normalisePptTheme(value: unknown): PptTheme | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const obj = value as Record<string, unknown>
  const hexColor = (v: unknown) => readString(v)?.replace(/^#/, '') ?? undefined
  const theme: PptTheme = {}
  const primary = hexColor(obj.primary) ?? hexColor(obj.primaryColor) ?? hexColor(obj.color)
  if (primary) theme.primary = primary
  const background = hexColor(obj.background) ?? hexColor(obj.bg)
  if (background) theme.background = background
  const surface = hexColor(obj.surface) ?? hexColor(obj.card)
  if (surface) theme.surface = surface
  const textBody = hexColor(obj.textBody) ?? hexColor(obj.text) ?? hexColor(obj.bodyColor)
  if (textBody) theme.textBody = textBody
  const textMuted = hexColor(obj.textMuted) ?? hexColor(obj.muted)
  if (textMuted) theme.textMuted = textMuted
  const accentPositive = hexColor(obj.accentPositive) ?? hexColor(obj.positive) ?? hexColor(obj.success)
  if (accentPositive) theme.accentPositive = accentPositive
  const accentNegative =
    hexColor(obj.accentNegative) ?? hexColor(obj.negative) ?? hexColor(obj.danger) ?? hexColor(obj.warning)
  if (accentNegative) theme.accentNegative = accentNegative
  const divider = hexColor(obj.divider) ?? hexColor(obj.border)
  if (divider) theme.divider = divider
  const fontHeading =
    readString(obj.fontHeading) ?? readString(obj.headingFont) ?? readString(obj.fontFace) ?? readString(obj.font)
  if (fontHeading) theme.fontHeading = fontHeading
  const fontBody = readString(obj.fontBody) ?? readString(obj.bodyFont) ?? readString(obj.font)
  if (fontBody) theme.fontBody = fontBody
  return Object.keys(theme).length > 0 ? theme : undefined
}

function normaliseMermaidTheme(value: unknown): MermaidTheme | undefined {
  const theme = readString(value)
  return theme === 'default' ||
    theme === 'base' ||
    theme === 'dark' ||
    theme === 'forest' ||
    theme === 'neutral'
    ? theme
    : undefined
}

function containsUnboundedBinaryPayload(value: unknown): boolean {
  if (typeof value === 'string') {
    return /^data:[^,]+;base64,/i.test(value.trim())
  }
  if (!value || typeof value !== 'object') return false
  if (Array.isArray(value)) return value.some(containsUnboundedBinaryPayload)
  return Object.values(value as Record<string, unknown>).some(containsUnboundedBinaryPayload)
}
