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
 * 回归：线上「落地发布组」的 主图设计师（modality='image' + adapter_name='custom'）
 * 导致 t4 连续 4 次失败。运行时已由 registry 纠偏，这里补一次存储值修复，
 * 让 Agent 配置面板的显示与实际行为一致。
 */
describe('生图模态适配器的存量修复', () => {
  it('把「生图模态 + 非 image-gen 适配器」的 Agent 修正为 image-gen', () => {
    withTempDb((sqlite) => {
      bootstrapDatabase(sqlite)
      sqlite
        .prepare(
          `INSERT INTO agents
             (id, name, avatar, description, capabilities, system_prompt, adapter_name,
              model_provider, model_id, api_key, api_base_url, tool_names,
              mcp_server_ids, skill_ids, is_builtin, is_orchestrator, supports_vision,
              modality, created_at)
           VALUES
             ('ag_img_bad', '主图设计师', '🎨', '', '[]', '', 'custom',
              'deepseek', 'deepseek-v4-flash', 'sk-x', 'https://dashscope.aliyuncs.com/compatible-mode/v1',
              '["write_artifact","web_search"]', '[]', '[]', 0, 0, 1, 'image', 0)`,
        )
        .run()

      bootstrapDatabase(sqlite)

      const row = sqlite
        .prepare('SELECT adapter_name, tool_names FROM agents WHERE id = ?')
        .get('ag_img_bad') as { adapter_name: string; tool_names: string }
      expect(row.adapter_name).toBe('image-gen')
      // tool_names 与创建路径对 image-gen 的处理保持一致（不消费工具集）
      expect(row.tool_names).toBe('[]')
    })
  })

  it('修复是幂等的：再启动一次不会重复改写、也不会波及别的 Agent', () => {
    withTempDb((sqlite) => {
      bootstrapDatabase(sqlite)
      const before = sqlite
        .prepare("SELECT id, adapter_name, tool_names FROM agents WHERE modality != 'image' ORDER BY id")
        .all()

      sqlite
        .prepare(
          `INSERT INTO agents
             (id, name, avatar, description, capabilities, system_prompt, adapter_name,
              model_provider, model_id, api_key, api_base_url, tool_names,
              mcp_server_ids, skill_ids, is_builtin, is_orchestrator, supports_vision,
              modality, created_at)
           VALUES
             ('ag_img_bad2', '生图手', '🎨', '', '[]', '', 'custom',
              'deepseek', 'deepseek-v4-flash', 'sk-x', 'https://dashscope.aliyuncs.com/compatible-mode/v1',
              '["write_artifact"]', '[]', '[]', 0, 0, 1, 'image', 0)`,
        )
        .run()

      bootstrapDatabase(sqlite)
      bootstrapDatabase(sqlite)

      const after = sqlite
        .prepare("SELECT id, adapter_name, tool_names FROM agents WHERE modality != 'image' ORDER BY id")
        .all()
      expect(after).toEqual(before)
    })
  })

  it('不误伤：模态是别名（multimodal / 大小写）的 Agent 保持原样', () => {
    withTempDb((sqlite) => {
      bootstrapDatabase(sqlite)
      sqlite
        .prepare(
          `INSERT INTO agents
             (id, name, avatar, description, capabilities, system_prompt, adapter_name,
              model_provider, model_id, api_key, api_base_url, tool_names,
              mcp_server_ids, skill_ids, is_builtin, is_orchestrator, supports_vision,
              modality, created_at)
           VALUES
             ('ag_alias', '多模态助手', '🤖', '', '[]', '', 'custom',
              'deepseek', 'deepseek-v4-flash', 'sk-x', 'https://api.deepseek.com/v1',
              '["fs_read"]', '[]', '[]', 0, 0, 0, 'multimodal', 0)`,
        )
        .run()

      bootstrapDatabase(sqlite)

      const row = sqlite
        .prepare('SELECT adapter_name, tool_names FROM agents WHERE id = ?')
        .get('ag_alias') as { adapter_name: string; tool_names: string }
      // normalizeModality('multimodal') === 'vision'，与运行时判据一致，不该被改成 image-gen
      expect(row.adapter_name).toBe('custom')
      expect(row.tool_names).toBe('["fs_read"]')
    })
  })
})
