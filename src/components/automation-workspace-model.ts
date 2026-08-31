import type { AutomationScheduleType, AutomationStatus, SaveAutomationBody } from '@/lib/api'

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
    status: task?.rawStatus === 'enabled' || task?.rawStatus === 'paused' || task?.rawStatus === 'draft' ? task.rawStatus : 'draft',
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

export function buildAutomationPromptEnhanceInput(form: AutomationFormState): string {
  const scheduleLabel =
    form.scheduleType === 'interval'
      ? `每 ${form.intervalMinutes || '60'} 分钟执行一次`
      : form.scheduleType === 'daily'
        ? `每天 ${form.timeOfDay || '09:00'} 执行`
        : form.scheduleType === 'weekly'
          ? `每周 ${WEEKDAY_LABELS[Number(form.dayOfWeek || 1)] ?? '周一'} ${form.timeOfDay || '09:00'} 执行`
          : '手动触发'

  return [
    '请根据以下信息，改写或生成一段适合自动化任务执行的提示词。',
    `任务标题：${form.title.trim() || '未命名自动化任务'}`,
    `任务分类：${form.category.trim() || '自定义任务'}`,
    form.description.trim() ? `任务说明：${form.description.trim()}` : '',
    `触发方式：${scheduleLabel}`,
    form.prompt.trim() ? `现有草稿：${form.prompt.trim()}` : '',
    '请直接输出可保存的最终提示词，语气自然、简洁、专业；补足必要的目标、上下文、边界和结果要求，但不要强行套用固定模板，也不要解释你做了什么。',
  ].filter((line) => line.length > 0).join('\n')
}
