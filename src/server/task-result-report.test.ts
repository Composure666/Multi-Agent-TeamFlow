import { describe, expect, it } from 'vitest'

import type { DispatchPlanItem, TaskResultReport } from '@/shared/types'

import {
  evaluateTaskResultReport,
  isTaskResultReportToolName,
  readTaskResultReportFromToolResult,
} from './task-result-report'

function task(overrides: Partial<DispatchPlanItem> = {}): DispatchPlanItem {
  return {
    id: 't1',
    agentId: 'ag_reviewer',
    task: 'Review the implementation',
    ...overrides,
  }
}

const completeReport: TaskResultReport = {
  status: 'complete',
  summary: 'Reviewed the implementation and found it acceptable.',
  acceptanceResults: [
    {
      criterion: 'Checks PRD alignment',
      passed: true,
      evidence: 'The implementation covers the required PRD scope.',
    },
  ],
}

describe('readTaskResultReportFromToolResult', () => {
  it('parses direct CustomAgent tool results', () => {
    expect(readTaskResultReportFromToolResult(completeReport)).toEqual(completeReport)
  })

  it('parses Claude MCP text content', () => {
    expect(
      readTaskResultReportFromToolResult([
        { type: 'text', text: JSON.stringify(completeReport) },
      ]),
    ).toEqual(completeReport)
  })

  it('parses Codex MCP wrapper results', () => {
    expect(
      readTaskResultReportFromToolResult({
        result: {
          structuredContent: completeReport,
        },
        status: 'completed',
      }),
    ).toEqual(completeReport)
  })
})

describe('isTaskResultReportToolName', () => {
  it('matches direct and MCP-prefixed tool names', () => {
    expect(isTaskResultReportToolName('report_task_result')).toBe(true)
    expect(isTaskResultReportToolName('mcp__agenthub__report_task_result')).toBe(true)
    expect(isTaskResultReportToolName('codex_mcp_agenthub_report_task_result')).toBe(true)
    expect(isTaskResultReportToolName('write_artifact')).toBe(false)
  })
})

