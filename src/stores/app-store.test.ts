import { beforeEach, describe, expect, it } from 'vitest'

import type { MessageRow } from '@/db/schema'
import type { DispatchPlanItem } from '@/shared/types'

import { selectDispatchForMessage, useAppStore } from './app-store'

const PLAN: DispatchPlanItem[] = [
  {
    id: 'task_frontend',
    agentId: 'ag_frontend',
    task: '实现页面调整',
  },
]

function resetStore(): void {
  useAppStore.setState({
    conversations: {},
    agents: {},
    messages: {},
    artifacts: {},
    messageIdsByConv: {},
    runsByConv: {},
    dispatchesByRunId: {},
    workbenchView: 'new-task',
    activeConversationId: null,
    previewArtifactId: null,
    fileExplorerOpen: false,
    openFilesByConv: {},
    activeTabByConv: {},
    replyTargetByConv: {},
    pendingQuoteForInput: null,
    pendingAttachmentsByConv: {},
    pendingWritesByConv: {},
    pendingBashCommandsByConv: {},
    pendingQuestionsByConv: {},
    unreadByConv: {},
    mobileSidebarOpen: false,
    highlightedMessageId: null,
    streamConnected: false,
    notifications: [],
    persistentNotifications: [],
    unreadNotificationCount: 0,
    automationResultNotices: {},
    pendingMessageJump: null,
    activeArtifactId: null,
    activeAutomationId: null,
    activeAutomationRunId: null,
    settingsOpen: false,
    activeSettingsSection: null,
  })
}

function agentMessage(id: string, runId: string, createdAt: number): MessageRow {
  return {
    id,
    conversationId: 'conv_1',
    role: 'agent',
    agentId: 'ag_orchestrator',
    parts: [],
    status: 'complete',
    parentMessageId: null,
    mentionedAgentIds: [],
    runId,
    usage: null,
    createdAt,
  }
}

describe('app-store dispatch plan binding', () => {
  beforeEach(() => {
    resetStore()
  })

  it('does not return the same dispatch for every message in the run', () => {
    useAppStore.setState({
      messages: {
        msg_plan: agentMessage('msg_plan', 'run_orch', 1),
        msg_extra: agentMessage('msg_extra', 'run_orch', 2),
      },
      dispatchesByRunId: {
        run_orch: {
          runId: 'run_orch',
          messageId: 'msg_plan',
          plan: PLAN,
          taskStatus: { task_frontend: 'pending' },
          childRunIds: {},
          reviewStatus: 'pending',
          pendingPlanId: 'pdp_1',
        },
      },
    })

    const state = useAppStore.getState()
    expect(selectDispatchForMessage(state, 'msg_plan')?.runId).toBe('run_orch')
    expect(selectDispatchForMessage(state, 'msg_extra')).toBeNull()
  })

  it('attaches a pending dispatch to the next message for that run', () => {
    useAppStore.getState().applyEvent({
      type: 'dispatch.plan.pending',
      conversationId: 'conv_1',
      timestamp: 1,
      pendingPlan: {
        id: 'pdp_1',
        conversationId: 'conv_1',
        agentId: 'ag_orchestrator',
        runId: 'run_orch',
        plan: PLAN,
        createdAt: 1,
      },
    })

    expect(useAppStore.getState().dispatchesByRunId.run_orch?.messageId).toBe('')

    useAppStore.getState().applyEvent({
      type: 'message.start',
      conversationId: 'conv_1',
      timestamp: 2,
      messageId: 'msg_plan',
      agentId: 'ag_orchestrator',
      runId: 'run_orch',
    })

    const state = useAppStore.getState()
    expect(state.dispatchesByRunId.run_orch?.messageId).toBe('msg_plan')
    expect(selectDispatchForMessage(state, 'msg_plan')?.pendingPlanId).toBe('pdp_1')
  })
})


