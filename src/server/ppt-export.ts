import { normalizePptDeck } from '@/shared/ppt-normalize'
import { detectBulletTone, resolvePptTheme } from '@/shared/ppt-theme'
import type { ArtifactContent, PptBlock, PptColumnBlock, PptTone } from '@/shared/types'
import type { NormalizedPptSlide } from '@/shared/ppt-normalize'

type PptContent = Extract<ArtifactContent, { type: 'ppt' }>
type ResolvedPptTheme = ReturnType<typeof resolvePptTheme>

interface PptxSlideLike {
  background?: { color: string }
  addText(text: unknown, options: Record<string, unknown>): void
  addShape(shape: unknown, options: Record<string, unknown>): void
  addNotes(notes: string): void
}

interface PptxShapeTypes {
  rect: unknown
  line: unknown
}

const SLIDE_W = 10
const SLIDE_H = 5.625

/**
 * Convert structured PPT artifact JSON into an editable .pptx. Preview and export both consume
 * normalizePptDeck so legacy title/bullets slides and enhanced block slides share one contract.
 */
export async function slidesToPptxBuffer(
  content: PptContent,
  fallbackTitle: string,
): Promise<Uint8Array> {
  const PptxGenJS = (await import('pptxgenjs')).default
  const pptx = new PptxGenJS()
  const deck = normalizePptDeck(content)
  const t = resolvePptTheme(deck.theme)

  pptx.title = deck.title || fallbackTitle
  pptx.layout = 'LAYOUT_16x9'

  for (const slideContent of deck.slides) {
    const slide = pptx.addSlide() as PptxSlideLike
    const shapeTypes = pptx.ShapeType as PptxShapeTypes
    renderSlide(slide, shapeTypes, slideContent, t)
  }

  return (await pptx.write({ outputType: 'nodebuffer' })) as Uint8Array
}

function renderSlide(
  slide: PptxSlideLike,
  shapeTypes: PptxShapeTypes,
  content: NormalizedPptSlide,
  theme: ResolvedPptTheme,
) {
  const centered = content.layout === 'title' || content.layout === 'section'
  if (centered) {
    renderCenteredSlide(slide, shapeTypes, content, theme)
  } else {
    renderContentSlide(slide, shapeTypes, content, theme)
  }
  if (content.notes) slide.addNotes(content.notes)
}

function renderCenteredSlide(
  slide: PptxSlideLike,
  shapeTypes: PptxShapeTypes,
  content: NormalizedPptSlide,
  theme: ResolvedPptTheme,
) {
  slide.background = { color: theme.primary }
  if (content.title) {
    slide.addText(content.title, {
      x: 0.7,
      y: content.layout === 'title' ? 1.85 : 2.18,
      w: 8.6,
      h: 1.25,
      fontSize: content.layout === 'title' ? 38 : 32,
      bold: true,
      color: 'FFFFFF',
      fontFace: theme.fontHeading,
      align: 'center',
      valign: 'mid',
      margin: 0.05,
    })
  }
  if (content.subtitle) {
    slide.addText(content.subtitle, {
      x: 1.2,
      y: 3.08,
      w: 7.6,
      h: 0.45,
      fontSize: 15,
      color: 'E8EDF3',
      fontFace: theme.fontBody,
      align: 'center',
      margin: 0.02,
    })
  }
  renderBlocks(slide, shapeTypes, content.blocks, theme, 3.72, 5.2, true)
}

