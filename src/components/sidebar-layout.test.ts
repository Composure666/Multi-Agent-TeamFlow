import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 侧栏垂直空间分配的不变量锁。
 *
 * 这类 bug 的共同特征是**不报错**：某一块被挤成 0 高、或者被 overflow-hidden 裁掉，
 * 控制台一片干净，只有「东西不见了」。所以这里不去渲染组件（vitest 的 include 只有
 * `*.test.ts`，没有 jsx），而是直接对 `globals.css` 与 `app-workbench.tsx` 的**文本**
 * 断言 —— 锁的是「两个文件必须一起改」的契约，不是样式实现细节。
 */

const root = process.cwd()
const css = readFileSync(path.join(root, 'src/app/globals.css'), 'utf8')
const workbench = readFileSync(path.join(root, 'src/components/app-workbench.tsx'), 'utf8')

/** globals.css 里的 `@media (<kind>: Npx) { … }` 块 */
function mediaBlocks(kind: 'max-height' | 'min-height') {
  const re = new RegExp(`@media \\(${kind}: (\\d+)px\\)\\s*\\{([\\s\\S]*?)\\n\\}`, 'g')
  return [...css.matchAll(re)].map((m) => ({ px: Number(m[1]), body: m[2] }))
}

/** 根字号是 `html { font-size: 106.25% }`（16px → 17px），rem 尺寸必须按它折算。 */
const rootFontPx = 16 * Number(/html\s*\{[^}]*font-size:\s*([\d.]+)%/.exec(css)?.[1] ?? '100') / 100

function navHeightTiers() {
  const base = /\.wb-sidebar\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
  const baseRem = /--wb-nav-h:\s*([\d.]+)rem/.exec(base)?.[1]
  const tiers = mediaBlocks('max-height')
    .map((b) => ({ px: b.px, rem: /--wb-nav-h:\s*([\d.]+)rem/.exec(b.body)?.[1] }))
    .filter((t): t is { px: number; rem: string } => Boolean(t.rem))
    .sort((a, b) => b.px - a.px)
  return { baseRem: baseRem ? Number(baseRem) : null, tiers }
}

describe('工作台侧栏：垂直空间分配', () => {
  it('导航行高与行距只有一个来源（CSS 变量），组件里不再写死 h-*', () => {
    expect(/.wb-nav-item\s*\{[^}]*height:\s*var\(--wb-nav-h\)/.test(css)).toBe(true)
    expect(/.wb-nav\s*\{[^}]*row-gap:\s*var\(--wb-nav-gap\)/.test(css)).toBe(true)
    expect(workbench).toContain('wb-nav-item')
    expect(workbench).toContain('wb-nav flex shrink-0 flex-col')
    // 组件里若再出现 h-9 之类的固定行高，就会与变量打架（v4 里谁赢按生成顺序，不可控）
    expect(/wb-nav-item[^'"]*'[^'"]*h-\d/.test(workbench)).toBe(false)
  })

  it('行高按窗口高度分档，且始终落在可点击的合理区间（≥28px、≤44px）', () => {
    const { baseRem, tiers } = navHeightTiers()
    expect(baseRem).not.toBeNull()
    const all = [baseRem!, ...tiers.map((t) => Number(t.rem))].map((rem) => rem * rootFontPx)
    for (const px of all) {
      expect(px).toBeGreaterThanOrEqual(28)
      expect(px).toBeLessThanOrEqual(44)
    }
    // 窗口越矮，行高只能更矮（单调不增）—— 反了会让矮窗口反而更挤
    for (let i = 1; i < all.length; i++) expect(all[i]).toBeLessThanOrEqual(all[i - 1])
  })

  it('历史区与占位块的隐藏条件互补 —— 任一高度下恰好有一个占住弹性空间', () => {
    const hideHistory = mediaBlocks('max-height').find((b) =>
      /\.wb-history\s*\{[^}]*display:\s*none/.test(b.body),
    )
    const hideSpacer = mediaBlocks('min-height').find((b) =>
      /\.wb-spacer\s*\{[^}]*display:\s*none/.test(b.body),
    )
    expect(hideHistory, '必须存在「太矮就隐藏历史区」的规则，否则标题会被裁成半截').toBeTruthy()
    expect(
      hideSpacer,
      '历史区让位后必须由 .wb-spacer 接管弹性空间，否则底部 Workspace 会浮上来贴不到底',
    ).toBeTruthy()
    // 680 / 681 这种「差 1px」的配对是刻意的：保证两个规则永不重叠、也永不留空档
    expect(hideSpacer!.px).toBe(hideHistory!.px + 1)
  })

  it('历史区是唯一弹性区块：flex-1 + min-h-0，且不再按 view 条件渲染', () => {
    expect(/wb-history[^'"]*flex-1/.test(workbench)).toBe(true)
    expect(/wb-history[^'"]*min-h-0/.test(workbench)).toBe(true)
    // 以前是 `{!compact && view === 'conversations' && (…)}` —— 切到产物库就没有历史了
    expect(/view === 'conversations' && \(\s*<div className="[^"]*min-h-0 flex-1/.test(workbench)).toBe(false)
    expect(workbench).toContain('wb-spacer')
  })
})
