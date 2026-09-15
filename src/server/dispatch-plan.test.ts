import { describe, expect, it } from 'vitest'

import type { DispatchPlanItem } from '@/shared/types'

import {
  assertAcyclicDispatchPlan,
  buildReplanContext,
  CODE_TASK_PROJECT_OUTPUT_DESCRIPTION,
  CODE_TASK_RUNNABLE_ACCEPTANCE_CRITERION,
  CODE_TASK_RUNNABLE_REQUIRED_EVIDENCE,
  collectDependencyClosure,
  compileDispatchPlan,
  extractPlanTasksToolArgs,
  parseDispatchPlanToolArgs,
  shouldReplan,
  taskExpectsArtifact,
  tryCompileAndValidateDispatchPlan,
  validateDispatchPlan,
} from './dispatch-plan'

const agents = [
  { id: 'ag_pm' },
  { id: 'ag_designer' },
  { id: 'ag_frontend' },
  { id: 'ag_reviewer' },
]

const planArgs = {
  reasoning: 'Split into implementation and review.',
  tasks: [{ id: 't1', agentId: 'ag_frontend', task: 'Build UI' }],
}

function task(
  id: string,
  agentId: string,
  dependsOn?: string[],
  instruction = `Do ${id}`,
): DispatchPlanItem {
  const item: DispatchPlanItem = { id, agentId, task: instruction }
  if (dependsOn) item.dependsOn = dependsOn
  return item
}

