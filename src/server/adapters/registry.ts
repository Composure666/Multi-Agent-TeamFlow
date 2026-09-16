import type { AgentRow } from '@/db/schema'
import { isImageGenerationModel } from '@/lib/llm-shared'
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
 * 判据是**自有模型是不是生图模型**，不是 modality —— 决定请求协议的是模型，不是成员分类。
 *
 * 只在「生图模型 + chat 适配器」这个方向上纠偏：chat 协议打到生图端点上会被网关按模型名
 * 路由到生图处理器，回 `Input should be 'user': input.messages.0.role`，而且这个错属于
 * 业务错、**不触发降级** → run 在 0.3s 内猝死、每次重试报错逐字相同。
 *
 * 反方向（image-gen 适配器 + 非生图模型）同样必然失败（chat 模型打原生
 * multimodal-generation 端点得 HTTP 400「url error」），但**这里刻意不纠偏**：
 * `isImageGenerationModel` 认不出陌生的生图模型名时会返回 false，若据此把用户显式选的
 * image-gen 改写成 custom，会把一个本来正确的配置改坏。反方向的存量数据由
 * bootstrap 的 `repairImageModalityAdapters` 一次性修（那里只动存储值，不猜运行时）。
 */
export function resolveEffectiveAdapterName(agent: AgentRow): AdapterName {
  if (agent.adapterName !== 'image-gen' && isImageGenerationModel(agent.modelId)) {
    console.warn(
      `[agent-registry] Agent "${agent.name}" (${agent.id}) 的模型 "${agent.modelId}" 是生图模型，` +
        `却挂了 "${agent.adapterName}" 适配器，已自动改走 image-gen（chat 协议调用生图模型会被网关拒绝）。`,
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
