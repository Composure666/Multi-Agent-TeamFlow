import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'

import { bootstrapDatabase } from './bootstrap'

/**
 * 回归：内置自动化任务必须「默认暂停」。
 *
 * 线上事故：老种子把内置任务写成 enabled / running，且 next_run_at 按「上次演示运行 + 1 天」
 * 预排（演示时间在过去）→ 服务一启动，调度器首个 tick 就当它们已到期，开箱即真跑了一轮。
 */
function withTempDb<T>(run: (sqlite: Database.Database) => T): T {
  const dir = mkdtempSync(path.join(tmpdir(), 'agenthub-bootstrap-'))
  const sqlite = new Database(path.join(dir, 'agenthub.db'))
  try {
    return run(sqlite)
  } finally {
    sqlite.close()
    rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  }
}

describe('built-in automation seed', () => {
  it('seeds every built-in automation as paused with no scheduled next run', () => {
    withTempDb((sqlite) => {
      bootstrapDatabase(sqlite)

      const rows = sqlite
        .prepare('SELECT id, status, next_run_at FROM automations')
        .all() as Array<{ id: string; status: string; next_run_at: number | null }>

      expect(rows.length).toBeGreaterThan(0)
      for (const row of rows) {
        expect({ id: row.id, status: row.status }).toEqual({ id: row.id, status: 'paused' })
        expect({ id: row.id, next_run_at: row.next_run_at }).toEqual({ id: row.id, next_run_at: null })
      }
    })
  })

  it('pauses legacy enabled built-ins on upgrade, but only once', () => {
    withTempDb((sqlite) => {
      bootstrapDatabase(sqlite)

      // 造出「老版本库」的样子：内置任务处于 enabled/running 且预排了下一次运行
      sqlite
        .prepare(
          `UPDATE automations
           SET status = 'enabled', next_run_at = ?
           WHERE id = 'auto_daily_ai_news'`,
        )
        .run(Date.now() - 60_000)
      sqlite
        .prepare(`UPDATE automations SET status = 'running' WHERE id = 'auto_classic_movie'`)
        .run()
      // 迁移标记还不在 → 下次启动应执行一次性修复
      sqlite.prepare('DELETE FROM bootstrap_migrations').run()

      bootstrapDatabase(sqlite)

      const afterUpgrade = sqlite
        .prepare(`SELECT id, status, next_run_at FROM automations WHERE id IN ('auto_daily_ai_news','auto_classic_movie')`)
        .all() as Array<{ id: string; status: string; next_run_at: number | null }>
      for (const row of afterUpgrade) {
        expect({ id: row.id, status: row.status }).toEqual({ id: row.id, status: 'paused' })
        expect({ id: row.id, next_run_at: row.next_run_at }).toEqual({ id: row.id, next_run_at: null })
      }

      // 用户随后手动启用：再次启动不能被反复暂停（迁移只跑一次）
      sqlite
        .prepare(`UPDATE automations SET status = 'enabled', next_run_at = ? WHERE id = 'auto_daily_ai_news'`)
        .run(Date.now() + 60_000)
      bootstrapDatabase(sqlite)

      const afterManualEnable = sqlite
        .prepare(`SELECT status, next_run_at FROM automations WHERE id = 'auto_daily_ai_news'`)
        .get() as { status: string; next_run_at: number | null }
      expect(afterManualEnable.status).toBe('enabled')
      expect(afterManualEnable.next_run_at).not.toBeNull()
    })
  })
})

/**
 * 回归：messages_fts 必须随 bootstrap 自愈。
 *
 * 线上事故：这张虚拟表的建表语句原先只躺在手工脚本 `migrate-add-message-search.ts` 里，
 * 运行时没有任何调用点 → 线上库一直没有它，`/api/search` 恒 500
 * （`SqliteError: no such table: messages_fts`）。对照 `experiences_fts` 因为写进了 DDL 所以一直正常。
 */
