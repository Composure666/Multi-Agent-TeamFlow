import { describe, expect, it } from 'vitest'

import {
  buildRetrievalKeywords,
  clipByBudget,
  filterReviewTargets,
  mergeExperienceHits,
  parseExtractionOutput,
  parseExtractionReviews,
  tokenizeKeywords,
  type ExperienceHitRow,
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

describe('parseExtractionOutput / 新旧两种输出形态', () => {
  const candidate = {
    kind: 'experience',
    title: '先校验输入素材再生成产物',
    trigger: '当任务需要先读取外部素材时',
    content: '先确认素材存在且可读，再进入生成步骤。',
    tags: ['检查清单'],
  }

  it('reads candidates from the object payload', () => {
    const raw = JSON.stringify({ candidates: [candidate], reviews: [] })
    const out = parseExtractionOutput(raw)
    expect(out).toHaveLength(1)
    expect(out[0].title).toBe(candidate.title)
  })

  it('still accepts a bare array emitted by older models', () => {
    expect(parseExtractionOutput(JSON.stringify([candidate]))).toHaveLength(1)
  })

  it('returns [] when there is no usable candidates field', () => {
    expect(parseExtractionOutput('{"reviews":[]}')).toEqual([])
    expect(parseExtractionOutput('null')).toEqual([])
    expect(parseExtractionOutput('not json')).toEqual([])
  })
})

describe('parseExtractionReviews', () => {
  it('parses verdict, reason and patch', () => {
    const raw = JSON.stringify({
      candidates: [],
      reviews: [
        {
          id: 'exp_abc123',
          verdict: 'refine',
          reason: '本次发现还要先检查编码',
          patch: { content: '先确认素材存在、可读且编码正确，再进入生成步骤。' },
        },
      ],
    })
    const reviews = parseExtractionReviews(raw)
    expect(reviews).toHaveLength(1)
    expect(reviews[0]).toMatchObject({
      id: 'exp_abc123',
      verdict: 'refine',
      reason: '本次发现还要先检查编码',
    })
    expect(reviews[0].patch?.content).toContain('编码正确')
  })

  it('defaults a missing reason to an empty string', () => {
    const raw = JSON.stringify({ reviews: [{ id: 'exp_x', verdict: 'confirmed' }] })
    const [review] = parseExtractionReviews(raw)
    expect(review.verdict).toBe('confirmed')
    expect(review.reason).toBe('')
    expect(review.patch).toBeUndefined()
  })

  it('drops reviews with an unknown verdict or without an id', () => {
    const raw = JSON.stringify({
      reviews: [
        { id: 'exp_ok', verdict: 'retire' },
        { id: 'exp_bad', verdict: 'maybe' },
        { verdict: 'confirmed' },
        { id: 'exp_ok2', verdict: 'confirmed', unexpected: 1 },
      ],
    })
    const reviews = parseExtractionReviews(raw)
    expect(reviews.map((r) => r.id)).toEqual(['exp_ok'])
  })

  it('caps at 3 reviews even if the model returns more', () => {
    const reviews = Array.from({ length: 6 }, (_, i) => ({
      id: `exp_${i}`,
      verdict: 'confirmed',
    }))
    expect(parseExtractionReviews(JSON.stringify({ reviews }))).toHaveLength(3)
  })

  it('returns [] for array payloads and invalid json', () => {
    expect(parseExtractionReviews('[]')).toEqual([])
    expect(parseExtractionReviews('{"candidates":[]}')).toEqual([])
    expect(parseExtractionReviews('oops')).toEqual([])
  })
})

describe('filterReviewTargets', () => {
  const injected = [
    {
      id: 'exp_injected',
      kind: 'experience',
      source: 'auto',
      title: '标题',
      trigger: '触发',
      content: '内容',
      tags: [],
    },
  ]

  it('accepts ids that were really injected in this run', () => {
    const result = filterReviewTargets(
      [{ id: 'exp_injected', verdict: 'refine', reason: '' }],
      injected,
    )
    expect(result.accepted.map((r) => r.id)).toEqual(['exp_injected'])
    expect(result.rejected).toEqual([])
  })

  it('rejects ids the model could have hallucinated', () => {
    const result = filterReviewTargets(
      [
        { id: 'exp_injected', verdict: 'confirmed', reason: '' },
        { id: 'exp_not_injected', verdict: 'retire', reason: '过时了' },
      ],
      injected,
    )
    expect(result.accepted.map((r) => r.id)).toEqual(['exp_injected'])
    expect(result.rejected.map((r) => r.id)).toEqual(['exp_not_injected'])
  })

  it('rejects everything when nothing was injected', () => {
    const result = filterReviewTargets(
      [{ id: 'exp_whatever', verdict: 'confirmed', reason: '' }],
      [],
    )
    expect(result.accepted).toEqual([])
    expect(result.rejected).toHaveLength(1)
  })
})
describe('buildRetrievalKeywords', () => {
  it('shreds a punctuation-less Chinese sentence into 3-grams so FTS can hit fragments', () => {
    const sentence = '请你把这个图表变成一个形象生动的流程图'
    const keywords = buildRetrievalKeywords(sentence)
    // 整句保留（字面命中）
    expect(keywords).toContain(sentence)
    // 关键：句子片段也能作为查询词，否则整句永远召回不到经验
    expect(keywords).toContain('流程图')
    expect(keywords).toContain('这个图')
    expect(keywords.length).toBeGreaterThan(1)
    expect(keywords.length).toBeLessThanOrEqual(24)
    expect(new Set(keywords).size).toBe(keywords.length)
  })

  it('keeps latin tokens intact and does not shred short Chinese words', () => {
    const keywords = buildRetrievalKeywords('用 React 生图')
    expect(keywords).toContain('react')
    expect(keywords).toContain('生图')
    expect(keywords).not.toContain('生')
  })

  it('returns an empty list for empty input', () => {
    expect(buildRetrievalKeywords('')).toEqual([])
  })
})

describe('mergeExperienceHits', () => {
  const hit = (id: string): ExperienceHitRow => ({
    id,
    kind: 'experience',
    scope: 'global',
    title: id,
    trigger: '',
    content: id,
    tags: '[]',
    agentId: null,
  })

  it('keeps always-on experiences first and dedupes by id', () => {
    const merged = mergeExperienceHits([hit('exp_always_on'), hit('exp_both')], [hit('exp_both'), hit('exp_hit')])
    expect(merged.map((row) => row.id)).toEqual(['exp_always_on', 'exp_both', 'exp_hit'])
  })

  it('returns keyword hits untouched when there is no always-on entry', () => {
    const merged = mergeExperienceHits([], [hit('exp_a'), hit('exp_b')])
    expect(merged.map((row) => row.id)).toEqual(['exp_a', 'exp_b'])
  })
})
