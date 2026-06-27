import type { PendingBashCommand } from '@/shared/types'

import { eventBus } from './event-bus'
import { newPendingBashCommandId } from './ids'

interface PendingEntry {
  command: PendingBashCommand
  resolver: ((decision: { approved: boolean }) => void) | null
}

class PendingBashCommandsStore {
  private map = new Map<string, PendingEntry>()

  register(args: {
    conversationId: string
    agentId: string
    runId: string
    command: string
    cwd: string
    reason: string
  }): PendingBashCommand {
    const command: PendingBashCommand = {
      id: newPendingBashCommandId(),
      conversationId: args.conversationId,
      agentId: args.agentId,
      runId: args.runId,
      command: args.command,
      cwd: args.cwd,
      reason: args.reason,
      createdAt: Date.now(),
    }
    this.map.set(command.id, { command, resolver: null })
    eventBus.publish({
      type: 'bash_command.pending',
      conversationId: args.conversationId,
      timestamp: command.createdAt,
      pendingCommand: command,
    })
    return command
  }

  attachResolver(id: string, resolver: (decision: { approved: boolean }) => void): void {
    const entry = this.map.get(id)
    if (entry) entry.resolver = resolver
  }

  get(id: string): PendingBashCommand | undefined {
    return this.map.get(id)?.command
  }

  listByConversation(conversationId: string): PendingBashCommand[] {
    return Array.from(this.map.values())
      .filter((entry) => entry.command.conversationId === conversationId)
      .map((entry) => entry.command)
      .sort((a, b) => a.createdAt - b.createdAt)
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

  private finalize(id: string, approved: boolean): void {
    const entry = this.map.get(id)
    if (!entry) return
    entry.resolver?.({ approved })
    this.map.delete(id)
    eventBus.publish({
      type: 'bash_command.resolved',
      conversationId: entry.command.conversationId,
      timestamp: Date.now(),
      pendingId: id,
      approved,
    })
  }
}

const globalForPBC = globalThis as unknown as {
  __agenthubPendingBashCommands?: PendingBashCommandsStore
}

export const pendingBashCommands =
  globalForPBC.__agenthubPendingBashCommands ?? new PendingBashCommandsStore()

if (!globalForPBC.__agenthubPendingBashCommands) {
  globalForPBC.__agenthubPendingBashCommands = pendingBashCommands
}
