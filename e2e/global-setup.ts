import { mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'

import Database from 'better-sqlite3'

import { bootstrapDatabase } from '../src/db/bootstrap'

const E2E_DATA_DIR = path.resolve('.agenthub-data-e2e')

/**
 * E2E 全局准备：建一个隔离的测试库（不碰真实 .agenthub-data），
 * 自动建表 + seed 内置 agent，并插入一个 mock adapter 测试 agent。
 *
 * mock agent 只能直接写 DB —— 创建 agent 的 API（zod）禁止 adapter_name='mock'。
 * better-sqlite3 须为当前 Node ABI（e2e 脚本前置 ensure-node-sqlite 保证）。
 */
export default function globalSetup() {
  rmSync(E2E_DATA_DIR, { recursive: true, force: true })
  mkdirSync(path.join(E2E_DATA_DIR, 'workspaces'), { recursive: true })

  const sqlite = new Database(path.join(E2E_DATA_DIR, 'agenthub.db'))
  try {
    bootstrapDatabase(sqlite)
    sqlite
      .prepare(
        `INSERT INTO agents (
           id, name, avatar, description, capabilities, system_prompt,
           adapter_name, model_provider, model_id, api_key, api_base_url,
           tool_names, is_builtin, is_orchestrator, supports_vision, created_at
         ) VALUES (
           @id, @name, @avatar, @description, @capabilities, @system_prompt,
           @adapter_name, @model_provider, @model_id, @api_key, @api_base_url,
           @tool_names, @is_builtin, @is_orchestrator, @supports_vision, @created_at
         )`,
      )
      .run({
        id: 'ag_e2e_mock',
        name: 'E2E Mock',
        avatar: '🤖',
        description: 'E2E 测试专用 mock agent（确定性脚本回复，不调真实 LLM）',
        capabilities: JSON.stringify(['test']),
        system_prompt: 'mock',
        adapter_name: 'mock',
        model_provider: null,
        model_id: null,
        api_key: null,
        api_base_url: null,
        tool_names: JSON.stringify([]),
        is_builtin: 0,
        is_orchestrator: 0,
        supports_vision: 0,
        created_at: Date.now(),
      })
  } finally {
    sqlite.close()
  }
}
