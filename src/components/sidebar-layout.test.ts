import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 侧栏结构与垂直空间分配的不变量锁。
 *
 * 这类 bug 的共同特征是**不报错**：某一块被挤成 0 高、或者被 overflow-hidden 裁掉，
 * 控制台一片干净，只有「东西不见了」。所以这里不去渲染组件（vitest 的 include 只有
 * `*.test.ts`，没有 jsx），而是直接对 `globals.css` 与 `app-workbench.tsx` 的**文本**
 * 断言 —— 锁的是「两个文件必须一起改」的契约，不是样式实现细节。
 *
 * 2026-10-14 第二轮（`view` 条件渲染 + 移除侧栏两个入口）后，本文件锁这五条：
 *   ① 导航行高只有一个来源（CSS 变量），组件里不写死 h-*
 *   ② 行高按窗口高度分档，单调不增，且落在可点击区间
 *   ③ 历史区**只在「对话」页渲染**，判据是既有的 `view`
 *   ④ 历史区的弹性尺寸在 CSS（`flex: 1 1 0%` + `min-height: 0`），组件里不重复写
 *   ⑤ 侧栏里没有「使用指南 / 官网」入口，也没有弹性占位元素；底部靠 `mt-auto` 贴底
 */

const root = process.cwd()
const css = readFileSync(path.join(root, 'src/app/globals.css'), 'utf8')
const workbench = readFileSync(path.join(root, 'src/components/app-workbench.tsx'), 'utf8')
const pageShell = readFileSync(path.join(root, 'src/app/page.tsx'), 'utf8')

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

  it('历史区只在「对话」页渲染，判据是既有的 view（不新造重复状态）', () => {
    // 必须是 `!compact && view === 'conversations' && (<section className="wb-history`
    expect(
      /\{!compact && view === 'conversations' && \(\s*<section className="wb-history/.test(workbench),
      '历史区必须按 view 条件渲染 —— 非对话页要整块不渲染，从而释放布局空间',
    ).toBe(true)
    // 反向：不许出现「无条件渲染」的写法（上一版就是无条件，被这轮需求推翻）
    expect(/\n\s*\{!compact && \(\s*\n\s*<section className="wb-history/.test(workbench)).toBe(false)
    // 判据只能来自 `view`；不许为「是否显示历史」另开状态/变量
    expect(/useState[^\n]*[Hh]istoryVisible/.test(workbench)).toBe(false)
    expect(/const\s+\w*[Hh]istory\w*\s*=\s*useAppStore/.test(workbench)).toBe(false)
  })

  it('历史区的弹性尺寸写在 CSS 里，组件里不重复写 flex-1 / min-h-0', () => {
    expect(
      /\.wb-history\s*\{[^}]*flex:\s*1 1 0%/.test(css),
      'flex-basis 必须是 0% 而不是 auto —— auto 会让内容撑出基准尺寸',
    ).toBe(true)
    expect(
      /\.wb-history\s*\{[^}]*min-height:\s*0/.test(css),
      'min-height:0 不可省：flex 子项默认 min-height:auto，列表内容会把容器顶高而非内部滚动',
    ).toBe(true)
    expect(/wb-history[^'"]*flex-1/.test(workbench)).toBe(false)
    expect(/wb-history[^'"]*min-h-0/.test(workbench)).toBe(false)
  })

  it('侧栏里没有「使用指南 / 官网」入口，也没有弹性占位元素，底部靠 mt-auto 贴底', () => {
    // 两个入口的 JSX 与唤起命令都必须消失（注释里提到组件名是允许的，所以断言标签与命令）
    expect(workbench).not.toContain("emitUiCommand('open-user-guide')")
    expect(workbench).not.toContain('<CircleHelp')
    expect(workbench).not.toContain('<OfficialSiteLink')
    expect(workbench).not.toContain("from '@/components/official-site-link'")
    // 不再有弹性占位 <div>（上一版靠它 + 互斥媒体查询保底），改由底部 mt-auto 接管
    expect(workbench).not.toContain('wb-spacer')
    expect(css).not.toContain('.wb-spacer')
    expect(/mt-auto shrink-0 border-t/.test(workbench), '底部区必须用 mt-auto 贴底').toBe(true)
    // 也不再需要任何「历史区让位」的媒体查询
    expect(
      mediaBlocks('max-height').some((b) => /\.wb-history\s*\{[^}]*display:\s*none/.test(b.body)),
      '非对话页整块不渲染，所以不该再有「太矮就隐藏历史区」的规则',
    ).toBe(false)
  })

  it('只移除侧栏入口，两个功能本体没有被删除', () => {
    // 「不要删除官网页面、使用指南页面或其相关功能」
    expect(existsSync(path.join(root, 'src/components/official-site-link.tsx'))).toBe(true)
    expect(existsSync(path.join(root, 'src/components/user-guide-dialog.tsx'))).toBe(true)
    expect(existsSync(path.join(root, 'src/components/settings/site-panel.tsx'))).toBe(true)
    // 指南弹窗仍挂在根布局上（首启自动弹出）
    expect(pageShell).toContain('<UserGuideDialog />')
  })
})
