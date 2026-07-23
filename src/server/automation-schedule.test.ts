import { describe, expect, it } from 'vitest'

import { calculateNextRunAt, cadenceFromSchedule, parseScheduleConfig } from './automation-schedule'

function localTimestamp(year: number, monthIndex: number, day: number, hours: number, minutes: number): number {
  return new Date(year, monthIndex, day, hours, minutes, 0, 0).getTime()
}

function localTimestampWithSeconds(year: number, monthIndex: number, day: number, hours: number, minutes: number, seconds: number): number {
  return new Date(year, monthIndex, day, hours, minutes, seconds, 0).getTime()
}

describe('automation schedule', () => {
  it('does not schedule manual automations', () => {
    expect(parseScheduleConfig('manual', undefined)).toBeNull()
    expect(calculateNextRunAt('manual', null, localTimestamp(2026, 0, 1, 8, 0))).toBeNull()
  })

  it('schedules interval automations by minutes', () => {
    const from = localTimestamp(2026, 0, 1, 8, 0)
    const config = parseScheduleConfig('interval', { intervalMinutes: 30 })
    expect(calculateNextRunAt('interval', config, from)).toBe(from + 30 * 60 * 1000)
    expect(cadenceFromSchedule('interval', config)).toBe('每 30 分钟')
  })

  it('schedules daily automations at the next time of day', () => {
    const config = parseScheduleConfig('daily', { timeOfDay: '09:00' })
    expect(calculateNextRunAt('daily', config, localTimestamp(2026, 0, 1, 8, 0))).toBe(localTimestamp(2026, 0, 1, 9, 0))
    expect(calculateNextRunAt('daily', config, localTimestamp(2026, 0, 1, 10, 0))).toBe(localTimestamp(2026, 0, 2, 9, 0))
    expect(cadenceFromSchedule('daily', config)).toBe('每天 09:00')
  })

  it('schedules weekly automations at the next matching weekday', () => {
    const config = parseScheduleConfig('weekly', { dayOfWeek: 5, timeOfDay: '18:00' })
    expect(calculateNextRunAt('weekly', config, localTimestamp(2026, 0, 1, 8, 0))).toBe(localTimestamp(2026, 0, 2, 18, 0))
    expect(calculateNextRunAt('weekly', config, localTimestamp(2026, 0, 2, 19, 0))).toBe(localTimestamp(2026, 0, 9, 18, 0))
    expect(cadenceFromSchedule('weekly', config)).toBe('周五 18:00')
  })

  it('advances daily automations when the configured minute has already started', () => {
    const config = parseScheduleConfig('daily', { timeOfDay: '10:35' })
    expect(calculateNextRunAt('daily', config, localTimestampWithSeconds(2026, 6, 22, 10, 34, 59))).toBe(localTimestamp(2026, 6, 22, 10, 35))
    expect(calculateNextRunAt('daily', config, localTimestampWithSeconds(2026, 6, 22, 10, 35, 0))).toBe(localTimestamp(2026, 6, 23, 10, 35))
    expect(calculateNextRunAt('daily', config, localTimestampWithSeconds(2026, 6, 22, 10, 35, 30))).toBe(localTimestamp(2026, 6, 23, 10, 35))
    expect(calculateNextRunAt('daily', config, localTimestampWithSeconds(2026, 6, 22, 10, 36, 0))).toBe(localTimestamp(2026, 6, 23, 10, 35))
  })

  it('advances weekly automations when the configured minute has already started', () => {
    const config = parseScheduleConfig('weekly', { dayOfWeek: 3, timeOfDay: '10:35' })
    expect(calculateNextRunAt('weekly', config, localTimestampWithSeconds(2026, 6, 22, 10, 34, 59))).toBe(localTimestamp(2026, 6, 22, 10, 35))
    expect(calculateNextRunAt('weekly', config, localTimestampWithSeconds(2026, 6, 22, 10, 35, 0))).toBe(localTimestamp(2026, 6, 29, 10, 35))
    expect(calculateNextRunAt('weekly', config, localTimestampWithSeconds(2026, 6, 22, 10, 35, 30))).toBe(localTimestamp(2026, 6, 29, 10, 35))
    expect(calculateNextRunAt('weekly', config, localTimestampWithSeconds(2026, 6, 22, 10, 36, 0))).toBe(localTimestamp(2026, 6, 29, 10, 35))
  })
})
