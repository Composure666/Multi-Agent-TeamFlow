import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { computeTokensTrend, formatTrendPercent, largestRemainderShares } from './analytics-workspace'

describe('analytics trend display', () => {
  it('shows +200% for trend=200 instead of dividing by 100 (D-P0-1)', () => {
    expect(formatTrendPercent(200)).toBe('+200%')
    expect(formatTrendPercent(150)).toBe('+150%')
    expect(formatTrendPercent(50)).toBe('+50%')
    expect(formatTrendPercent(-25)).toBe('-25%')
    expect(formatTrendPercent(0)).toBe('+0%')
  })

  it('returns null for token trend when there is no previous period (D-P1-3)', () => {
    expect(computeTokensTrend(100, 0)).toBeNull()
    expect(computeTokensTrend(0, 0)).toBeNull()
    expect(computeTokensTrend(150, 100)).toBe(50)
    expect(computeTokensTrend(100, 200)).toBe(-50)
  })
})

describe('largestRemainderShares (D-P2-3)', () => {
  const totalUnits = (shares: number[]) => shares.reduce((sum, s) => sum + Math.round(s * 10), 0)

  it('three equal thirds sum to exactly 100.0 and the first (largest) slice gets the top-up', () => {
    const shares = largestRemainderShares([1 / 3, 1 / 3, 1 / 3])
    expect(shares).toEqual([33.4, 33.3, 33.3])
    expect(totalUnits(shares)).toBe(1000)
  })

  it('gives the residual to the largest remainders, ties broken by slice size', () => {
    const shares = largestRemainderShares([2 / 3, 1 / 6, 1 / 6])
    expect(shares).toEqual([66.7, 16.7, 16.6])
    expect(totalUnits(shares)).toBe(1000)
  })

  it('leaves already-divisible shares untouched', () => {
    expect(largestRemainderShares([0.5, 0.3, 0.2])).toEqual([50, 30, 20])
  })

  it('handles a single slice and empty input', () => {
    expect(largestRemainderShares([1])).toEqual([100])
    expect(largestRemainderShares([])).toEqual([])
  })
})

describe('analytics layout guards', () => {
  const source = readFileSync(path.join(process.cwd(), 'src/components/analytics-workspace.tsx'), 'utf8')

  it('trend chart svg has no min-width that overflows 390px (L-P0-1)', () => {
    expect(source).not.toContain('min-w-[440px]')
  })

  it('Token card has no sparkline: no per-day token data in trend buckets (D-P1-4)', () => {
    expect(source.match(/sparkline=\{\{/g)?.length).toBe(2)
    expect(source).not.toContain("sparkColorForTone('purple')")
  })

  it('automation task-count card has no sparkline: task count is static, completed counts are not task counts (D-P1-4)', () => {
    const card = source.match(/label="自动化任务"[\s\S]*?\/>/)
    expect(card).not.toBeNull()
    expect(card![0]).not.toContain('sparkline')
    expect(source).not.toContain("sparkColorForTone('emerald')")
  })

  it('PageHeader carries the sidebar icon BarChart3 (U-P1-3)', () => {
    expect(source).toMatch(/<PageHeader[\s\S]*?icon=\{BarChart3\}/)
  })

  it('self-written PanelEmpty is gone, shared EmptyState is used (U-P1-6)', () => {
    expect(source).not.toContain('PanelEmpty')
    expect(source).toContain('<EmptyState compact icon={BarChart3} title="该时间段内没有运行记录"')
  })

  it('export writes truncated: true only when the list was truncated (D-P2-1)', () => {
    expect(source).toContain('...(analytics?.truncated === true ? { truncated: true } : {})')
  })

  it('total is labelled as including sub-runs (D-P2-2)', () => {
    expect(source).toContain('范围内共 {totalRuns} 条（含子任务）')
  })

  it('no fake LIVE badge (D-P2-4)', () => {
    expect(source).not.toContain('LIVE')
  })

  it('"全部" tab count uses totalRuns, not the truncated runs list (D-P1-6)', () => {
    expect(source).toContain("tab === '全部' ? totalRuns :")
  })

  it('donut arcs and legend share the largest-remainder shares, not the server-rounded value (D-P2-3)', () => {
    expect(source).toContain('shares={distributionShares}')
    expect(source).toContain('{distributionShares[i] ?? item.value}%')
    expect(source).toContain('((shares[i] ?? item.value) / 100) * circ')
  })
})
