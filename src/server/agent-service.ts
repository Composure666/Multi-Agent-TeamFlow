import { and, desc, eq } from 'drizzle-orm'

import { db, schema } from '@/db/client'
import { BUILTIN_PROVIDER_IDS, normalizeModality, shouldUseImageGenAdapter } from '@/lib/llm-shared'
import { newAgentId } from '@/server/ids'
import { resolveProviderCredentialsForAgent } from '@/server/provider-service'
import {
  validateOpenAICompatibleApiKey,
  validateOpenAICompatibleBaseUrl,
} from '@/shared/openai-compatible'
import type { AdapterName, ModelProvider } from '@/shared/types'

/**
 * 用户自建 Agent 的服务。
 *
 * 自建 Agent 默认走 adapterName='custom'，也可选择 Claude Code / Codex SDK adapter。
 * 内置 Agent (isBuiltin=true) 不可被删除或修改。
 */

export interface CreateAgentArgs {
  name: string
  avatar: string
  description: string
  capabilities: string[]
  systemPrompt: string
  /** 'custom' (默认) | 'claude-code' | 'codex' | 'image-gen' */
  adapterName?: AdapterName
  /** custom: required；SDK adapter: 忽略（可不传） */
  modelProvider?: ModelProvider
  /** custom: required；SDK adapter: 可选，默认 SDK 默认模型 */
  modelId?: string
  /** SDK adapter 忽略此字段（SDK 内置工具集，不走 toolRegistry）*/
  toolNames: string[]
  /** 外部 MCP server opt-in，SDK adapter 首阶段消费；custom 暂不消费 */
  mcpServerIds?: string[]
  /** 本地 Skills opt-in，运行时作为 prompt section 注入 */
  skillIds?: string[]
  supportsVision?: boolean
  modality?: string
  apiKey?: string | null
  /** 自定义 API base URL。Claude/Codex 对 endpoint 协议兼容性要求不同；NULL 走默认 */
  apiBaseUrl?: string | null
}

