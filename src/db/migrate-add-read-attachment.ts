/**
 * 一次性迁移：给所有自带 read_artifact 的 agent 也加上 read_attachment 工具。
 *
 * 可重入：已有 read_attachment 的 agent 会跳过。运行完即可删除（保留也无害）。
 */
import { eq } from 'drizzle-orm'

import { db, schema } from './client'

async function migrate() {
  const rows = await db.query.agents.findMany()
  let updated = 0
  for (const r of rows) {
    if (!r.toolNames.includes('read_artifact')) continue
    if (r.toolNames.includes('read_attachment')) continue
    const next = [...r.toolNames, 'read_attachment']
    await db.update(schema.agents).set({ toolNames: next }).where(eq(schema.agents.id, r.id))
    console.log(`updated ${r.id} (${r.name}): tools = ${next.join(',')}`)
    updated++
  }
  console.log(`\ntotal updated: ${updated}`)
}

migrate().catch((err) => {
  console.error('[migrate-add-read-attachment] failed', err)
  process.exit(1)
})
