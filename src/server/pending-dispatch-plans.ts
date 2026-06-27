import type { DispatchPlanItem, PendingDispatchPlan } from '@/shared/types'

import { eventBus } from './event-bus'
import { newPendingDispatchPlanId } from './ids'

type PlanValidator = (plan: DispatchPlanItem[]) => DispatchPlanItem[]

/** 用户对 pending 计划的决定，由 gate 的 resolver 回传给 Orchestrator run。 */
export type PlanReviewOutcome =
  | { kind: 'approve'; plan: DispatchPlanItem[] }
  | { kind: 'reject' }
  | { kind: 'revise'; feedback: string }

interface PendingEntry {
  pendingPlan: PendingDispatchPlan
  resolver: ((outcome: PlanReviewOutcome) => void) | null
  validator: PlanValidator
}

export type PendingDispatchPlanResult =
  | { ok: true }
  | { ok: false; error: string }

class PendingDispatchPlansStore {
  private map = new Map<string, PendingEntry>()

  register(args: {
    conversationId: string
    agentId: string
    runId: string
    plan: DispatchPlanItem[]
    validator: PlanValidator
  }): PendingDispatchPlan {
    const id = newPendingDispatchPlanId()
    const pendingPlan: PendingDispatchPlan = {
      id,
      conversationId: args.conversationId,
      agentId: args.agentId,
      runId: args.runId,
      plan: args.plan,
      createdAt: Date.now(),
    }
    this.map.set(id, {
      pendingPlan,
      resolver: null,
      validator: args.validator,
    })

    eventBus.publish({
      type: 'dispatch.plan.pending',
      conversationId: args.conversationId,
      timestamp: pendingPlan.createdAt,
      pendingPlan,
    })

    return pendingPlan
  }

  attachResolver(id: string, resolver: (outcome: PlanReviewOutcome) => void): void {
    const entry = this.map.get(id)
    if (entry) entry.resolver = resolver
  }

  get(id: string): PendingDispatchPlan | undefined {
    return this.map.get(id)?.pendingPlan
  }

  listByConversation(conversationId: string): PendingDispatchPlan[] {
    return Array.from(this.map.values())
      .filter((entry) => entry.pendingPlan.conversationId === conversationId)
      .map((entry) => entry.pendingPlan)
      .sort((a, b) => a.createdAt - b.createdAt)
  }

  /** 批准：用已登记的（只读）计划执行；仍过一遍 validator 做防御性校验。 */
  approve(id: string): PendingDispatchPlanResult {
    const entry = this.map.get(id)
    if (!entry) return { ok: false, error: 'Pending dispatch plan not found' }

    let compiledPlan: DispatchPlanItem[]
    try {
      compiledPlan = entry.validator(entry.pendingPlan.plan)
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }

    entry.resolver?.({ kind: 'approve', plan: compiledPlan })
    this.finalize(id, { approved: true })
    return { ok: true }
  }

  /** 修改：把用户的自然语言反馈交回 Orchestrator 重排；当前 pending 作废（重排后会再发新的）。 */
  revise(id: string, feedback: string): boolean {
    const entry = this.map.get(id)
    if (!entry) return false
    entry.resolver?.({ kind: 'revise', feedback })
    this.finalize(id, { approved: false, revising: true })
    return true
  }

  reject(id: string): boolean {
    const entry = this.map.get(id)
    if (!entry) return false
    entry.resolver?.({ kind: 'reject' })
    this.finalize(id, { approved: false })
    return true
  }

  cancel(id: string): void {
    const entry = this.map.get(id)
    if (!entry) return
    entry.resolver?.({ kind: 'reject' })
    this.finalize(id, { approved: false })
  }

  private finalize(id: string, opts: { approved: boolean; revising?: boolean }): void {
    const entry = this.map.get(id)
    if (!entry) return
    this.map.delete(id)
    eventBus.publish({
      type: 'dispatch.plan.resolved',
      conversationId: entry.pendingPlan.conversationId,
      timestamp: Date.now(),
      pendingId: id,
      runId: entry.pendingPlan.runId,
      approved: opts.approved,
      ...(opts.revising ? { revising: true } : {}),
    })
  }
}

const globalForPDP = globalThis as unknown as {
  __agenthubPendingDispatchPlans?: PendingDispatchPlansStore
}

export const pendingDispatchPlans =
  globalForPDP.__agenthubPendingDispatchPlans ?? new PendingDispatchPlansStore()

if (!globalForPDP.__agenthubPendingDispatchPlans) {
  globalForPDP.__agenthubPendingDispatchPlans = pendingDispatchPlans
}