export async function createCustomAgent(args: CreateAgentArgs) {
  const id = newAgentId()
  const createdAt = Date.now()
  const modality = normalizeModality(args.modality)
  // 适配器由**自有模型**决定，不由 modality 决定 —— 决定请求协议的是模型，不是成员分类。
  //
  // 「生图模型 + custom（chat）适配器」是一个**必然失败**的组合：modality 是 image 时
  // AgentRunner 会按 `agent:image` 解析降级链，链上是**生图模型**；chat 适配器发的却是
  // chat completions（system + user messages），网关按模型名把它路由到生图处理器后
  // 直接 400 `Input should be 'user': input.messages.0.role`。400 属业务错、不触发降级，
  // 于是整个 run 在 0.3s 内猝死，且每次重试报错逐字相同。
  //
  // 反过来「chat 模型 + image-gen 适配器」同样必然失败（chat 模型打到原生
  // multimodal-generation 端点得 HTTP 400「url error」），所以这里明确拒绝而不是静默改写。
  //
  // ⚠️ 不要退回「modality === 'image' ⇒ image-gen」：那会把「chat 模型 + 工具循环」的视觉生产
  // 成员（生图师 / 视觉设计师 / 图表设计师 / 主图设计师）连工具一起改掉 —— 它们原本靠
  // bash / fs_write / write_artifact 自己产 SVG 图或调外部生图服务（详见 docs/model-assignment.md
  // 与 2026-09-16 的事故记录）。
  const requestedAdapter: AdapterName = args.adapterName ?? 'custom'
  if (requestedAdapter === 'image-gen' && !shouldUseImageGenAdapter(args.modelId)) {
    throw new Error(
      `生图适配器需要生图模型，但当前模型是 "${args.modelId || '(空)'}"。` +
        '修法二选一：① 改用 custom 适配器（chat 模型 + 工具循环，成员可以自己产 SVG 图或调用生图服务）；' +
        '② 把模型换成生图模型（如 z-image-turbo / qwen-image-3.0-pro / flux-1-dev）。',
    )
  }
  const adapterName: AdapterName = shouldUseImageGenAdapter(args.modelId) ? 'image-gen' : requestedAdapter

  // 「设置-模型分配」里只存 (供应商, 模型名)，凭证在供应商中心。这里把凭证补进 Agent，
  // 否则「按模态自动匹配模型」创建出来的 Agent 会带着空 key 去跑，直到第一次对话才报缺 Key。
  const credentials = await resolveProviderCredentialsForAgent({
    modelProvider: args.modelProvider ?? null,
    modelId: args.modelId ?? null,
    apiBaseUrl: args.apiBaseUrl ?? null,
  })
  const apiKey = args.apiKey?.trim() || credentials?.apiKey || null
  const apiBaseUrl =
    args.apiBaseUrl?.trim() ||
    (adapterName === 'image-gen' || !isBuiltinProviderId(credentials?.providerId)
      ? credentials?.apiBaseUrl ?? null
      : null)

  if (adapterName === 'custom') {
    if (!args.modelProvider || !args.modelId) {
      throw new Error('Custom adapter requires modelProvider and modelId')
    }
    const baseUrlError = validateOpenAICompatibleBaseUrl(args.modelProvider, apiBaseUrl)
    if (baseUrlError) throw new Error(baseUrlError)
    const apiKeyError = validateOpenAICompatibleApiKey(args.modelProvider, apiKey)
    if (apiKeyError) throw new Error(apiKeyError)
  }
  if (adapterName === 'image-gen') {
    if (!apiKey) {
      throw new Error(
        '生图适配器需要 API Key：请在「设置 - 模型分配」里给「生图 Agent」选择已配置的供应商，或在该 Agent 上单独填写 API Key。',
      )
    }
    if (!apiBaseUrl) {
      throw new Error(
        '生图适配器需要 API Base URL：请在「设置 - 供应商」里为对应供应商填写 Base URL 后重新创建。',
      )
    }
    if (!args.modelId) throw new Error('Image-gen adapter requires modelId')
  }

  const row = {
    id,
    name: args.name.trim(),
    avatar: args.avatar.trim() || '🤖',
    description: args.description.trim(),
    capabilities: args.capabilities,
    systemPrompt: args.systemPrompt,
    adapterName,
    modelProvider: adapterName === 'custom' || adapterName === 'image-gen' ? (args.modelProvider ?? (adapterName === 'image-gen' ? 'openai-compatible' : null)) : null,
    modelId: args.modelId ?? null,
    apiKey,
    apiBaseUrl,
    // SDK adapter 走各自内置工具集，不消费 toolNames；强制空数组避免 UI 残留
    toolNames: adapterName === 'custom' ? args.toolNames : [],
    mcpServerIds: args.mcpServerIds ?? [],
    skillIds: args.skillIds ?? [],
    isBuiltin: false,
    isOrchestrator: false,
    supportsVision: args.supportsVision ?? false,
    modality,
    createdAt,
  }

  await db.insert(schema.agents).values(row)
  return row
}

function isBuiltinProviderId(providerId: string | null | undefined): boolean {
  return !!providerId && BUILTIN_PROVIDER_IDS.includes(providerId)
}

export async function deleteCustomAgent(agentId: string): Promise<void> {
  // 防止误删内置
  const agent = await db.query.agents.findFirst({
    where: eq(schema.agents.id, agentId),
  })
  if (!agent) throw new Error(`Agent not found: ${agentId}`)
  if (agent.isBuiltin) throw new Error('Built-in agents cannot be deleted')

  const deleted = await db
    .delete(schema.agents)
    .where(and(eq(schema.agents.id, agentId), eq(schema.agents.isBuiltin, false)))
    .returning({ id: schema.agents.id })

  if (deleted.length === 0) {
    throw new Error(`Failed to delete agent: ${agentId}`)
  }
}

export interface UpdateAgentPatch {
  name?: string
  description?: string
  capabilities?: string[]
  systemPrompt?: string
  adapterName?: AdapterName
  modelProvider?: ModelProvider
  modelId?: string | null
  toolNames?: string[]
  mcpServerIds?: string[]
  skillIds?: string[]
  supportsVision?: boolean
  /** 模态分类；归一化到 code / text / vision / image 四类后落库 */
  modality?: string
  /** 传 null 显式清除自定义 key（fallback 回 env）；undefined 表示不动 */
  apiKey?: string | null
  /** 传 null 显式清除自定义 base URL；undefined 表示不动 */
  apiBaseUrl?: string | null
}

