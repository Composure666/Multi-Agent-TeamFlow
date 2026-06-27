import {
  normalizeTaskResultReport,
  REPORT_TASK_RESULT_TOOL_NAME,
  ReportTaskResultArgsSchema,
} from '@/server/task-result-report'

import type { ToolDef } from './types'

/**
 * report_task_result —— 子任务最终语义结果上报。
 *
 * 它不产生 artifact，也不写 workspace；AgentRunner 用它判断 child run 是否真的完成了任务。
 */

export const reportTaskResultTool: ToolDef = {
  name: REPORT_TASK_RESULT_TOOL_NAME,
  description:
    'Report the final semantic outcome of the current AgentHub sub-task. Call exactly once at the end of a dispatched child task. Use complete only when the assigned task is fully accomplished and every acceptance criterion passed; never report complete for partial work, failing tests, unresolved errors, or missing files/dependencies.',
  parameters: {
    type: 'object',
    required: ['status', 'summary'],
    properties: {
      status: {
        type: 'string',
        enum: ['complete', 'failed', 'blocked'],
        description:
          'complete when the task is fully accomplished; failed when you attempted it but did not satisfy the task; blocked when required external input or a prerequisite prevents progress.',
      },
      summary: {
        type: 'string',
        description:
          'Concise final outcome summary. State what was completed, why it failed, or what blocks progress.',
      },
      acceptanceResults: {
        type: 'array',
        description:
          'Required when acceptance_criteria are present. Copy each criterion string exactly and provide pass/fail evidence.',
        items: {
          type: 'object',
          required: ['criterion', 'passed', 'evidence'],
          properties: {
            criterion: {
              type: 'string',
              description: 'Exact acceptance_criteria item text.',
            },
            passed: {
              type: 'boolean',
              description: 'Whether this criterion was satisfied.',
            },
            evidence: {
              type: 'string',
              description: 'Specific evidence for the pass/fail decision.',
            },
          },
        },
      },
      filesChanged: {
        type: 'array',
        description:
          'Workspace files changed or explicitly verified for this task. Required when target_paths are present.',
        items: {
          type: 'object',
          required: ['path'],
          properties: {
            path: {
              type: 'string',
              description: 'Workspace-relative path when possible.',
            },
            action: {
              type: 'string',
              enum: ['created', 'modified', 'deleted', 'verified'],
              description: 'How this path was handled.',
            },
          },
        },
      },
      commandsRun: {
        type: 'array',
        description:
          'Commands run to verify the task. Required when required_commands are present; include cwd and timedOut when relevant.',
        items: {
          type: 'object',
          required: ['command', 'exitCode'],
          properties: {
            command: {
              type: 'string',
              description: 'Command exactly as run.',
            },
            exitCode: {
              type: ['number', 'null'],
              description: 'Process exit code, or null if no exit code was available.',
            },
            cwd: {
              type: 'string',
              description: 'Workspace-relative directory the command ran in, when relevant.',
            },
            timedOut: {
              type: 'boolean',
              description: 'Whether the command timed out.',
            },
            summary: {
              type: 'string',
              description: 'Short result summary.',
            },
          },
        },
      },
      tests: {
        type: 'array',
        description: 'Test or verification commands and whether they passed.',
        items: {
          type: 'object',
          required: ['command', 'passed'],
          properties: {
            command: {
              type: 'string',
              description: 'Test or verification command.',
            },
            passed: {
              type: 'boolean',
              description: 'Whether the test/verification passed.',
            },
            summary: {
              type: 'string',
              description: 'Short result summary.',
            },
          },
        },
      },
      blockers: {
        type: 'array',
        description: 'Concrete blockers when status is blocked or failed.',
        items: { type: 'string' },
      },
    },
  },
  async handler(args) {
    const parsed = ReportTaskResultArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: `Invalid task result report: ${parsed.error.message}` }
    }
    return { ok: true, value: normalizeTaskResultReport(parsed.data) }
  },
}
