import { describe, expect, it } from 'vitest'

import { eventBus } from './event-bus'
import { pendingMcpToolApprovals } from './pending-mcp-tool-approvals'

function registerApproval(args: Partial<Parameters<typeof pendingMcpToolApprovals.register>[0]> = {}) {
  return pendingMcpToolApprovals.register({
    conversationId: 'conv_mcp',
    agentId: 'ag_mcp',
    runId: 'run_mcp',
    serverId: 'mcp_server',
    serverName: 'github',
    toolName: 'create_issue',
    namespacedToolName: 'mcp__github__create_issue',
    args: { title: 'Bug' },
    ...args,
  })
}

describe('pending MCP tool approvals', () => {
  it('registers pending approvals and lists them by conversation', () => {
    const events: string[] = []
    const unsubscribe = eventBus.subscribe((event) => events.push(event.type))
    try {
      const approval = registerApproval()

      expect(approval.id).toMatch(/^pmcp_/)
      expect(pendingMcpToolApprovals.listByConversation('conv_mcp').map((item) => item.id)).toContain(approval.id)
      expect(pendingMcpToolApprovals.listByConversation('other')).toEqual([])
      expect(events).toContain('mcp_tool.pending')
    } finally {
      unsubscribe()
    }
  })

  it('approves and caches by conversation plus namespaced tool', () => {
    const approval = registerApproval({ conversationId: 'conv_cache', namespacedToolName: 'mcp__github__read_issue' })
    let decision: { approved: boolean } | null = null
    pendingMcpToolApprovals.attachResolver(approval.id, (value) => {
      decision = value
    })

    expect(pendingMcpToolApprovals.approve(approval.id)).toBe(true)
    expect(decision).toEqual({ approved: true })
    expect(pendingMcpToolApprovals.get(approval.id)).toBeUndefined()
    expect(pendingMcpToolApprovals.isApproved('conv_cache', 'mcp__github__read_issue')).toBe(true)
    expect(pendingMcpToolApprovals.isApproved('other', 'mcp__github__read_issue')).toBe(false)
    expect(pendingMcpToolApprovals.isApproved('conv_cache', 'mcp__github__create_issue')).toBe(false)
  })

  it('rejects without caching approval', () => {
    const approval = registerApproval({ conversationId: 'conv_reject', namespacedToolName: 'mcp__github__delete_issue' })
    let decision: { approved: boolean } | null = null
    pendingMcpToolApprovals.attachResolver(approval.id, (value) => {
      decision = value
    })

    expect(pendingMcpToolApprovals.reject(approval.id)).toBe(true)
    expect(decision).toEqual({ approved: false })
    expect(pendingMcpToolApprovals.isApproved('conv_reject', 'mcp__github__delete_issue')).toBe(false)
  })
})
