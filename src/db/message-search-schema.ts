/**
 * messages_fts 的 schema 定义与回填语句（单一信息源）。
 *
 * 背景（线上事故）：`/api/search` 的 FTS 路径（见 `search-service.ts` 的 `runFtsPath`）依赖
 * `messages_fts` 这张虚拟表，但建表语句最初只存在于一次性脚本 `migrate-add-message-search.ts` 里，
 * **运行时没有任何调用点** —— 于是线上库从来没有这张表，全局搜索恒 500：
 *   `SqliteError: no such table: messages_fts`
 * 对照组：`experiences_fts` 因为同时写进了 bootstrap 的 DDL 数组，一直工作正常。
 *
 * 现在的三层约定，缺一不可：
 *  1. `MESSAGE_SEARCH_DDL`（虚拟表 + 3 个同步触发器）随 bootstrap **每次启动**执行 —— 幂等、不扫表，
 *     保证任何库（新装 / 老库 / 重装）启动后这张表一定存在，不会再出现「迁移没人跑」。
 *  2. `MESSAGE_SEARCH_BACKFILL` 是重活（全表扫 messages.parts），由 bootstrap 用
 *     `bootstrap_migrations` 标记守卫，**只跑一次**，避免每次启动都全表重扫。
 *  3. `migrate-add-message-search.ts` 保留为手工 CLI，与这里共用同一份语句，防止两处漂移。
 */
import type Database from 'better-sqlite3'

/**
 * 虚拟表 + 3 个同步触发器（INSERT / UPDATE / DELETE）。
 *
 * 只索引 `parts` 里 `type='text'` 的片段；`status='streaming'` 的行不索引 ——
 * 流式期间 parts 每帧都在变，逐帧写 FTS 纯属浪费，等落定（非 streaming）那次 UPDATE 再进索引。
 */
export const MESSAGE_SEARCH_DDL: string[] = [
  `CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(content, tokenize='trigram')`,
  `CREATE TRIGGER IF NOT EXISTS messages_fts_ai
     AFTER INSERT ON messages
     WHEN new.status != 'streaming'
     BEGIN
       INSERT INTO messages_fts(rowid, content)
       SELECT new.rowid, (
         SELECT GROUP_CONCAT(json_extract(value, '$.content'), ' ')
         FROM json_each(new.parts)
         WHERE json_extract(value, '$.type') = 'text'
       );
     END`,
  `CREATE TRIGGER IF NOT EXISTS messages_fts_au
     AFTER UPDATE ON messages
     WHEN new.status != 'streaming'
     BEGIN
       DELETE FROM messages_fts WHERE rowid = old.rowid;
       INSERT INTO messages_fts(rowid, content)
       SELECT new.rowid, (
         SELECT GROUP_CONCAT(json_extract(value, '$.content'), ' ')
         FROM json_each(new.parts)
         WHERE json_extract(value, '$.type') = 'text'
       );
     END`,
  `CREATE TRIGGER IF NOT EXISTS messages_fts_ad
     AFTER DELETE ON messages
     BEGIN
       DELETE FROM messages_fts WHERE rowid = old.rowid;
     END`,
]

/**
 * 回填存量消息的 text 片段。
 *
 * `INSERT OR IGNORE` 让语句本身幂等（已在索引里的 rowid 会被忽略），但每次执行都要全表扫
 * `json_each(parts)`，所以在 bootstrap 侧额外用迁移标记守卫成「只跑一次」。
 */
export const MESSAGE_SEARCH_BACKFILL = `INSERT OR IGNORE INTO messages_fts(rowid, content)
     SELECT m.rowid, (
       SELECT GROUP_CONCAT(json_extract(value, '$.content'), ' ')
       FROM json_each(m.parts)
       WHERE json_extract(value, '$.type') = 'text'
     )
     FROM messages m`

/** 建表 + 回填，一次跑完（手工 CLI 与单测用；bootstrap 走上面两步拆开的路径）。 */
export function runMessageSearchMigration(target: Database.Database): void {
  for (const stmt of MESSAGE_SEARCH_DDL) {
    target.exec(stmt)
  }
  target.exec(MESSAGE_SEARCH_BACKFILL)
}