function renderContentSlide(
  slide: PptxSlideLike,
  shapeTypes: PptxShapeTypes,
  content: NormalizedPptSlide,
  theme: ResolvedPptTheme,
) {
  slide.background = { color: theme.background }
  slide.addShape(shapeTypes.rect, {
    x: 0,
    y: 0,
    w: SLIDE_W,
    h: 0.16,
    fill: { color: theme.primary },
    line: { color: theme.primary, width: 0 },
  })

  let y = 0.52
  if (content.title) {
    slide.addText(content.title, {
      x: 0.55,
      y,
      w: 8.9,
      h: 0.55,
      fontSize: 26,
      bold: true,
      color: theme.primary,
      fontFace: theme.fontHeading,
      margin: 0.02,
    })
    y += 0.62
  }
  if (content.subtitle) {
    slide.addText(content.subtitle, {
      x: 0.56,
      y,
      w: 8.7,
      h: 0.28,
      fontSize: 10,
      color: theme.textMuted,
      fontFace: theme.fontBody,
      margin: 0.01,
    })
    y += 0.32
  }
  if (content.title || content.subtitle) {
    slide.addShape(shapeTypes.line, {
      x: 0.55,
      y: y + 0.06,
      w: 8.9,
      h: 0,
      line: { color: theme.divider, width: 1 },
    })
    y += 0.28
  }

  renderBlocks(slide, shapeTypes, content.blocks, theme, y, SLIDE_H - 0.35, false)
}

function renderBlocks(
  slide: PptxSlideLike,
  shapeTypes: PptxShapeTypes,
  blocks: PptBlock[],
  theme: ResolvedPptTheme,
  startY: number,
  maxY: number,
  centered: boolean,
) {
  const metricOnly = blocks.length > 0 && blocks.every((block) => block.type === 'metric')
  if (metricOnly) {
    renderMetricGrid(
      slide,
      shapeTypes,
      blocks.filter((block): block is Extract<PptBlock, { type: 'metric' }> => block.type === 'metric'),
      theme,
      startY,
      maxY,
    )
    return
  }

  let y = startY
  for (const block of blocks) {
    if (y >= maxY) break
    y = renderBlock(slide, shapeTypes, block, theme, y, maxY, centered) + 0.1
  }
}

function renderBlock(
  slide: PptxSlideLike,
  shapeTypes: PptxShapeTypes,
  block: PptBlock,
  theme: ResolvedPptTheme,
  y: number,
  maxY: number,
  centered: boolean,
): number {
  switch (block.type) {
    case 'heading':
      slide.addText(block.text, {
        x: centered ? 1.15 : 0.7,
        y,
        w: centered ? 7.7 : 8.6,
        h: block.level === 1 ? 0.45 : 0.34,
        fontSize: block.level === 1 ? 20 : 15,
        bold: true,
        color: centered ? 'FFFFFF' : theme.primary,
        fontFace: theme.fontHeading,
        align: centered ? 'center' : 'left',
        margin: 0.02,
      })
      return y + (block.level === 1 ? 0.48 : 0.38)
    case 'paragraph': {
      const h = Math.min(0.8, Math.max(0.34, estimateTextHeight(block.text, 78, 0.22)))
      slide.addText(block.text, {
        x: centered ? 1.2 : 0.75,
        y,
        w: centered ? 7.6 : 8.5,
        h,
        fontSize: 12,
        color: centered ? 'E8EDF3' : theme.textBody,
        fontFace: theme.fontBody,
        fit: 'shrink',
        margin: 0.03,
      })
      return y + h
    }
    case 'bullets':
      return renderBullets(slide, shapeTypes, block.items, theme, y, maxY, centered, block.ordered)
    case 'metric':
      renderMetricCard(slide, shapeTypes, block, theme, 0.75, y, 4.15, 0.82)
      return y + 0.86
    case 'quote':
      return renderQuote(slide, shapeTypes, block, theme, y, centered)
    case 'timeline':
      return renderTimeline(slide, shapeTypes, block, theme, y, maxY)
    case 'columns':
      return renderColumns(slide, shapeTypes, block, theme, y, maxY)
    case 'callout':
      return renderCallout(slide, shapeTypes, block, theme, y, centered)
    case 'divider':
      slide.addShape(shapeTypes.line, {
        x: centered ? 1.4 : 0.75,
        y: y + 0.1,
        w: centered ? 7.2 : 8.5,
        h: 0,
        line: { color: centered ? 'FFFFFF' : theme.divider, transparency: centered ? 65 : 0, width: 1 },
      })
      return y + 0.22
    case 'spacer':
      return y + (block.size === 'lg' ? 0.42 : block.size === 'sm' ? 0.12 : 0.25)
  }
}