describe('app-store notification reducer', () => {
  beforeEach(() => {
    resetStore()
  })

  it('deduplicates notification events and keeps the newest 20 items', () => {
    for (let index = 0; index < 22; index += 1) {
      useAppStore.getState().applyEvent({
        type: 'notification.created',
        conversationId: `conv_${index}`,
        timestamp: index,
        notification: {
          id: `ntf_${index}`,
          title: `通知 ${index}`,
          level: 'info',
          source: 'system',
          createdAt: index,
          conversationId: `conv_${index}`,
        },
      })
    }

    useAppStore.getState().applyEvent({
      type: 'notification.created',
      conversationId: 'conv_duplicate',
      timestamp: 100,
      notification: {
        id: 'ntf_21',
        title: '重复通知',
        level: 'error',
        source: 'automation',
        createdAt: 100,
        conversationId: 'conv_duplicate',
      },
    })

    const notifications = useAppStore.getState().notifications
    expect(notifications).toHaveLength(20)
    expect(notifications[0]?.id).toBe('ntf_21')
    expect(notifications.at(-1)?.id).toBe('ntf_2')
    expect(notifications.filter((item) => item.id === 'ntf_21')).toHaveLength(1)
  })

  it('opens a conversation from global notification navigation', () => {
    useAppStore.setState({
      workbenchView: 'automation',
      unreadByConv: { conv_result: 3 },
      mobileSidebarOpen: true,
    })

    useAppStore.getState().openConversation('conv_result')

    const state = useAppStore.getState()
    expect(state.workbenchView).toBe('conversations')
    expect(state.activeConversationId).toBe('conv_result')
    expect(state.unreadByConv.conv_result).toBeUndefined()
    expect(state.mobileSidebarOpen).toBe(false)
  })

  it('keeps automation result notices until the result conversation is opened', () => {
    useAppStore.getState().applyEvent({
      type: 'notification.created',
      conversationId: 'conv_result',
      timestamp: 1,
      notification: {
        id: 'ntf_result',
        title: '自动化任务执行完成',
        level: 'success',
        source: 'automation',
        createdAt: 1,
        conversationId: 'conv_result',
        automationId: 'auto_1',
        runId: 'arun_1',
      },
    })

    expect(useAppStore.getState().notifications).toHaveLength(1)
    expect(useAppStore.getState().automationResultNotices.ntf_result).toMatchObject({
      notificationId: 'ntf_result',
      conversationId: 'conv_result',
      automationId: 'auto_1',
      runId: 'arun_1',
      createdAt: 1,
    })

    useAppStore.getState().dismissNotification('ntf_result')
    expect(useAppStore.getState().notifications).toHaveLength(0)
    expect(useAppStore.getState().automationResultNotices.ntf_result).toBeDefined()

    useAppStore.getState().openConversation('conv_result')
    expect(useAppStore.getState().automationResultNotices.ntf_result).toBeUndefined()
  })

  it('tracks persistent notifications and unread count idempotently', () => {
    const event = {
      type: 'notification.created' as const,
      conversationId: 'conv_1',
      timestamp: 1,
      notification: {
        id: 'ntf_persistent',
        title: '持久通知',
        level: 'info' as const,
        source: 'system' as const,
        category: 'system' as const,
        createdAt: 1,
      },
    }

    useAppStore.getState().applyEvent(event)
    useAppStore.getState().applyEvent(event)

    expect(useAppStore.getState().persistentNotifications).toHaveLength(1)
    expect(useAppStore.getState().unreadNotificationCount).toBe(1)

    useAppStore.getState().markNotificationReadLocal('ntf_persistent')
    useAppStore.getState().markNotificationReadLocal('ntf_persistent')
    expect(useAppStore.getState().unreadNotificationCount).toBe(0)

    useAppStore.getState().deleteNotificationLocal('ntf_persistent')
    expect(useAppStore.getState().persistentNotifications).toHaveLength(0)
  })

  it('routes notification targets to the correct workbench state', () => {
    useAppStore.getState().openNotificationTarget({ type: 'settings', settingsSection: 'notifications' })
    expect(useAppStore.getState().settingsOpen).toBe(true)
    expect(useAppStore.getState().activeSettingsSection).toBe('notifications')

    useAppStore.getState().openNotificationTarget({ type: 'automation', automationId: 'auto_1', runId: 'run_1' })
    expect(useAppStore.getState().workbenchView).toBe('automation')
    expect(useAppStore.getState().activeAutomationId).toBe('auto_1')
    expect(useAppStore.getState().activeAutomationRunId).toBe('run_1')

    useAppStore.getState().openNotificationTarget({ type: 'artifact', artifactId: 'art_1', conversationId: 'conv_1', messageId: 'msg_1' })
    expect(useAppStore.getState().workbenchView).toBe('artifacts')
    expect(useAppStore.getState().activeArtifactId).toBe('art_1')
    expect(useAppStore.getState().previewArtifactId).toBe('art_1')

    useAppStore.getState().openNotificationTarget({ type: 'conversation', conversationId: 'conv_2', messageId: 'msg_2' })
    expect(useAppStore.getState().workbenchView).toBe('conversations')
    expect(useAppStore.getState().activeConversationId).toBe('conv_2')
    expect(useAppStore.getState().pendingMessageJump).toEqual({ conversationId: 'conv_2', messageId: 'msg_2' })
  })
})