describe('parseDispatchPlanToolArgs', () => {
  it('parses valid plan_tasks args', () => {
    expect(
      parseDispatchPlanToolArgs({
        tasks: [
          { id: 't1', agentId: 'ag_pm', task: 'Write PRD' },
          { id: 't2', agentId: 'ag_frontend', task: 'Build UI', dependsOn: ['t1'] },
        ],
      }),
    ).toEqual([
      { id: 't1', agentId: 'ag_pm', task: 'Write PRD' },
      { id: 't2', agentId: 'ag_frontend', task: 'Build UI', dependsOn: ['t1'] },
    ])
  })

  it('parses task contracts for artifact handoff', () => {
    expect(
      parseDispatchPlanToolArgs({
        tasks: [
          {
            id: 't1',
            agentId: 'ag_pm',
            task: 'Write PRD',
            expectedOutputs: [
              {
                id: 'prd',
                type: 'document',
                description: 'Product requirements',
              },
            ],
            acceptanceCriteria: ['Includes P0 scope'],
          },
          {
            id: 't2',
            agentId: 'ag_frontend',
            task: 'Build UI',
            inputs: [{ fromTaskId: 't1', outputId: 'prd' }],
            expectedOutputs: [{ id: 'web_app', type: 'web_app' }],
          },
        ],
      }),
    ).toEqual([
      {
        id: 't1',
        agentId: 'ag_pm',
        task: 'Write PRD',
        expectedOutputs: [
          {
            id: 'prd',
            type: 'document',
            description: 'Product requirements',
          },
        ],
        acceptanceCriteria: ['Includes P0 scope'],
      },
      {
        id: 't2',
        agentId: 'ag_frontend',
        task: 'Build UI',
        inputs: [{ fromTaskId: 't1', outputId: 'prd' }],
        expectedOutputs: [{ id: 'web_app', type: 'web_app' }],
      },
    ])
  })

  it('parses evidence contract fields', () => {
    expect(
      parseDispatchPlanToolArgs({
        tasks: [
          {
            id: 't1',
            agentId: 'ag_frontend',
            task: 'Implement endpoint',
            taskKind: 'code',
            targetPaths: ['src/server/foo.ts'],
            expectedWorkspaceChanges: ['Add foo handler'],
            requiredCommands: [
              {
                command: 'pnpm test src/server/foo.test.ts',
                cwd: 'frontend',
                timeoutMs: 300000,
              },
            ],
            requiredEvidence: ['测试命令 exitCode=0'],
          },
        ],
      }),
    ).toEqual([
      {
        id: 't1',
        agentId: 'ag_frontend',
        task: 'Implement endpoint',
        taskKind: 'code',
        targetPaths: ['src/server/foo.ts'],
        expectedWorkspaceChanges: ['Add foo handler'],
        requiredCommands: [
          {
            command: 'pnpm test src/server/foo.test.ts',
            cwd: 'frontend',
            timeoutMs: 300000,
          },
        ],
        requiredEvidence: ['测试命令 exitCode=0'],
      },
    ])
  })

  it('parses project expected outputs for workspace code trees', () => {
    expect(
      parseDispatchPlanToolArgs({
        tasks: [
          {
            id: 't1',
            agentId: 'ag_frontend',
            task: 'Implement frontend project',
            taskKind: 'code',
            expectedOutputs: [{ id: 'project', type: 'project', required: true }],
          },
        ],
      }),
    ).toEqual([
      {
        id: 't1',
        agentId: 'ag_frontend',
        task: 'Implement frontend project',
        taskKind: 'code',
        expectedOutputs: [{ id: 'project', type: 'project', required: true }],
      },
    ])
  })

  it('rejects malformed tool args', () => {
    expect(() => parseDispatchPlanToolArgs(null)).toThrow('tasks array')
    expect(() => parseDispatchPlanToolArgs({ tasks: ['bad'] })).toThrow(
      'task at index 0 must be an object',
    )
    expect(() => parseDispatchPlanToolArgs({ tasks: [{ id: '', agentId: 'ag_pm', task: 'x' }] }))
      .toThrow('task at index 0 id must be a non-empty string')
    expect(() =>
      parseDispatchPlanToolArgs({ tasks: [{ id: 't1', agentId: 'ag_pm', task: 'x', dependsOn: 't0' }] }),
    ).toThrow('dependsOn must be an array')
    expect(() =>
      parseDispatchPlanToolArgs({ tasks: [{ id: 't1', agentId: 'ag_pm', task: 'x', dependsOn: [1] }] }),
    ).toThrow('dependsOn[0] must be a non-empty string')
    expect(() =>
      parseDispatchPlanToolArgs({ tasks: [{ id: 't1', agentId: 'ag_pm', task: 'x', taskKind: 'unknown' }] }),
    ).toThrow('task "t1" taskKind must be one of')
    expect(() =>
      parseDispatchPlanToolArgs({
        tasks: [
          {
            id: 't1',
            agentId: 'ag_pm',
            task: 'x',
            requiredCommands: [{ command: 'pnpm build', timeoutMs: -1 }],
          },
        ],
      }),
    ).toThrow('requiredCommands[0].timeoutMs must be a positive integer')
  })

  it('parses plan_tasks args delivered as a stringified JSON object', () => {
    expect(
      parseDispatchPlanToolArgs(JSON.stringify({ tasks: [{ id: 't1', agentId: 'ag_pm', task: 'Write PRD' }] })),
    ).toEqual([{ id: 't1', agentId: 'ag_pm', task: 'Write PRD' }])
  })

  it('parses plan_tasks args whose tasks field itself is a JSON string', () => {
    // claude-code path 曾把 tasks 字段序列化成字符串，导致 Array.isArray(tasks) 校验失败、
    // Orchestrator 连续 3 次补救后兜底转普通回复（run 从未进入执行阶段，终端/日志全空）。
    const args = {
      reasoning: 'Split into implementation and review.',
      tasks: JSON.stringify([
        { id: 't1', agentId: 'ag_frontend', task: 'Build UI' },
        { id: 't2', agentId: 'ag_reviewer', task: 'Review UI', dependsOn: ['t1'] },
      ]),
    }
    expect(parseDispatchPlanToolArgs(args)).toEqual([
      { id: 't1', agentId: 'ag_frontend', task: 'Build UI' },
      { id: 't2', agentId: 'ag_reviewer', task: 'Review UI', dependsOn: ['t1'] },
    ])
  })

  it('surfaces helpful diagnostics when args are missing the tasks array', () => {
    let message = ''
    try {
      parseDispatchPlanToolArgs({ reasoning: 'I will handle this myself.' })
    } catch (err) {
      message = err instanceof Error ? err.message : String(err)
    }
    expect(message).toContain('must include a tasks array')
    // 应该明确告诉 LLM 期待的结构，并指出实际观察到的字段
    expect(message).toContain('Expected shape')
    expect(message).toContain('reasoning')
  })

  it('rejects empty-string plan_tasks args', () => {
    expect(() => parseDispatchPlanToolArgs('')).toThrow('empty string')
  })

  it('rejects plan_tasks args that are non-JSON strings', () => {
    expect(() => parseDispatchPlanToolArgs('not a json')).toThrow('non-JSON string')
  })
})