function insertMessage(sqlite: Database.Database, id: string, text: string, status = 'complete') {
  // messages.conversation_id 有外键约束，先把宿主会话补上
  const now = Date.now()
  sqlite
    .prepare(
      `INSERT OR IGNORE INTO conversations (id, title, mode, agent_ids, created_at, updated_at)
       VALUES ('conv_fts', 'fts test', 'chat', '[]', ?, ?)`,
    )
    .run(now, now)
  sqlite
    .prepare(
      `INSERT INTO messages (id, conversation_id, role, agent_id, parts, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, 'conv_fts', 'user', null, JSON.stringify([{ type: 'text', content: text }]), status, now)
}

function ftsRows(sqlite: Database.Database, term: string) {
  return sqlite
    .prepare('SELECT rowid, content FROM messages_fts WHERE messages_fts MATCH ?')
    .all(term) as Array<{ rowid: number; content: string }>
}

describe('messages_fts self-heal', () => {
  it('creates the virtual table and its three triggers on a fresh database', () => {
    withTempDb((sqlite) => {
      bootstrapDatabase(sqlite)

      const table = sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='messages_fts'")
        .get()
      expect(table).toBeDefined()

      const triggers = sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'messages_fts_%'")
        .all() as { name: string }[]
      expect(triggers.map((t) => t.name).sort()).toEqual(['messages_fts_ad', 'messages_fts_ai', 'messages_fts_au'])
    })
  })

  it('repairs a legacy database that has messages but no messages_fts', () => {
    withTempDb((sqlite) => {
      bootstrapDatabase(sqlite)

      // 还原线上现状：表不存在、触发器不存在、回填标记也没打过
      sqlite.exec(`
        DROP TRIGGER IF EXISTS messages_fts_ai;
        DROP TRIGGER IF EXISTS messages_fts_au;
        DROP TRIGGER IF EXISTS messages_fts_ad;
        DROP TABLE IF EXISTS messages_fts;
      `)
      sqlite.prepare('DELETE FROM bootstrap_migrations').run()
      insertMessage(sqlite, 'm_legacy', 'alpha bravo charlie')

      // 老库里的存量消息只有在建表之前就存在，才需要靠回填补上
      bootstrapDatabase(sqlite)

      expect(ftsRows(sqlite, 'bravo')).toEqual([
        expect.objectContaining({ content: expect.stringContaining('alpha bravo charlie') }),
      ])
    })
  })

  it('indexes new messages through the trigger and never duplicates rows on restart', () => {
    withTempDb((sqlite) => {
      bootstrapDatabase(sqlite)
      expect(sqlite.prepare('SELECT 1 AS one FROM bootstrap_migrations WHERE key = ?').get('messages_fts_backfill_v1')).toBeDefined()

      // 落定后的消息由 AFTER INSERT 触发器接管
      insertMessage(sqlite, 'm_new', 'delta echo foxtrot')

      // 重启（再 bootstrap 一次）不应重复回填，也不应报错
      expect(() => bootstrapDatabase(sqlite)).not.toThrow()

      expect(ftsRows(sqlite, 'echo').length).toBe(1)
    })
  })

  it('skips streaming messages, which are indexed on the follow-up update instead', () => {
    withTempDb((sqlite) => {
      bootstrapDatabase(sqlite)
      insertMessage(sqlite, 'm_stream', 'golf hotel india', 'streaming')
      expect(ftsRows(sqlite, 'hotel')).toEqual([])

      sqlite
        .prepare(`UPDATE messages SET status = 'complete' WHERE id = 'm_stream'`)
        .run()
      expect(ftsRows(sqlite, 'hotel').length).toBe(1)
    })
  })
})

/**
 * 回归：品牌改名后，**存量库**里 builtin agent 的提示词必须一起改名。
 *
 * 背景：builtin agent 的 system_prompt 只在建库时写一次，upgradeBuiltinAgents 之后只做追加，
 * 所以改源码不会影响老库 —— 不迁移的话 Agent 会在对话里继续自称旧品牌名。
 *
 * 边界（与本用例同等重要）：小写 `.agenthub-data/`、`AGENTHUB_*`、`mcp__agenthub__*`
 * 都是内部标识，迁移绝不能碰；用户自建 Agent 属用户数据，也不碰。
 */
describe('legacy brand rename migration', () => {
  it('rewrites the old brand in builtin prompts and keeps internal identifiers intact', () => {
    withTempDb((sqlite) => {
      bootstrapDatabase(sqlite)

      // 还原老库：提示词里同时含旧品牌（大写，该改）与内部标识（小写，不该改）
      sqlite
        .prepare(`UPDATE agents SET system_prompt = ? WHERE id = 'ag_orchestrator'`)
        .run(
          '你是 AgentHub 平台的 Orchestrator。数据在 .agenthub-data/，env 叫 AGENTHUB_DATA_DIR，工具前缀 mcp__agenthub__ask_user。',
        )
      sqlite.prepare('DELETE FROM bootstrap_migrations').run()

      bootstrapDatabase(sqlite)

      const row = sqlite
        .prepare(`SELECT system_prompt FROM agents WHERE id = 'ag_orchestrator'`)
        .get() as { system_prompt: string }

      expect(row.system_prompt).toContain('你是 Multi-Agent TeamFlow 平台的 Orchestrator')
      expect(row.system_prompt).not.toContain('AgentHub 平台')
      expect(row.system_prompt).toContain('.agenthub-data/')
      expect(row.system_prompt).toContain('AGENTHUB_DATA_DIR')
      expect(row.system_prompt).toContain('mcp__agenthub__ask_user')
    })
  })

  it('replaces every occurrence, not just the first', () => {
    withTempDb((sqlite) => {
      bootstrapDatabase(sqlite)
      sqlite
        .prepare(`UPDATE agents SET system_prompt = ? WHERE id = 'ag_reviewer'`)
        .run('AgentHub A / AgentHub B / AgentHub C')
      sqlite.prepare('DELETE FROM bootstrap_migrations').run()

      bootstrapDatabase(sqlite)

      const row = sqlite
        .prepare(`SELECT system_prompt FROM agents WHERE id = 'ag_reviewer'`)
        .get() as { system_prompt: string }
      // upgradeBuiltinAgents 会给 ag_reviewer 追加审查提示词片段，所以这里断言包含关系
      expect(row.system_prompt).toContain(
        'Multi-Agent TeamFlow A / Multi-Agent TeamFlow B / Multi-Agent TeamFlow C',
      )
      expect(row.system_prompt).not.toContain('AgentHub')
    })
  })

  it('leaves non-builtin agents (user data) untouched', () => {
    withTempDb((sqlite) => {
      bootstrapDatabase(sqlite)

      // 用「摘掉 is_builtin 标记」模拟用户自建 Agent，避免耦合 agents 表的列结构
      sqlite
        .prepare(`UPDATE agents SET is_builtin = 0, system_prompt = ? WHERE id = 'ag_designer'`)
        .run('我是一个 AgentHub custom agent')
      sqlite.prepare('DELETE FROM bootstrap_migrations').run()

      bootstrapDatabase(sqlite)

      const row = sqlite
        .prepare(`SELECT system_prompt FROM agents WHERE id = 'ag_designer'`)
        .get() as { system_prompt: string }
      expect(row.system_prompt).toBe('我是一个 AgentHub custom agent')
    })
  })

  it('is a one-shot: a later manual edit with the old brand stays untouched', () => {
    withTempDb((sqlite) => {
      bootstrapDatabase(sqlite)
      sqlite
        .prepare(`UPDATE agents SET system_prompt = ? WHERE id = 'ag_pm'`)
        .run('你是 AgentHub 平台的 PM')
      sqlite.prepare('DELETE FROM bootstrap_migrations').run()
      bootstrapDatabase(sqlite)

      // 迁移已记录：用户之后手工把提示词改回旧品牌，不该被反复覆盖
      sqlite.prepare(`UPDATE agents SET system_prompt = ? WHERE id = 'ag_pm'`).run('手工写回 AgentHub')
      bootstrapDatabase(sqlite)

      const row = sqlite
        .prepare(`SELECT system_prompt FROM agents WHERE id = 'ag_pm'`)
        .get() as { system_prompt: string }
      expect(row.system_prompt).toBe('手工写回 AgentHub')
    })
  })
})

/**
 * 回归：模型分配必须能从「空表」自愈。
 *
 * 线上事故（2026-09-19）：09-17 弃用百炼清理供应商时把 `llm_model_assignments` 一起清空了，
 * 于是 `resolveProvider(capability)` 对任何能力都返回 null —— 提示词增强 / 团队成员「重新生成」
 * 这类走能力优先级链的功能永远只能落到本地兜底，用户看到的是「点了没变化」。
 *
 * 边界（与本用例同等重要）：**只在空表时补**。用户 / UI 配过的东西不能被迁移改写，
 * 用户后来手动清空也不能被重新塞回来。
 */
describe('default llm model assignment seed', () => {
  const MIGRATION = 'seed_default_llm_assignments_v1'

  function insertProvider(
    sqlite: Database.Database,
    row: { id: string; models?: string[]; apiKey?: string | null; connected?: boolean },
  ): void {
    const now = Date.now()
    sqlite
      .prepare(
        `INSERT OR REPLACE INTO llm_providers
           (id, provider_type, display_name, api_key, base_url, models, is_connected, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.id,
        row.id === 'ark' ? 'ark' : row.id,
        row.id,
        row.apiKey === undefined ? 'sk-test' : row.apiKey,
        'https://example.test/v1',
        JSON.stringify(row.models ?? ['deepseek-flash', 'deepseek-v4-pro']),
        row.connected === false ? 0 : 1,
        now,
        now,
      )
  }

  function readAssignments(sqlite: Database.Database) {
    return sqlite
      .prepare(
        'SELECT id, scope, capability_key, provider_id, model_name, priority, use_global FROM llm_model_assignments ORDER BY capability_key',
      )
      .all() as Array<{
      id: string
      scope: string
      capability_key: string
      provider_id: string | null
      model_name: string | null
      priority: number
      use_global: number
    }>
  }

  function hasMigration(sqlite: Database.Database): boolean {
    return Boolean(
      sqlite.prepare('SELECT 1 AS one FROM bootstrap_migrations WHERE key = ?').get(MIGRATION),
    )
  }

  it('seeds every capability onto the usable provider once one exists', () => {
    withTempDb((sqlite) => {
      bootstrapDatabase(sqlite)
      // 全新实例：还没有任何供应商 ⇒ 既不该写分配，也不该记账（否则以后补了 key 也不会再补）
      expect(readAssignments(sqlite)).toEqual([])
      expect(hasMigration(sqlite)).toBe(false)

      insertProvider(sqlite, { id: 'deepseek' })
      bootstrapDatabase(sqlite)

      const rows = readAssignments(sqlite)
      const keys = rows.map((row) => row.capability_key)
      expect(keys).toEqual([
        'agent:code',
        'agent:image',
        'agent:text',
        'agent:vision',
        'context_summary',
        'global:default',
        'global:default_provider',
        'global:fallback_provider',
        'prompt_optimize',
        'system_chat',
        'task_planning',
      ])

      for (const row of rows) {
        expect(row.provider_id).toBe('deepseek')
        expect(row.model_name).toBe('deepseek-flash')
        expect(row.priority).toBe(0)
        expect(row.use_global).toBe(0)
      }
      // scope 归类：global:* → global，系统能力 → system，agent:<模态> → agent
      expect(rows.find((row) => row.capability_key === 'global:default')?.scope).toBe('global')
      expect(rows.find((row) => row.capability_key === 'prompt_optimize')?.scope).toBe('system')
      expect(rows.find((row) => row.capability_key === 'agent:vision')?.scope).toBe('agent')
      expect(hasMigration(sqlite)).toBe(true)
    })
  })

  it('skips providers without an api key', () => {
    withTempDb((sqlite) => {
      bootstrapDatabase(sqlite)
      insertProvider(sqlite, { id: 'deepseek', apiKey: null })
      insertProvider(sqlite, { id: 'openai', apiKey: '   ' })

      bootstrapDatabase(sqlite)

      expect(readAssignments(sqlite)).toEqual([])
      expect(hasMigration(sqlite)).toBe(false)
    })
  })

  it('prefers deepseek, and a connected provider over an unconnected one', () => {
    withTempDb((sqlite) => {
      bootstrapDatabase(sqlite)
      insertProvider(sqlite, { id: 'openai', models: ['gpt-4o-mini'] })
      insertProvider(sqlite, { id: 'deepseek', connected: false })

      bootstrapDatabase(sqlite)

      const rows = readAssignments(sqlite)
      expect(rows.length).toBeGreaterThan(0)
      for (const row of rows) {
        expect(row.provider_id).toBe('deepseek')
        expect(row.model_name).toBe('deepseek-flash')
      }
    })
  })

  it('never touches an instance that already has assignments', () => {
    withTempDb((sqlite) => {
      bootstrapDatabase(sqlite)
      insertProvider(sqlite, { id: 'deepseek' })
      // 模拟用户 / UI 已经配过：只有一条，且指向别处
      sqlite
        .prepare(
          `INSERT INTO llm_model_assignments
             (id, scope, capability_key, provider_id, model_name, priority, created_at, updated_at, use_global)
           VALUES ('assign_user_made', 'system', 'prompt_optimize', 'deepseek', 'custom-model', 0, 1, 1, 0)`,
        )
        .run()

      bootstrapDatabase(sqlite)

      const rows = readAssignments(sqlite)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ id: 'assign_user_made', model_name: 'custom-model' })
      // 已配置 ⇒ 记账，但一条都不补
      expect(hasMigration(sqlite)).toBe(true)
    })
  })

  it('is a one-shot: clearing the assignments later does not resurrect them', () => {
    withTempDb((sqlite) => {
      bootstrapDatabase(sqlite)
      insertProvider(sqlite, { id: 'deepseek' })
      bootstrapDatabase(sqlite)
      expect(readAssignments(sqlite).length).toBeGreaterThan(0)

      // 用户随后在「设置 → 模型分配」里全部清空
      sqlite.prepare('DELETE FROM llm_model_assignments').run()
      bootstrapDatabase(sqlite)
      bootstrapDatabase(sqlite)

      expect(readAssignments(sqlite)).toEqual([])
    })
  })

  it('leaves the model name null when the provider lists no usable model', () => {
    withTempDb((sqlite) => {
      bootstrapDatabase(sqlite)
      insertProvider(sqlite, { id: 'deepseek', models: [] })

      bootstrapDatabase(sqlite)

      const rows = readAssignments(sqlite)
      expect(rows.length).toBeGreaterThan(0)
      for (const row of rows) {
        expect(row.provider_id).toBe('deepseek')
        // 模型名为空不是错误：route 侧有 DEFAULT_MODELS[providerType] 兜底
        expect(row.model_name).toBeNull()
      }
    })
  })
})

