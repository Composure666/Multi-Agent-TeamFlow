/**
 * 一次性 schema migration：加 messages_fts 虚拟表 + 3 触发器，回填已有 text part。
 *
 * 幂等：使用 IF NOT EXISTS 守卫；backfill 使用 INSERT OR IGNORE 不会重复插入。
 *
 * ⚠️ 这个脚本曾经是 messages_fts 的**唯一**来源，而运行时没有任何调用点 ——
 * 导致线上库一直没有这张表、`/api/search` 恒 500。现在 DDL 与回填都搬到了
 * `message-search-schema.ts`，并由 bootstrap 随启动自动执行（回填用迁移标记守卫成一次性）。
 * 本文件保留为手工 CLI：schema 出问题时可以直接 `tsx src/db/migrate-add-message-search.ts` 补跑。
 *
 * 执行：tsx src/db/migrate-add-message-search.ts
 */
import { sqlite as defaultSqlite } from './client'
import { runMessageSearchMigration } from './message-search-schema'

export { MESSAGE_SEARCH_BACKFILL, MESSAGE_SEARCH_DDL, runMessageSearchMigration } from './message-search-schema'

// CLI entry
if (require.main === module) {
  runMessageSearchMigration(defaultSqlite)
  console.log('done')
}