export async function updateCustomAgent(agentId: string, patch: UpdateAgentPatch) {
  const agent = await db.query.agents.findFirst({
    where: eq(schema.agents.id, agentId),
  })
  if (!agent) throw new Error(`Agent not found: ${agentId}`)
  // 内建 agent 允许修改配置（API key / system prompt / model 等），但删除仍受保护

  const updates: Record<string, unknown> = {}
  // 与创建路径同一条不变式：适配器由**自有模型**决定，不由 modality 决定（理由见 createCustomAgent）。
  //
  // 三种情况：
  //  - 模型是生图模型            → image-gen（无论此前/此处填的是什么适配器）
  //  - 模型不是生图模型 + 显式请求 image-gen → 报错（这是必然失败的组合，不静默改写用户的选择）
  //  - 其余                      → 沿用请求值；若原值是 image-gen（换模型换走了）则回落到 custom
  //
  // modality 字段本身**不参与**这个判断，也不跟着适配器一起改：它只是成员分类标签
  // （bootstrap 的双向修复同样只动 adapter_name / tool_names）。改了适配器不等于要改标签。
  const nextModelProvider = patch.modelProvider ?? agent.modelProvider
  const nextModelId = patch.modelId ?? agent.modelId
  const requestedAdapter: AdapterName = patch.adapterName ?? agent.adapterName
  let nextAdapterName: AdapterName
  if (shouldUseImageGenAdapter(nextModelId)) {
    nextAdapterName = 'image-gen'
  } else if (requestedAdapter === 'image-gen') {
    if (patch.adapterName === 'image-gen') {
      throw new Error(
        `生图适配器需要生图模型，但当前模型是 "${nextModelId || '(空)'}"。` +
          '修法二选一：① 改用 custom 适配器（chat 模型 + 工具循环）；' +
          '② 把模型换成生图模型（如 z-image-turbo / qwen-image-3.0-pro / flux-1-dev）。',
      )
    }
    nextAdapterName = 'custom'
  } else {
    nextAdapterName = requestedAdapter
  }
  let nextApiBaseUrl =
    patch.apiBaseUrl !== undefined ? patch.apiBaseUrl?.trim() || null : agent.apiBaseUrl
  let nextApiKey = patch.apiKey !== undefined ? patch.apiKey?.trim() || null : agent.apiKey

  // 换了模型/供应商但没带凭证时，从供应商中心补一次（与创建路径同一条规则）
  if ((nextAdapterName === 'custom' || nextAdapterName === 'image-gen') && (!nextApiKey || !nextApiBaseUrl)) {
    const credentials = await resolveProviderCredentialsForAgent({
      modelProvider: nextModelProvider,
      modelId: nextModelId,
      apiBaseUrl: nextApiBaseUrl,
    })
    if (!nextApiKey) nextApiKey = credentials?.apiKey ?? null
    if (!nextApiBaseUrl) {
      nextApiBaseUrl =
        nextAdapterName === 'image-gen' || !isBuiltinProviderId(credentials?.providerId)
          ? credentials?.apiBaseUrl ?? null
          : null
    }
  }

  if (nextAdapterName === 'custom' && (!nextModelProvider || !nextModelId)) {
    throw new Error('Custom adapter requires modelProvider and modelId')
  }
  if (nextAdapterName === 'image-gen') {
    if (!nextApiKey) throw new Error('Image-gen adapter requires apiKey')
    if (!nextApiBaseUrl) throw new Error('Image-gen adapter requires apiBaseUrl')
    if (!nextModelId) throw new Error('Image-gen adapter requires modelId')
  }
  if (nextAdapterName === 'custom') {
    const baseUrlError = validateOpenAICompatibleBaseUrl(nextModelProvider, nextApiBaseUrl)
    if (baseUrlError) throw new Error(baseUrlError)
    const apiKeyError = validateOpenAICompatibleApiKey(nextModelProvider, nextApiKey)
    if (apiKeyError) throw new Error(apiKeyError)
  }

  if (patch.name !== undefined) updates.name = patch.name.trim()
  if (patch.description !== undefined) updates.description = patch.description.trim()
  if (patch.capabilities !== undefined) updates.capabilities = patch.capabilities
  if (patch.systemPrompt !== undefined) updates.systemPrompt = patch.systemPrompt
  if (patch.adapterName !== undefined || nextAdapterName !== agent.adapterName) {
    updates.adapterName = nextAdapterName
  }
  if (patch.modelId !== undefined) updates.modelId = patch.modelId?.trim() || null
  if (patch.supportsVision !== undefined) updates.supportsVision = patch.supportsVision
  if (patch.modality !== undefined) updates.modality = normalizeModality(patch.modality)
  if (patch.mcpServerIds !== undefined) updates.mcpServerIds = patch.mcpServerIds
  if (patch.skillIds !== undefined) updates.skillIds = patch.skillIds
  if (patch.apiKey !== undefined || nextApiKey !== agent.apiKey) updates.apiKey = nextApiKey
  if (patch.apiBaseUrl !== undefined || nextApiBaseUrl !== agent.apiBaseUrl) {
    updates.apiBaseUrl = nextApiBaseUrl
  }

  if (nextAdapterName === 'custom' || nextAdapterName === 'image-gen') {
    if (patch.modelProvider !== undefined) updates.modelProvider = patch.modelProvider
    if (nextAdapterName === 'image-gen' && patch.modelProvider === undefined) updates.modelProvider = 'openai-compatible'
    if (patch.toolNames !== undefined && nextAdapterName === 'custom') updates.toolNames = patch.toolNames
  } else {
    // SDK adapter 走各自内置工具集，不消费 modelProvider/toolNames。
    if (patch.adapterName !== undefined && patch.modelId === undefined) {
      updates.modelId = null
    }
    if (
      patch.adapterName !== undefined ||
      patch.modelProvider !== undefined ||
      patch.toolNames !== undefined
    ) {
      updates.modelProvider = null
      updates.toolNames = []
    }
  }

  if (Object.keys(updates).length === 0) return agent

  await db.update(schema.agents).set(updates).where(eq(schema.agents.id, agentId))

  const updated = await db.query.agents.findFirst({ where: eq(schema.agents.id, agentId) })
  if (!updated) throw new Error('Update succeeded but row missing afterwards')
  return updated
}

