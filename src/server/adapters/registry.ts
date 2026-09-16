import type { AgentRow } from '@/db/schema'
import { normalizeModality } from '@/lib/llm-shared'
import type { AdapterName } from '@/shared/types'

import { ClaudeCodeAdapter } from './claude-code-adapter'
import { CodexAdapter } from './codex-adapter'
import { CustomAgentAdapter } from './custom-agent-adapter'
import { ImageGenAdapter } from './image-gen-adapter'
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
    const effectiveName = resolveEffectiveAdapterName(agent)
    const adapter = this.adapters.get(effectiveName)
    if (!adapter) {
      throw new Error(
        `No adapter registered for "${effectiveName}" (agent: ${agent.name} / ${agent.id})`,
      )
    }
    return adapter
  }
}

/**
 * 解析 Agent 实际应该使用的适配器名（运行时纠偏）。
 *
 * 生图模态（`modality='image'`）必须走 ImageGenAdapter：只有它会调生图端点并落地图片产物。
 * 「生图模态 + custom（chat）适配器」会让 chat 请求打到生图模型上，被网关按模型路由后
 * 400 拒绝（`input.messages` 校验失败），且 400 不触发降级 → run 秒挂、每次报错完全相同。
 *
 * 这里做一次运行时纠偏，让**存量数据**（本次改动之前建的 Agent）不迁移也能恢复；
 * 新建 / 编辑路径已由 agent-service 强制同一不变式，bootstrap 也会修一次存储值。
 */
export function resolveEffectiveAdapterName(agent: AgentRow): AdapterName {
  if (normalizeModality(agent.modality) === 'image' && agent.adapterName !== 'image-gen') {
    console.warn(
      `[agent-registry] Agent "${agent.name}" (${agent.id}) 是生图模态却挂了 "${agent.adapterName}" ` +
        '适配器，已自动改走 image-gen（chat 适配器调用生图模型会被网关拒绝）。',
    )
    return 'image-gen'
  }
  return agent.adapterName
}

function buildRegistry(): AgentRegistry {
  const reg = new AgentRegistry()
  reg.register(new MockAdapter())
  reg.register(new CustomAgentAdapter())
  reg.register(new ImageGenAdapter())
  reg.register(new ClaudeCodeAdapter())
  reg.register(new CodexAdapter())
  return reg
}

// adapter 都是无状态翻译器（SDK client 实例化 cheap），不必跨 HMR 保活。
// 每次模块加载重建，dev 添加新 adapter 自动生效。
export const agentRegistry = buildRegistry()
