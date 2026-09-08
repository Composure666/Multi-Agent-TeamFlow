import { existsSync, statSync } from 'node:fs'
import { userInfo } from 'node:os'
import { basename } from 'node:path'

import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { db, schema } from '@/db/client'
import { classifyBashApproval, waitForBashApproval } from '@/server/bash-command-approval'
import { recordRunCommand } from '@/server/dispatch-run-evidence'
import { currentPlatform, type Platform } from '@/server/platform'
import { findBannedPattern } from '@/server/security'
import { runTerminalCommand } from '@/server/terminal-session-service'
import { assertPathWithinWorkspace, getEffectiveCwd } from '@/server/workspace-utils'

import type { ToolContext, ToolDef, ToolResult } from './types'

const ArgsSchema = z.object({
  command: z.string().min(1),
  cwd: z.string().min(1).optional(),
  timeoutMs: z.number().int().positive().optional(),
})

const DEFAULT_TIMEOUT_MS = 30_000
const MIN_TIMEOUT_MS = 1_000
const MAX_TIMEOUT_MS = 15 * 60_000
const POSIX_LOGIN_INTERACTIVE_SHELLS = new Set(['bash', 'zsh'])

export interface BashExecutionArgs {
  command: string
  cwd?: string
  timeoutMs?: number
  evidenceKind?: 'prepare' | 'verification'
}

interface ShellInvocation {
  cmd: string
  args: string[]
}

function readUserInfoShell(): string | null {
  try {
    return userInfo().shell ?? null
  } catch {
    return null
  }
}

function resolvePosixUserShell(): string | null {
  const candidates = [process.env.SHELL, readUserInfoShell()]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.startsWith('/') && existsSync(candidate)) {
      return candidate
    }
  }
  return null
}

function buildPosixShellInvocation(command: string): ShellInvocation {
  const userShell = resolvePosixUserShell()
  if (!userShell) {
    return { cmd: 'sh', args: ['-c', command] }
  }

  const shellName = basename(userShell)
  if (POSIX_LOGIN_INTERACTIVE_SHELLS.has(shellName)) {
    return { cmd: userShell, args: ['-l', '-i', '-c', command] }
  }

  return { cmd: 'sh', args: ['-c', command] }
}

function buildShellInvocation(command: string, platform: Platform): ShellInvocation {
  if (platform === 'windows') {
    const preamble =
      "$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new();"
    return {
      cmd: 'powershell.exe',
      args: ['-NoProfile', '-NonInteractive', '-Command', `${preamble} ${command}`],
    }
  }
  return buildPosixShellInvocation(command)
}

const PLATFORM = currentPlatform()

const DESCRIPTION_POSIX =
  'Run a shell command inside the workspace. Optional cwd must stay inside the workspace. POSIX uses the user login shell for zsh/bash ($SHELL -l -i -c) when available, otherwise sh -c. Use POSIX syntax: ls, grep, cat, git, npm, python, etc. Output is stdout + stderr combined, truncated to 10000 chars, 30s timeout. Destructive commands (rm -rf /, sudo, fork bombs, curl | sh) are blocked. No interactive stdin. Do not leave persistent background servers running; start test servers only inside a command that cleans them up.'

const DESCRIPTION_WINDOWS =
  'Run a Windows PowerShell 5.1 command inside the workspace. Optional cwd must stay inside the workspace. ' +
  'CRITICAL: this is Windows, not Linux/macOS. You MUST use PowerShell syntax; POSIX flags like `-la`, `-rf` do not work. ' +
  'Examples of correct commands: `Get-ChildItem -Force` (NOT `ls -la`), `Get-Content file.txt` (NOT `cat`), ' +
  '`Select-String pattern file.txt` (NOT `grep`), `Remove-Item path` (NOT `rm`), `New-Item -ItemType Directory` (NOT `mkdir -p`), ' +
  '`Copy-Item src dst` (NOT `cp`), `Move-Item src dst` (NOT `mv`). git/npm/python/node work as usual. ' +
  'Output is UTF-8, stdout + stderr combined, truncated to 10000 chars. ' +
  'Destructive commands (Remove-Item -Recurse -Force, format, shutdown, iex(iwr ...), reg delete, Set-ExecutionPolicy Unrestricted) are blocked. No interactive stdin. ' +
  'Do not leave persistent background servers running; start test servers only inside a command that cleans them up.'

