/**
 * LLM 模型分配服务。
 *
 * 模型分配负责「使用」：决定哪个系统能力 / Agent 用哪个供应商的哪个模型。
 * 供应商的接入配置（Key / Base URL）由 provider-service 负责。
 *
 * 分配层级：
 *   - global：全局策略（默认 Provider / 备用 Provider / 故障切换）
 *   - system：系统能力（提示词增强 / 任务规划 / 上下文摘要 / 系统对话）
 *   - agent：Agent 模型策略（默认 Agent / 代码 Agent / 研究 Agent / ...）
 *
 * 每个 capabilityKey 可以有多条记录，priority 越小优先级越高（用于故障自动切换）。
 * providerId 为 null 表示「自动选择」（按全局策略 / 已连接供应商自动选）。
 */
import { and, eq } from 'drizzle-orm'

import { db, schema } from '@/db/client'
import type { LlmModelAssignmentRow } from '@/db/schema'
import {
  GLOBAL_KEYS,
  type AssignmentUpsertInput,
  type ProviderUsage,
  type ResolvedModel,
} from '@/lib/llm-shared'

// ─── CRUD ──────────────────────────────────────────────────────

export async function listAssignments(): Promise<LlmModelAssignmentRow[]> {
  return db.query.llmModelAssignments.findMany({
    orderBy: (a, { asc }) => [asc(a.scope), asc(a.capabilityKey), asc(a.priority)],
  })
}

export async function getAssignmentsByCapability(capabilityKey: string): Promise<LlmModelAssignmentRow[]> {
  return db.query.llmModelAssignments.findMany({
    where: eq(schema.llmModelAssignments.capabilityKey, capabilityKey),
    orderBy: (a, { asc }) => [asc(a.priority)],
  })
}

/**
 * Upsert 单条分配。按 (capabilityKey, priority) 匹配现有记录，
 * 匹配到则更新，没匹配到则新建。
 */
export async function upsertAssignment(input: AssignmentUpsertInput): Promise<LlmModelAssignmentRow> {
  const now = Date.now()
  const priority = input.priority ?? 0

  const existing = await db.query.llmModelAssignments.findFirst({
    where: and(
      eq(schema.llmModelAssignments.capabilityKey, input.capabilityKey),
      eq(schema.llmModelAssignments.priority, priority),
    ),
  })

  const id = input.id ?? existing?.id ?? `assign_${Math.random().toString(36).slice(2, 10)}`
  const next: LlmModelAssignmentRow = {
    id,
    scope: input.scope,
    capabilityKey: input.capabilityKey,
    providerId: input.providerId !== undefined ? input.providerId : existing?.providerId ?? null,
    modelName: input.modelName !== undefined ? input.modelName : existing?.modelName ?? null,
    priority,
    useGlobal: input.useGlobal !== undefined ? input.useGlobal : existing?.useGlobal ?? true,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }

  await db
    .insert(schema.llmModelAssignments)
    .values(next)
    .onConflictDoUpdate({ target: schema.llmModelAssignments.id, set: next })
  return next
}

/** 批量 upsert（UI 保存时用）。 */
export async function upsertAssignments(items: AssignmentUpsertInput[]): Promise<LlmModelAssignmentRow[]> {
  const results: LlmModelAssignmentRow[] = []
  for (const item of items) {
    results.push(await upsertAssignment(item))
  }
  return results
}

export async function deleteAssignment(id: string): Promise<void> {
  await db.delete(schema.llmModelAssignments).where(eq(schema.llmModelAssignments.id, id))
}

/** 删除某个 capabilityKey 的所有分配（用于「重置为自动」）。 */
export async function clearAssignments(capabilityKey: string): Promise<void> {
  await db.delete(schema.llmModelAssignments).where(eq(schema.llmModelAssignments.capabilityKey, capabilityKey))
}

// ─── 解析实际使用的模型 ─────────────────────────────────────────

/**
 * 解析某个能力实际使用的 provider + model。
 *
 * 逻辑：
 * 1. 取该 capabilityKey 的所有分配，按 priority 升序
 * 2. 逐条检查 provider 是否连接（isConnected）
 * 3. 第一条已连接的就是实际使用的
 * 4. 如果全局开启了故障切换且所有指定的都没连接，回退到全局默认 Provider
 * 5. 都没有时返回 null（调用方走本地模板兜底）
 */
export async function resolveModelForCapability(capabilityKey: string): Promise<ResolvedModel | null> {
  const assignments = await getAssignmentsByCapability(capabilityKey)

  // 1. 按 priority 选第一条已连接的
  for (const a of assignments) {
    if (!a.providerId) continue // 自动选择，跳过（后续可以加自动逻辑）
    const provider = await db.query.llmProviders.findFirst({ where: eq(schema.llmProviders.id, a.providerId) })
    if (provider?.isConnected) {
      return { providerId: a.providerId, modelName: a.modelName }
    }
  }

  // 2. 都没连接，返回第一条有 providerId 的（即使没连接，调用方自己处理错误）
  const firstWithProvider = assignments.find((a) => a.providerId)
  if (firstWithProvider?.providerId) {
    return { providerId: firstWithProvider.providerId, modelName: firstWithProvider.modelName }
  }

  // 3. 回退到全局默认 Provider
  const globalDefault = await getAssignmentsByCapability(GLOBAL_KEYS.defaultProvider)
  for (const a of globalDefault) {
    if (!a.providerId) continue
    const provider = await db.query.llmProviders.findFirst({ where: eq(schema.llmProviders.id, a.providerId) })
    if (provider?.isConnected) {
      return { providerId: a.providerId, modelName: a.modelName }
    }
  }
  const firstGlobal = globalDefault.find((a) => a.providerId)
  if (firstGlobal?.providerId) {
    return { providerId: firstGlobal.providerId, modelName: firstGlobal.modelName }
  }

  return null
}

// ─── 供应商使用情况（供应商卡片显示「使用中」） ──────────────────

export async function getProviderUsage(providerId: string): Promise<ProviderUsage> {
  const assignments = await db.query.llmModelAssignments.findMany({
    where: eq(schema.llmModelAssignments.providerId, providerId),
  })
  return {
    systemCapabilities: assignments.filter((a) => a.scope === 'system').map((a) => a.capabilityKey),
    agentCapabilities: assignments.filter((a) => a.scope === 'agent').map((a) => a.capabilityKey),
    globalKeys: assignments.filter((a) => a.scope === 'global').map((a) => a.capabilityKey),
  }
}

/** 批量获取所有供应商的使用情况（供应商列表页用）。 */
export async function getProviderUsageMap(): Promise<Map<string, ProviderUsage>> {
  const all = await listAssignments()
  const map = new Map<string, ProviderUsage>()
  for (const a of all) {
    if (!a.providerId) continue
    if (!map.has(a.providerId)) {
      map.set(a.providerId, { systemCapabilities: [], agentCapabilities: [], globalKeys: [] })
    }
    const usage = map.get(a.providerId)!
    if (a.scope === 'system') usage.systemCapabilities.push(a.capabilityKey)
    else if (a.scope === 'agent') usage.agentCapabilities.push(a.capabilityKey)
    else usage.globalKeys.push(a.capabilityKey)
  }
  return map
}
