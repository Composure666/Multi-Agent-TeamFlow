import type { AgentRow } from '@/db/schema'

export type AgentPresetView = {
  id: string
  name: string
  displayName: string
  category: string
  description: string
  capabilities: string[]
}

export function filterAgentPresets<T extends AgentPresetView>(presets: T[], query: string, tab: string): T[] {
  const normalizedQuery = query.trim().toLowerCase()
  return presets.filter((preset) => {
    const searchableText = `${preset.displayName} ${preset.name} ${preset.description} ${preset.capabilities.join(' ')}`.toLowerCase()
    const matchesQuery = !normalizedQuery || searchableText.includes(normalizedQuery)
    const matchesTab = tab === '全部' || preset.category === tab
    return matchesQuery && matchesTab
  })
}

export function getVisibleAgentPresets<T>(presets: T[], visibleCount: number): T[] {
  return presets.slice(0, Math.max(0, visibleCount))
}

export function projectMyAgents(
  agents: AgentRow[],
  featuredAgentIds: Set<string>,
  isPresetBackedAgent: (agent: AgentRow) => boolean,
): AgentRow[] {
  return agents.filter((agent) => {
    if (agent.isBuiltin) return false
    if (!isPresetBackedAgent(agent)) return true
    return featuredAgentIds.has(agent.id)
  })
}

export function filterMyAgents(
  agents: AgentRow[],
  query: string,
  getDisplayName: (agent: AgentRow) => string,
): AgentRow[] {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return agents

  return agents.filter((agent) => {
    const searchableText = `${getDisplayName(agent)} ${agent.name} ${agent.description} ${agent.modelId ?? ''}`.toLowerCase()
    return searchableText.includes(normalizedQuery)
  })
}
