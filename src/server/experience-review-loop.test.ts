import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'

import { db, schema } from '@/db/client'
import {
  applyExperienceReviews,
  createExperience,
  listExperienceRevisions,
  rollbackExperienceRevision,
} from '@/server/experience-service'
import type { InjectedExperienceEntry } from '@/server/experience-service'

/**
 * 经验迭代闭环的集成测试（会真的落库，afterAll 里把自己建的东西全部删干净）。
 *
 * 覆盖的是「注入 → 运行 → 复盘 → 改写 → 可回滚」这条链最容易出错的地方：
 * 幻觉 id、手工经验不该被自动停用、快照必须是改前值、回滚必须还原。
 */

const RUN_ID = `run_smoke_${Date.now()}`
const createdExperienceIds: string[] = []

function toInjected(row: {
  id: string
  kind: string
  source: string
  title: string
  trigger: string
  content: string
  tags: string[]
}): InjectedExperienceEntry {
  return {
    id: row.id,
    kind: row.kind,
    source: row.source,
    title: row.title,
    trigger: row.trigger,
    content: row.content,
    tags: row.tags,
  }
}

async function seedExperience(overrides: { source?: 'auto' | 'manual'; content?: string } = {}) {
  const row = await createExperience({
    kind: 'experience',
    agentId: null,
    scope: 'global',
    runId: RUN_ID,
    title: '冒烟：先校验素材再生成产物',
    trigger: '当任务需要先读取外部素材时',
    content: overrides.content ?? '先确认素材存在且可读，再进入生成步骤。',
    tags: ['smoke'],
    source: overrides.source ?? 'auto',
    active: true,
  })
  createdExperienceIds.push(row.id)
  // 模拟「这次 run 真的注入过它」
  await db.insert(schema.experienceUsages).values({
    id: `expu_${Math.random().toString(36).slice(2, 14)}`,
    experienceId: row.id,
    runId: RUN_ID,
    agentId: null,
    createdAt: Date.now(),
  })
  return row
}

afterAll(async () => {
  for (const id of createdExperienceIds) {
    try {
      await db.delete(schema.experienceRevisions).where(eq(schema.experienceRevisions.experienceId, id))
      await db.delete(schema.experienceUsages).where(eq(schema.experienceUsages.experienceId, id))
      await db.delete(schema.experiences).where(eq(schema.experiences.id, id))
    } catch (err) {
      console.warn('[experience-review-loop] cleanup failed', err)
    }
  }
})

describe('experience review loop', () => {
  it('refine 会改写内容，并把改前的值留成快照', async () => {
    const row = await seedExperience()
    const injected = [toInjected(row)]

    const outcomes = await applyExperienceReviews(
      [{ id: row.id, verdict: 'refine', reason: '还要先检查文件编码', patch: { content: '先确认素材存在、可读且编码正确。' } }],
      injected,
      { runId: RUN_ID },
    )
    expect(outcomes[0].applied).toBe(true)

    const updated = await db.query.experiences.findFirst({ where: eq(schema.experiences.id, row.id) })
    expect(updated?.content).toContain('编码正确')

    const revisions = await listExperienceRevisions(row.id)
    expect(revisions).toHaveLength(1)
    expect(revisions[0].kind).toBe('refine')
    expect(revisions[0].content).toBe('先确认素材存在且可读，再进入生成步骤。')
    expect(revisions[0].note).toBe('还要先检查文件编码')

    // 回滚必须还原到改前那一版
    await rollbackExperienceRevision(row.id, revisions[0].id)
    const restored = await db.query.experiences.findFirst({ where: eq(schema.experiences.id, row.id) })
    expect(restored?.content).toBe('先确认素材存在且可读，再进入生成步骤。')
    // 回滚本身也要留痕，保证可以一路回滚回去
    expect(await listExperienceRevisions(row.id)).toHaveLength(2)
  })

  it('retire 只停用 Agent 自动沉淀的经验，手工经验留给人工决定', async () => {
    const auto = await seedExperience({ source: 'auto' })
    const manual = await seedExperience({ source: 'manual' })

    const outcomes = await applyExperienceReviews(
      [
        { id: auto.id, verdict: 'retire', reason: '这条做法已经过时' },
        { id: manual.id, verdict: 'retire', reason: '同上' },
      ],
      [toInjected(auto), toInjected(manual)],
      { runId: RUN_ID },
    )

    expect(outcomes.find((o) => o.experienceId === auto.id)?.applied).toBe(true)
    expect(outcomes.find((o) => o.experienceId === manual.id)?.applied).toBe(false)

    const autoRow = await db.query.experiences.findFirst({ where: eq(schema.experiences.id, auto.id) })
    const manualRow = await db.query.experiences.findFirst({ where: eq(schema.experiences.id, manual.id) })
    expect(autoRow?.active).toBe(false)
    expect(manualRow?.active).toBe(true)
  })

  it('confirmed 不改内容，但留一条验证痕', async () => {
    const row = await seedExperience()
    const before = row.content

    await applyExperienceReviews(
      [{ id: row.id, verdict: 'confirmed', reason: '本次确实按它执行了' }],
      [toInjected(row)],
      { runId: RUN_ID },
    )

    const after = await db.query.experiences.findFirst({ where: eq(schema.experiences.id, row.id) })
    expect(after?.content).toBe(before)
    const revisions = await listExperienceRevisions(row.id)
    expect(revisions).toHaveLength(1)
    expect(revisions[0].kind).toBe('confirm')
  })

  it('没有被注入过的 id 一律丢弃，不会误改别的经验', async () => {
    const row = await seedExperience()
    const before = row.content

    const outcomes = await applyExperienceReviews(
      [{ id: 'exp_not_injected_at_all', verdict: 'refine', reason: '幻觉', patch: { content: '被误改的内容' } }],
      [toInjected(row)],
      { runId: RUN_ID },
    )
    expect(outcomes[0].applied).toBe(false)

    const after = await db.query.experiences.findFirst({ where: eq(schema.experiences.id, row.id) })
    expect(after?.content).toBe(before)
    expect(await listExperienceRevisions(row.id)).toHaveLength(0)
  })

  it('patch 与现值一致时不产生无意义的修订', async () => {
    const row = await seedExperience()
    const outcomes = await applyExperienceReviews(
      [{ id: row.id, verdict: 'refine', reason: '没变化', patch: { content: row.content } }],
      [toInjected(row)],
      { runId: RUN_ID },
    )
    expect(outcomes[0].applied).toBe(false)
    expect(await listExperienceRevisions(row.id)).toHaveLength(0)
  })
})
