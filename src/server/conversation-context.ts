import { and, desc, eq, gt, inArray, ne } from 'drizzle-orm'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'

import { db, schema } from '@/db/client'
import type { AgentRow, ArtifactRow, MessageRow } from '@/db/schema'
import { estimateTokens } from '@/shared/model-registry'
import type { DeployStatusRecord, MessagePart } from '@/shared/types'

import {
  getLatestContextSummary,
  renderConversationSummaryBlock,
} from './context-compaction-service'

/**
 * 把 conversation messages 序列化成 OpenAI ChatMessage 数组，给 CustomAgentAdapter 拼到
 * [system, ...history, currentUser] 中间，让 agent 跨 run 记住上下文。
 *
 * 详细规格见 specs/13-conversation-context.md。
 */

export interface BuildHistoryOptions {
  /** 取最近多少条 messages（不含 pinned）。默认 20。 */
  maxTurns?: number
  /** 是否注入 pinned messages。默认 true。 */
  includePinned?: boolean
  /** 当前触发消息 id；它不应进入历史（避免重复）。 */
  excludeMessageId?: string
  /**
   * history 的 token 预算上限（仅本字段，不含 system / currentUser）。
   * undefined 表示不做 token 截断，只按 maxTurns 截。详见 spec 13 「Token 预算」节。
   * pinned 永远不被截断（即便整体超 budget）。
   */
  tokenBudget?: number
}

const DEFAULT_MAX_TURNS = 20

export async function buildHistoryFor(
  agentId: string,
  conversationId: string,
  options: BuildHistoryOptions = {},
): Promise<ChatCompletionMessageParam[]> {
  const maxTurns = options.maxTurns ?? DEFAULT_MAX_TURNS
  const includePinned = options.includePinned ?? true
  const excludeMessageId = options.excludeMessageId
  const tokenBudget = options.tokenBudget
  const latestSummary = await getLatestContextSummary(conversationId)

  // 拉最近 N 条 complete 消息（按时间逆序取，下面再翻回正序）
  const recentWhereClauses = [
    eq(schema.messages.conversationId, conversationId),
    eq(schema.messages.status, 'complete'),
  ]
  if (excludeMessageId) recentWhereClauses.push(ne(schema.messages.id, excludeMessageId))
  if (latestSummary) {
    recentWhereClauses.push(
      gt(schema.messages.createdAt, latestSummary.coveredUntilCreatedAt),
    )
  }
  const recentWhere = and(...recentWhereClauses)

  const recent = await db
    .select()
    .from(schema.messages)
    .where(recentWhere)
    .orderBy(desc(schema.messages.createdAt))
    .limit(maxTurns)

  // 始终拉 conversation 用于 pinned ids + agentIds（agent 名字 map 给 Phase C 跨 agent 渲染用）
  const conv = await db.query.conversations.findFirst({
    where: eq(schema.conversations.id, conversationId),
  })

  // pinned 消息：可能在最近 N 条之外，单独拉
  let pinned: MessageRow[] = []
  let pinnedIdSet = new Set<string>()
  if (includePinned) {
    const pinnedIds = (conv?.pinnedMessageIds ?? []).filter((id) => id !== excludeMessageId)
    if (pinnedIds.length > 0) {
      pinned = await db
        .select()
        .from(schema.messages)
        .where(
          and(
            inArray(schema.messages.id, pinnedIds),
            eq(schema.messages.status, 'complete'),
          ),
        )
      pinnedIdSet = new Set(pinned.map((p) => p.id))
    }
  }

  // agent 名字 map：Phase C 群聊里把别 agent 的消息渲染成 [名字]: text 的 user 消息时要用
  const agentNames = new Map<string, string>()
  if (conv && conv.agentIds.length > 1) {
    const rows = await db
      .select({ id: schema.agents.id, name: schema.agents.name })
      .from(schema.agents)
      .where(inArray(schema.agents.id, conv.agentIds))
    for (const r of rows as Pick<AgentRow, 'id' | 'name'>[]) {
      agentNames.set(r.id, r.name)
    }
  }

  // 合并去重，按时间升序
  const byId = new Map<string, MessageRow>()
  for (const m of recent) byId.set(m.id, m)
  for (const m of pinned) byId.set(m.id, m)
  const merged = Array.from(byId.values()).sort((a, b) => a.createdAt - b.createdAt)

  // 批量取 artifact title 给 artifact_ref 折叠用
  const artifactIds = collectArtifactIds(merged)
  const artifactTitles = await loadArtifactTitles(artifactIds)

  // 先序列化全量，再按 token 预算从老往新丢非 pinned 项
  const items: Array<{
    msgId: string
    isPinned: boolean
    serialized: ChatCompletionMessageParam[]
    tokens: number
  }> = []
  if (latestSummary) {
    const summaryMessage: ChatCompletionMessageParam = {
      role: 'user',
      content: renderConversationSummaryBlock(latestSummary),
    }
    items.push({
      msgId: latestSummary.id,
      isPinned: true,
      serialized: [summaryMessage],
      tokens: estimateChatMessageTokens(summaryMessage),
    })
  }
  for (const msg of merged) {
    const serialized = serializeMessage(msg, agentId, artifactTitles, agentNames)
    if (!serialized) continue
    const tokens = serialized.reduce((sum, m) => sum + estimateChatMessageTokens(m), 0)
    items.push({ msgId: msg.id, isPinned: pinnedIdSet.has(msg.id), serialized, tokens })
  }

  if (tokenBudget !== undefined && tokenBudget > 0) {
    let total = items.reduce((s, it) => s + it.tokens, 0)
    // 超预算时，从老到新（按 items 顺序）丢非 pinned，直到符合预算
    for (let i = 0; i < items.length && total > tokenBudget; i++) {
      if (items[i].isPinned) continue
      total -= items[i].tokens
      items[i].tokens = -1 // 标记丢弃；保留 isPinned/order 但稍后过滤
    }
  }

  const out: ChatCompletionMessageParam[] = []
  for (const it of items) {
    if (it.tokens < 0) continue
    out.push(...it.serialized)
  }
  return out
}

