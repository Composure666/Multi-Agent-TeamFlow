import type { WorkspaceRow } from '@/db/schema'
import type { PendingWrite } from '@/shared/types'

import { eventBus } from './event-bus'
import { writeFileInWorkspace } from './fs-service'
import { newPendingWriteId } from './ids'

/**
 * Agent fs_write 审批中心（仅 review 模式下走这里）。
 *
 * 模块级单例 + HMR-safe globalThis。每个 pending 持有一个 promise resolver；
 * 用户 approve / reject / run abort 时调对应方法 resolve。
 *
 * 详见 specs/07-tools.md 「fs_write 审批模式」一节。
 */

interface PendingEntry {
  write: PendingWrite
  workspace: WorkspaceRow
  resolver: ((decision: { applied: boolean }) => void) | null
  /** true = approve 时不调 writeFileInWorkspace（写盘由调用方负责，如 Claude Code SDK 内置 Edit/Write）。 */
  skipWrite: boolean
}

class PendingWritesStore {
  private map = new Map<string, PendingEntry>()

  register(args: {
    conversationId: string
    agentId: string
    runId: string
    path: string
    absolutePath: string
    oldContent: string | null
    newContent: string
    workspace: WorkspaceRow
    /** 默认 false：approve 时调 writeFileInWorkspace 自己写盘（适用 AgentHub 自带 fs_write 工具）。
     *  true：approve 后不写盘，仅 resolver 通知调用方放行（适用 ClaudeCodeAdapter，SDK 自己写）。 */
    skipWrite?: boolean
  }): PendingWrite {
    const id = newPendingWriteId()
    const write: PendingWrite = {
      id,
      conversationId: args.conversationId,
      agentId: args.agentId,
      runId: args.runId,
      path: args.path,
      absolutePath: args.absolutePath,
      oldContent: args.oldContent,
      newContent: args.newContent,
      createdAt: Date.now(),
    }
    this.map.set(id, {
      write,
      workspace: args.workspace,
      resolver: null,
      skipWrite: args.skipWrite ?? false,
    })

    // 推 SSE 让前端弹审批 dialog
    eventBus.publish({
      type: 'fs_write.pending',
      conversationId: args.conversationId,
      timestamp: write.createdAt,
      pendingWrite: write,
    })

    return write
  }

  attachResolver(id: string, resolver: (decision: { applied: boolean }) => void): void {
    const entry = this.map.get(id)
    if (entry) entry.resolver = resolver
  }

  get(id: string): PendingWrite | undefined {
    return this.map.get(id)?.write
  }

  listByConversation(conversationId: string): PendingWrite[] {
    return Array.from(this.map.values())
      .filter((e) => e.write.conversationId === conversationId)
      .map((e) => e.write)
      .sort((a, b) => a.createdAt - b.createdAt)
  }

  approve(id: string): boolean {
    const entry = this.map.get(id)
    if (!entry) return false
    if (!entry.skipWrite) {
      try {
        writeFileInWorkspace(entry.workspace, entry.write.path, entry.write.newContent)
      } catch (err) {
        // 写入失败仍视作「未应用」让 LLM 看到错误，但 dialog 也要关
        console.error('[pendingWrites] approve write failed', err)
        this.finalize(id, false)
        return false
      }
    }
    this.finalize(id, true)
    return true
  }

  reject(id: string): boolean {
    if (!this.map.has(id)) return false
    this.finalize(id, false)
    return true
  }

  /** Run abort 路径：不发 SSE（前端 store 自己会通过 fs_write.resolved 移除，但 abort 时整 run 被中止，前端无需特别清理 —— pending 在 store 里跟随 run cleanup 移除）。 */
  cancel(id: string): void {
    const entry = this.map.get(id)
    if (!entry) return
    entry.resolver?.({ applied: false })
    this.map.delete(id)
  }

  private finalize(id: string, applied: boolean) {
    const entry = this.map.get(id)
    if (!entry) return
    entry.resolver?.({ applied })
    this.map.delete(id)
    eventBus.publish({
      type: 'fs_write.resolved',
      conversationId: entry.write.conversationId,
      timestamp: Date.now(),
      pendingId: id,
      applied,
    })
  }
}

const globalForPW = globalThis as unknown as {
  __agenthubPendingWrites?: PendingWritesStore
}

export const pendingWrites = globalForPW.__agenthubPendingWrites ?? new PendingWritesStore()

if (!globalForPW.__agenthubPendingWrites) {
  globalForPW.__agenthubPendingWrites = pendingWrites
}