describe('app-store run failure cleanup', () => {
  beforeEach(() => {
    resetStore()
  })

  it('adds error results for unresolved tool calls when a run fails', () => {
    useAppStore.setState({
      messages: {
        msg_tool: {
          ...agentMessage('msg_tool', 'run_failed', 1),
          status: 'streaming',
          parts: [
            {
              type: 'tool_use',
              callId: 'call_bash',
              toolName: 'bash',
              args: { command: 'npm run dev' },
            },
          ],
        },
      },
      messageIdsByConv: { conv_1: ['msg_tool'] },
    })

    useAppStore.getState().applyEvent({
      type: 'run.end',
      conversationId: 'conv_1',
      timestamp: 2,
      runId: 'run_failed',
      status: 'failed',
      error: 'process exited with code 1',
    })

    const message = useAppStore.getState().messages.msg_tool
    expect(message.status).toBe('error')
    expect(message.parts).toContainEqual({
      type: 'tool_result',
      callId: 'call_bash',
      result: '工具调用未完成：本次运行失败。process exited with code 1',
      isError: true,
    })

    useAppStore.getState().applyEvent({
      type: 'tool.result',
      conversationId: 'conv_1',
      timestamp: 3,
      messageId: 'msg_tool',
      callId: 'call_bash',
      result: 'server fallback',
      isError: true,
    })

    const results = useAppStore
      .getState()
      .messages.msg_tool.parts.filter((part) => part.type === 'tool_result')
    expect(results).toHaveLength(1)
    expect(results[0]).toEqual({
      type: 'tool_result',
      callId: 'call_bash',
      result: 'server fallback',
      isError: true,
    })
  })

  it('does not duplicate existing tool results on aborted runs', () => {
    useAppStore.setState({
      messages: {
        msg_tool: {
          ...agentMessage('msg_tool', 'run_aborted', 1),
          status: 'streaming',
          parts: [
            {
              type: 'tool_use',
              callId: 'call_done',
              toolName: 'fs_read',
              args: { path: 'README.md' },
            },
            {
              type: 'tool_result',
              callId: 'call_done',
              result: 'ok',
              isError: false,
            },
          ],
        },
      },
      messageIdsByConv: { conv_1: ['msg_tool'] },
    })

    useAppStore.getState().applyEvent({
      type: 'run.end',
      conversationId: 'conv_1',
      timestamp: 2,
      runId: 'run_aborted',
      status: 'aborted',
    })

    const message = useAppStore.getState().messages.msg_tool
    expect(message.status).toBe('aborted')
    expect(message.parts.filter((part) => part.type === 'tool_result')).toHaveLength(1)
  })
})
