import { describe, expect, it } from 'vitest'

import type { AgentRunDebugDetail, AgentRunDebugListItem, MessageRecord } from '@/shared/types'

import {
  getAgentRunToolTraceKind,
  projectAgentRunArtifacts,
  projectAgentRunAskUserInteractions,
  projectAgentRunOperations,
  projectAgentRunPlanDag,
  projectAgentRunPlanTasks,
  projectAgentRunRelations,
  projectAgentRunTaskResults,
  projectAgentRunTimeline,
  projectAgentRunToolTrace,
  summarizeAgentRunToolTraceArgs,
  summarizeAgentRunToolTraceResult,
  summarizeMessageRecord,
  summarizeUnknown,
  type AgentRunToolTraceItem,
} from './agent-run-debug-projection'

function buildRun(): AgentRunDebugListItem {
  return {
    id: 'run_1',
    conversationId: 'conv_1',
    agentId: 'agent_1',
    agentName: 'Agent',
    adapterName: 'codex',
    modelId: 'gpt-5-codex',
    triggerMessageId: null,
    parentRunId: null,
    status: 'complete',
    error: null,
    usage: null,
    startedAt: 1,
    finishedAt: 2,
    hasDebugSnapshot: false,
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

function buildDetail(outputMessages: MessageRecord[]): AgentRunDebugDetail {
  return {
    agentRun: buildRun(),
    snapshot: null,
    triggerMessage: null,
    outputMessages,
    childrenRuns: [],
    parentRun: null,
  }
}

function buildTraceItem(toolName: string, args: unknown, result: unknown = null): AgentRunToolTraceItem {
  return {
    callId: 'call_1',
    toolName,
    messageId: 'msg_1',
    messageIndex: 0,
    partIndex: 0,
    args,
    result,
    isError: false,
    completed: result !== null,
  }
}

describe('agent run debug projection', () => {
  it('pairs tool_use with matching tool_result', () => {
    const detail = buildDetail([
      buildMessage('msg_1', [
        { type: 'tool_use', callId: 'call_1', toolName: 'codex_command', args: { command: 'pnpm test' } },
        { type: 'tool_result', callId: 'call_1', result: { status: 'completed', exitCode: 0 }, isError: false },
      ]),
    ])

    expect(projectAgentRunToolTrace(detail)).toEqual([
      {
        callId: 'call_1',
        toolName: 'codex_command',
        messageId: 'msg_1',
        messageIndex: 0,
        partIndex: 0,
        args: { command: 'pnpm test' },
        result: { status: 'completed', exitCode: 0 },
        isError: false,
        completed: true,
      },
    ])
  })

  it('keeps trace order across output messages', () => {
    const detail = buildDetail([
      buildMessage('msg_1', [
        { type: 'text', content: 'before' },
        { type: 'tool_use', callId: 'call_1', toolName: 'fs_read', args: { path: 'a.ts' } },
      ]),
      buildMessage('msg_2', [
        { type: 'tool_use', callId: 'call_2', toolName: 'web_fetch', args: { url: 'https://example.com' } },
      ]),
    ])

    expect(projectAgentRunToolTrace(detail).map((item) => item.callId)).toEqual(['call_1', 'call_2'])
  })

  it('marks tool_use without result as incomplete', () => {
    const detail = buildDetail([
      buildMessage('msg_1', [
        { type: 'tool_use', callId: 'call_1', toolName: 'ask_user', args: { questions: [] } },
      ]),
    ])

    expect(projectAgentRunToolTrace(detail)[0]).toMatchObject({ completed: false, result: null })
  })

  it('keeps orphan tool_result as unknown_tool', () => {
    const detail = buildDetail([
      buildMessage('msg_1', [
        { type: 'tool_result', callId: 'call_1', result: { error: 'missing call' }, isError: true },
      ]),
    ])

    expect(projectAgentRunToolTrace(detail)[0]).toMatchObject({
      toolName: 'unknown_tool',
      completed: true,
      isError: true,
    })
  })

  it('classifies Codex and AgentHub tools', () => {
    expect(getAgentRunToolTraceKind('codex_command')).toBe('command')
    expect(getAgentRunToolTraceKind('codex_file_change')).toBe('file_change')
    expect(getAgentRunToolTraceKind('codex_mcp_agenthub_write_artifact')).toBe('mcp')
    expect(getAgentRunToolTraceKind('codex_web_search')).toBe('web_search')
    expect(getAgentRunToolTraceKind('plan_tasks')).toBe('agenthub')
    expect(getAgentRunToolTraceKind('custom_tool')).toBe('other')
  })

  it('summarizes common tool args and results', () => {
    expect(summarizeAgentRunToolTraceArgs(buildTraceItem('codex_command', { command: 'pnpm lint' }))).toBe('pnpm lint')
    expect(summarizeAgentRunToolTraceArgs(buildTraceItem('web_fetch', { url: 'https://example.com/docs' }))).toBe('https://example.com/docs')
    expect(summarizeAgentRunToolTraceArgs(buildTraceItem('codex_mcp_agenthub_write_artifact', {
      server: 'agenthub',
      tool: 'write_artifact',
      arguments: { type: 'diagram' },
    }))).toBe('agenthub / write_artifact args={"type":"diagram"}')
    expect(summarizeAgentRunToolTraceArgs(buildTraceItem('codex_file_change', {
      changes: [{ kind: 'modify', path: 'src/a.ts' }, { kind: 'create', path: 'src/b.ts' }],
    }))).toBe('2 changes: modify:src/a.ts, create:src/b.ts')
    expect(summarizeAgentRunToolTraceResult(buildTraceItem('codex_command', {}, {
      status: 'completed',
      exitCode: 0,
      output: 'ok',
    }))).toBe('status=completed · exitCode=0 · output=ok')
  })

  it('projects plan_tasks from direct and Codex MCP calls', () => {
    const direct = buildTraceItem('plan_tasks', {
      tasks: [
        {
          id: 't1',
          agentId: 'agent_a',
          task: '实现功能',
          taskKind: 'code',
          dependsOn: ['t0'],
          targetPaths: ['src/a.ts'],
          acceptanceCriteria: ['typecheck passes'],
          requiredCommands: [{ command: 'pnpm typecheck' }],
        },
      ],
    })
    const codexMcp = buildTraceItem('codex_mcp_agenthub_plan_tasks', {
      server: 'agenthub',
      tool: 'plan_tasks',
      arguments: {
        tasks: [{ id: 't2', agentId: 'agent_b', task: '补测试' }],
      },
    })

    expect(projectAgentRunPlanTasks([direct])).toMatchObject([
      {
        id: 't1',
        agentId: 'agent_a',
        task: '实现功能',
        taskKind: 'code',
        dependsOn: ['t0'],
        targetPaths: ['src/a.ts'],
        acceptanceCriteria: ['typecheck passes'],
        requiredCommands: [{ command: 'pnpm typecheck' }],
      },
    ])
    expect(projectAgentRunPlanTasks([codexMcp])).toMatchObject([
      { id: 't2', agentId: 'agent_b', task: '补测试' },
    ])
  })

  it('projects a layered DAG from plan task dependencies', () => {
    const dag = projectAgentRunPlanDag([
      { id: 'design', agentId: 'agent_a', task: '设计方案', taskKind: 'design' },
      { id: 'code', agentId: 'agent_b', task: '实现功能', taskKind: 'code', dependsOn: ['design'] },
      { id: 'test', agentId: 'agent_c', task: '补测试', taskKind: 'test', dependsOn: ['design'] },
      { id: 'review', agentId: 'agent_d', task: '代码审查', taskKind: 'review', dependsOn: ['code', 'test'] },
    ])

    expect(dag.edges).toEqual([
      { from: 'design', to: 'code' },
      { from: 'design', to: 'test' },
      { from: 'code', to: 'review' },
      { from: 'test', to: 'review' },
    ])
    expect(dag.layers).toEqual([['design'], ['code', 'test'], ['review']])
    expect(dag.nodes).toMatchObject([
      { id: 'design', layer: 0, isRoot: true, isLeaf: false, dependents: ['code', 'test'] },
      { id: 'code', layer: 1, dependsOn: ['design'], isRoot: false, isLeaf: false },
      { id: 'test', layer: 1, dependsOn: ['design'], isRoot: false, isLeaf: false },
      { id: 'review', layer: 2, dependsOn: ['code', 'test'], isRoot: false, isLeaf: true },
    ])
    expect(dag.hasCycle).toBe(false)
    expect(dag.missingDependencyCount).toBe(0)
  })

  it('keeps DAG renderable when dependencies are missing or cyclic', () => {
    const dag = projectAgentRunPlanDag([
      { id: 'a', agentId: 'agent_a', task: 'A', dependsOn: ['c', 'missing'] },
      { id: 'b', agentId: 'agent_b', task: 'B', dependsOn: ['a'] },
      { id: 'c', agentId: 'agent_c', task: 'C', dependsOn: ['b'] },
    ])

    expect(dag.nodes).toHaveLength(3)
    expect(dag.edges).toEqual([
      { from: 'c', to: 'a' },
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
    ])
    expect(dag.missingDependencyCount).toBe(1)
    expect(dag.hasCycle).toBe(true)
    expect(dag.nodes.find((node) => node.id === 'a')).toMatchObject({ missingDependsOn: ['missing'], hasCycle: true })
  })

  it('projects file, command, and network operations', () => {
    const operations = projectAgentRunOperations([
      buildTraceItem('codex_command', { command: 'pnpm test' }, { command: 'pnpm test', exitCode: 0, status: 'completed' }),
      buildTraceItem('web_fetch', { url: 'https://example.com/docs' }, { status: 'ok' }),
      buildTraceItem('fs_read', { path: 'src/a.ts' }, { ok: true }),
      buildTraceItem('codex_file_change', { changes: [{ kind: 'modify', path: 'src/b.ts' }] }, { changes: [{ kind: 'modify', path: 'src/b.ts' }], status: 'completed' }),
    ])

    expect(operations.commands).toEqual([
      {
        callId: 'call_1',
        toolName: 'codex_command',
        command: 'pnpm test',
        exitCode: 0,
        status: 'completed',
        isError: false,
      },
    ])
    expect(operations.network).toEqual([
      {
        callId: 'call_1',
        toolName: 'web_fetch',
        target: 'https://example.com/docs',
        kind: 'fetch',
        status: 'ok',
        isError: false,
      },
    ])
    expect(operations.files).toEqual([
      {
        callId: 'call_1',
        toolName: 'fs_read',
        kind: 'read',
        path: 'src/a.ts',
        isError: false,
      },
      {
        callId: 'call_1',
        toolName: 'codex_file_change',
        kind: 'change',
        path: 'src/b.ts',
        detail: 'modify',
        isError: false,
      },
    ])
  })

  it('projects ask_user interactions with answers', () => {
    const interactions = projectAgentRunAskUserInteractions([
      buildTraceItem('codex_mcp_agenthub_ask_user', {
        server: 'agenthub',
        tool: 'ask_user',
        arguments: {
          questions: [
            {
              question: '选择实现方式?',
              header: '方案',
              multiSelect: false,
              options: [{ label: 'A' }, { label: 'B' }],
            },
          ],
        },
      }, { value: { answers: { '选择实现方式?': 'A' } } }),
    ])

    expect(interactions).toEqual([
      {
        callId: 'call_1',
        messageId: 'msg_1',
        questionCount: 1,
        answered: true,
        isError: false,
        questions: [
          {
            question: '选择实现方式?',
            header: '方案',
            multiSelect: false,
            options: ['A', 'B'],
            answer: 'A',
          },
        ],
      },
    ])
  })

  it('projects report_task_result summaries', () => {
    expect(projectAgentRunTaskResults([
      buildTraceItem('codex_mcp_agenthub_report_task_result', {
        arguments: {
          status: 'complete',
          summary: '已完成',
          filesChanged: [{ path: 'src/a.ts', action: 'modified' }],
          commandsRun: [{ command: 'pnpm typecheck', exitCode: 0 }],
          tests: [{ command: 'pnpm test', passed: true }],
          acceptanceResults: [{ criterion: '通过检查', passed: true, evidence: 'typecheck' }],
        },
      }, { ok: true }),
    ])).toMatchObject([
      {
        callId: 'call_1',
        messageId: 'msg_1',
        status: 'complete',
        summary: '已完成',
        filesChanged: [{ path: 'src/a.ts', action: 'modified' }],
        commandsRun: [{ command: 'pnpm typecheck', exitCode: 0 }],
        tests: [{ command: 'pnpm test', passed: true }],
        acceptanceResults: [{ criterion: '通过检查', passed: true, evidence: 'typecheck' }],
      },
    ])
  })

  it('projects artifact refs, deploy status, and deploy candidates', () => {
    const detail = buildDetail([
      buildMessage('msg_1', [
        { type: 'artifact_ref', artifactId: 'artifact_1' },
        {
          type: 'deploy_status',
          deployment: {
            id: 'deploy_1',
            artifactId: 'artifact_1',
            title: 'Demo',
            version: 2,
            previewPath: '/preview/deploy_1',
            publicUrl: 'https://example.com/demo',
            status: 'ready',
            createdAt: 1,
          },
        },
        {
          type: 'deploy_candidates',
          candidates: [
            { artifactId: 'artifact_2', title: 'Candidate', version: 1, createdByAgentId: 'agent_2', createdAt: 2 },
          ],
        },
      ]),
    ])

    expect(projectAgentRunArtifacts(detail)).toMatchObject([
      {
        kind: 'artifact_ref',
        artifactId: 'artifact_1',
        title: null,
        version: null,
        status: null,
        previewPath: null,
        detail: 'artifact_1',
        isError: false,
      },
      {
        kind: 'deploy_status',
        artifactId: 'artifact_1',
        title: 'Demo',
        version: 2,
        status: 'ready',
        previewPath: '/preview/deploy_1',
        detail: 'https://example.com/demo',
        isError: false,
      },
      {
        kind: 'deploy_candidate',
        artifactId: 'artifact_2',
        title: 'Candidate',
        version: 1,
        detail: 'candidate by agent_2',
        isError: false,
      },
    ])
  })

  it('projects a compact timeline from output message parts', () => {
    const detail = buildDetail([
      buildMessage('msg_1', [
        { type: 'thinking', content: '思考' },
        { type: 'tool_use', callId: 'call_1', toolName: 'fs_read', args: { path: 'src/a.ts' } },
        { type: 'tool_result', callId: 'call_1', result: { status: 'ok' }, isError: false },
        { type: 'text', content: '完成' },
      ]),
      buildMessage('msg_2', [
        { type: 'tool_use', callId: 'call_2', toolName: 'ask_user', args: { questions: [] } },
      ]),
    ])

    expect(projectAgentRunTimeline(detail)).toMatchObject([
      { id: 'msg_1:message', kind: 'message', label: 'agent message', detail: '4 parts · complete', status: 'done' },
      { messageId: 'msg_1', partIndex: 0, kind: 'thinking', label: 'thinking', detail: '2 chars', status: 'done' },
      { messageId: 'msg_1', partIndex: 1, kind: 'tool_call', label: 'fs_read', detail: '{"path":"src/a.ts"}', status: 'done' },
      { messageId: 'msg_1', partIndex: 2, kind: 'tool_result', label: 'result call_1', detail: 'status=ok', status: 'done' },
      { messageId: 'msg_1', partIndex: 3, kind: 'text', label: 'text', detail: '完成', status: 'done' },
      { id: 'msg_2:message', kind: 'message', detail: '1 parts · complete', status: 'done' },
      { messageId: 'msg_2', partIndex: 0, kind: 'tool_call', label: 'ask_user', status: 'pending' },
    ])
  })
  it('projects run relations and message summaries', () => {
    const trigger = buildMessage('msg_trigger', [
      { type: 'text', content: '请执行任务' },
    ])
    const output = buildMessage('msg_output', [
      { type: 'thinking', content: '分析中' },
      { type: 'tool_use', callId: 'call_1', toolName: 'fs_read', args: { path: 'src/a.ts' } },
      { type: 'tool_result', callId: 'call_1', result: { ok: true }, isError: false },
      { type: 'artifact_ref', artifactId: 'artifact_1' },
      { type: 'text', content: '已完成' },
    ])
    const child = { ...buildRun(), id: 'run_child', parentRunId: 'run_1', status: 'running' as const }
    const parent = { ...buildRun(), id: 'run_parent', finishedAt: null }
    const detail: AgentRunDebugDetail = {
      ...buildDetail([output]),
      triggerMessage: trigger,
      childrenRuns: [child],
      parentRun: parent,
    }

    expect(projectAgentRunRelations(detail)).toMatchObject({
      current: { id: 'run_1', agentId: 'agent_1', status: 'complete' },
      parent: { id: 'run_parent', status: 'complete', finishedAt: null },
      children: [{ id: 'run_child', status: 'running' }],
      triggerMessage: { messageId: 'msg_trigger', partCount: 1, textChars: 5, preview: '请执行任务' },
      outputMessages: [
        {
          messageId: 'msg_output',
          partCount: 5,
          textChars: 3,
          thinkingChars: 3,
          toolUseCount: 1,
          toolResultCount: 1,
          artifactRefCount: 1,
          deployPartCount: 0,
          preview: '已完成',
        },
      ],
    })
  })

  it('summarizes message parts without exposing full long content', () => {
    expect(summarizeMessageRecord(buildMessage('msg_1', [
      { type: 'text', content: 'x'.repeat(300) },
      { type: 'deploy_candidates', candidates: [] },
    ]))).toMatchObject({
      messageId: 'msg_1',
      partCount: 2,
      textChars: 300,
      deployPartCount: 1,
      preview: `${'x'.repeat(159)}…`,
    })
  })
  it('summarizes unexpected unknown values without throwing', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular

    expect(summarizeUnknown(circular)).toBe('[unserializable]')
    expect(summarizeUnknown('x'.repeat(300))).toHaveLength(240)
  })
})
