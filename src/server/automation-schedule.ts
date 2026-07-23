import { z } from 'zod'

import type { AutomationScheduleType } from '@/db/schema'

const TIME_OF_DAY_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

export const intervalScheduleConfigSchema = z.object({
  intervalMinutes: z.number().int().min(1).max(60 * 24 * 30),
})

export const dailyScheduleConfigSchema = z.object({
  timeOfDay: z.string().regex(TIME_OF_DAY_RE),
})

export const weeklyScheduleConfigSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  timeOfDay: z.string().regex(TIME_OF_DAY_RE),
})

export type AutomationScheduleConfig =
  | null
  | z.infer<typeof intervalScheduleConfigSchema>
  | z.infer<typeof dailyScheduleConfigSchema>
  | z.infer<typeof weeklyScheduleConfigSchema>

export function parseScheduleConfig(
  scheduleType: AutomationScheduleType,
  value: unknown,
): AutomationScheduleConfig {
  if (scheduleType === 'manual') return null
  if (scheduleType === 'interval') return intervalScheduleConfigSchema.parse(value)
  if (scheduleType === 'daily') return dailyScheduleConfigSchema.parse(value)
  return weeklyScheduleConfigSchema.parse(value)
}

export function serializeScheduleConfig(
  scheduleType: AutomationScheduleType,
  value: unknown,
): string | null {
  const parsed = parseScheduleConfig(scheduleType, value)
  return parsed ? JSON.stringify(parsed) : null
}

export function deserializeScheduleConfig(
  scheduleType: AutomationScheduleType,
  value: string | null,
): AutomationScheduleConfig {
  if (scheduleType === 'manual') return null
  if (!value) throw new Error(`Missing schedule config for ${scheduleType} automation`)
  return parseScheduleConfig(scheduleType, JSON.parse(value) as unknown)
}

export function calculateNextRunAt(
  scheduleType: AutomationScheduleType,
  config: AutomationScheduleConfig,
  from = Date.now(),
): number | null {
  if (scheduleType === 'manual') return null
  if (scheduleType === 'interval') {
    const parsed = intervalScheduleConfigSchema.parse(config)
    return from + parsed.intervalMinutes * 60 * 1000
  }

  if (scheduleType === 'daily') {
    const parsed = dailyScheduleConfigSchema.parse(config)
    return nextTimeOfDay(parsed.timeOfDay, from)
  }

  const parsed = weeklyScheduleConfigSchema.parse(config)
  return nextWeeklyTime(parsed.dayOfWeek, parsed.timeOfDay, from)
}

export function cadenceFromSchedule(
  scheduleType: AutomationScheduleType,
  config: AutomationScheduleConfig,
): string {
  if (scheduleType === 'manual') return '手动触发'
  if (scheduleType === 'interval') {
    const parsed = intervalScheduleConfigSchema.parse(config)
    if (parsed.intervalMinutes < 60) return `每 ${parsed.intervalMinutes} 分钟`
    if (parsed.intervalMinutes % 60 === 0) return `每 ${parsed.intervalMinutes / 60} 小时`
    return `每 ${parsed.intervalMinutes} 分钟`
  }
  if (scheduleType === 'daily') {
    const parsed = dailyScheduleConfigSchema.parse(config)
    return `每天 ${parsed.timeOfDay}`
  }
  const parsed = weeklyScheduleConfigSchema.parse(config)
  return `${['周日', '周一', '周二', '周三', '周四', '周五', '周六'][parsed.dayOfWeek]} ${parsed.timeOfDay}`
}

function nextTimeOfDay(timeOfDay: string, from: number): number {
  const [hours, minutes] = parseTimeOfDay(timeOfDay)
  const next = new Date(from)
  next.setHours(hours, minutes, 0, 0)
  if (next.getTime() <= from) next.setDate(next.getDate() + 1)
  return next.getTime()
}

function nextWeeklyTime(dayOfWeek: number, timeOfDay: string, from: number): number {
  const [hours, minutes] = parseTimeOfDay(timeOfDay)
  const next = new Date(from)
  next.setHours(hours, minutes, 0, 0)
  const daysUntil = (dayOfWeek - next.getDay() + 7) % 7
  next.setDate(next.getDate() + daysUntil)
  if (next.getTime() <= from) next.setDate(next.getDate() + 7)
  return next.getTime()
}

function parseTimeOfDay(value: string): [number, number] {
  const match = TIME_OF_DAY_RE.exec(value)
  if (!match) throw new Error(`Invalid timeOfDay: ${value}`)
  return [Number(match[1]), Number(match[2])]
}