function renderBullets(
  slide: PptxSlideLike,
  shapeTypes: PptxShapeTypes,
  items: string[],
  theme: ResolvedPptTheme,
  y: number,
  maxY: number,
  centered: boolean,
  ordered?: boolean,
): number {
  const rowH = centered ? 0.28 : 0.42
  const gap = 0.08
  const x = centered ? 1.3 : 0.75
  const w = centered ? 7.4 : 8.5
  let nextY = y

  for (const [index, item] of items.slice(0, 8).entries()) {
    if (nextY + rowH > maxY) break
    const tone = detectBulletTone(item)
    const color = tone === 'positive' ? theme.accentPositive : tone === 'negative' ? theme.accentNegative : theme.primary
    const icon = ordered ? `${index + 1}.` : tone === 'positive' ? '▲' : tone === 'negative' ? '▼' : '•'
    if (!centered) {
      slide.addShape(shapeTypes.rect, {
        x,
        y: nextY,
        w,
        h: rowH,
        rectRadius: 0.08,
        fill: { color: theme.surface },
        line: { color: theme.divider, width: 0.5 },
      })
    }
    slide.addText(
      [
        { text: `${icon}  `, options: { color: centered ? 'FFFFFF' : color, bold: true } },
        { text: item, options: { color: centered ? 'E8EDF3' : theme.textBody } },
      ],
      {
        x: x + 0.12,
        y: nextY + 0.04,
        w: w - 0.24,
        h: rowH - 0.05,
        fontSize: centered ? 10 : 11.5,
        fontFace: theme.fontBody,
        fit: 'shrink',
        margin: 0.02,
        breakLine: false,
      },
    )
    nextY += rowH + gap
  }
  return nextY
}

function renderMetricGrid(
  slide: PptxSlideLike,
  shapeTypes: PptxShapeTypes,
  metrics: Array<Extract<PptBlock, { type: 'metric' }>>,
  theme: ResolvedPptTheme,
  y: number,
  maxY: number,
) {
  const cols = metrics.length <= 2 ? metrics.length : 2
  const cardW = cols === 1 ? 8.5 : 4.15
  const cardH = 0.9
  metrics.slice(0, 6).forEach((metric, index) => {
    const col = index % cols
    const row = Math.floor(index / cols)
    const cardY = y + row * (cardH + 0.18)
    if (cardY + cardH > maxY) return
    renderMetricCard(slide, shapeTypes, metric, theme, 0.75 + col * (cardW + 0.2), cardY, cardW, cardH)
  })
}

function renderMetricCard(
  slide: PptxSlideLike,
  shapeTypes: PptxShapeTypes,
  metric: Extract<PptBlock, { type: 'metric' }>,
  theme: ResolvedPptTheme,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const color = toneColor(metric.tone, theme)
  slide.addShape(shapeTypes.rect, {
    x,
    y,
    w,
    h,
    rectRadius: 0.08,
    fill: { color: theme.surface },
    line: { color: theme.divider, width: 0.5 },
  })
  slide.addText(metric.label, {
    x: x + 0.18,
    y: y + 0.13,
    w: w - 0.36,
    h: 0.18,
    fontSize: 8.5,
    bold: true,
    color: theme.textMuted,
    fontFace: theme.fontBody,
    margin: 0,
  })
  slide.addText(metric.value, {
    x: x + 0.18,
    y: y + 0.33,
    w: w - 0.36,
    h: 0.35,
    fontSize: 22,
    bold: true,
    color,
    fontFace: theme.fontHeading,
    fit: 'shrink',
    margin: 0,
  })
  if (metric.change) {
    slide.addText(metric.change, {
      x: x + 0.18,
      y: y + 0.68,
      w: w - 0.36,
      h: 0.16,
      fontSize: 8.5,
      color,
      fontFace: theme.fontBody,
      margin: 0,
    })
  }
}