/**
 * 回归：存量库的内置 Agent 必须跟上「平台统一走 claude-code」的口径。
 *
 * 背景：`ensureBuiltinAgents` 见到任意内置行就整体跳过，`upgradeBuiltinAgents` 只追加
 * toolNames / systemPrompt —— 两者都不会改 `adapter_name`。所以改 seed 只影响新装实例，
 * 老库（本地库就是）会一直停在 `custom` + deepseek，与 UI 新建默认 claude-code 的口径不一致。
 */
describe('builtin agent adapter migration', () => {
  /** 把全部内置 Agent 还原成 09-17 之前的老样子。 */
  const RESTORE_LEGACY_BUILTINS = `UPDATE agents
     SET adapter_name = 'custom', model_provider = 'deepseek', model_id = 'deepseek-v4-flash'
     WHERE is_builtin = 1`

  it('upgrades builtin agents to claude-code and keeps their toolNames', () => {
    withTempDb((sqlite) => {
      bootstrapDatabase(sqlite)
      sqlite.prepare(RESTORE_LEGACY_BUILTINS).run()
      sqlite.prepare('DELETE FROM bootstrap_migrations').run()

      bootstrapDatabase(sqlite)

      const rows = sqlite
        .prepare(
          `SELECT id, adapter_name, model_provider, model_id, tool_names, is_orchestrator
           FROM agents WHERE is_builtin = 1 ORDER BY id`,
        )
        .all() as Array<{
        id: string
        adapter_name: string
        model_provider: string | null
        model_id: string | null
        tool_names: string
        is_orchestrator: number
      }>

      expect(rows).toHaveLength(5)
      for (const row of rows) {
        expect({ id: row.id, adapter: row.adapter_name }).toEqual({ id: row.id, adapter: 'claude-code' })
        expect({ id: row.id, provider: row.model_provider }).toEqual({ id: row.id, provider: null })
        // cc adapter 走 DeepSeek 的 Anthropic 兼容端点，model_id 必须仍是 DeepSeek 系
        expect({ id: row.id, model: row.model_id }).toEqual({ id: row.id, model: 'deepseek-flash' })
      }

      // toolNames 必须原样保留：cc adapter 用 `filterAgentHubMcpToolsForRun(toolNames, ...)`
      // 判断是否处于计划阶段，Orchestrator 的 plan_tasks 丢了就会失去上下文工具。
      const orchestrator = rows.find((row) => row.is_orchestrator === 1)
      expect(orchestrator?.id).toBe('ag_orchestrator')
      expect(JSON.parse(orchestrator?.tool_names ?? '[]')).toContain('plan_tasks')
    })
  })

  it('leaves user-created agents untouched', () => {
    withTempDb((sqlite) => {
      bootstrapDatabase(sqlite)
      sqlite
        .prepare(
          `INSERT INTO agents (id, name, avatar, description, capabilities, system_prompt, adapter_name,
             model_provider, model_id, tool_names, is_builtin, is_orchestrator, supports_vision, created_at)
           VALUES ('ag_user_made', '自建 Agent', '🤖', 'd', '[]', 'p', 'custom',
             'deepseek', 'deepseek-v4-flash', '[]', 0, 0, 0, ?)`,
        )
        .run(Date.now())
      sqlite.prepare(RESTORE_LEGACY_BUILTINS).run()
      sqlite.prepare('DELETE FROM bootstrap_migrations').run()

      bootstrapDatabase(sqlite)

      const row = sqlite
        .prepare(`SELECT adapter_name, model_provider, model_id FROM agents WHERE id = 'ag_user_made'`)
        .get() as { adapter_name: string; model_provider: string; model_id: string }
      expect(row).toEqual({
        adapter_name: 'custom',
        model_provider: 'deepseek',
        model_id: 'deepseek-v4-flash',
      })
    })
  })

  it('is a one-shot: a later manual edit back to custom stays untouched', () => {
    withTempDb((sqlite) => {
      bootstrapDatabase(sqlite)
      // 迁移已记账（首次 bootstrap 就写了标记）⇒ 之后手工改回 custom 不该被反复覆盖
      sqlite.prepare(`UPDATE agents SET adapter_name = 'custom' WHERE id = 'ag_pm'`).run()
      bootstrapDatabase(sqlite)

      const row = sqlite
        .prepare(`SELECT adapter_name FROM agents WHERE id = 'ag_pm'`)
        .get() as { adapter_name: string }
      expect(row.adapter_name).toBe('custom')
    })
  })
})

