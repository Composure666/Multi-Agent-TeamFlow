import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { db, schema } from '@/db/client'
import { recordRunFileWrite } from '@/server/dispatch-run-evidence'
import { recordFileWrite } from '@/server/dispatch-file-writes'
import {
  getWorkspaceForConversation,
  readIfExists,
  writeFileInWorkspace,
} from '@/server/fs-service'
import { pendingWrites } from '@/server/pending-writes'
import { assertPathWithinWorkspace } from '@/server/workspace-utils'

import type { ToolDef } from './types'

const ArgsSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
})

/**
 * fs_write —— 在 workspace 内写文件。
 *
 * 行为按 conversation.fsWriteApprovalMode 分支：
 *  - 'auto'   : 直接写
 *  - 'review' : 注册 pendingWrite，发 fs_write.pending 事件让前端弹审批 dialog，
 *               等用户 approve / reject（或 run abort）才决定真写还是放弃
 *
 * 详见 specs/07-tools.md 「fs_write 审批模式」一节。
 */
export const fsWriteTool: ToolDef = {
  name: 'fs_write',
  description:
    "Write a UTF-8 text file inside the workspace. Path can be relative (resolved against the workspace root) or absolute (must still be inside the workspace). Parent directories are created automatically. Each file is capped at 100 KB; in sandbox mode the workspace as a whole is capped at 100 MB / 1000 files. In 'review' mode the user must approve the diff before the write actually happens; you'll see ok:false with 'rejected' if they decline. Use this to scaffold code, write documents, etc.",
  parameters: {
    type: 'object',
    required: ['path', 'content'],
    properties: {
      path: {
        type: 'string',
        description: 'Destination path inside the workspace.',
      },
      content: {
        type: 'string',
        description: 'UTF-8 text content (max 100 KB).',
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

    const conv = await db.query.conversations.findFirst({
      where: eq(schema.conversations.id, ctx.conversationId),
    })
    const mode = conv?.fsWriteApprovalMode ?? 'review'

    // Auto 模式：直接写
    if (mode === 'auto') {
      try {
        const result = writeFileInWorkspace(workspace, parsed.data.path, parsed.data.content)
        recordFileWrite(ctx.runId, result.absolutePath, parsed.data.content)
        recordRunFileWrite(ctx.runId, {
          path: parsed.data.path,
          absolutePath: result.absolutePath,
          bytes: result.bytes,
          applied: 'auto',
        })
        return { ok: true, value: { ...result, applied: 'auto' as const } }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }

    // Review 模式：注册 pending 并等用户响应
    let absPath: string
    try {
      absPath = assertPathWithinWorkspace(workspace, parsed.data.path)
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }

    const pending = pendingWrites.register({
      conversationId: ctx.conversationId,
      agentId: ctx.agentId,
      runId: ctx.runId,
      path: parsed.data.path,
      absolutePath: absPath,
      oldContent: readIfExists(workspace, parsed.data.path),
      newContent: parsed.data.content,
      workspace,
    })

    const decision = await new Promise<{ applied: boolean }>((resolve) => {
      pendingWrites.attachResolver(pending.id, resolve)
      // Run abort → pending 也取消
      const onAbort = () => {
        pendingWrites.cancel(pending.id)
        resolve({ applied: false })
      }
      if (ctx.abortSignal.aborted) {
        onAbort()
      } else {
        ctx.abortSignal.addEventListener('abort', onAbort, { once: true })
      }
    })

    if (!decision.applied) {
      return { ok: false, error: 'User rejected the file change' }
    }

    recordFileWrite(ctx.runId, absPath, parsed.data.content)
    recordRunFileWrite(ctx.runId, {
      path: parsed.data.path,
      absolutePath: absPath,
      bytes: Buffer.byteLength(parsed.data.content, 'utf8'),
      applied: 'review',
    })

    return {
      ok: true,
      value: {
        path: parsed.data.path,
        absolutePath: absPath,
        bytes: Buffer.byteLength(parsed.data.content, 'utf8'),
        applied: 'review' as const,
      },
    }
  },
}
