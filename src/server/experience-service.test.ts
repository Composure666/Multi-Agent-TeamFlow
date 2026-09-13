import { describe, expect, it } from 'vitest'

import {
  clipByBudget,
  parseExtractionOutput,
  tokenizeKeywords,
} from '@/server/experience-service'

describe('tokenizeKeywords', () => {
  it('splits mixed text into lowercase tokens by separators', () => {
    const tokens = tokenizeKeywords('用 React 写一个 Todo 应用 App，部署到 Vercel')
    expect(tokens).toContain('react')
    expect(tokens).toContain('todo')
    expect(tokens).toContain('应用')
    expect(tokens).toContain('vercel')
    expect(tokens).toContain('写一个')
    expect(tokens).toContain('部署到')
  })

  it('drops stop words that appear as standalone tokens', () => {
    const tokens = tokenizeKeywords('请 帮 我 处理 这个 问题')
    expect(tokens).not.toContain('请')
    expect(tokens).not.toContain('帮')
    expect(tokens).not.toContain('我')
    expect(tokens).toContain('处理')
    expect(tokens).toContain('问题')
  })

  it('deduplicates tokens and caps at 12', () => {
    const tokens = tokenizeKeywords('a a a b b c d e f g h i j k l m n')
    expect(new Set(tokens).size).toBe(tokens.length)
    expect(tokens.length).toBeLessThanOrEqual(12)
  })

  it('returns empty array for empty / punctuation-only input', () => {
    expect(tokenizeKeywords('')).toEqual([])
    expect(tokenizeKeywords('！！！？？？')).toEqual([])
  })
})

describe('clipByBudget', () => {
  const hit = (id: string, content: string) => ({
    id,
    kind: 'experience',
    scope: 'agent',
    title: id,
    trigger: '',
    content,
    tags: '[]',
    agentId: null,
  })

  it('keeps entries while budget lasts', () => {
    const rows = [hit('a', 'xx'), hit('b', 'yyy'), hit('c', 'zz')]
    const picked = clipByBudget(rows, 6, 10)
    expect(picked.map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('respects maxEntries even with a huge budget', () => {
    const rows = [hit('a', 'x'), hit('b', 'y'), hit('c', 'z'), hit('d', 'w')]
    const picked = clipByBudget(rows, 10_000, 3)
    expect(picked).toHaveLength(3)
  })

  it('skips empty content rows', () => {
    const rows = [hit('empty', '   '), hit('ok', 'content')]
    const picked = clipByBudget(rows, 100, 10)
    expect(picked.map((r) => r.id)).toEqual(['ok'])
  })

  it('returns empty when budget is exhausted', () => {
    const rows = [hit('a', '0123456789'), hit('b', 'xyz')]
    expect(clipByBudget(rows, 5, 10)).toEqual([])
  })
})

describe('parseExtractionOutput', () => {
  it('parses a valid JSON array', () => {
    const raw = JSON.stringify([
      {
        kind: 'experience',
        title: '用 drizzle 加列要同步 onConflictDoUpdate',
        trigger: '修改 appSettings 表结构时',
        content: '加列后必须同步 updateAppSettings 的 set 数组。',
        tags: ['drizzle', 'migration'],
      },
    ])
    const out = parseExtractionOutput(raw)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ kind: 'experience', tags: ['drizzle', 'migration'] })
  })

  it('strips markdown code fences', () => {
    const raw = '```json\n[]\n```'
    expect(parseExtractionOutput(raw)).toEqual([])
  })

  it('rejects non-array output', () => {
    expect(parseExtractionOutput('{"kind":"experience"}')).toEqual([])
  })

  it('rejects invalid JSON', () => {
    expect(parseExtractionOutput('not json at all')).toEqual([])
    expect(parseExtractionOutput('')).toEqual([])
  })

  it('drops invalid items and caps at 3', () => {
    const raw = JSON.stringify([
      { kind: 'experience', title: 'ok1', trigger: 't', content: 'c' },
      { kind: 'nonsense', title: 'bad kind' },
      { title: 'missing trigger' },
      { kind: 'experience', title: 'ok2', trigger: 't', content: 'c' },
      { kind: 'experience', title: 'ok3', trigger: 't', content: 'c' },
      { kind: 'experience', title: 'ok4', trigger: 't', content: 'c' },
    ])
    const out = parseExtractionOutput(raw)
    expect(out.map((c) => c.title)).toEqual(['ok1', 'ok2', 'ok3'])
  })

  it('clamps over-long fields via zod max', () => {
    const raw = JSON.stringify([
      { kind: 'experience', title: 'x'.repeat(81), trigger: 't', content: 'c' },
    ])
    expect(parseExtractionOutput(raw)).toEqual([])
  })
})
