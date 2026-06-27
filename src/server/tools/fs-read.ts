import { z } from 'zod'

import { getWorkspaceForConversation, readFileInWorkspace } from '@/server/fs-service'

import type { ToolDef } from './types'

const ArgsSchema = z.object({
  path: z.string().min(1),
})

/**
 * fs_read —— 读 workspace 内的文本文件。
 *
 * 路径可以是相对（基于 workspace effective cwd）或绝对，但 resolve 后必须落在
 * effective cwd 子树内，否则拒绝。
 */
export const fsReadTool: ToolDef = {
  name: 'fs_read',
  description:
    'Read a text file from the workspace. Path can be relative (to the workspace root) or absolute (must still resolve inside the workspace). Returns UTF-8 contents truncated to 50,000 characters. Use this to inspect source code, configs, etc.',
  parameters: {
    type: 'object',
    required: ['path'],
    properties: {
      path: {
        type: 'string',
        description: 'File path. Relative paths resolve from the workspace root.',
      },
    },
  },
  async handler(args, ctx) {
    const parsed = ArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: `Invalid args: ${parsed.error.message}` }
    }

    const workspace = await getWorkspaceForConversation(ctx.conversationId)
    if (!workspace) return { ok: false, error: 'Workspace not found' }

    try {
      const result = readFileInWorkspace(workspace, parsed.data.path)
      return { ok: true, value: result }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  },
}
