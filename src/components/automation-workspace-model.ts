import type { AutomationScheduleType, AutomationStatus, SaveAutomationBody } from '@/lib/api'
import type { PromptEnhanceContext } from '@/shared/prompt-enhance'

export type AutomationTaskView = {
  title: string
  description: string
  category: string
  prompt: string
  agentId: string | null
  conversationId: string | null
  scheduleType: AutomationScheduleType
  scheduleConfig: unknown
  rawStatus: AutomationStatus
}

export type AutomationFormState = {
  title: string
  description: string
  category: string
  prompt: string
  agentId: string
  conversationId: string
  scheduleType: AutomationScheduleType
  intervalMinutes: string
  timeOfDay: string
  dayOfWeek: string
  status: Exclude<AutomationStatus, 'running'>
}

const WEEKDAY_LABELS: Record<number, string> = {
  0: '周日',
  1: '周一',
  2: '周二',
  3: '周三',
  4: '周四',
  5: '周五',
  6: '周六',
}

export function automationStatusLabel(status: AutomationStatus): '运行中' | '已启用' | '待配置' | '已暂停' {
  if (status === 'running') return '运行中'
  if (status === 'enabled') return '已启用'
  if (status === 'paused') return '已暂停'
  return '待配置'
}

export function automationStatusClassName(status: AutomationStatus): string {
  if (status === 'running') return 'bg-emerald-50 text-emerald-600'
  if (status === 'enabled') return 'bg-[var(--agenthub-accent-soft)] text-[var(--agenthub-accent)]'
  if (status === 'paused') return 'bg-slate-100 text-slate-500'
  return 'bg-amber-50 text-amber-600'
}

export function automationStatusDescription(status: AutomationStatus): string {
  if (status === 'running') return '已有运行记录处理中，页面会自动同步最新状态。'
  if (status === 'enabled') return '任务已启用，等待下一次触发。'
  if (status === 'paused') return '任务已暂停，不会自动触发。'
  return '任务仍需补全配置后才能运行。'
}

function scheduleConfigField(config: unknown, key: string): string {
  if (!config || typeof config !== 'object' || !(key in config)) return ''
  const value = (config as Record<string, unknown>)[key]
  return typeof value === 'number' || typeof value === 'string' ? String(value) : ''
}

export function automationFormFromTask(task?: AutomationTaskView | null): AutomationFormState {
  return {
    title: task?.title ?? '',
    description: task?.description ?? '',
    category: task?.category ?? '自定义任务',
    prompt: task?.prompt ?? '',
    agentId: task?.agentId ?? '',
    conversationId: task?.conversationId ?? '',
    scheduleType: task?.scheduleType ?? 'manual',
    intervalMinutes: scheduleConfigField(task?.scheduleConfig, 'intervalMinutes') || '60',
    timeOfDay: scheduleConfigField(task?.scheduleConfig, 'timeOfDay') || '09:00',
    dayOfWeek: scheduleConfigField(task?.scheduleConfig, 'dayOfWeek') || '1',
    // 新建任务默认「已暂停」—— 保存后不会立刻触发，等用户确认配置无误再手动启用。
    // 早期默认值是 draft，语义含糊且容易被当成「还没配好」，这里统一收成显式暂停态。
    status:
      task?.rawStatus === 'enabled' || task?.rawStatus === 'paused' || task?.rawStatus === 'draft'
        ? task.rawStatus
        : 'paused',
  }
}

export function buildAutomationSaveBody(form: AutomationFormState): SaveAutomationBody {
  const scheduleConfig =
    form.scheduleType === 'interval'
      ? { intervalMinutes: Number(form.intervalMinutes || 60) }
      : form.scheduleType === 'daily'
        ? { timeOfDay: form.timeOfDay || '09:00' }
        : form.scheduleType === 'weekly'
          ? { dayOfWeek: Number(form.dayOfWeek || 1), timeOfDay: form.timeOfDay || '09:00' }
          : undefined

  return {
    title: form.title.trim(),
    description: form.description.trim(),
    category: form.category.trim(),
    prompt: form.prompt.trim(),
    agentId: form.agentId || null,
    conversationId: form.conversationId || null,
    scheduleType: form.scheduleType,
    scheduleConfig,
    status: form.status,
  }
}

/**
 * 自动化任务的「AI 优化提示词」入参。
 *
 * 这里和其它入口不同:自动化提示词本身就是由表单字段定义的,所以标题/说明/触发方式
 * 属于**任务内容**,要随请求一起给出;分类只作为意图线索,同样不进最终提示词的正文。
 * 返回用户原文 + 背景素材两段,由服务端决定怎么用(详见 `@/server/prompt-enhance`)。
 */
export function buildAutomationPromptEnhanceInput(form: AutomationFormState): {
  prompt: string
  context: PromptEnhanceContext
} {
  const scheduleLabel =
    form.scheduleType === 'interval'
      ? `每 ${form.intervalMinutes || '60'} 分钟执行一次`
      : form.scheduleType === 'daily'
        ? `每天 ${form.timeOfDay || '09:00'} 执行`
        : form.scheduleType === 'weekly'
          ? `每周 ${WEEKDAY_LABELS[Number(form.dayOfWeek || 1)] ?? '周一'} ${form.timeOfDay || '09:00'} 执行`
          : '手动触发'

  const draft = form.prompt.trim()
  const description = form.description.trim()
  const title = form.title.trim()

  return {
    // 用户原文:优先用已有草稿;没有草稿时用标题+说明作为任务定义,不拼任何系统上下文。
    prompt: draft || [title || '未命名自动化任务', description].filter(Boolean).join('\n'),
    context: {
      title: title || undefined,
      description: description || undefined,
      schedule: scheduleLabel,
    },
  }
}