describe('validateDispatchPlan', () => {
  it('accepts a valid acyclic plan', () => {
    const plan = [
      task('t1', 'ag_pm'),
      task('t2', 'ag_frontend', ['t1']),
      task('t3', 'ag_reviewer', ['t2']),
    ]

    expect(() => validateDispatchPlan(plan, agents, 'ag_orchestrator')).not.toThrow()
  })

  it('rejects empty plans and duplicate task ids', () => {
    expect(() => validateDispatchPlan([], agents, 'ag_orchestrator')).toThrow(
      'tasks must not be empty',
    )
    expect(() =>
      validateDispatchPlan([task('t1', 'ag_pm'), task('t1', 'ag_frontend')], agents, 'ag_orchestrator'),
    ).toThrow('duplicate task id(s): t1')
  })

  it('rejects unavailable or recursive agent targets', () => {
    expect(() => validateDispatchPlan([task('t1', 'ag_orchestrator')], agents, 'ag_orchestrator'))
      .toThrow('dispatches to the orchestrator itself')
    expect(() => validateDispatchPlan([task('t1', 'ag_missing')], agents, 'ag_orchestrator'))
      .toThrow('references unavailable agentId "ag_missing"')
  })

  it('rejects invalid dependencies', () => {
    expect(() => validateDispatchPlan([task('t1', 'ag_pm', ['t1'])], agents, 'ag_orchestrator'))
      .toThrow('cannot depend on itself')
    expect(() => validateDispatchPlan([task('t1', 'ag_pm', ['t0'])], agents, 'ag_orchestrator'))
      .toThrow('depends on unknown task "t0"')
    expect(() =>
      validateDispatchPlan([task('t1', 'ag_pm'), task('t2', 'ag_frontend', ['t1', 't1'])], agents, 'ag_orchestrator'),
    ).toThrow('lists duplicate dependency "t1"')
  })

  it('accepts dependencies on resolved external tasks during replan', () => {
    expect(() =>
      validateDispatchPlan(
        [task('t4', 'ag_frontend', ['t2'])],
        agents,
        'ag_orchestrator',
        [task('t2', 'ag_pm')],
      ),
    ).not.toThrow()
  })

  it('rejects invalid task contracts', () => {
    expect(() =>
      validateDispatchPlan(
        [
          {
            ...task('t1', 'ag_pm'),
            expectedOutputs: [
              { id: 'prd', type: 'document' },
              { id: 'prd', type: 'document' },
            ],
          },
        ],
        agents,
        'ag_orchestrator',
      ),
    ).toThrow('duplicate expected output "prd"')

    expect(() =>
      validateDispatchPlan(
        [
          { ...task('t1', 'ag_pm'), expectedOutputs: [{ id: 'prd', type: 'document' }] },
          {
            ...task('t2', 'ag_frontend'),
            inputs: [{ fromTaskId: 't1', outputId: 'missing' }],
          },
        ],
        agents,
        'ag_orchestrator',
      ),
    ).toThrow('input references unknown output "missing" from task "t1"')
  })

  it('accepts inputs from resolved external tasks during replan', () => {
    expect(() =>
      validateDispatchPlan(
        [
          {
            ...task('t4', 'ag_frontend'),
            inputs: [{ fromTaskId: 't2', outputId: 'prd' }],
          },
        ],
        agents,
        'ag_orchestrator',
        [{ ...task('t2', 'ag_pm'), expectedOutputs: [{ id: 'prd', type: 'document' }] }],
      ),
    ).not.toThrow()
  })

  it('rejects circular dependencies', () => {
    const plan = [task('t1', 'ag_pm', ['t2']), task('t2', 'ag_frontend', ['t1'])]

    expect(() => validateDispatchPlan(plan, agents, 'ag_orchestrator')).toThrow(
      'circular dependency t1 -> t2 -> t1',
    )
  })
})

