import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

import { bootstrapDatabase } from './bootstrap'
import * as schema from './schema'

// Electron 模式下 main 进程注入 AGENTHUB_DATA_DIR 指向 userData；web / dev 走 cwd 兜底（详见 Spec 12 §5）
const DATA_DIR =
  process.env.AGENTHUB_DATA_DIR ??
  path.resolve(/* turbopackIgnore: true */ process.cwd(), '.agenthub-data')
const DB_PATH = path.join(DATA_DIR, 'agenthub.db')

mkdirSync(DATA_DIR, { recursive: true })
mkdirSync(path.join(DATA_DIR, 'workspaces'), { recursive: true })

// 跨 Next.js HMR 保活单例（dev 模式下避免每次保存代码都新建 connection）
const globalForDb = globalThis as unknown as {
  sqlite?: Database.Database
}

const sqlite =
  globalForDb.sqlite ??
  new Database(DB_PATH, {
    // 启用 WAL 模式，并发读写性能更好
    fileMustExist: false,
  })

if (!globalForDb.sqlite) {
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  // 同步建表 + seed 内置 agent（CREATE TABLE IF NOT EXISTS + 只在空时插入，幂等）。
  // 打包后桌面版第一次起 server 时，userData 里只有空 DB 文件，必须在这里把 schema / 数据补齐。
  // dev 模式 DB 已经存在，操作都是 no-op，开销可忽略。
  bootstrapDatabase(sqlite)
  globalForDb.sqlite = sqlite
}

export const db = drizzle(sqlite, { schema })
export { schema, sqlite }