describe('evaluateTaskResultReport', () => {
  it('accepts complete reports with matching acceptance criteria', () => {
    expect(
      evaluateTaskResultReport(
        task({ acceptanceCriteria: ['Checks PRD alignment'] }),
        completeReport,
      ),
    ).toEqual({ ok: true })
  })

  it('does not use expectedOutputs as a completion gate', () => {
    expect(
      evaluateTaskResultReport(
        task({ expectedOutputs: [{ id: 'report', type: 'document' }] }),
        {
          status: 'complete',
          summary: 'The review was completed in the final message.',
        },
      ),
    ).toEqual({ ok: true })
  })

  it('fails when a child task omits report_task_result', () => {
    expect(evaluateTaskResultReport(task(), undefined)).toEqual({
      ok: false,
      error: 'Task "t1" completed without report_task_result',
    })
  })

  it('fails when the child reports failed or blocked', () => {
    expect(
      evaluateTaskResultReport(task(), {
        status: 'blocked',
        summary: 'Need missing credentials.',
        blockers: ['Missing API key'],
      }),
    ).toEqual({
      ok: false,
      error: 'Task "t1" reported blocked: Need missing credentials. Blockers: Missing API key',
    })
  })

  it('fails when acceptance criteria are missing or failed', () => {
    expect(
      evaluateTaskResultReport(task({ acceptanceCriteria: ['Checks PRD alignment'] }), {
        status: 'complete',
        summary: 'Done.',
      }),
    ).toEqual({
      ok: false,
      error: 'Task "t1" report is missing acceptance criteria result(s): Checks PRD alignment',
    })

    expect(
      evaluateTaskResultReport(task(), {
        status: 'complete',
        summary: 'Done.',
        acceptanceResults: [
          {
            criterion: 'Checks PRD alignment',
            passed: false,
            evidence: 'The implementation missed the export workflow.',
          },
        ],
      }),
    ).toEqual({
      ok: false,
      error:
        'Task "t1" did not satisfy acceptance criteria: Checks PRD alignment (The implementation missed the export workflow.)',
    })
  })

  it('accepts complete reports with required file and command evidence', () => {
    expect(
      evaluateTaskResultReport(
        task({
          targetPaths: ['src/server/foo.ts'],
          requiredCommands: [{ command: 'pnpm test src/server/foo.test.ts' }],
          requiredEvidence: ['测试命令 exitCode=0'],
        }),
        {
          status: 'complete',
          summary: 'Implemented foo. 测试命令 exitCode=0',
          filesChanged: [{ path: 'src/server/foo.ts', action: 'modified' }],
          commandsRun: [{ command: 'pnpm test src/server/foo.test.ts', exitCode: 0 }],
        },
        {
          fileWrites: [
            {
              path: 'src/server/foo.ts',
              absolutePath: 'E:/repo/src/server/foo.ts',
              bytes: 123,
              applied: 'auto',
            },
          ],
          commands: [
            {
              command: 'pnpm test src/server/foo.test.ts',
              cwd: 'E:/repo',
              exitCode: 0,
              timedOut: false,
              isError: false,
            },
          ],
        },
      ),
    ).toEqual({ ok: true })
  })

  it('fails complete reports missing required file or command evidence', () => {
    expect(
      evaluateTaskResultReport(
        task({
          targetPaths: ['src/server/foo.ts'],
          requiredCommands: [{ command: 'pnpm test src/server/foo.test.ts' }],
        }),
        {
          status: 'complete',
          summary: 'Done.',
        },
      ),
    ).toEqual({
      ok: false,
      error:
        'Task "t1" report is missing target path evidence: src/server/foo.ts. Evidence seen — filesChanged/fileWrites: [none]; artifacts: [none]; commands: [none].',
    })

    expect(
      evaluateTaskResultReport(
        task({
          requiredCommands: [{ command: 'pnpm test src/server/foo.test.ts' }],
        }),
        {
          status: 'complete',
          summary: 'Done.',
        },
      ),
    ).toEqual({
      ok: false,
      error:
        'Task "t1" report is missing successful command evidence: pnpm test src/server/foo.test.ts',
    })
  })

  it('fails complete reports when managed command evidence failed', () => {
    expect(
      evaluateTaskResultReport(
        task(),
        {
          status: 'complete',
          summary: 'Done.',
        },
        {
          fileWrites: [],
          commands: [
            {
              command: 'mvn compile',
              cwd: 'E:/repo',
              exitCode: 1,
              timedOut: false,
              isError: false,
            },
          ],
        },
      ),
    ).toEqual({
      ok: false,
      error: 'Task "t1" has failed command evidence: mvn compile (exit 1)',
    })
  })

  it('accepts when a failed managed command later succeeds', () => {
    expect(
      evaluateTaskResultReport(
        task({ requiredCommands: [{ command: 'pnpm build', cwd: 'frontend' }] }),
        {
          status: 'complete',
          summary: 'Build now passes.',
          commandsRun: [{ command: 'pnpm build', exitCode: 0, cwd: 'frontend' }],
        },
        {
          fileWrites: [],
          commands: [
            {
              command: 'pnpm build',
              cwd: 'E:/repo/frontend',
              exitCode: 1,
              timedOut: false,
              isError: false,
            },
            {
              command: 'pnpm build',
              cwd: 'E:/repo/frontend',
              exitCode: 0,
              timedOut: false,
              isError: false,
            },
          ],
        },
      ),
    ).toEqual({ ok: true })
  })

  it('accepts when a Windows stderr-redirected build is followed by an equivalent successful build', () => {
    expect(
      evaluateTaskResultReport(
        task({ requiredCommands: [{ command: 'npm run build', cwd: 'frontend' }] }),
        {
          status: 'complete',
          summary: 'Build now passes.',
          commandsRun: [{ command: 'npm run build', exitCode: 0, cwd: 'frontend' }],
        },
        {
          fileWrites: [],
          commands: [
            {
              command: 'npm run build 2>&1',
              cwd: 'E:/repo/frontend',
              exitCode: 1,
              timedOut: false,
              isError: false,
            },
            {
              command: 'npm run build',
              cwd: 'E:/repo/frontend',
              exitCode: 0,
              timedOut: false,
              isError: false,
            },
          ],
        },
      ),
    ).toEqual({ ok: true })
  })

  it('does not let an earlier automatic prepare failure block later successful verification', () => {
    expect(
      evaluateTaskResultReport(
        task({ requiredCommands: [{ command: 'pnpm build', cwd: 'frontend' }] }),
        {
          status: 'complete',
          summary: 'Build passes after dependencies were prepared.',
          commandsRun: [{ command: 'pnpm build', exitCode: 0, cwd: 'frontend' }],
        },
        {
          fileWrites: [],
          commands: [
            {
              command: 'pnpm install',
              cwd: 'E:/repo/frontend',
              exitCode: 1,
              timedOut: false,
              isError: false,
              prepare: true,
            },
            {
              command: 'pnpm build',
              cwd: 'E:/repo/frontend',
              exitCode: 1,
              timedOut: false,
              isError: true,
              error: 'prepare command failed',
            },
            {
              command: 'pnpm build',
              cwd: 'E:/repo/frontend',
              exitCode: 0,
              timedOut: false,
              isError: false,
            },
          ],
        },
      ),
    ).toEqual({ ok: true })
  })

  it('does not clear a failed command with a later success from a different cwd', () => {
    expect(
      evaluateTaskResultReport(
        task(),
        {
          status: 'complete',
          summary: 'Backend build passes.',
        },
        {
          fileWrites: [],
          commands: [
            {
              command: 'npm run build 2>&1',
              cwd: 'E:/repo/frontend',
              exitCode: 1,
              timedOut: false,
              isError: false,
            },
            {
              command: 'npm run build',
              cwd: 'E:/repo/backend',
              exitCode: 0,
              timedOut: false,
              isError: false,
            },
          ],
        },
      ),
    ).toEqual({
      ok: false,
      error: 'Task "t1" has failed command evidence: npm run build 2>&1 (exit 1)',
    })
  })

  it('fails code tasks without successful runnable verification command evidence', () => {
    expect(
      evaluateTaskResultReport(
        task({ task: 'Implement the frontend app', taskKind: 'code' }),
        {
          status: 'complete',
          summary: 'Implemented the app.',
        },
        {
          fileWrites: [
            {
              path: 'frontend/src/App.tsx',
              absolutePath: 'E:/repo/frontend/src/App.tsx',
              bytes: 123,
              applied: 'auto',
            },
          ],
          commands: [],
        },
      ),
    ).toEqual({
      ok: false,
      error:
        'Task "t1" is missing successful runnable verification command evidence: build/compile/test/typecheck/lint command exitCode=0',
    })
  })

  it('does not count prepare commands as runnable verification', () => {
    expect(
      evaluateTaskResultReport(
        task({ task: 'Implement the frontend app', taskKind: 'code' }),
        {
          status: 'complete',
          summary: 'Dependencies installed and app implemented.',
        },
        {
          fileWrites: [],
          commands: [
            {
              command: 'pnpm install',
              cwd: 'E:/repo/frontend',
              exitCode: 0,
              timedOut: false,
              isError: false,
              prepare: true,
            },
          ],
        },
      ),
    ).toEqual({
      ok: false,
      error:
        'Task "t1" is missing successful runnable verification command evidence: build/compile/test/typecheck/lint command exitCode=0',
    })
  })

  it('accepts code tasks with successful build command evidence', () => {
    expect(
      evaluateTaskResultReport(
        task({ task: 'Implement the frontend app', taskKind: 'code' }),
        {
          status: 'complete',
          summary: 'Build passes.',
        },
        {
          fileWrites: [],
          commands: [
            {
              command: 'pnpm build',
              cwd: 'E:/repo/frontend',
              exitCode: 0,
              timedOut: false,
              isError: false,
            },
          ],
        },
      ),
    ).toEqual({ ok: true })
  })

  it('does not count unrelated successful commands as runnable verification', () => {
    expect(
      evaluateTaskResultReport(
        task({ task: 'Implement the frontend app', taskKind: 'code' }),
        {
          status: 'complete',
          summary: 'Listed files.',
        },
        {
          fileWrites: [],
          commands: [
            {
              command: 'ls',
              cwd: 'E:/repo/frontend',
              exitCode: 0,
              timedOut: false,
              isError: false,
            },
          ],
        },
      ),
    ).toEqual({
      ok: false,
      error:
        'Task "t1" is missing successful runnable verification command evidence: build/compile/test/typecheck/lint command exitCode=0',
    })
  })

  it('allows non-code review tasks to complete without runnable verification', () => {
    expect(
      evaluateTaskResultReport(
        task({ task: 'Review the implementation', taskKind: 'review' }),
        {
          status: 'complete',
          summary: 'Reviewed the implementation.',
        },
      ),
    ).toEqual({ ok: true })
  })

  // 回归：交付方式是「bash 生成 + write_artifact」时，磁盘上可能根本没有 workspace 文件，
  // 以前 targetPaths 门禁永远判不过并触发重试放大（一次生图任务曾放大成 12 个 run）。
  it('counts artifacts created by write_artifact as target path evidence', () => {
    expect(
      evaluateTaskResultReport(
        task({
          task: '生成信息图',
          taskKind: 'design',
          targetPaths: ['output/xiaomi-band-11-infographic.png'],
        }),
        { status: 'complete', summary: '信息图已生成并通过 write_artifact 交付。' },
        {
          fileWrites: [],
          commands: [],
          artifacts: [
            {
              artifactId: 'art_1',
              title: '小米手环11 横版科技酷炫风信息图（1920×1080）',
              type: 'image',
              version: 1,
            },
          ],
        },
      ),
    ).toEqual({ ok: true })
  })

  it('does not let an artifact satisfy a directory target path', () => {
    expect(
      evaluateTaskResultReport(
        task({ task: '实现前端', taskKind: 'code', targetPaths: ['frontend/'] }),
        { status: 'complete', summary: 'Done.' },
        {
          fileWrites: [],
          commands: [],
          artifacts: [{ artifactId: 'art_1', title: '首页', type: 'web_app', version: 1 }],
        },
      ),
    ).toMatchObject({ ok: false })
  })

  it('lists the evidence it did see when target path evidence is missing', () => {
    const result = evaluateTaskResultReport(
      task({ targetPaths: ['src/server/foo.ts'] }),
      { status: 'complete', summary: 'Done.' },
      {
        fileWrites: [],
        commands: [
          { command: 'ls', cwd: 'E:/repo', exitCode: 0, timedOut: false, isError: false },
        ],
        artifacts: [{ artifactId: 'art_1', title: '说明文档', type: 'document', version: 1 }],
      },
    )
    expect(result.ok).toBe(false)
    expect(result.error).toContain('artifacts: [document:说明文档]')
    expect(result.error).toContain('commands: [ls]')
  })

  // ─────────────────────────────────────────────────────────────────────────
  // 以下 3 个用例复现「产物验收恒失败 → 重试放大 → 产物爆炸」的死锁。
  // 共同点：产物的确是该任务的交付物，但 targetPath 的扩展名 / 文件名主干
  // 与产物 type / title 对不上，门禁每次都判不过 —— agent 只能反复重做，
  // 每次 write_artifact 又生成一个全新独立产物（不是新版本）。
  // ─────────────────────────────────────────────────────────────────────────

  it('accepts a mermaid diagram delivered as type=diagram for a .svg target path', () => {
    // svg → ARTIFACT_TYPE_BY_EXTENSION 映射到 image，而 Mermaid 源码类交付的
    // write_artifact type 是 diagram：扩展名与语义 type 错位 → 以前恒失败。
    expect(
      evaluateTaskResultReport(
        task({
          task: '画订单流程图',
          taskKind: 'design',
          targetPaths: ['output/order-flow.svg'],
        }),
        { status: 'complete', summary: '流程图已交付。' },
        {
          fileWrites: [],
          commands: [],
          artifacts: [
            { artifactId: 'art_1', title: '订单流程图', type: 'diagram', version: 1 },
          ],
        },
      ),
    ).toEqual({ ok: true })
  })

  it('accepts a short CJK filename stem when the artifact is clearly the deliverable', () => {
    // stem = '流程图' 只有 3 个字符，被 `stem.length < 4` 直接拒掉；
    // 中文命名在这个门禁里天然吃亏 → 恒失败。
    expect(
      evaluateTaskResultReport(
        task({
          task: '画流程图',
          taskKind: 'design',
          targetPaths: ['output/流程图.mmd'],
        }),
        { status: 'complete', summary: '流程图已交付。' },
        {
          fileWrites: [],
          commands: [],
          artifacts: [
            { artifactId: 'art_1', title: '订单流程图', type: 'diagram', version: 1 },
          ],
        },
      ),
    ).toEqual({ ok: true })
  })

  it('explains the type mismatch in the error so the agent can actually fix it', () => {
    const result = evaluateTaskResultReport(
      task({
        task: '画订单流程图',
        taskKind: 'design',
        targetPaths: ['output/order-flow.svg'],
      }),
      { status: 'complete', summary: '流程图已交付。' },
      {
        fileWrites: [],
        commands: [],
        artifacts: [
          { artifactId: 'art_1', title: '订单流程图', type: 'diagram', version: 1 },
        ],
      },
    )
    // 即使这一条最终判不过，错误信息也必须说清「期望什么 type、实际是什么 type」，
    // 否则 agent 拿到的只是 "missing target path evidence"，只能瞎重试。
    if (!result.ok) {
      expect(result.error).toMatch(/expects? (artifact )?type|expected type/i)
      expect(result.error).toContain('diagram')
    }
  })
})
