import { pendingBashCommands } from '@/server/pending-bash-commands'
import type { Platform } from '@/server/platform'

export interface BashApproval {
  required: boolean
  reason: string
}

export function classifyBashApproval(command: string, platform: Platform): BashApproval {
  const normalized = command.trim()
  const checks: Array<[RegExp, string]> = [
    [
      /\b(?:npm|pnpm|yarn|bun)\s+(?:install|i|ci|add|remove|rm|uninstall|update|upgrade)\b/i,
      'package manager changes dependencies or downloads packages',
    ],
    [
      /\b(?:npx|bunx)\b|\b(?:pnpm|yarn)\s+dlx\b/i,
      'package runner may download and execute packages',
    ],
    [
      /\b(?:pip|pip3|uv)\s+(?:install|add|remove|sync)\b|\bpython(?:3)?\s+-m\s+pip\s+install\b/i,
      'Python package command may download or change dependencies',
    ],
    [/\bgit\s+(?:reset|clean)\b/i, 'git command may discard local changes'],
    [/\bgit\s+(?:checkout|restore)\b[\s\S]*(?:--|\s)\./i, 'git command may overwrite workspace files'],
    [/\brm\s+-(?:[A-Za-z]*r[A-Za-z]*f|[A-Za-z]*f[A-Za-z]*r)\b/i, 'recursive force delete command'],
    [/\bfind\b[\s\S]*\s-delete\b/i, 'find -delete may remove many files'],
    [/\b(?:chmod|chown)\b/i, 'permission or ownership change'],
    [
      /\bdocker\s+(?:run|compose|build|push|pull|system|volume|network)\b/i,
      'Docker command may affect local containers, images, or network',
    ],
  ]

  if (platform === 'windows') {
    checks.push(
      [/\bRemove-Item\b[\s\S]*-(?:Recurse|Force)\b/i, 'PowerShell recursive or forced removal'],
      [
        /\b(?:npm|pnpm|yarn|bun)\.cmd\s+(?:install|i|ci|add|remove|rm|uninstall|update|upgrade)\b/i,
        'package manager changes dependencies or downloads packages',
      ],
    )
  }

  for (const [pattern, reason] of checks) {
    if (pattern.test(normalized)) return { required: true, reason }
  }
  return { required: false, reason: '' }
}

export async function waitForBashApproval(args: {
  conversationId: string
  agentId: string
  runId: string
  command: string
  cwd: string
  reason: string
  signal: AbortSignal
}): Promise<boolean> {
  const pending = pendingBashCommands.register(args)
  return new Promise<boolean>((resolve) => {
    let settled = false
    const finish = (approved: boolean) => {
      if (settled) return
      settled = true
      args.signal.removeEventListener('abort', onAbort)
      resolve(approved)
    }
    const onAbort = () => {
      pendingBashCommands.cancel(pending.id)
      finish(false)
    }
    pendingBashCommands.attachResolver(pending.id, (decision) => finish(decision.approved))
    if (args.signal.aborted) onAbort()
    else args.signal.addEventListener('abort', onAbort, { once: true })
  })
}
