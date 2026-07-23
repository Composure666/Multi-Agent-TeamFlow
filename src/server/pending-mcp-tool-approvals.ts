import type { PendingMcpToolApproval } from '@/shared/types'

import { eventBus } from './event-bus'
import { newPendingMcpToolApprovalId } from './ids'

interface PendingEntry {
  approval: PendingMcpToolApproval
  resolver: ((decision: { approved: boolean }) => void) | null
}

class PendingMcpToolApprovalsStore {
  private map = new Map<string, PendingEntry>()
  private approved = new Set<string>()

  register(args: {
    conversationId: string
    agentId: string
    runId: string
    serverId: string
    serverName: string
    toolName: string
    namespacedToolName: string
    args: unknown
  }): PendingMcpToolApproval {
    const approval: PendingMcpToolApproval = {
      id: newPendingMcpToolApprovalId(),
      conversationId: args.conversationId,
      agentId: args.agentId,
      runId: args.runId,
      serverId: args.serverId,
      serverName: args.serverName,
      toolName: args.toolName,
      namespacedToolName: args.namespacedToolName,
      args: args.args,
      createdAt: Date.now(),
    }
    this.map.set(approval.id, { approval, resolver: null })
    eventBus.publish({
      type: 'mcp_tool.pending',
      conversationId: args.conversationId,
      timestamp: approval.createdAt,
      pendingApproval: approval,
    })
    return approval
  }

  attachResolver(id: string, resolver: (decision: { approved: boolean }) => void): void {
    const entry = this.map.get(id)
    if (entry) entry.resolver = resolver
  }

  get(id: string): PendingMcpToolApproval | undefined {
    return this.map.get(id)?.approval
  }

  listByConversation(conversationId: string): PendingMcpToolApproval[] {
    return Array.from(this.map.values())
      .filter((entry) => entry.approval.conversationId === conversationId)
      .map((entry) => entry.approval)
      .sort((a, b) => a.createdAt - b.createdAt)
  }

  isApproved(conversationId: string, namespacedToolName: string): boolean {
    return this.approved.has(this.cacheKey(conversationId, namespacedToolName))
  }

  approve(id: string): boolean {
    if (!this.map.has(id)) return false
    this.finalize(id, true)
    return true
  }

  reject(id: string): boolean {
    if (!this.map.has(id)) return false
    this.finalize(id, false)
    return true
  }

  cancel(id: string): void {
    const entry = this.map.get(id)
    if (!entry) return
    this.finalize(id, false)
  }

  clearApprovalCache(): void {
    this.approved.clear()
  }

  private finalize(id: string, approved: boolean): void {
    const entry = this.map.get(id)
    if (!entry) return
    if (approved) {
      this.approved.add(this.cacheKey(entry.approval.conversationId, entry.approval.namespacedToolName))
    }
    entry.resolver?.({ approved })
    this.map.delete(id)
    eventBus.publish({
      type: 'mcp_tool.resolved',
      conversationId: entry.approval.conversationId,
      timestamp: Date.now(),
      pendingId: id,
      approved,
    })
  }

  private cacheKey(conversationId: string, namespacedToolName: string): string {
    return `${conversationId}\u0000${namespacedToolName}`
  }
}

const globalForPMTA = globalThis as unknown as {
  __agenthubPendingMcpToolApprovals?: PendingMcpToolApprovalsStore
}

export const pendingMcpToolApprovals =
  globalForPMTA.__agenthubPendingMcpToolApprovals ?? new PendingMcpToolApprovalsStore()

if (!globalForPMTA.__agenthubPendingMcpToolApprovals) {
  globalForPMTA.__agenthubPendingMcpToolApprovals = pendingMcpToolApprovals
}
