import {
  listDueAutomations,
  reconcileStaleAutomationRuns,
  recordScheduledAutomationDispatchFailure,
  runAutomation,
} from '@/server/automation-service'

const SCHEDULER_INTERVAL_MS = 30_000

const globalForAutomationScheduler = globalThis as unknown as {
  automationSchedulerTimer?: ReturnType<typeof setInterval>
  automationSchedulerTicking?: boolean
}

export function startAutomationScheduler(): void {
  if (globalForAutomationScheduler.automationSchedulerTimer) return
  // 启动即收尾上一进程遗留的僵尸 running 记录（maxAgeMs=0：本次启动前留下的都不可信）。
  // 否则那些记录会让对应自动化的「手动运行」永远撞 409。
  void reconcileStaleAutomationRuns({ maxAgeMs: 0 })
    .then((count) => {
      if (count > 0) {
        console.warn(`[automation-scheduler] reconciled ${count} stale running automation run(s)`)
      }
    })
    .catch((error) => {
      console.warn('[automation-scheduler] stale run reconciliation failed:', error)
    })
  globalForAutomationScheduler.automationSchedulerTimer = setInterval(() => {
    void tickAutomationScheduler()
  }, SCHEDULER_INTERVAL_MS)
}

export function stopAutomationScheduler(): void {
  const timer = globalForAutomationScheduler.automationSchedulerTimer
  if (!timer) return
  clearInterval(timer)
  globalForAutomationScheduler.automationSchedulerTimer = undefined
}

export async function tickAutomationScheduler(now = Date.now()): Promise<void> {
  if (globalForAutomationScheduler.automationSchedulerTicking) return
  globalForAutomationScheduler.automationSchedulerTicking = true
  try {
    const dueAutomations = await listDueAutomations(now)
    for (const automation of dueAutomations) {
      try {
        await runAutomation(automation.id, {
          trigger: 'schedule',
          scheduledFor: automation.nextRunAt,
          schedulerNow: now,
        })
      } catch (error) {
        await recordScheduledAutomationDispatchFailure(automation.id, error, now)
      }
    }
  } finally {
    globalForAutomationScheduler.automationSchedulerTicking = false
  }
}