export async function configureAgentTool(
  agentId: string,
  input: { action: 'attach' | 'detach'; kind: 'skill' | 'mcp_server'; id: string },
) {
  const agent = await db.query.agents.findFirst({ where: eq(schema.agents.id, agentId) })
  if (!agent) throw new Error(`Agent not found: ${agentId}`)

  if (input.kind === 'skill') {
    const skill = await db.query.skills.findFirst({ where: eq(schema.skills.id, input.id) })
    if (!skill) throw new Error(`Skill not found: ${input.id}`)
    if (!skill.enabled && input.action === 'attach') throw new Error(`Skill is disabled: ${input.id}`)
    return updateCustomAgent(agentId, {
      skillIds: updateIdList(agent.skillIds, input.id, input.action),
    })
  }

  const server = await db.query.mcpServers.findFirst({ where: eq(schema.mcpServers.id, input.id) })
  if (!server) throw new Error(`MCP server not found: ${input.id}`)
  if (!server.enabled && input.action === 'attach') throw new Error(`MCP server is disabled: ${input.id}`)
  if (input.action === 'attach') {
    if (agent.adapterName === 'custom' || agent.adapterName === 'mock') {
      throw new Error(`External MCP is not supported by ${agent.adapterName} agents`)
    }
    if (agent.adapterName === 'codex' && server.trust !== 'always') {
      throw new Error('Codex agents can only attach MCP servers with trust=always')
    }
  }

  return updateCustomAgent(agentId, {
    mcpServerIds: updateIdList(agent.mcpServerIds, input.id, input.action),
  })
}

function updateIdList(ids: string[], id: string, action: 'attach' | 'detach'): string[] {
  if (action === 'detach') return ids.filter((item) => item !== id)
  return ids.includes(id) ? ids : [...ids, id]
}

export async function listAgentsOrdered() {
  // 内置在前，按 createdAt desc
  return db.query.agents.findMany({
    orderBy: [desc(schema.agents.isBuiltin), desc(schema.agents.createdAt)],
  })
}