// ─── token 估算（粗粒度，4 字符≈1 token） ─────────────────

function estimateChatMessageTokens(m: ChatCompletionMessageParam): number {
  let s = ''
  if (typeof m.content === 'string') {
    s += m.content
  } else if (Array.isArray(m.content)) {
    for (const part of m.content) {
      if (part.type === 'text') s += part.text
      // multimodal image_url 不在 Phase A 历史里出现（spec 13），跳过估算
    }
  }
  if ('tool_calls' in m && m.tool_calls) {
    for (const tc of m.tool_calls) {
      // OpenAI ChatCompletion tool_calls union 含 function / custom 两种；function 形态走 .function.name/arguments
      if (tc.type === 'function') {
        s += tc.function.name + tc.function.arguments
      }
    }
  }
  // 每条 message 至少有 role / metadata 开销，加 4 token 兜底
  return estimateTokens(s) + 4
}

// ─── 序列化核心 ─────────────────────────────────────────

function serializeMessage(
  msg: MessageRow,
  currentAgentId: string,
  artifactTitles: Map<string, string>,
  agentNames: Map<string, string>,
): ChatCompletionMessageParam[] | null {
  if (msg.role === 'system') return null // system prompt 由 agent-runner 注入，不进 history

  if (msg.role === 'user') {
    const content = renderUserParts(msg.parts)
    if (!content) return null
    return [{ role: 'user', content }]
  }

  // role === 'agent'
  if (msg.role === 'agent') {
    if (msg.agentId === currentAgentId) {
      return renderSelfAssistantParts(msg.parts, artifactTitles)
    }
    // Phase C：别 agent 的消息 → [名字]: text 的 user role 注入；仅在群聊场景（agentNames 非空）启用
    if (msg.agentId && agentNames.has(msg.agentId)) {
      const m = renderOtherAgentAsUser(msg.parts, agentNames.get(msg.agentId)!, artifactTitles)
      return m ? [m] : null
    }
    return null
  }

  return null
}