describe('extractPlanTasksToolArgs', () => {
  it('recognizes native AgentHub plan_tasks tool calls', () => {
    expect(extractPlanTasksToolArgs({ toolName: 'plan_tasks', args: planArgs })).toBe(planArgs)
  })

  it('recognizes Claude Code MCP plan_tasks tool calls', () => {
    expect(extractPlanTasksToolArgs({ toolName: 'mcp__agenthub__plan_tasks', args: planArgs }))
      .toBe(planArgs)
  })

  it('unwraps Codex MCP plan_tasks tool call arguments', () => {
    expect(
      extractPlanTasksToolArgs({
        toolName: 'codex_mcp_agenthub_plan_tasks',
        args: { server: 'agenthub', tool: 'plan_tasks', arguments: planArgs },
      }),
    ).toBe(planArgs)
  })

  it('unwraps JSON-encoded Codex MCP plan_tasks tool call arguments', () => {
    expect(
      extractPlanTasksToolArgs({
        toolName: 'codex_mcp_agenthub_plan_tasks',
        args: { server: 'agenthub', tool: 'plan_tasks', arguments: JSON.stringify(planArgs) },
      }),
    ).toEqual(planArgs)
  })

  it('ignores unrelated tool calls', () => {
    expect(extractPlanTasksToolArgs({ toolName: 'write_artifact', args: planArgs })).toBeNull()
  })
})