function renderQuote(
  slide: PptxSlideLike,
  shapeTypes: PptxShapeTypes,
  quote: Extract<PptBlock, { type: 'quote' }>,
  theme: ResolvedPptTheme,
  y: number,
  centered: boolean,
): number {
  const x = centered ? 1.25 : 0.8
  const w = centered ? 7.5 : 8.4
  const h = 0.95
  slide.addShape(shapeTypes.rect, {
    x,
    y,
    w,
    h,
    rectRadius: 0.08,
    fill: { color: centered ? theme.primary : theme.surface, transparency: centered ? 100 : 0 },
    line: { color: centered ? 'FFFFFF' : theme.primary, width: 1.2 },
  })
  slide.addText(`“${quote.text}”`, {
    x: x + 0.22,
    y: y + 0.15,
    w: w - 0.44,
    h: quote.attribution ? 0.5 : 0.66,
    fontSize: 14,
    bold: true,
    color: centered ? 'FFFFFF' : theme.textBody,
    fontFace: theme.fontHeading,
    fit: 'shrink',
    margin: 0.02,
  })
  if (quote.attribution) {
    slide.addText(quote.attribution, {
      x: x + 0.22,
      y: y + 0.7,
      w: w - 0.44,
      h: 0.16,
      fontSize: 8.5,
      color: centered ? 'E8EDF3' : theme.textMuted,
      fontFace: theme.fontBody,
      margin: 0,
    })
  }
  return y + h
}

function renderTimeline(
  slide: PptxSlideLike,
  shapeTypes: PptxShapeTypes,
  timeline: Extract<PptBlock, { type: 'timeline' }>,
  theme: ResolvedPptTheme,
  y: number,
  maxY: number,
): number {
  const items = timeline.items.slice(0, 6)
  const rowH = 0.72
  let nextY = y
  for (const [index, item] of items.entries()) {
    if (nextY + rowH > maxY) break
    const x = index % 2 === 0 ? 0.75 : 5.08
    if (index > 0 && index % 2 === 0) nextY += rowH + 0.12
    if (nextY + rowH > maxY) break
    slide.addShape(shapeTypes.rect, {
      x,
      y: nextY,
      w: 4.05,
      h: rowH,
      rectRadius: 0.08,
      fill: { color: theme.surface },
      line: { color: theme.divider, width: 0.5 },
    })
    slide.addText(item.label, {
      x: x + 0.18,
      y: nextY + 0.1,
      w: 0.78,
      h: 0.22,
      fontSize: 8.5,
      bold: true,
      color: theme.primary,
      fontFace: theme.fontBody,
      margin: 0,
    })
    slide.addText([item.title, item.text].filter(Boolean).join('\n'), {
      x: x + 0.95,
      y: nextY + 0.1,
      w: 2.9,
      h: rowH - 0.16,
      fontSize: 9.5,
      color: theme.textBody,
      fontFace: theme.fontBody,
      fit: 'shrink',
      margin: 0.02,
    })
  }
  return nextY + rowH
}

function renderColumns(
  slide: PptxSlideLike,
  shapeTypes: PptxShapeTypes,
  columns: Extract<PptBlock, { type: 'columns' }>,
  theme: ResolvedPptTheme,
  y: number,
  maxY: number,
): number {
  const items = columns.columns.slice(0, 3)
  const gap = 0.18
  const x = 0.75
  const w = (8.5 - gap * (items.length - 1)) / Math.max(1, items.length)
  const h = Math.max(0.9, Math.min(2.6, maxY - y))
  items.forEach((column, index) => {
    const colX = x + index * (w + gap)
    slide.addShape(shapeTypes.rect, {
      x: colX,
      y,
      w,
      h,
      rectRadius: 0.08,
      fill: { color: theme.surface },
      line: { color: theme.divider, width: 0.5 },
    })
    let colY = y + 0.15
    if (column.title) {
      slide.addText(column.title, {
        x: colX + 0.15,
        y: colY,
        w: w - 0.3,
        h: 0.22,
        fontSize: 10.5,
        bold: true,
        color: theme.primary,
        fontFace: theme.fontHeading,
        margin: 0,
      })
      colY += 0.3
    }
    for (const block of (column.blocks ?? []).slice(0, 4)) {
      if (colY > y + h - 0.2) break
      colY = renderColumnBlock(slide, shapeTypes, block, theme, colX + 0.15, colY, w - 0.3, y + h - 0.12) + 0.06
    }
  })
  return y + h
}