function renderUserParts(parts: MessagePart[]): string {
  const buf: string[] = []
  for (const p of parts) {
    switch (p.type) {
      case 'text':
        buf.push(p.content)
        break
      case 'image_attachment':
        buf.push(`[图片附件: ${p.fileName}]`)
        break
      case 'file_attachment':
        buf.push(`[文件附件: ${p.fileName}]`)
        break
      // user 不应出现 thinking/tool_use/tool_result/code/artifact_ref，跳过
      default:
        break
    }
  }
  return buf.join('\n').trim()
}

function renderSelfAssistantParts(
  parts: MessagePart[],
  artifactTitles: Map<string, string>,
): ChatCompletionMessageParam[] | null {
  const text = renderAgentPublicText(parts, artifactTitles)
  if (!text) return null
  return [{ role: 'assistant', content: text }]
}

/**
 * Phase C：把别 agent 的 message 转成 [名字]: text 的 user role 消息注入给当前 agent。
 * 只保留 text / code / artifact_ref 折叠占位；drop thinking / tool_use / tool_result。
 * 详见 specs/13-conversation-context.md「群聊 / Orchestrator」节。
 */
function renderOtherAgentAsUser(
  parts: MessagePart[],
  agentName: string,
  artifactTitles: Map<string, string>,
): ChatCompletionMessageParam | null {
  const text = renderAgentPublicText(parts, artifactTitles)
  if (!text) return null
  return { role: 'user', content: `[${agentName}] ${text}` }
}

function renderAgentPublicText(
  parts: MessagePart[],
  artifactTitles: Map<string, string>,
): string {
  const buf: string[] = []
  for (const p of parts) {
    switch (p.type) {
      case 'text':
        if (p.content) buf.push(p.content)
        break
      case 'code':
        if (p.content) buf.push(p.content)
        break
      case 'artifact_ref': {
        const title = artifactTitles.get(p.artifactId) ?? ''
        buf.push(title ? `[产物: ${title} (id=${p.artifactId})]` : `[产物 ${p.artifactId}]`)
        break
      }
      case 'deploy_status':
        if (p.deployment.status === 'ready') {
          buf.push(
            `[部署预览: ${p.deployment.title} ${formatDeploymentSourceLabel(p.deployment)} (${p.deployment.previewPath})]`,
          )
        } else {
          buf.push(`[部署失败: ${p.deployment.title} (${p.deployment.error ?? 'unknown error'})]`)
        }
        break
      // 跨 run 历史只保留公开输出；thinking / tool_use / tool_result 不回放。
      default:
        break
    }
  }
  return buf.join('\n').trim()
}

function formatDeploymentSourceLabel(deployment: DeployStatusRecord): string {
  if (deployment.sourceType === 'workspace') {
    return `workspace=${deployment.workspacePath ?? 'unknown'}`
  }
  return `v${deployment.version}`
}

// ─── 批量取 artifact title ───────────────────────────────

function collectArtifactIds(messages: MessageRow[]): string[] {
  const ids = new Set<string>()
  for (const m of messages) {
    if (m.role !== 'agent') continue
    for (const p of m.parts) {
      if (p.type === 'artifact_ref') ids.add(p.artifactId)
    }
  }
  return Array.from(ids)
}

async function loadArtifactTitles(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (ids.length === 0) return out
  const rows = await db
    .select({ id: schema.artifacts.id, title: schema.artifacts.title })
    .from(schema.artifacts)
    .where(inArray(schema.artifacts.id, ids))
  for (const r of rows as Pick<ArtifactRow, 'id' | 'title'>[]) {
    out.set(r.id, r.title)
  }
  return out
}