describe('compileDispatchPlan', () => {
  it('adds required project output and runnable evidence to code tasks', () => {
    const { plan } = compileDispatchPlan([
      {
        ...task('t1', 'ag_frontend', undefined, 'Implement the frontend app'),
        taskKind: 'code',
      },
    ])

    expect(plan[0].expectedOutputs).toContainEqual({
      id: 'project',
      type: 'project',
      required: true,
      description: CODE_TASK_PROJECT_OUTPUT_DESCRIPTION,
    })
    expect(plan[0].acceptanceCriteria).toContain(CODE_TASK_RUNNABLE_ACCEPTANCE_CRITERION)
    expect(plan[0].requiredEvidence).toContain(CODE_TASK_RUNNABLE_REQUIRED_EVIDENCE)
  })

  it('forces declared project outputs on code tasks to be required', () => {
    const { plan } = compileDispatchPlan([
      {
        ...task('t1', 'ag_frontend', undefined, 'Implement the backend project'),
        taskKind: 'code',
        expectedOutputs: [{ id: 'workspace', type: 'project', required: false }],
      },
    ])

    expect(plan[0].expectedOutputs).toEqual([
      {
        id: 'workspace',
        type: 'project',
        required: true,
        description: CODE_TASK_PROJECT_OUTPUT_DESCRIPTION,
      },
    ])
  })

  it('does not add project outputs to explicit review tasks', () => {
    const { plan } = compileDispatchPlan([
      {
        ...task('t1', 'ag_reviewer', undefined, 'Review the implementation and summarize risks'),
        taskKind: 'review',
      },
    ])

    expect(plan[0].expectedOutputs).toBeUndefined()
    expect(plan[0].acceptanceCriteria).toBeUndefined()
    expect(plan[0].requiredEvidence).toBeUndefined()
  })

  it('infers missing dependencies from task id artifact references', () => {
    const { plan, inferredDependencies } = compileDispatchPlan([
      task('t1', 'ag_pm', undefined, '请产出 PRD 文档，并写入 artifact。'),
      task('t2', 'ag_frontend', undefined, '读取 t1 产物后实现 web_app artifact。'),
    ])

    expect(plan[1].dependsOn).toEqual(['t1'])
    expect(inferredDependencies).toEqual([
      {
        taskId: 't2',
        dependsOn: ['t1'],
        reason: 'task text references earlier task output',
      },
    ])
    expect(() => validateDispatchPlan(plan, agents, 'ag_orchestrator')).not.toThrow()
  })

  it('infers the PRD to UI to frontend to reviewer incident pattern', () => {
    const { plan } = compileDispatchPlan([
      task('t1', 'ag_pm', undefined, '输出一份 PRD 文档，并写入 artifact。'),
      task('t2', 'ag_designer', undefined, '读取 PRD artifact 后输出一份 UI 设计方案。'),
      task('t3', 'ag_frontend', undefined, '读取 PRD 和 UI 设计，输出一个 web_app artifact。'),
      task(
        't4',
        'ag_reviewer',
        undefined,
        '审查前端工程师产出的 web_app artifact，检查是否符合 PRD 和 UI 设计，并输出审查报告。',
      ),
    ])

    expect(plan.map((item) => ({ id: item.id, dependsOn: item.dependsOn }))).toEqual([
      { id: 't1', dependsOn: undefined },
      { id: 't2', dependsOn: ['t1'] },
      { id: 't3', dependsOn: ['t1', 't2'] },
      { id: 't4', dependsOn: ['t1', 't2', 't3'] },
    ])
  })

  it('preserves explicit dependencies while adding missing review predecessors', () => {
    const { plan } = compileDispatchPlan([
      task('t1', 'ag_pm', undefined, '输出一份 PRD 文档，并写入 artifact。'),
      task('t2', 'ag_designer', ['t1'], '读取 PRD artifact 后输出一份 UI 设计方案。'),
      task('t3', 'ag_frontend', ['t2'], '读取 UI 设计，输出一个 web_app artifact。'),
      task('t4', 'ag_reviewer', ['t3'], '审查实现是否符合 PRD 和 UI 设计，并输出审查报告。'),
    ])

    expect(plan[3].dependsOn).toEqual(['t3', 't1', 't2'])
  })

  it('compiles task inputs into dependencies', () => {
    const { plan } = compileDispatchPlan([
      { ...task('t1', 'ag_pm'), expectedOutputs: [{ id: 'prd', type: 'document' }] },
      {
        ...task('t2', 'ag_frontend'),
        inputs: [{ fromTaskId: 't1', outputId: 'prd' }],
      },
    ])

    expect(plan[1].dependsOn).toEqual(['t1'])
    expect(() => validateDispatchPlan(plan, agents, 'ag_orchestrator')).not.toThrow()
  })

  it('returns actionable feedback for mismatched input output ids', () => {
    const result = tryCompileAndValidateDispatchPlan(
      [
        { ...task('t1', 'ag_pm'), expectedOutputs: [{ id: 'prd_doc', type: 'document' }] },
        {
          ...task('t2', 'ag_frontend'),
          inputs: [{ fromTaskId: 't1', outputId: 'prd' }],
        },
      ],
      agents,
      'ag_orchestrator',
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('input references unknown output "prd" from task "t1"')
      expect(result.error).toContain('Task "t1" declares expectedOutputs: prd_doc')
      expect(result.error).toContain('call plan_tasks again with the full corrected plan')
      // 反馈里同时列出所有可用 task id，避免 LLM 重复捏造 dep id
      expect(result.error).toContain('Available task ids')
    }
  })

  it('lists every available task id when a dependsOn references an unknown task', () => {
    const result = tryCompileAndValidateDispatchPlan(
      [
        task('t1_baseline', 'ag_pm'),
        task('t2_retry', 'ag_frontend', ['t1']),
      ],
      agents,
      'ag_orchestrator',
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('depends on unknown task "t1"')
      // 必须把真实存在的 task id 列出来，否则 LLM 会在补救轮里继续 hallucinate
      expect(result.error).toContain('Available task ids: t1_baseline, t2_retry')
      expect(result.error).toContain('every dependsOn id must be one of the available task ids')
    }
  })

  it('lists external resolved task ids alongside the new plan', () => {
    const result = tryCompileAndValidateDispatchPlan(
      [task('t2_retry', 'ag_frontend', ['ghost_task'])],
      agents,
      'ag_orchestrator',
      [task('t1_baseline', 'ag_pm')],
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      // 既要列出当前 plan 的 id，也要列出已 resolved 的外部 task id
      expect(result.error).toContain('Available task ids: t1_baseline, t2_retry')
      expect(result.error).toContain('depends on unknown task "ghost_task"')
    }
  })

  // 回归：补救轮里 LLM 复用上一轮已完成的 id，反馈只说「Available task ids」会被理解成
  // 「这些 id 可以拿来当新任务 id」，于是一直撞车。
  it('tells the model which task ids are already occupied and suggests a fresh one', () => {
    const result = tryCompileAndValidateDispatchPlan(
      [task('t1', 'ag_frontend', ['ghost'])],
      agents,
      'ag_orchestrator',
      [task('t1', 'ag_pm'), task('t2', 'ag_designer')],
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('Occupied task ids from previous rounds')
      expect(result.error).toContain('do NOT reuse them as new task ids: t1, t2')
      expect(result.error).toContain('"t3"')
    }
  })

  it('explains that a self-dependency on an occupied id needs a fresh id', () => {
    expect(() =>
      validateDispatchPlan([task('t1', 'ag_frontend', ['t1'])], agents, 'ag_orchestrator', [
        task('t1', 'ag_pm'),
      ]),
    ).toThrow(
      /cannot depend on itself[\s\S]*already used by a previous round[\s\S]*"t2"/,
    )
  })
})

