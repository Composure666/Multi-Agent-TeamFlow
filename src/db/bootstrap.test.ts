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
 * 回归：适配器必须与自有模型的**协议**匹配，判据是「模型是不是生图模型」而不是 modality。
 *
 * 两个方向都要修：
 *  ① 生图模型 + 非 image-gen 适配器 → image-gen（chat 请求打到生图模型上会被网关拒，
 *     且该 400 不触发降级 → run 在 0.3s 内猝死）；
 *  ② image-gen 适配器 + 非生图模型 → custom **并回填视觉生产工具集**
 *     （这条修的是 2026-09-16 那版旧不变式造成的倒退：生图师 / 视觉设计师 / 图表设计师 /
 *      主图设计师 原本是「chat 模型 + 工具循环」，靠 bash / fs_write / write_artifact
 *      自己产 SVG 图或调外部生图服务，被一刀切清空工具后只剩「调一个端点出一张图」。）
 */
describe('存量 Agent 的适配器修复与能力补齐', () => {
  const insertAgent = (
    sqlite: Database.Database,
    id: string,
    adapterName: string,
    modelId: string,
    toolNames: string,
    modality = 'image',
  ) => {
    sqlite
      .prepare(
        `INSERT INTO agents
           (id, name, avatar, description, capabilities, system_prompt, adapter_name,
            model_provider, model_id, api_key, api_base_url, tool_names,
            mcp_server_ids, skill_ids, is_builtin, is_orchestrator, supports_vision,
            modality, created_at)
         VALUES
           (?, ?, '🎨', '', '[]', '', ?,
            'deepseek', ?, 'sk-x', 'https://api.deepseek.com/v1',
            ?, '[]', '[]', 0, 0, 1, ?, 0)`,
      )
      .run(id, id, adapterName, modelId, toolNames, modality)
  }

  it('① 生图模型挂了 chat 适配器 → 修正为 image-gen，并清空工具集', () => {
    withTempDb((sqlite) => {
      bootstrapDatabase(sqlite)
      insertAgent(sqlite, 'ag_img_bad', 'custom', 'z-image-turbo', '["write_artifact","web_search"]')

      bootstrapDatabase(sqlite)

      const row = sqlite
        .prepare('SELECT adapter_name, tool_names FROM agents WHERE id = ?')
        .get('ag_img_bad') as { adapter_name: string; tool_names: string }
      expect(row.adapter_name).toBe('image-gen')
      // 生图适配器没有工具循环，工具留着只会在配置页制造「这成员能用工具」的假象
      expect(row.tool_names).toBe('[]')
    })
  })

  it('② image-gen 适配器挂了 chat 模型 → 改回 custom，并回填视觉生产工具集', () => {
    withTempDb((sqlite) => {
      bootstrapDatabase(sqlite)
      insertAgent(sqlite, 'ag_visual_broken', 'image-gen', 'deepseek-v4-flash', '[]')

      bootstrapDatabase(sqlite)

      const row = sqlite
        .prepare('SELECT adapter_name, tool_names FROM agents WHERE id = ?')
        .get('ag_visual_broken') as { adapter_name: string; tool_names: string }
      expect(row.adapter_name).toBe('custom')
      const tools = JSON.parse(row.tool_names) as string[]
      // 出图靠工具循环，这三件缺一不可（历史上分别对应：写 SVG 图 / 写脚本 / 跑脚本）
      expect(tools).toContain('write_artifact')
      expect(tools).toContain('fs_write')
      expect(tools).toContain('bash')
      // 内嵌联网工具一并补齐，与运行时兜底注入的口径一致
      expect(tools).toContain('web_search')
      expect(tools).toContain('web_fetch')
    })
  })

  it('② 只回填「工具集为空」的成员，不覆盖用户自己配过的工具集', () => {
    withTempDb((sqlite) => {
      bootstrapDatabase(sqlite)
      insertAgent(sqlite, 'ag_visual_configured', 'image-gen', 'qwen3.8-flash', '["fs_read"]')

      bootstrapDatabase(sqlite)

      const row = sqlite
        .prepare('SELECT adapter_name, tool_names FROM agents WHERE id = ?')
        .get('ag_visual_configured') as { adapter_name: string; tool_names: string }
      expect(row.adapter_name).toBe('custom')
      const tools = JSON.parse(row.tool_names) as string[]
      // 用户配过的那一个原样保留（不被视觉工具集整体替换）……
      expect(tools).toContain('fs_read')
      expect(tools).not.toContain('write_artifact')
      expect(tools).not.toContain('bash')
      // ……只追加了按需生图工具（③ 的职责，只增不删）
      expect(tools).toEqual(['fs_read', 'image_generate'])
    })
  })

  it('③ 生图模态成员缺 image_generate → 补上（只增不删，且幂等）', () => {
    withTempDb((sqlite) => {
      bootstrapDatabase(sqlite)
      insertAgent(sqlite, 'ag_visual_tools', 'custom', 'deepseek-v4-flash', '["write_artifact","bash"]')

      bootstrapDatabase(sqlite)

      const read = () =>
        (
          sqlite
            .prepare('SELECT tool_names FROM agents WHERE id = ?')
            .get('ag_visual_tools') as { tool_names: string }
        ).tool_names
      expect(JSON.parse(read())).toEqual(['write_artifact', 'bash', 'image_generate'])

      bootstrapDatabase(sqlite)
      expect(JSON.parse(read())).toEqual(['write_artifact', 'bash', 'image_generate'])
    })
  })

  it('③ 不动非生图模态的成员', () => {
    withTempDb((sqlite) => {
      bootstrapDatabase(sqlite)
      insertAgent(sqlite, 'ag_text_tools', 'custom', 'deepseek-v4-flash', '["fs_read"]', 'text')

      bootstrapDatabase(sqlite)

      const row = sqlite
        .prepare('SELECT tool_names FROM agents WHERE id = ?')
        .get('ag_text_tools') as { tool_names: string }
      expect(row.tool_names).toBe('["fs_read"]')
    })
  })

  it('③ 与 ① 不打架：已被改成 image-gen 的成员不会被补回工具', () => {
    withTempDb((sqlite) => {
      bootstrapDatabase(sqlite)
      // 生图模型 + custom → ① 会改成 image-gen 并清空工具集；③ 只针对 custom 适配器，
      // 不能在清空之后又把 image_generate 塞回去（那会让配置页再次出现「能用工具」的假象）。
      insertAgent(sqlite, 'ag_img_only', 'custom', 'z-image-turbo', '["fs_read"]')

      bootstrapDatabase(sqlite)

      const row = sqlite
        .prepare('SELECT adapter_name, tool_names FROM agents WHERE id = ?')
        .get('ag_img_only') as { adapter_name: string; tool_names: string }
      expect(row.adapter_name).toBe('image-gen')
      expect(row.tool_names).toBe('[]')
    })
  })

  it('修复是幂等的：再启动一次不会重复改写', () => {
    withTempDb((sqlite) => {
      bootstrapDatabase(sqlite)
      insertAgent(sqlite, 'ag_img_bad2', 'custom', 'z-image-turbo', '[]')
      insertAgent(sqlite, 'ag_visual_broken2', 'image-gen', 'deepseek-v4-flash', '[]')

      bootstrapDatabase(sqlite)
      const first = sqlite
        .prepare('SELECT id, adapter_name, tool_names FROM agents ORDER BY id')
        .all() as Array<{ id: string; adapter_name: string; tool_names: string }>
      bootstrapDatabase(sqlite)
      const second = sqlite
        .prepare('SELECT id, adapter_name, tool_names FROM agents ORDER BY id')
        .all()
      expect(second).toEqual(first)

      // 顺带确认两个方向都真的发生了修复
      const byId = new Map(first.map((r) => [r.id, r]))
      expect(byId.get('ag_img_bad2')?.adapter_name).toBe('image-gen')
      expect(byId.get('ag_visual_broken2')?.adapter_name).toBe('custom')
    })
  })

  it('不误伤：chat 模型 + custom 适配器（模态取别名）的 Agent 保持原样', () => {
    withTempDb((sqlite) => {
      bootstrapDatabase(sqlite)
      insertAgent(sqlite, 'ag_alias', 'custom', 'deepseek-v4-flash', '["fs_read"]', 'multimodal')

      bootstrapDatabase(sqlite)

      const row = sqlite
        .prepare('SELECT adapter_name, tool_names FROM agents WHERE id = ?')
        .get('ag_alias') as { adapter_name: string; tool_names: string }
      // 两个方向都不匹配（模型是 chat、适配器是 custom），不该被动
      expect(row.adapter_name).toBe('custom')
      expect(row.tool_names).toBe('["fs_read"]')
    })
  })
})
