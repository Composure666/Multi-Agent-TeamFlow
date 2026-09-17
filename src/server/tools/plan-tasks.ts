import { z } from 'zod'

import type { ToolDef } from './types'

/**
 * plan_tasks —— Orchestrator 专用的「输出端工具」。
 *
 * 它本身不执行任何副作用，只是把 Orchestrator 拆解出的子任务列表以
 * 结构化形式输出。AgentRunner 在看到 plan_tasks 工具调用时进入调度模式，
 * 把这个 plan 拆成子 AgentRun 并发执行。
 *
 * 详细规格见 specs/06-orchestrator-flow.md。
 */

const TaskSchema = z.object({
  id: z.string().min(1),
  agentId: z.string().min(1),
  task: z.string().min(1),
  taskKind: z.enum(['code', 'test', 'review', 'design', 'doc', 'analysis']).optional(),
  dependsOn: z.array(z.string()).optional(),
  expectedOutputs: z
    .array(
      z.object({
        id: z.string().min(1),
        type: z.enum(['web_app', 'document', 'image', 'ppt', 'diagram', 'project']),
        required: z.boolean().optional(),
        description: z.string().optional(),
      }),
    )
    .optional(),
  inputs: z
    .array(
      z.object({
        fromTaskId: z.string().min(1),
        outputId: z.string().min(1),
        required: z.boolean().optional(),
        description: z.string().optional(),
      }),
    )
    .optional(),
  acceptanceCriteria: z.array(z.string().min(1)).optional(),
  targetPaths: z.array(z.string().min(1)).optional(),
  expectedWorkspaceChanges: z.array(z.string().min(1)).optional(),
  requiredCommands: z
    .array(
      z.object({
        command: z.string().min(1),
        description: z.string().optional(),
        cwd: z.string().min(1).optional(),
        timeoutMs: z.number().int().positive().optional(),
      }),
    )
    .optional(),
  requiredEvidence: z.array(z.string().min(1)).optional(),
})

const ArgsSchema = z.object({
  reasoning: z.string().min(1),
  tasks: z.array(TaskSchema).min(1),
})

export const planTasksTool: ToolDef = {
  name: 'plan_tasks',
  description:
    'Decompose the user request into sub-tasks and dispatch them to other agents in this group. Output a complete plan in a single call; do NOT call this tool multiple times.',
  parameters: {
    type: 'object',
    required: ['reasoning', 'tasks'],
    properties: {
      reasoning: {
        type: 'string',
        description: 'Brief explanation of why this decomposition makes sense, 3 sentences max',
      },
      tasks: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          required: ['id', 'agentId', 'task'],
          properties: {
            id: {
              type: 'string',
              description: 'Sub-task id, use t1/t2/t3 format',
            },
            agentId: {
              type: 'string',
              description: 'Agent id that should execute this task. Must come from the available list.',
            },
            task: {
              type: 'string',
              description: 'Concrete, self-contained instruction for that agent. The agent will not see the full group history.',
            },
            taskKind: {
              type: 'string',
              enum: ['code', 'test', 'review', 'design', 'doc', 'analysis'],
              description:
                'Kind of work. Use code/test/review/design/doc/analysis to help AgentRunner apply evidence expectations.',
            },
            dependsOn: {
              type: 'array',
              items: { type: 'string' },
              description: 'Ids of prerequisite tasks. Omit when the task can start immediately.',
            },
            expectedOutputs: {
              type: 'array',
              description:
                'Artifacts this task must create for downstream handoff or user inspection. Code implementation tasks should declare a required project output. Omit for text-only work such as review, validation, diagnosis, status check, explanation, or summary.',
              items: {
                type: 'object',
                required: ['id', 'type'],
                properties: {
                  id: {
                    type: 'string',
                    description: 'Symbolic output key within this task, not an artifact id.',
                  },
                  type: {
                    type: 'string',
                    enum: ['web_app', 'document', 'image', 'ppt', 'diagram', 'project'],
                    description:
                      'Expected artifact type. Use project for workspace code trees; project is created by Multi-Agent TeamFlow from fs_write evidence, not by write_artifact.',
                  },
                  required: {
                    type: 'boolean',
                    description:
                      'Whether this handoff output is expected by the plan. Defaults to true. Required project outputs on code tasks are hard completion gates.',
                  },
                  description: {
                    type: 'string',
                    description: 'Short description of what this output should contain.',
                  },
                },
              },
            },
            inputs: {
              type: 'array',
              description:
                'Upstream artifacts this task must consume. AgentRunner validates these against upstream expectedOutputs and compiles them into dependencies.',
              items: {
                type: 'object',
                required: ['fromTaskId', 'outputId'],
                properties: {
                  fromTaskId: {
                    type: 'string',
                    description: 'Upstream task id that produces the artifact.',
                  },
                  outputId: {
                    type: 'string',
                    description: 'The upstream expectedOutputs.id to consume.',
                  },
                  required: {
                    type: 'boolean',
                    description: 'Whether this input is required. Defaults to true.',
                  },
                  description: {
                    type: 'string',
                    description: 'Why this input is needed.',
                  },
                },
              },
            },
            acceptanceCriteria: {
              type: 'array',
              description:
                'Concrete completion checks for this task. Use this for text-only/review/validation tasks instead of expectedOutputs. The child agent must report each item through report_task_result.acceptanceResults.',
              items: { type: 'string' },
            },
            targetPaths: {
              type: 'array',
              description:
                'Workspace file or directory paths this task is expected to inspect, create, or change. Use relative paths when possible.',
              items: { type: 'string' },
            },
            expectedWorkspaceChanges: {
              type: 'array',
              description:
                'Plain-language list of expected workspace changes. Required for non-trivial code tasks.',
              items: { type: 'string' },
            },
            requiredCommands: {
              type: 'array',
              description:
                'Commands that Multi-Agent TeamFlow must run successfully before accepting this task as complete, such as pnpm test or mvn compile. Use cwd instead of cd for subdirectories.',
              items: {
                type: 'object',
                required: ['command'],
                properties: {
                  command: {
                    type: 'string',
                    description:
                      'Exact command expected to run. Keep it focused on the verification step; use cwd for subdirectories.',
                  },
                  description: {
                    type: 'string',
                    description: 'Short reason this command verifies the task.',
                  },
                  cwd: {
                    type: 'string',
                    description:
                      'Optional workspace-relative directory to run the command in, such as "frontend" or "backend".',
                  },
                  timeoutMs: {
                    type: 'number',
                    description:
                      'Optional timeout in milliseconds. Use a larger value for dependency install or compilation.',
                  },
                },
              },
            },
            requiredEvidence: {
              type: 'array',
              description:
                'Evidence statements the child must provide in report_task_result before the task can complete.',
              items: { type: 'string' },
            },
          },
        },
      },
    },
  },
  async handler(args) {
    const parsed = ArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: `Invalid plan: ${parsed.error.message}` }
    }
    // 实际执行在 AgentRunner 里完成。这里仅做格式校验并回 ack。
    return {
      ok: true,
      value: {
        acknowledged: true,
        taskCount: parsed.data.tasks.length,
      },
    }
  },
}
