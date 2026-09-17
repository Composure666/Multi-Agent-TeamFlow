import { existsSync, statSync } from 'node:fs'
import { userInfo } from 'node:os'
import { basename } from 'node:path'

import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { db, schema } from '@/db/client'
import { getWriteApprovalMode } from '@/server/approval-mode'
import { classifyBashApproval, waitForBashApproval } from '@/server/bash-command-approval'
import { recordRunCommand } from '@/server/dispatch-run-evidence'
import { currentPlatform, type Platform } from '@/server/platform'
import { findBannedPattern } from '@/server/security'
import { runTerminalCommand } from '@/server/terminal-session-service'
import { assertPathWithinWorkspace, getEffectiveCwd } from '@/server/workspace-utils'
import { adaptCommandForWindowsPowerShell } from './windows-command-compat'

import type { ToolContext, ToolDef, ToolResult } from './types'

const ArgsSchema = z.object({
  command: z.string().min(1),
  cwd: z.string().min(1).optional(),
  timeoutMs: z.number().int().positive().optional(),
})

const DEFAULT_TIMEOUT_MS = 30_000
/** 依赖安装的默认超时：装包在慢机器上经常 1-5 分钟，用 30s 必误伤。 */
const INSTALL_TIMEOUT_MS = 5 * 60_000
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
  'Run a shell command inside the workspace. Optional cwd must stay inside the workspace. POSIX uses the user login shell for zsh/bash ($SHELL -l -i -c) when available, otherwise sh -c. Use POSIX syntax: ls, grep, cat, git, npm, python, etc. Output is stdout + stderr combined, truncated to 10000 chars, 30s timeout (5min default for dependency installs like pip/npm/apt install; pass timeoutMs for other slow steps). A timed-out command counts as failure evidence — give slow commands an explicit timeoutMs. Destructive commands (rm -rf /, sudo, fork bombs, curl | sh) are blocked. No interactive stdin. Do not leave persistent background servers running; start test servers only inside a command that cleans them up.'

const DESCRIPTION_WINDOWS =
  'Run a Windows PowerShell 5.1 command inside the workspace. Optional cwd must stay inside the workspace. ' +
  'CRITICAL: this is Windows, not Linux/macOS. You MUST use PowerShell syntax; POSIX flags like `-la`, `-rf` do not work. ' +
  'Examples of correct commands: `Get-ChildItem -Force` (NOT `ls -la`), `Get-Content file.txt` (NOT `cat`), ' +
  '`Select-String pattern file.txt` (NOT `grep`), `Remove-Item path` (NOT `rm`), `New-Item -ItemType Directory` (NOT `mkdir -p`), ' +
  '`Copy-Item src dst` (NOT `cp`), `Move-Item src dst` (NOT `mv`). git/npm/python/node work as usual. ' +
  'NEVER use bash-only syntax: no `sudo`, no heredoc (`cat <<EOF`), no backslash line continuation, no `/dev/null` (use $null), no `-rf`/`-p` style flags. ' +
  'If you must chain commands, use `;` or `if ($?) { ... }`. ' +
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
          'Optional timeout in milliseconds (max 900000). Default 30000; dependency installs (pip/npm/pnpm/yarn/bun/apt install) default to 300000. Raise it explicitly for slow steps (builds, installs, long test suites) — a timed-out command is recorded as failure evidence.',
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

  // Windows 上 shell 固定是 PowerShell 5.1，但模型常写 POSIX 语法。
  // 先做兼容改写 / 提前报错，避免「必然失败的命令」被记成 failed command evidence。
  const adapted =
    PLATFORM === 'windows' ? adaptCommandForWindowsPowerShell(args.command) : null
  if (adapted?.error) {
    return {
      ok: false,
      error: `Command uses bash syntax that cannot run on Windows PowerShell: ${adapted.error} Original command: ${args.command}`,
    }
  }
  const executedCommand = adapted?.command ?? args.command
  if (adapted?.rewritten) {
    const rewrittenBanned = findBannedPattern(executedCommand, PLATFORM)
    if (rewrittenBanned) {
      return { ok: false, error: `Command rejected by safety policy: ${rewrittenBanned.source}` }
    }
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

  // 与 fs_write / write_artifact 同一个开关：review 模式下「会改文件」的命令也要确认。
  // 传 auto 时只拦 tier-1 高危命令，行为与改动前完全一致。
  const approvalMode = await getWriteApprovalMode(ctx.conversationId)
  const approval = classifyBashApproval(executedCommand, PLATFORM, approvalMode)
  if (approval.required) {
    const approved = await waitForBashApproval({
      conversationId: ctx.conversationId,
      agentId: ctx.agentId,
      runId: ctx.runId,
      command: executedCommand,
      cwd,
      reason: approval.reason,
      signal: ctx.abortSignal,
    })
    if (!approved) {
      return { ok: false, error: `User rejected command execution: ${approval.reason}` }
    }
  }

  return runShellCommand(args, cwd, ctx, executedCommand, adapted?.notes ?? [])
}

function runShellCommand(
  args: BashExecutionArgs,
  cwd: string,
  ctx: ToolContext,
  executedCommand: string,
  rewriteNotes: string[],
): Promise<ToolResult> {
  const timeoutMs = clampTimeout(
    args.timeoutMs ??
      (isDependencyInstallCommand(executedCommand) ? INSTALL_TIMEOUT_MS : undefined),
  )
  const shell = buildShellInvocation(executedCommand, PLATFORM)

  return runTerminalCommand({
    conversationId: ctx.conversationId,
    runId: ctx.runId,
    parentRunId: ctx.parentRunId ?? null,
    agentId: ctx.agentId,
    taskId: ctx.taskId ?? null,
    toolCallId: ctx.toolCallId ?? null,
    shell: shell.cmd,
    shellArgs: shell.args,
    command: executedCommand,
    cwd,
    timeoutMs,
    abortSignal: ctx.abortSignal,
  })
    .then((result) => {
      // 证据里记原始命令：plan 里的 requiredCommands 是模型写的原文，比对必须用同一份字符串。
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
          ...(rewriteNotes.length > 0
            ? { rewrittenTo: executedCommand, rewriteNotes }
            : {}),
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

/**
 * 依赖安装类命令给更宽的默认超时。
 *
 * 2026-09-17 线上事故：`pip install --quiet pillow` 在 2C2G 服务器上超过 30s 默认超时，
 * 被记成 timed out 的失败命令证据（后来又叠加「跨 attempt 永久定罪」把任务钉死 4 次）。
 * 安装本身是准备动作，不该被 30s 掐死；模型显式传 timeoutMs 时仍然尊重模型的值。
 */
function isDependencyInstallCommand(command: string): boolean {
  return /(?:^|[\s;&|(])(?:pip3?|python3?(?:\.\d+)?\s+-m\s+pip|npm|pnpm|yarn|bun|apt|apt-get|dnf|yum|apk)\s+(?:install|add|ci|i)\b/.test(
    command,
  )
}
