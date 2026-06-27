/**
 * Seed 初始 Agent —— `pnpm db:seed` 手动入口（dev 用）。
 *
 * Packaged 桌面版**不**需要跑这个 —— `src/db/bootstrap.ts` 已经在 DB 初始化时自动 seed。
 * 这个脚本保留只是为了 dev 时手动重置或追加。
 *
 * 行为：只 seed 一次，重复运行跳过已存在的 Agent。
 */
import { eq } from 'drizzle-orm'

import { BUILTIN_AGENTS } from './builtin-agents'
import { db, schema } from './client'

async function seed() {
  for (const agent of BUILTIN_AGENTS) {
    const existing = await db.query.agents.findFirst({
      where: eq(schema.agents.id, agent.id),
    })
    if (existing) {
      console.log(`[seed] skip ${agent.id} (already exists)`)
      continue
    }
    await db.insert(schema.agents).values(agent)
    console.log(`[seed] insert ${agent.id} (${agent.name})`)
  }
  console.log('[seed] done')
}

seed().catch((err) => {
  console.error('[seed] failed', err)
  process.exit(1)
})
