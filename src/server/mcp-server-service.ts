import { asc, eq, inArray } from 'drizzle-orm'

import { db, schema } from '@/db/client'
import type { AgentRow, McpServerRow } from '@/db/schema'
import { newMcpServerId } from '@/server/ids'

export type McpTransport = 'stdio'
export type McpTrust = 'always' | 'ask'

export interface McpServerInput {
  name: string
  command: string
  args?: string[]
  env?: Record<string, string>
  trust?: McpTrust
  enabled?: boolean
}

export interface McpServerPatch {
  name?: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  trust?: McpTrust
  enabled?: boolean
}

export interface McpServerListItem {
  id: string
  name: string
  transport: McpTransport
  command: string
  args: string[]
  env: Record<string, string>
  trust: McpTrust
  enabled: boolean
  createdAt: number
  updatedAt: number
}

export interface ResolvedMcpStdioServer {
  id: string
  name: string
  transport: 'stdio'
  command: string
  args: string[]
  env: Record<string, string>
  trust: McpTrust
}

const MCP_NAME_RE = /^[a-z0-9_]+$/
const SECRET_KEY_RE = /(key|token|secret|password|authorization|auth)/i

export async function createMcpServer(input: McpServerInput): Promise<McpServerListItem> {
  const now = Date.now()
  const normalized = normalizeMcpServerInput(input)
  const row = {
    id: newMcpServerId(),
    transport: 'stdio' as const,
    ...normalized,
    createdAt: now,
    updatedAt: now,
  }

  await db.insert(schema.mcpServers).values(row)
  return toMcpServerListItem(row)
}

export async function updateMcpServer(id: string, patch: McpServerPatch): Promise<McpServerListItem> {
  const existing = await db.query.mcpServers.findFirst({ where: eq(schema.mcpServers.id, id) })
  if (!existing) throw new Error(`MCP server not found: ${id}`)

  const normalized = normalizeMcpServerInput({
    name: patch.name ?? existing.name,
    command: patch.command ?? existing.command,
    args: patch.args ?? existing.args,
    env: patch.env ?? existing.env,
    trust: patch.trust ?? existing.trust,
    enabled: patch.enabled ?? existing.enabled,
  })

  await db
    .update(schema.mcpServers)
    .set({ ...normalized, updatedAt: Date.now() })
    .where(eq(schema.mcpServers.id, id))

  const updated = await db.query.mcpServers.findFirst({ where: eq(schema.mcpServers.id, id) })
  if (!updated) throw new Error(`MCP server update succeeded but row missing: ${id}`)
  return toMcpServerListItem(updated)
}

export async function deleteMcpServer(id: string): Promise<void> {
  await db.delete(schema.mcpServers).where(eq(schema.mcpServers.id, id))
}

export async function listMcpServers(): Promise<McpServerListItem[]> {
  const rows = await db.query.mcpServers.findMany({ orderBy: [asc(schema.mcpServers.name)] })
  return rows.map(toMcpServerListItem)
}

export async function resolveAgentMcpServers(agent: AgentRow): Promise<ResolvedMcpStdioServer[]> {
  if (agent.adapterName === 'custom') return []
  if (agent.isOrchestrator) return []
  if (agent.mcpServerIds.length === 0) return []

  const rows = await db.query.mcpServers.findMany({
    where: inArray(schema.mcpServers.id, agent.mcpServerIds),
  })
  const byId = new Map(rows.map((row) => [row.id, row]))

  return agent.mcpServerIds
    .map((id) => byId.get(id))
    .filter((row): row is McpServerRow => !!row && row.enabled && row.transport === 'stdio')
    .map((row) => ({
      id: row.id,
      name: row.name,
      transport: 'stdio' as const,
      command: row.command,
      args: row.args,
      env: resolveEnvPlaceholders(row.env),
      trust: row.trust,
    }))
}

export function normalizeMcpServerInput(input: McpServerInput): Required<McpServerInput> {
  const name = input.name.trim()
  if (!MCP_NAME_RE.test(name)) {
    throw new Error('MCP server name must match [a-z0-9_]+')
  }
  if (name === 'agenthub') {
    throw new Error('MCP server name "agenthub" is reserved')
  }

  const command = input.command.trim()
  if (!command) throw new Error('MCP stdio server command is required')

  const args = input.args ?? []
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== 'string')) {
    throw new Error('MCP stdio server args must be a string array')
  }

  const env = input.env ?? {}
  for (const [key, value] of Object.entries(env)) {
    if (!key.trim()) throw new Error('MCP stdio server env keys cannot be empty')
    if (typeof value !== 'string') throw new Error(`MCP stdio server env value must be a string: ${key}`)
  }

  return {
    name,
    command,
    args,
    env,
    trust: input.trust ?? 'ask',
    enabled: input.enabled ?? true,
  }
}

export function maskMcpEnv(env: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).map(([key, value]) => [key, shouldMaskEnv(key, value) ? maskSecret(value) : value]),
  )
}

export function resolveEnvPlaceholders(env: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).map(([key, value]) => [
      key,
      value.replace(/^\$\{([A-Z0-9_]+)\}$/i, (_, envName: string) => process.env[envName] ?? ''),
    ]),
  )
}

function toMcpServerListItem(row: McpServerRow): McpServerListItem {
  return {
    id: row.id,
    name: row.name,
    transport: row.transport,
    command: row.command,
    args: row.args,
    env: maskMcpEnv(row.env),
    trust: row.trust,
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function shouldMaskEnv(key: string, value: string): boolean {
  if (!value) return false
  if (/^\$\{[A-Z0-9_]+\}$/i.test(value)) return false
  return SECRET_KEY_RE.test(key) || value.length >= 24
}

function maskSecret(value: string): string {
  if (value.length <= 4) return '****'
  return `****${value.slice(-4)}`
}