describe('collectDependencyClosure', () => {
  it('returns transitive dependencies in upstream order', () => {
    const plan = [
      task('t1', 'ag_pm'),
      task('t2', 'ag_designer', ['t1']),
      task('t3', 'ag_frontend', ['t2']),
      task('t4', 'ag_reviewer', ['t3']),
    ]

    expect(collectDependencyClosure(plan, 't4')).toEqual(['t1', 't2', 't3'])
  })
})

describe('taskExpectsArtifact', () => {
  it('distinguishes artifact-producing tasks from read-only tasks', () => {
    expect(taskExpectsArtifact(task('t1', 'ag_pm', undefined, '输出一个 document/markdown artifact。'))).toBe(true)
    expect(taskExpectsArtifact(task('t2', 'ag_frontend', undefined, '请实现一个完整的响应式网页应用。'))).toBe(true)
    expect(taskExpectsArtifact(task('t2', 'ag_reviewer', undefined, '读取 artifact 并总结主要问题。'))).toBe(false)
  })
})

describe('assertAcyclicDispatchPlan', () => {
  it('accepts linear DAGs', () => {
    expect(() =>
      assertAcyclicDispatchPlan([task('t1', 'ag_pm'), task('t2', 'ag_frontend', ['t1'])]),
    ).not.toThrow()
  })

  it('detects self and multi-node cycles', () => {
    expect(() => assertAcyclicDispatchPlan([task('t1', 'ag_pm', ['t1'])])).toThrow(
      'circular dependency t1 -> t1',
    )
    expect(() =>
      assertAcyclicDispatchPlan([task('t1', 'ag_pm', ['t2']), task('t2', 'ag_frontend', ['t1'])]),
    ).toThrow('circular dependency t1 -> t2 -> t1')
  })
})

describe('shouldReplan', () => {
  it('false when all tasks complete and no conflicts', () => {
    expect(
      shouldReplan(
        [
          { taskId: 't1', agentId: 'ag_pm', status: 'complete' },
          { taskId: 't2', agentId: 'ag_frontend', status: 'complete' },
        ],
        [],
      ),
    ).toBe(false)
  })

  it('true when a task failed or was skipped', () => {
    expect(
      shouldReplan(
        [
          { taskId: 't1', agentId: 'ag_pm', status: 'complete' },
          { taskId: 't2', agentId: 'ag_frontend', status: 'failed', error: 'no artifact' },
        ],
        [],
      ),
    ).toBe(true)
  })

  it('true when there is a write conflict even if all complete', () => {
    expect(
      shouldReplan(
        [{ taskId: 't1', agentId: 'ag_a', status: 'complete' }],
        [{ path: 'index.html', taskIds: ['t1', 't2'] }],
      ),
    ).toBe(true)
  })
})

describe('buildReplanContext', () => {
  it('lists complete + failed tasks + conflicts and instructs remediation', () => {
    const ctx = buildReplanContext(
      [
        { taskId: 't1', agentId: 'ag_pm', status: 'complete' },
        { taskId: 't2', agentId: 'ag_frontend', status: 'failed', error: 'missing artifact' },
      ],
      [{ path: 'index.html', taskIds: ['t2', 't3'] }],
    )
    expect(ctx).toContain('<previous_round_results>')
    expect(ctx).toContain('id="t1" agent="ag_pm" status="complete"')
    expect(ctx).toContain('status="failed"')
    expect(ctx).toContain('missing artifact')
    expect(ctx).toContain('<file_conflicts>')
    expect(ctx).toContain('index.html')
    expect(ctx).toContain('plan_tasks')
  })
})