/**
 * 回归：已弃用供应商（阿里云百炼 `bailian`）的残留必须被清干净，且清完不留「优先级空洞」。
 *
 * 背景：弃用只删了代码、没配迁移 —— 线上是手工清的，本地库没清，于是本地的首选供应商仍是
 * `bailian`（欠费锁定，且 `ProviderType` 里已无该成员）。删完还必须保证每条能力链仍有兜底。
 */
describe('deprecated llm provider purge migration', () => {
  /** 本 describe 自带一份（外层那个 helper 定义在别的 describe 作用域里）。 */
  function insertProvider(
    sqlite: Database.Database,
    row: { id: string; models?: string[]; apiKey?: string | null },
  ): void {
    const now = Date.now()
    sqlite
      .prepare(
        `INSERT OR REPLACE INTO llm_providers
           (id, provider_type, display_name, api_key, base_url, models, is_connected, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .run(
        row.id,
        row.id,
        row.id,
        row.apiKey === undefined ? 'sk-test' : row.apiKey,
        'https://example.test/v1',
        JSON.stringify(row.models ?? ['deepseek-flash', 'deepseek-v4-pro']),
        now,
        now,
      )
  }

  function insertAssignment(
    sqlite: Database.Database,
    row: {
      id: string
      capabilityKey: string
      providerId: string
      modelName: string
      priority: number
    },
  ): void {
    const now = Date.now()
    sqlite
      .prepare(
        `INSERT INTO llm_model_assignments
           (id, scope, capability_key, provider_id, model_name, priority, created_at, updated_at, use_global)
         VALUES (?, 'system', ?, ?, ?, ?, ?, ?, 0)`,
      )
      .run(row.id, row.capabilityKey, row.providerId, row.modelName, row.priority, now, now)
  }

  it('purges bailian from all three tables and renumbers the surviving chain', () => {
    withTempDb((sqlite) => {
      bootstrapDatabase(sqlite)
      insertProvider(sqlite, { id: 'deepseek' })
      insertProvider(sqlite, { id: 'bailian', models: ['qwen3.8-flash'] })

      // 复刻本地库的形状：bailian 占 p0（欠费锁定），deepseek 在 p1 兜底
      insertAssignment(sqlite, {
        id: 'a_bailian_0',
        capabilityKey: 'system_chat',
        providerId: 'bailian',
        modelName: 'glm-5.3',
        priority: 0,
      })
      insertAssignment(sqlite, {
        id: 'a_deepseek_1',
        capabilityKey: 'system_chat',
        providerId: 'deepseek',
        modelName: 'deepseek-v4-flash',
        priority: 1,
      })
      // 一条与 bailian 无关的能力链：优先级不该被顺手改掉
      insertAssignment(sqlite, {
        id: 'a_text_5',
        capabilityKey: 'agent:text',
        providerId: 'deepseek',
        modelName: 'deepseek-flash',
        priority: 5,
      })
      sqlite
        .prepare(
          `INSERT OR REPLACE INTO llm_provider_status
             (provider_id, status, last_error_code, consecutive_failures, updated_at)
           VALUES ('bailian', 'unavailable', 'balance', 8, ?)`,
        )
        .run(Date.now())
      sqlite.prepare('DELETE FROM bootstrap_migrations').run()

      bootstrapDatabase(sqlite)

      // 供应商行 / 健康状态 / 模型分配 三处都不能再有 bailian
      const targets = [
        { table: 'llm_providers', column: 'id' },
        { table: 'llm_provider_status', column: 'provider_id' },
        { table: 'llm_model_assignments', column: 'provider_id' },
      ]
      for (const target of targets) {
        const hit = sqlite
          .prepare(`SELECT COUNT(*) AS n FROM ${target.table} WHERE ${target.column} = 'bailian'`)
          .get() as { n: number }
        expect({ table: target.table, n: hit.n }).toEqual({ table: target.table, n: 0 })
      }

      // 受影响的链：剩下的 deepseek 从 p1 压到 p0（不留空洞），兜底仍在
      const chat = sqlite
        .prepare(
          `SELECT id, priority FROM llm_model_assignments WHERE capability_key = 'system_chat' ORDER BY priority`,
        )
        .all() as Array<{ id: string; priority: number }>
      expect(chat).toEqual([{ id: 'a_deepseek_1', priority: 0 }])

      // 未受影响的能力链：优先级原样保留
      const text = sqlite
        .prepare(`SELECT id, priority FROM llm_model_assignments WHERE capability_key = 'agent:text'`)
        .all() as Array<{ id: string; priority: number }>
      expect(text).toEqual([{ id: 'a_text_5', priority: 5 }])
    })
  })

  it('is a one-shot: a later manual re-add of bailian is not purged again', () => {
    withTempDb((sqlite) => {
      bootstrapDatabase(sqlite)
      sqlite.prepare('DELETE FROM bootstrap_migrations').run()
      bootstrapDatabase(sqlite)

      // 迁移已记账：之后有人手工把 bailian 塞回来，不该被反复删（避免误删用户重建的配置）
      insertProvider(sqlite, { id: 'bailian' })
      bootstrapDatabase(sqlite)

      const hit = sqlite
        .prepare(`SELECT COUNT(*) AS n FROM llm_providers WHERE id = 'bailian'`)
        .get() as { n: number }
      expect(hit.n).toBe(1)
    })
  })

  it('never seeds default assignments onto a deprecated provider', () => {
    withTempDb((sqlite) => {
      bootstrapDatabase(sqlite)
      // bailian 已连接且带 key，比 deepseek 更「早」出现在表里 —— 仍然必须被排除，
      // 否则默认分配会写到 ProviderType 里已不存在的成员上，运行时只能是坏链。
      insertProvider(sqlite, { id: 'bailian', models: ['qwen3.8-flash'] })
      insertProvider(sqlite, { id: 'deepseek' })
      sqlite.prepare('DELETE FROM bootstrap_migrations').run()

      bootstrapDatabase(sqlite)

      const rows = sqlite
        .prepare('SELECT provider_id FROM llm_model_assignments')
        .all() as Array<{ provider_id: string | null }>
      expect(rows.length).toBeGreaterThan(0)
      for (const row of rows) {
        expect(row.provider_id).toBe('deepseek')
      }
    })
  })

  it('skips the seed entirely when only deprecated providers are usable', () => {
    withTempDb((sqlite) => {
      bootstrapDatabase(sqlite)
      insertProvider(sqlite, { id: 'bailian' })
      sqlite.prepare('DELETE FROM bootstrap_migrations').run()

      bootstrapDatabase(sqlite)

      // 没有可用供应商 ⇒ 不写分配、也**不记账**，将来配上真供应商还能自愈
      const rows = sqlite.prepare('SELECT id FROM llm_model_assignments').all()
      expect(rows).toEqual([])
      const marked = sqlite
        .prepare('SELECT 1 AS one FROM bootstrap_migrations WHERE key = ?')
        .get('seed_default_llm_assignments_v1')
      expect(marked).toBeUndefined()
    })
  })
})
