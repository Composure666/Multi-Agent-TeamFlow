import { listDueAutomations, runAutomation } from '@/server/automation-service'

const SCHEDULER_INTERVAL_MS = 30_000

const globalForAutomationScheduler = globalThis as unknown as {
  automationSchedulerTimer?: ReturnType<typeof setInterval>
  automationSchedulerTicking?: boolean
}

export function startAutomationScheduler(): void {
  if (globalForAutomationScheduler.automationSchedulerTimer) return
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
      await runAutomation(automation.id, { trigger: 'schedule' }).catch(() => undefined)
    }
  } finally {
    globalForAutomationScheduler.automationSchedulerTicking = false
  }
}
