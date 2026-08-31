import type { AgentRow } from '@/db/schema'

type NamedCapability = { id: string; name: string }

export type CapabilityBindingItem = {
  id: string
  name: string
  agents: AgentRow[]
  missing: boolean
}

export type AgentCapabilityBindingItem = {
  agent: AgentRow
  skills: Array<{ id: string; name: string; missing: boolean }>
  mcpServers: Array<{ id: string; name: string; missing: boolean }>
}

export function buildCapabilityBindings<T extends NamedCapability>(
  agents: AgentRow[],
  capabilities: T[],
  field: 'skillIds' | 'mcpServerIds',
): CapabilityBindingItem[] {
  const capabilityById = new Map(capabilities.map((capability) => [capability.id, capability]))
  const ids = new Set<string>()
  for (const agent of agents) {
    for (const id of agent[field] ?? []) ids.add(id)
  }

  return Array.from(ids)
    .map((id) => {
      const capability = capabilityById.get(id)
      return {
        id,
        name: capability?.name ?? `未找到能力：${id}`,
        agents: agents.filter((agent) => (agent[field] ?? []).includes(id)),
        missing: !capability,
      }
    })
    .sort((a, b) => b.agents.length - a.agents.length)
}

export function buildAgentCapabilityBindings(
  agents: AgentRow[],
  skills: NamedCapability[],
  mcpServers: NamedCapability[],
): AgentCapabilityBindingItem[] {
  const skillById = new Map(skills.map((skill) => [skill.id, skill]))
  const mcpById = new Map(mcpServers.map((server) => [server.id, server]))
  return agents
    .map((agent) => ({
      agent,
      skills: (agent.skillIds ?? []).map((id) => {
        const skill = skillById.get(id)
        return { id, name: skill?.name ?? `未找到能力：${id}`, missing: !skill }
      }),
      mcpServers: (agent.mcpServerIds ?? []).map((id) => {
        const server = mcpById.get(id)
        return { id, name: server?.name ?? `未找到能力：${id}`, missing: !server }
      }),
    }))
    .filter((item) => item.skills.length > 0 || item.mcpServers.length > 0)
    .sort((a, b) => b.skills.length + b.mcpServers.length - (a.skills.length + a.mcpServers.length))
}
