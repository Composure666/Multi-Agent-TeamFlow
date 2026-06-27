import { z } from 'zod'

import { getWorkspaceForConversation, listDirInWorkspace } from '@/server/fs-service'

import type { ToolDef } from './types'

const ArgsSchema = z.object({
  path: z.string().optional().default(''),
})

/**
 * Lists a workspace directory after the shared workspace boundary checks run.
 */
export const fsListTool: ToolDef = {
  name: 'fs_list',
  description:
    'List files and directories inside the workspace. Path defaults to the workspace root. Use this before fs_read when exploring a project; it avoids shell-specific listing mistakes.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Directory path. Omit or pass "" for the workspace root.',
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
      return { ok: true, value: listDirInWorkspace(workspace, parsed.data.path) }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  },
}