function renderColumnBlock(
  slide: PptxSlideLike,
  shapeTypes: PptxShapeTypes,
  block: PptColumnBlock,
  theme: ResolvedPptTheme,
  x: number,
  y: number,
  w: number,
  maxY: number,
): number {
  if (block.type === 'paragraph') {
    const h = Math.min(0.48, Math.max(0.22, estimateTextHeight(block.text, 36, 0.18)))
    slide.addText(block.text, {
      x,
      y,
      w,
      h,
      fontSize: 8.5,
      color: theme.textBody,
      fontFace: theme.fontBody,
      fit: 'shrink',
      margin: 0,
    })
    return y + h
  }
  if (block.type === 'bullets') {
    let nextY = y
    for (const item of block.items.slice(0, 4)) {
      if (nextY + 0.18 > maxY) break
      slide.addText(`• ${item}`, {
        x,
        y: nextY,
        w,
        h: 0.18,
        fontSize: 7.8,
        color: theme.textBody,
        fontFace: theme.fontBody,
        fit: 'shrink',
        margin: 0,
      })
      nextY += 0.21
    }
    return nextY
  }
  if (block.type === 'metric') {
    renderMetricCard(slide, shapeTypes, block, theme, x, y, w, Math.min(0.74, maxY - y))
    return y + 0.78
  }
  return renderCalloutAt(slide, shapeTypes, block, theme, x, y, w, Math.min(0.58, maxY - y))
}

function renderCallout(
  slide: PptxSlideLike,
  shapeTypes: PptxShapeTypes,
  block: Extract<PptBlock, { type: 'callout' }>,
  theme: ResolvedPptTheme,
  y: number,
  centered: boolean,
): number {
  const x = centered ? 1.3 : 0.75
  const w = centered ? 7.4 : 8.5
  return renderCalloutAt(slide, shapeTypes, block, theme, x, y, w, centered ? 0.58 : 0.66)
}

function renderCalloutAt(
  slide: PptxSlideLike,
  shapeTypes: PptxShapeTypes,
  block: Extract<PptBlock, { type: 'callout' }> | Extract<PptColumnBlock, { type: 'callout' }>,
  theme: ResolvedPptTheme,
  x: number,
  y: number,
  w: number,
  h: number,
): number {
  const color = toneColor(block.tone, theme)
  slide.addShape(shapeTypes.rect, {
    x,
    y,
    w,
    h,
    rectRadius: 0.08,
    fill: { color: theme.surface },
    line: { color, width: 0.8 },
  })
  slide.addText([block.title, block.text].filter(Boolean).join('\n'), {
    x: x + 0.16,
    y: y + 0.1,
    w: w - 0.32,
    h: h - 0.14,
    fontSize: block.title ? 9 : 10,
    color: theme.textBody,
    fontFace: theme.fontBody,
    bold: Boolean(block.title),
    fit: 'shrink',
    margin: 0,
  })
  return y + h
}

function toneColor(tone: PptTone | undefined, theme: ResolvedPptTheme): string {
  if (tone === 'positive') return theme.accentPositive
  if (tone === 'negative' || tone === 'warning') return theme.accentNegative
  return theme.primary
}

function estimateTextHeight(text: string, charsPerLine: number, lineHeight: number): number {
  return Math.ceil(Math.max(1, text.length) / charsPerLine) * lineHeight
}
