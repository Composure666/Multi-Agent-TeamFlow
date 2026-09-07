import type { AgentRunDebugListItem } from '@/shared/types'
import type { AgentRunTimelineItem } from './agent-run-debug-projection'

export type AgentRunHistoryStatusFilter = 'all' | 'running' | 'failed' | 'complete'
export type AgentRunHistoryWindowFilter = 'all' | '24h' | '7d' | '30d'
export type AgentRunTimelineFilter = 'all' | 'agent' | 'tools' | 'errors'

export interface AgentRunHistoryFilterState {
  status: AgentRunHistoryStatusFilter
  window: AgentRunHistoryWindowFilter
}

export function filterAgentRunHistory(
  runs: readonly AgentRunDebugListItem[],
  filters: AgentRunHistoryFilterState,
  now = Date.now(),
): AgentRunDebugListItem[] {
  const minStartedAt = getHistoryWindowStart(now, filters.window)
  return runs.filter((run) => {
    if (filters.status !== 'all' && run.status !== filters.status) return false
    if (minStartedAt !== null && run.startedAt < minStartedAt) return false
    return true
  })
}

export function filterAgentRunTimeline(
  items: readonly AgentRunTimelineItem[],
  filter: AgentRunTimelineFilter,
): AgentRunTimelineItem[] {
  if (filter === 'all') return [...items]
  return items.filter((item) => {
    if (filter === 'errors') return item.status === 'error'
    if (filter === 'agent') return item.kind === 'message' || item.kind === 'thinking' || item.kind === 'text'
    return item.kind === 'tool_call' || item.kind === 'tool_result' || item.kind === 'artifact' || item.kind === 'deploy'
  })
}

function getHistoryWindowStart(now: number, window: AgentRunHistoryWindowFilter): number | null {
  if (window === 'all') return null
  const hours = window === '24h' ? 24 : window === '7d' ? 24 * 7 : 24 * 30
  return now - hours * 60 * 60 * 1000
}
