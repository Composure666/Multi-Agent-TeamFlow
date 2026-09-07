import { describe, expect, it } from 'vitest'

import type { AgentRunDebugDetail, AgentRunDebugEventRecord, AgentRunDebugListItem, MessageRecord } from '@/shared/types'

import {
  buildAgentRunBoardGraph,
  buildAgentRunDebuggerGraph,
  buildAgentRunSessionDebuggerGraph,
  describeAgentRunDebugEvent,
  focusAgentRunDebuggerGraph,
  getAgentRunBoardStageStatus,
  getBoardPanelTabForStage,
  getBoardPanelTabForDebuggerNode,
  getBoardPanelTabForCanvasView,
  getDebuggerNodeIdForDebugEvent,
  getVisibleAgentDebuggerSteps,
  projectAgentRunBoardStages,
  shouldInitializeDebuggerSelection,
  summarizeRunDisplayTitle,
} from './agent-run-debug-board'

function buildRun(overrides: Partial<AgentRunDebugListItem> = {}): AgentRunDebugListItem {
  return {
    id: 'run_1',
    conversationId: 'conv_1',
    agentId: 'agent_1',
    agentName: 'Agent',
    adapterName: 'codex',
    modelId: 'gpt-5-codex',
    triggerMessageId: 'msg_trigger',
    parentRunId: null,
    status: 'running',
    error: null,
    usage: null,
    startedAt: 1,
    finishedAt: null,
    hasDebugSnapshot: true,
    ...overrides,
  }
}

function buildMessage(id: string, parts: MessageRecord['parts']): MessageRecord {
  return {
    id,
    conversationId: 'conv_1',
    role: 'agent',
    agentId: 'agent_1',
    parts,
    status: 'complete',
    parentMessageId: null,
    mentionedAgentIds: [],
    runId: 'run_1',
    usage: null,
    createdAt: 1,
  }
}

function buildDetail(overrides: Partial<AgentRunDebugDetail> = {}): AgentRunDebugDetail {
  return {
    agentRun: buildRun(),
    snapshot: {
      runId: 'run_1',
      conversationId: 'conv_1',
      agent: {
        id: 'agent_1',
        name: 'Agent',
        adapterName: 'codex',
        modelProvider: 'openai',
        modelId: 'gpt-5-codex',
        isOrchestrator: true,
      },
      workspace: {
        mode: 'local',
        effectiveCwd: 'C:/workspace',
        boundPath: 'C:/workspace',
      },
      prompt: {
        overridePrompt: false,
        overrideSystemPrompt: false,
        userPromptChars: 12,
        effectivePromptChars: 24,
        systemPromptChars: 48,
        systemPromptSections: [],
      },
      context: {
        summaryInjected: true,
        summaryId: 'summary_1',
        workspaceMemoryInjected: true,
        workspaceMemoryNoteCount: 2,
        historyInjected: true,
        historyMessageCount: 4,
        historyTokenBudget: 1000,
        historyTokenEstimate: 400,
      },
      tools: {
        toolNames: ['plan_tasks', 'bash'],
        externalMcpServers: [],
        skills: [],
      },
      attachments: [],
    },
    triggerMessage: buildMessage('msg_trigger', [{ type: 'text', content: '执行任务' }]),
    outputMessages: [
      buildMessage('msg_output', [
        {
          type: 'tool_use',
          callId: 'call_1',
          toolName: 'plan_tasks',
          args: {
            tasks: [
              { id: 'design', agentId: 'designer', task: '设计页面', taskKind: 'design' },
              { id: 'code', agentId: 'coder', task: '实现页面', taskKind: 'code', dependsOn: ['design'] },
            ],
          },
        },
        { type: 'tool_result', callId: 'call_1', result: { ok: true }, isError: false },
        { type: 'tool_use', callId: 'call_2', toolName: 'bash', args: { command: 'pnpm test' } },
        { type: 'tool_result', callId: 'call_2', result: { exitCode: 0, status: 'completed' }, isError: false },
        { type: 'artifact_ref', artifactId: 'artifact_1' },
        { type: 'text', content: '完成' },
      ]),
    ],
    childrenRuns: [
      buildRun({ id: 'run_child', agentId: 'coder', agentName: 'Coder', parentRunId: 'run_1', status: 'running' }),
    ],
    parentRun: null,
    ...overrides,
  }
}

