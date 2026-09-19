import { describe, expect, it } from 'vitest'

import {
  automationFormFromTask,
  automationStatusLabel,
  buildAutomationPromptEnhanceInput,
  buildAutomationSaveBody,
  type AutomationTaskView,
} from './automation-workspace-model'

describe('automation workspace model', () => {
  it('normalizes empty bindings and interval configuration for saving', () => {
    const body = buildAutomationSaveBody({
      title: '  周报整理  ',
      description: '  汇总本周进展  ',
      category: '  团队协作  ',
      prompt: '  输出结构化周报  ',
      agentId: '',
      conversationId: '',
      scheduleType: 'interval',
      intervalMinutes: '',
      timeOfDay: '09:00',
      dayOfWeek: '1',
      status: 'enabled',
    })

    expect(body).toEqual({
      title: '周报整理',
      description: '汇总本周进展',
      category: '团队协作',
      prompt: '输出结构化周报',
      agentId: null,
      conversationId: null,
      scheduleType: 'interval',
      scheduleConfig: { intervalMinutes: 60 },
      status: 'enabled',
    })
  })

  it('projects an existing weekly task into editable form fields', () => {
    const task = {
      title: '行业简报',
      description: '整理信息',
      category: '研究',
      prompt: '生成简报',
      agentId: 'agent-1',
      conversationId: 'conversation-1',
      scheduleType: 'weekly',
      scheduleConfig: { dayOfWeek: 5, timeOfDay: '18:30' },
      rawStatus: 'paused',
    } as AutomationTaskView

    expect(automationFormFromTask(task)).toMatchObject({
      dayOfWeek: '5',
      timeOfDay: '18:30',
      status: 'paused',
    })
  })

  it('describes the selected schedule when building AI prompt context', () => {
    const input = buildAutomationPromptEnhanceInput({
      ...automationFormFromTask(),
      title: '周一例会准备',
      prompt: '把本周进展整理成例会材料',
      scheduleType: 'weekly',
      dayOfWeek: '1',
      timeOfDay: '08:30',
    })

    // 用户原文与背景分开:草稿进 prompt,标题/触发方式只作背景
    expect(input.prompt).toBe('把本周进展整理成例会材料')
    expect(input.context.title).toBe('周一例会准备')
    expect(input.context.schedule).toBe('每周 周一 08:30 执行')
  })

  it('falls back to title + description as the raw prompt when no draft exists', () => {
    const input = buildAutomationPromptEnhanceInput({
      ...automationFormFromTask(),
      title: '每日舆情简报',
      description: '汇总当天行业新闻',
      prompt: '   ',
    })

    expect(input.prompt).toBe('每日舆情简报\n汇总当天行业新闻')
    // 系统上下文(分类/审批)不再随请求下发
    expect(JSON.stringify(input)).not.toContain('任务分类')
  })

  it('maps running and paused states to user-facing labels', () => {
    expect(automationStatusLabel('running')).toBe('运行中')
    expect(automationStatusLabel('paused')).toBe('已暂停')
  })
})
