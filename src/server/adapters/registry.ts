import type { AgentRow } from '@/db/schema'
import type { AdapterName } from '@/shared/types'

import { ClaudeCodeAdapter } from './claude-code-adapter'
import { CodexAdapter } from './codex-adapter'
import { CustomAgentAdapter } from './custom-agent-adapter'
import { MockAdapter } from './mock-adapter'
import type { AgentPlatformAdapter } from './types'

/**
 * AgentRegistry — 根据 Agent.adapterName 路由到对应实现。
 *
 * Codex adapter 走 @openai/codex-sdk。
 */
class AgentRegistry {
  private adapters = new Map<AdapterName, AgentPlatformAdapter>()

  register(adapter: AgentPlatformAdapter): void {
    this.adapters.set(adapter.name, adapter)
  }

  getAdapter(agent: AgentRow): AgentPlatformAdapter {
    const adapter = this.adapters.get(agent.adapterName)
    if (!adapter) {
      throw new Error(
        `No adapter registered for "${agent.adapterName}" (agent: ${agent.name} / ${agent.id})`,
      )
    }
    return adapter
  }
}

function buildRegistry(): AgentRegistry {
  const reg = new AgentRegistry()
  reg.register(new MockAdapter())
  reg.register(new CustomAgentAdapter())
  reg.register(new ClaudeCodeAdapter())
  reg.register(new CodexAdapter())
  return reg
}

// adapter 都是无状态翻译器（SDK client 实例化 cheap），不必跨 HMR 保活。
// 每次模块加载重建，dev 添加新 adapter 自动生效。
export const agentRegistry = buildRegistry()
