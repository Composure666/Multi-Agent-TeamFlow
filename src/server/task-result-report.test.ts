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

/**
 * 验证门禁失败信息的固定尾巴：它必须说清「实际看到了哪些命令」与「什么形态才被承认」，
 * 否则 agent 只能对着同一句笼统报错反复重跑同一条 exit 0 的命令。
 */
function verificationGapHint(seen: string): string {
  return ` Commands seen: [${seen}]. Accepted forms: npm/pnpm/yarn/bun/deno run build|test|lint|check|verify|qa, tsc, next/vite build, pytest, go test, cargo test, or a check script run directly (node qa/check.mjs, python check.py, bash verify.sh), or any non-prepare command the plan declared in requiredCommands. Run the check as its own bash call so its own exitCode is the one recorded.`
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
        'Task "t1" is missing successful runnable verification command evidence: build/compile/test/typecheck/lint command exitCode=0' +
        verificationGapHint('pnpm install (prepare, exit 0)'),
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
        'Task "t1" is missing successful runnable verification command evidence: build/compile/test/typecheck/lint command exitCode=0' +
        verificationGapHint('ls (exit 0)'),
    })
  })

  // 回归（2026-09-17 线上）：零依赖项目用自写脚本验证（`node landing/qa/check.mjs`，
  // 42 项全 PASS / exitCode=0），旧白名单只认包管理器与已知测试框架，于是交付被判 failed，
  // agent 只能反复重跑同一条已经绿了的命令。
  it('accepts a project check script as runnable verification', () => {
    expect(
      evaluateTaskResultReport(
        task({ task: 'Implement the landing page', taskKind: 'code' }),
        { status: 'complete', summary: 'Implemented the landing page; check script passes.' },
        {
          fileWrites: [],
          commands: [
            {
              command: 'node landing/qa/check.mjs',
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

  it('accepts verification nested in compound and multi-line commands', () => {
    const commands = [
      'cd landing && node landing/qa/check.mjs',
      'cd landing\nnode landing/qa/check.mjs',
      'bash scripts/verify.sh',
      'npm test; echo done',
    ]
    for (const command of commands) {
      const result = evaluateTaskResultReport(
        task({ task: 'Implement the landing page', taskKind: 'code' }),
        { status: 'complete', summary: 'Verified.' },
        {
          fileWrites: [],
          commands: [{ command, cwd: 'E:/repo', exitCode: 0, timedOut: false, isError: false }],
        },
      )
      expect(result, command).toEqual({ ok: true })
    }
  })

  it('does not accept a failed verification masked by an || fallback', () => {
    // `A || B` 里的 B 只在 A 失败时才跑，它 exit 0 恰恰说明验证没过 —— 不能算证据。
    expect(
      evaluateTaskResultReport(
        task({ task: 'Implement the landing page', taskKind: 'code' }),
        { status: 'complete', summary: 'Verified.' },
        {
          fileWrites: [],
          commands: [
            {
              command: 'npm test || echo skipped',
              cwd: 'E:/repo',
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
        'Task "t1" is missing successful runnable verification command evidence: build/compile/test/typecheck/lint command exitCode=0' +
        verificationGapHint('npm test || echo skipped (exit 0)'),
    })
  })

  it('names the commands it saw when verification is missing', () => {
    const result = evaluateTaskResultReport(
      task({ task: 'Implement the landing page', taskKind: 'code' }),
      { status: 'complete', summary: 'Started the dev server and looked at it.' },
      {
        fileWrites: [],
        commands: [
          {
            command: 'node server.js',
            cwd: 'E:/repo',
            exitCode: 0,
            timedOut: false,
            isError: false,
          },
        ],
      },
    )
    expect(result.ok).toBe(false)
    expect(result.error).toContain('Commands seen: [node server.js (exit 0)]')
    expect(result.error).toContain('node qa/check.mjs')
  })

  // 回归（2026-09-17 线上）：plan 的 requiredCommand 是它自己写的
  // `node -e "…readFileSync('landing/index.html')…process.exit(1)…"` 一行流校验 ——
  // exit 0 跑过、也进了 evidence.commands，但词形不在白名单里，门禁仍判「没有验证命令证据」，
  // 同一任务 4 次 attempt 全灭。plan 声明过的验证命令由 supervisor 标记，不再靠猜词形。
  it('accepts a plan-declared required command as verification evidence', () => {
    const declaredCheck = `node -e "const fs=require('fs');const h=fs.readFileSync('landing/index.html','utf8');if(!h.includes('viewport'))process.exit(1)"`
    const withEvidence = (command: Record<string, unknown>) => {
      return {
        fileWrites: [],
        commands: [
          {
            command: declaredCheck,
            cwd: 'E:/repo',
            exitCode: 0,
            timedOut: false,
            isError: false,
            ...command,
          },
        ],
      }
    }

    expect(
      evaluateTaskResultReport(
        task({ task: 'Implement the landing page', taskKind: 'code' }),
        { status: 'complete', summary: 'The declared check passes.' },
        withEvidence({ verification: true }),
      ),
    ).toEqual({ ok: true })

    // 没有标记时同一条命令仍不算验证证据 —— 凭据是「plan 声明过」，不是词形巧合。
    expect(
      evaluateTaskResultReport(
        task({ task: 'Implement the landing page', taskKind: 'code' }),
        { status: 'complete', summary: 'The declared check passes.' },
        withEvidence({}),
      ).ok,
    ).toBe(false)
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

  // ─────────────────────────────────────────────────────────────────────────
  // 回归（2026-09-15 线上生图任务 4 次重试全灭）：环境探测类命令的失败不是任务
  // 失败的证据。服务器上没有 jq / PIL，agent 的 which / import / pip install
  // 探测全部非零退出，被门禁判「failed command evidence」反复重试直到熔断。
  // ─────────────────────────────────────────────────────────────────────────

  it('excuses failed environment probes so image tasks are not doomed by missing tools', () => {
    const probeCommands = [
      'pwd && ls -la && echo "---tools---" && which curl jq python3 base64 2>/dev/null',
      'pwd && ls -la && echo "---outputs---" && ls -la outputs 2>/dev/null && echo "---tools---" && which curl jq python3 base64 2>/dev/null',
      'echo "=== generation_record.json ==="; cat outputs/generation_record.json; echo "=== prompts ==="; ls -la prompts; cat prompts/positive.txt 2>/dev/null',
      'python3 -c "import PIL; print(\'PIL\', PIL.version)" 2>&1',
      'pip install --quiet Pillow 2>&1 | tail -3',
      'python3 -c "import PIL; print(\'PIL ok\', PIL.version)"',
    ]
    expect(
      evaluateTaskResultReport(
        task({ task: '生成 16:9 写实照片', taskKind: 'design' }),
        { status: 'complete', summary: '图片已通过 write_artifact 交付。' },
        {
          fileWrites: [],
          commands: probeCommands.map((command) => ({
            command,
            cwd: '/opt/agenthub/workspaces/conv_1',
            exitCode: 1,
            timedOut: false,
            isError: true,
          })),
          artifacts: [
            { artifactId: 'art_img', title: '16:9写实成图', type: 'image', version: 1 },
          ],
        },
      ),
    ).toEqual({ ok: true })
  })

  it('does not excuse failures of commands that do real work', () => {
    expect(
      evaluateTaskResultReport(
        task(),
        { status: 'complete', summary: 'Done.' },
        {
          fileWrites: [],
          commands: [
            {
              command: 'curl -fsS https://api.example.com/generate -o out.png',
              cwd: '/w',
              exitCode: 1,
              timedOut: false,
              isError: true,
            },
          ],
        },
      ),
    ).toEqual({
      ok: false,
      error:
        'Task "t1" has failed command evidence: curl -fsS https://api.example.com/generate -o out.png (exit 1)',
    })

    // 混合链路：探测段 + 实际工作段，整体失败照常定罪
    expect(
      evaluateTaskResultReport(
        task(),
        { status: 'complete', summary: 'Done.' },
        {
          fileWrites: [],
          commands: [
            {
              command: 'which convert 2>/dev/null && convert input.png -resize 1024x output.png',
              cwd: '/w',
              exitCode: 1,
              timedOut: false,
              isError: true,
            },
          ],
        },
      ),
    ).toMatchObject({ ok: false })
  })

  it('shows the real exit code instead of a bare "tool error" when error detail is missing', () => {
    const result = evaluateTaskResultReport(
      task(),
      { status: 'complete', summary: 'Done.' },
      {
        fileWrites: [],
        commands: [
          {
            command: 'npm run build',
            cwd: '/w',
            exitCode: 2,
            timedOut: false,
            isError: true,
          },
        ],
      },
    )
    expect(result.ok).toBe(false)
    expect(result.error).toContain('npm run build (exit 2)')
    expect(result.error).not.toContain('tool error')
  })

  // ─────────────────────────────────────────────────────────────────────────
  // 回归（2026-09-17 线上生图任务 4 次重试全灭）：多行脚本形式的探测 / 装依赖命令
  // 也要豁免。子 agent 习惯把「cd 进目录 + 打印几行 + pip/npm 试装」一次提交，旧实现
  // 只认 ; && | 切段，整段以 cd 开头 → 永远命中不了白名单，pip 超时把任务钉死。
  // ─────────────────────────────────────────────────────────────────────────

  it('excuses multi-line probe and dependency-install scripts', () => {
    const multiLineProbe = [
      'cd /opt/agenthub/workspaces/conv_x',
      'head -c 16 outputs/real_A_en.png | xxd | head -1',
      'echo "=== try pip install pillow ==="',
      'pip install --quiet pillow 2>&1 | tail -5; python3 -c "import PIL;print(\'PIL OK\',PIL.__version__)" 2>&1 | tail -1',
      'echo "=== try pip install numpy ==="',
      'pip install --quiet numpy 2>&1 | tail -3; python3 -c "import numpy;print(\'numpy OK\',numpy.__version__)" 2>&1 | tail -1',
    ].join('\n')
    expect(
      evaluateTaskResultReport(
        task({ task: '用真实 API 生成候选图', taskKind: 'design' }),
        { status: 'complete', summary: '候选图已交付。' },
        {
          fileWrites: [],
          commands: [
            {
              command: multiLineProbe,
              cwd: '/w',
              exitCode: null,
              timedOut: true,
              isError: true,
            },
            {
              command: 'npm install --no-audit',
              cwd: '/w',
              exitCode: 1,
              timedOut: false,
              isError: true,
            },
            {
              command: 'mkdir -p outputs/meta',
              cwd: '/w',
              exitCode: 1,
              timedOut: false,
              isError: true,
            },
          ],
        },
      ),
    ).toEqual({ ok: true })
  })

  // ─────────────────────────────────────────────────────────────────────────
  // 回归（2026-09-17 同一次事故）：失败定罪只认当前 attempt。
  // 第 1 次 attempt 的 pip 超时 + 第 2 次 attempt 的探索脚本报错，不该让第 4 次
  // attempt（VERIFY OK / exitCode=0）也判失败。
  // ─────────────────────────────────────────────────────────────────────────

  it('does not let earlier attempts failures convict the current attempt', () => {
    const evidence = {
      fileWrites: [],
      commands: [
        {
          command: 'pip install --quiet numpy 2>&1 | tail -3',
          cwd: '/w',
          exitCode: null,
          timedOut: true,
          isError: true,
          runId: 'run_attempt1',
        },
        {
          command: "python3 - <<'EOF'\nfrom PIL import Image\nassert False\nEOF",
          cwd: '/w',
          exitCode: 1,
          timedOut: false,
          isError: true,
          runId: 'run_attempt2',
        },
        {
          command: 'python3 verify_real.py',
          cwd: '/w',
          exitCode: 0,
          timedOut: false,
          isError: false,
          runId: 'run_attempt4',
        },
      ],
      artifacts: [{ artifactId: 'art_img', title: '候选图', type: 'image', version: 1 }],
    }

    expect(
      evaluateTaskResultReport(
        task({ task: '用真实 API 生成候选图', taskKind: 'design' }),
        { status: 'complete', summary: '候选图已交付。' },
        evidence,
        { attemptRunIds: ['run_attempt4'] },
      ),
    ).toEqual({ ok: true })

    // 同一份证据里当前 attempt 自己失败 → 照常定罪
    expect(
      evaluateTaskResultReport(
        task({ task: '用真实 API 生成候选图', taskKind: 'design' }),
        { status: 'complete', summary: '候选图已交付。' },
        evidence,
        { attemptRunIds: ['run_attempt2'] },
      ),
    ).toMatchObject({ ok: false })

    // 不传 attemptRunIds = 旧的全量行为（无法归因的证据仍定罪，不放水）
    expect(
      evaluateTaskResultReport(
        task({ task: '用真实 API 生成候选图', taskKind: 'design' }),
        { status: 'complete', summary: '候选图已交付。' },
        evidence,
      ),
    ).toMatchObject({ ok: false })
  })

  it('keeps convicting evidence without a run id so legacy callers stay strict', () => {
    expect(
      evaluateTaskResultReport(
        task(),
        { status: 'complete', summary: 'Done.' },
        {
          fileWrites: [],
          commands: [
            {
              command: 'npm run build',
              cwd: '/w',
              exitCode: 1,
              timedOut: false,
              isError: true,
            },
          ],
        },
        { attemptRunIds: ['run_attempt9'] },
      ),
    ).toMatchObject({ ok: false })
  })
})