function buildDebugEvent(overrides: Partial<AgentRunDebugEventRecord> = {}): AgentRunDebugEventRecord {
  return {
    id: 'event_1',
    conversationId: 'conv_1',
    runId: 'run_1',
    parentRunId: null,
    agentId: null,
    taskId: null,
    stepId: null,
    toolCallId: null,
    type: 'run.debug.step.started',
    status: 'running',
    payload: {},
    createdAt: 1,
    ...overrides,
  }
}

describe('agent run debug board projection', () => {
  it('projects a run into five presentation stages', () => {
    const stages = projectAgentRunBoardStages(buildDetail())

    expect(stages.map((stage) => stage.id)).toEqual(['trigger', 'context', 'plan', 'execute', 'output'])
    expect(stages).toMatchObject([
      { id: 'trigger', status: 'complete', metric: '1 条触发消息' },
      { id: 'context', status: 'complete', metric: '3 类上下文' },
      { id: 'plan', status: 'running', metric: '2 个任务' },
      { id: 'execute', status: 'running', metric: '2 次调用 · 1 个子 Agent' },
      { id: 'output', status: 'running', metric: '1 个产物' },
    ])
  })

  it('keeps a failed run visually actionable', () => {
    const detail = buildDetail({
      agentRun: buildRun({ status: 'failed', error: 'build failed' }),
    })

    expect(getAgentRunBoardStageStatus(detail.agentRun.status, true)).toBe('failed')
    expect(projectAgentRunBoardStages(detail).find((stage) => stage.id === 'execute')).toMatchObject({
      status: 'failed',
      tone: 'danger',
    })
  })

  it('marks context as unavailable for legacy runs without a snapshot', () => {
    const detail = buildDetail({
      agentRun: buildRun({ hasDebugSnapshot: false }),
      snapshot: null,
    })

    expect(projectAgentRunBoardStages(detail).find((stage) => stage.id === 'context')).toMatchObject({
      status: 'unavailable',
      metric: '快照不可用',
    })
  })

  it('builds a left-to-right graph with stable stage ids', () => {
    const graph = buildAgentRunBoardGraph(projectAgentRunBoardStages(buildDetail()))

    expect(graph.nodes.map((node) => node.id)).toEqual([
      'stage-trigger',
      'stage-context',
      'stage-plan',
      'stage-execute',
      'stage-output',
    ])
    expect(graph.edges).toMatchObject([
      { id: 'edge-trigger-context', source: 'stage-trigger', target: 'stage-context', animated: false },
      { id: 'edge-context-plan', source: 'stage-context', target: 'stage-plan', animated: true },
      { id: 'edge-plan-execute', source: 'stage-plan', target: 'stage-execute', animated: true },
      { id: 'edge-execute-output', source: 'stage-execute', target: 'stage-output', animated: true },
    ])
  })

  it('maps stages to the debugging tab that explains them', () => {
    expect(getBoardPanelTabForStage('trigger')).toBe('history')
    expect(getBoardPanelTabForStage('context')).toBe('variables')
    expect(getBoardPanelTabForStage('plan')).toBe('variables')
    expect(getBoardPanelTabForStage('execute')).toBe('trace')
    expect(getBoardPanelTabForStage('output')).toBe('output')
  })

  it('maps debugger nodes to the panel tab that explains them', () => {
    expect(getBoardPanelTabForDebuggerNode('run')).toBe('output')
    expect(getBoardPanelTabForDebuggerNode('agent')).toBe('trace')
    expect(getBoardPanelTabForDebuggerNode('task')).toBe('variables')
    expect(getBoardPanelTabForDebuggerNode('summary')).toBe('output')
  })

  it('maps canvas views to the supporting bottom panel tab', () => {
    expect(getBoardPanelTabForCanvasView('graph')).toBe('trace')
    expect(getBoardPanelTabForCanvasView('timeline')).toBe('timeline')
    expect(getBoardPanelTabForCanvasView('events')).toBe('timeline')
  })

  it('projects task split into agent cards instead of separate task nodes', () => {
    const graph = buildAgentRunDebuggerGraph(buildDetail())

    expect(graph.nodes.map((node) => node.id)).toEqual([
      'run-run_1',
      'agent-agent_1',
      'agent-designer',
      'agent-coder',
      'summary-output',
    ])
    expect(graph.nodes.map((node) => node.data.kind)).toEqual([
      'run',
      'agent',
      'agent',
      'agent',
      'summary',
    ])
    expect(graph.nodes.find((node) => node.id === 'run-run_1')?.data.label).toBe('执行任务')
    expect(graph.nodes.find((node) => node.id === 'agent-agent_1')?.data.agent).toMatchObject({
      role: 'orchestrator',
      status: 'running',
      taskIds: ['design', 'code'],
      toolCallCount: 2,
      taskTitles: ['设计页面', '实现页面'],
    })
    expect(graph.nodes.find((node) => node.id === 'agent-coder')?.data.agent).toMatchObject({
      agentId: 'coder',
      name: 'Coder',
      runId: 'run_child',
      status: 'running',
      steps: [
        expect.objectContaining({
          id: 'code',
          title: '实现页面',
          status: 'running',
          dependsOn: ['design'],
        }),
      ],
    })
    expect(graph.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'run-run_1', target: 'agent-agent_1' }),
      expect.objectContaining({ source: 'agent-agent_1', target: 'agent-designer' }),
      expect.objectContaining({ source: 'agent-agent_1', target: 'agent-coder' }),
      expect.objectContaining({ source: 'agent-designer', target: 'summary-output' }),
      expect.objectContaining({ source: 'agent-coder', target: 'summary-output' }),
    ]))
  })

  it('projects a conversation into message and run groups while expanding the current run', () => {
    const detail = buildDetail()
    const graph = buildAgentRunSessionDebuggerGraph({
      messages: [
        {
          ...buildMessage('msg_trigger', [{ type: 'text', content: '执行任务' }]),
          role: 'user',
          runId: null,
        },
        {
          ...buildMessage('msg_second', [{ type: 'text', content: '继续检查' }]),
          role: 'user',
          runId: null,
          createdAt: 2,
        },
      ],
      runs: [
        detail.agentRun,
        buildRun({
          id: 'run_second',
          triggerMessageId: 'msg_second',
          status: 'complete',
          startedAt: 3,
          finishedAt: 4,
        }),
      ],
      currentDetail: detail,
    })

    expect(graph.nodes.map((node) => node.id)).toEqual(expect.arrayContaining([
      'message-msg_trigger',
      'run-run_1',
      'agent-agent_1',
      'agent-designer',
      'agent-coder',
      'summary-output',
      'message-msg_second',
      'run-run_second',
    ]))
    expect(graph.nodes.find((node) => node.id === 'message-msg_trigger')?.data.message).toMatchObject({
      role: 'user',
      runIds: ['run_1'],
    })
    expect(graph.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'message-msg_trigger', target: 'run-run_1' }),
      expect.objectContaining({ source: 'summary-output', target: 'message-msg_second' }),
      expect.objectContaining({ source: 'message-msg_second', target: 'run-run_second' }),
    ]))
  })

  it('can collapse the current run group in the session graph', () => {
    const detail = buildDetail()
    const graph = buildAgentRunSessionDebuggerGraph({
      messages: [
        {
          ...buildMessage('msg_trigger', [{ type: 'text', content: '执行任务' }]),
          role: 'user',
          runId: null,
        },
      ],
      runs: [detail.agentRun],
      currentDetail: detail,
      expandedRunIds: [],
    })

    expect(graph.nodes.map((node) => node.id)).toEqual([
      'message-msg_trigger',
      'run-run_1',
    ])
    expect(graph.edges).toEqual([
      expect.objectContaining({ source: 'message-msg_trigger', target: 'run-run_1' }),
    ])
  })

  it('expands the loaded detail for a selected historical run in the session graph', () => {
    const historicalDetail = buildDetail({
      agentRun: buildRun({
        id: 'run_second',
        triggerMessageId: 'msg_second',
        status: 'complete',
        startedAt: 3,
        finishedAt: 4,
      }),
      triggerMessage: {
        ...buildMessage('msg_second', [{ type: 'text', content: '继续检查历史 Run' }]),
        role: 'user',
        runId: null,
        createdAt: 2,
      },
      outputMessages: [
        buildMessage('msg_second_output', [
          { type: 'text', content: '历史 Run 输出' },
        ]),
      ],
      childrenRuns: [],
    })
    const graph = buildAgentRunSessionDebuggerGraph({
      messages: [
        {
          ...buildMessage('msg_trigger', [{ type: 'text', content: '执行任务' }]),
          role: 'user',
          runId: null,
        },
        {
          ...buildMessage('msg_second', [{ type: 'text', content: '继续检查历史 Run' }]),
          role: 'user',
          runId: null,
          createdAt: 2,
        },
      ],
      runs: [
        buildRun({ id: 'run_1', status: 'complete', finishedAt: 2 }),
        historicalDetail.agentRun,
      ],
      currentDetail: historicalDetail,
      expandedRunIds: ['run_second'],
    })

    expect(graph.nodes.map((node) => node.id)).toEqual(expect.arrayContaining([
      'message-msg_trigger',
      'run-run_1',
      'message-msg_second',
      'run-run_second',
      'agent-agent_1',
      'summary-output',
    ]))
    expect(graph.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'message-msg_second', target: 'run-run_second' }),
      expect.objectContaining({ source: 'run-run_second', target: 'agent-agent_1' }),
    ]))
  })

  it('omits unlinked messages from a run-backed session graph to avoid false zero-run chains', () => {
    const detail = buildDetail()
    const graph = buildAgentRunSessionDebuggerGraph({
      messages: [
        {
          ...buildMessage('msg_unlinked', [{ type: 'text', content: '早期消息，当前分页没有对应 Run' }]),
          role: 'user',
          runId: null,
          createdAt: 0,
        },
        {
          ...buildMessage('msg_trigger', [{ type: 'text', content: '执行任务' }]),
          role: 'user',
          runId: null,
          createdAt: 1,
        },
      ],
      runs: [detail.agentRun],
      currentDetail: detail,
    })

    expect(graph.nodes.map((node) => node.id)).not.toContain('message-msg_unlinked')
    expect(graph.nodes.map((node) => node.id)).toContain('message-msg_trigger')
  })

  it('places the graph as a readable root-orchestrator-agents-summary topology', () => {
    const graph = buildAgentRunDebuggerGraph(buildDetail())

    const runNode = graph.nodes.find((node) => node.id === 'run-run_1')
    const orchestratorNode = graph.nodes.find((node) => node.id === 'agent-agent_1')
    const workerNodes = graph.nodes.filter((node) => node.data.kind === 'agent' && node.data.agent?.role === 'worker')
    const summaryNode = graph.nodes.find((node) => node.id === 'summary-output')

    expect(runNode?.position.x).toBe(360)
    expect(runNode?.position.y).toBe(0)
    expect(orchestratorNode?.position.x).toBe(360)
    expect(orchestratorNode?.position.y).toBe(170)
    expect(workerNodes.map((node) => node.position.x)).toEqual([208, 513])
    expect(workerNodes.map((node) => node.position.y)).toEqual([430, 430])
    expect(summaryNode?.position).toEqual({ x: 360, y: 690 })
  })

  it('uses a clean task title for the run summary instead of leading agent mentions', () => {
    const graph = buildAgentRunDebuggerGraph(buildDetail({
      snapshot: {
        ...buildDetail().snapshot!,
        agent: {
          ...buildDetail().snapshot!.agent,
          name: 'Orchestrator',
        },
      },
      triggerMessage: buildMessage('msg_trigger', [{ type: 'text', content: '@Orchestrator 审查前端工程并输出风险清单' }]),
    }))

    expect(graph.nodes.find((node) => node.id === 'run-run_1')?.data.label).toBe('审查前端工程并输出风险清单')
  })

  it('uses smooth top-down debugger edges to reduce visual crossings', () => {
    const graph = buildAgentRunDebuggerGraph(buildDetail())

    expect(graph.edges.every((edge) => edge.type === 'smoothstep')).toBe(true)
  })

  it('summarizes long run titles into concise task names', () => {
    expect(summarizeRunDisplayTitle('审查前端任务完成度，继续指派去完成整体review')).toBe('审查前端任务完成度')
    expect(summarizeRunDisplayTitle('@Orchestrator 研究 GitHub 上最新 Agent 项目，并整理结论')).toBe('研究 GitHub 上最新 Agent 项目')
  })

  it('centers a single worker agent to avoid loop-like edges', () => {
    const graph = buildAgentRunDebuggerGraph(buildDetail({
      outputMessages: [
        buildMessage('msg_output', [
          {
            type: 'tool_use',
            callId: 'call_1',
            toolName: 'plan_tasks',
            args: {
              tasks: [
                { id: 'review', agentId: 'reviewer', task: '审查结果', taskKind: 'review' },
              ],
            },
          },
          { type: 'tool_result', callId: 'call_1', result: { ok: true }, isError: false },
        ]),
      ],
      childrenRuns: [
        buildRun({ id: 'run_review', agentId: 'reviewer', agentName: 'Reviewer', parentRunId: 'run_1', status: 'complete' }),
      ],
    }))

    expect(graph.nodes.find((node) => node.id === 'agent-reviewer')?.position).toEqual({ x: 360, y: 430 })
  })

  it('dims non-matching graph nodes for agent, tool, and error filters without removing context', () => {
    const graph = buildAgentRunDebuggerGraph(buildDetail({
      childrenRuns: [
        buildRun({ id: 'run_design', agentId: 'designer', agentName: 'Designer', parentRunId: 'run_1', status: 'complete' }),
        buildRun({ id: 'run_child', agentId: 'coder', agentName: 'Coder', parentRunId: 'run_1', status: 'failed' }),
      ],
    }))

    const agentFocus = focusAgentRunDebuggerGraph(graph, 'agent')
    expect(agentFocus.nodes).toHaveLength(graph.nodes.length)
    expect(agentFocus.nodes.find((node) => node.id === 'agent-coder')?.data.emphasis).toBe('normal')
    expect(agentFocus.nodes.find((node) => node.id === 'summary-output')?.data.emphasis).toBe('muted')

    const toolFocus = focusAgentRunDebuggerGraph(graph, 'tools')
    expect(toolFocus.nodes.find((node) => node.id === 'agent-coder')?.data.emphasis).toBe('normal')
    expect(toolFocus.nodes.find((node) => node.id === 'summary-output')?.data.emphasis).toBe('muted')

    const errorFocus = focusAgentRunDebuggerGraph(graph, 'errors')
    expect(errorFocus.nodes.find((node) => node.id === 'agent-coder')?.data.emphasis).toBe('normal')
    expect(errorFocus.nodes.find((node) => node.id === 'agent-designer')?.data.emphasis).toBe('muted')
  })

  it('resolves runtime events back to their graph agent node', () => {
    const graph = buildAgentRunDebuggerGraph(buildDetail())

    expect(getDebuggerNodeIdForDebugEvent(graph, buildDebugEvent({
      agentId: 'coder',
      taskId: 'code',
      type: 'run.debug.tool.started',
      toolCallId: 'call_2',
    }))).toBe('agent-coder')
    expect(getDebuggerNodeIdForDebugEvent(graph, buildDebugEvent({
      agentId: 'missing',
      type: 'run.debug.step.started',
    }))).toBeNull()
  })

  it('keeps agent steps collapsed by default and exposes all when expanded', () => {
    const steps = ['one', 'two', 'three', 'four'].map((title, index) => ({
      id: `step_${index}`,
      title,
      status: 'waiting' as const,
      dependsOn: [],
      toolNames: [],
    }))

    expect(getVisibleAgentDebuggerSteps(steps, false)).toMatchObject({
      steps: steps.slice(0, 3),
      hiddenCount: 1,
    })
    expect(getVisibleAgentDebuggerSteps(steps, true)).toMatchObject({
      steps,
      hiddenCount: 0,
    })
  })

  it('does not auto-initialize inspector selection after the inspector is closed', () => {
    const graph = buildAgentRunDebuggerGraph(buildDetail())

    expect(shouldInitializeDebuggerSelection({
      inspectorOpen: false,
      selectedNodeId: null,
      graph,
    })).toBe(false)

    expect(shouldInitializeDebuggerSelection({
      inspectorOpen: true,
      selectedNodeId: null,
      graph,
    })).toBe(true)
  })

  it('describes dispatch debug events as readable task assignment rows', () => {
    expect(describeAgentRunDebugEvent(buildDebugEvent({
      taskId: 'code',
      agentId: 'coder',
      type: 'run.debug.step.started',
      payload: {
        childRunId: 'run_child',
        task: '实现页面',
        taskKind: 'code',
      },
    }))).toMatchObject({
      label: '分配任务给 Agent',
      detail: '实现页面',
    })

    expect(describeAgentRunDebugEvent(buildDebugEvent({
      type: 'run.debug.tool.completed',
      toolCallId: 'call_2',
      status: 'complete',
      payload: {
        toolName: 'bash',
        outputSummary: 'exitCode=0',
      },
    }))).toMatchObject({
      label: 'bash 完成',
      detail: 'exitCode=0',
    })
  })

  it('falls back to a single agent graph for legacy runs without a plan', () => {
    const graph = buildAgentRunDebuggerGraph(buildDetail({
      agentRun: buildRun({ status: 'complete', hasDebugSnapshot: false }),
      snapshot: null,
      outputMessages: [],
      childrenRuns: [],
    }))

    expect(graph.nodes).toHaveLength(2)
    expect(graph.nodes.map((node) => node.id)).toEqual(['run-run_1', 'agent-agent_1'])
    expect(graph.nodes.find((node) => node.id === 'agent-agent_1')?.data.agent).toMatchObject({
      role: 'worker',
      status: 'completed',
      source: 'current_run',
    })
    expect(graph.edges).toEqual([
      expect.objectContaining({ source: 'run-run_1', target: 'agent-agent_1' }),
    ])
  })

  it('keeps a summary node for runs with output but no worker agents', () => {
    const graph = buildAgentRunDebuggerGraph(buildDetail({
      agentRun: buildRun({ status: 'complete' }),
      outputMessages: [
        buildMessage('msg_output', [{ type: 'text', content: '已经完成汇总输出' }]),
      ],
      childrenRuns: [],
    }))

    expect(graph.nodes.map((node) => node.id)).toEqual([
      'run-run_1',
      'agent-agent_1',
      'summary-output',
    ])
    expect(graph.nodes.find((node) => node.id === 'summary-output')?.position).toEqual({ x: 360, y: 430 })
    expect(graph.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'agent-agent_1', target: 'summary-output' }),
    ]))
  })

  it('uses child runs as worker agents when plan data is unavailable', () => {
    const graph = buildAgentRunDebuggerGraph(buildDetail({
      agentRun: buildRun({ status: 'running' }),
      outputMessages: [],
      childrenRuns: [
        buildRun({ id: 'run_research', agentId: 'research', agentName: 'Research Agent', parentRunId: 'run_1', status: 'complete' }),
        buildRun({ id: 'run_writer', agentId: 'writer', agentName: 'Writer Agent', parentRunId: 'run_1', status: 'running' }),
      ],
    }))

    expect(graph.nodes.map((node) => node.id)).toEqual([
      'run-run_1',
      'agent-agent_1',
      'agent-research',
      'agent-writer',
      'summary-output',
    ])
    expect(graph.nodes.find((node) => node.id === 'agent-research')?.data.agent).toMatchObject({
      role: 'worker',
      runId: 'run_research',
      status: 'completed',
      taskTitles: ['Research Agent'],
    })
    expect(graph.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'agent-agent_1', target: 'agent-research' }),
      expect.objectContaining({ source: 'agent-agent_1', target: 'agent-writer' }),
      expect.objectContaining({ source: 'agent-research', target: 'summary-output' }),
      expect.objectContaining({ source: 'agent-writer', target: 'summary-output' }),
    ]))
  })

  it('merges planned and child-run-backed worker agents', () => {
    const graph = buildAgentRunDebuggerGraph(buildDetail({
      outputMessages: [
        buildMessage('msg_output', [
          {
            type: 'tool_use',
            callId: 'call_1',
            toolName: 'plan_tasks',
            args: {
              tasks: [
                { id: 'review', agentId: 'reviewer', task: '审查结果', taskKind: 'review' },
              ],
            },
          },
          { type: 'tool_result', callId: 'call_1', result: { ok: true }, isError: false },
        ]),
      ],
      childrenRuns: [
        buildRun({ id: 'run_review', agentId: 'reviewer', agentName: 'Reviewer', parentRunId: 'run_1', status: 'complete' }),
        buildRun({ id: 'run_frontend', agentId: 'frontend', agentName: 'Frontend Agent', parentRunId: 'run_1', status: 'complete' }),
      ],
    }))

    expect(graph.nodes.filter((node) => node.data.kind === 'agent' && node.data.agent?.role === 'worker').map((node) => node.data.agent?.agentId)).toEqual([
      'reviewer',
      'frontend',
    ])
    expect(graph.nodes.find((node) => node.id === 'agent-frontend')?.data.agent).toMatchObject({
      runId: 'run_frontend',
      taskTitles: ['Frontend Agent'],
      source: 'child_run',
    })
  })
})