/**
 * bash —— 在 workspace 内跑 shell 命令。详见 specs/07-tools.md, specs/11-platform.md。
 */
export const bashTool: ToolDef = {
  name: 'bash',
  description: PLATFORM === 'windows' ? DESCRIPTION_WINDOWS : DESCRIPTION_POSIX,
  parameters: {
    type: 'object',
    required: ['command'],
    properties: {
      command: {
        type: 'string',
        description:
          PLATFORM === 'windows'
            ? 'PowerShell command to execute. Use cwd instead of Set-Location.'
            : 'Shell command to execute. Use cwd instead of cd.',
      },
      cwd: {
        type: 'string',
        description:
          'Optional workspace-relative directory to run from, such as "frontend" or "backend". It must resolve inside the workspace.',
      },
      timeoutMs: {
        type: 'number',
        description:
          'Optional timeout in milliseconds. Values are clamped to AgentHub safety bounds.',
      },
    },
  },
  async handler(args, ctx) {
    const parsed = ArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: `Invalid args: ${parsed.error.message}` }
    }

    return executeBashCommand(parsed.data, ctx)
  },
}

export async function executeBashCommand(
  args: BashExecutionArgs,
  ctx: ToolContext,
): Promise<ToolResult> {
  const banned = findBannedPattern(args.command, PLATFORM)
  if (banned) {
    return { ok: false, error: `Command rejected by safety policy: ${banned.source}` }
  }

  const workspace = await db.query.workspaces.findFirst({
    where: eq(schema.workspaces.conversationId, ctx.conversationId),
  })
  if (!workspace) return { ok: false, error: 'Workspace not found' }

  let cwd = getEffectiveCwd(workspace)
  if (args.cwd) {
    try {
      cwd = assertPathWithinWorkspace(workspace, args.cwd)
      if (!statSync(cwd).isDirectory()) {
        return { ok: false, error: `cwd is not a directory: ${args.cwd}` }
      }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  const approval = classifyBashApproval(args.command, PLATFORM)
  if (approval.required) {
    const approved = await waitForBashApproval({
      conversationId: ctx.conversationId,
      agentId: ctx.agentId,
      runId: ctx.runId,
      command: args.command,
      cwd,
      reason: approval.reason,
      signal: ctx.abortSignal,
    })
    if (!approved) {
      return { ok: false, error: `User rejected command execution: ${approval.reason}` }
    }
  }

  return runShellCommand(args, cwd, ctx)
}

function runShellCommand(
  args: BashExecutionArgs,
  cwd: string,
  ctx: ToolContext,
): Promise<ToolResult> {
  const timeoutMs = clampTimeout(args.timeoutMs)
  const shell = buildShellInvocation(args.command, PLATFORM)

  return runTerminalCommand({
    conversationId: ctx.conversationId,
    runId: ctx.runId,
    parentRunId: ctx.parentRunId ?? null,
    agentId: ctx.agentId,
    taskId: ctx.taskId ?? null,
    toolCallId: ctx.toolCallId ?? null,
    shell: shell.cmd,
    shellArgs: shell.args,
    command: args.command,
    cwd,
    timeoutMs,
    abortSignal: ctx.abortSignal,
  })
    .then((result) => {
      recordRunCommand(ctx.runId, {
        command: args.command,
        cwd,
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        isError: result.exitCode !== 0 || result.timedOut,
        ...(args.evidenceKind === 'prepare' ? { prepare: true } : {}),
      })

      return {
        ok: true as const,
        value: {
          sessionId: result.sessionId,
          cwd,
          command: args.command,
          shell: result.shell,
          exitCode: result.exitCode,
          output: result.output,
          truncated: result.truncated,
          timedOut: result.timedOut,
        },
      }
    })
    .catch((err) => {
      const error = `Terminal command failed: ${err instanceof Error ? err.message : String(err)}`
      recordRunCommand(ctx.runId, {
        command: args.command,
        cwd,
        exitCode: null,
        timedOut: false,
        isError: true,
        ...(args.evidenceKind === 'prepare' ? { prepare: true } : {}),
        error,
      })
      return { ok: false, error }
    })
}

function clampTimeout(timeoutMs: number | undefined): number {
  if (timeoutMs === undefined) return DEFAULT_TIMEOUT_MS
  return Math.max(MIN_TIMEOUT_MS, Math.min(timeoutMs, MAX_TIMEOUT_MS))
}
