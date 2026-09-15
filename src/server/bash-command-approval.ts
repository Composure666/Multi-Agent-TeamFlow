import type { WriteApprovalMode } from '@/server/approval-mode'
import { pendingBashCommands } from '@/server/pending-bash-commands'
import type { Platform } from '@/server/platform'

export interface BashApproval {
  required: boolean
  reason: string
}

/**
 * review 模式下额外拦截的一档：命令本身不算「高危」，但会改动工作区文件。
 * auto 模式完全不管这些（auto = 写入直接生效）。
 *
 * 刻意不拦 npm run build / next build / 测试命令 —— 这类几乎每个前端任务都要跑，
 * 逐个点确认会把 review 模式变成「点确认模式」。
 */
const MUTATING_CHECKS: Array<[RegExp, string]> = [
  [/\b(?:cp|mv|rm|mkdir|rmdir|touch|ln)\b/i, 'command creates, moves or deletes files'],
  [/\b(?:sed|perl)\s+-i\b/i, 'in-place edit rewrites files'],
  [/\btee\b/i, 'tee writes to files'],
  [/\b(?:cat|echo|printf)\b[\s\S]*>/, 'shell redirection writes to a file'],
  [/\bgit\s+(?:add|commit|push|pull|merge|rebase|cherry-pick|stash|apply|am|switch|checkout|restore|reset|clean|tag)\b/i, 'git command changes the repository state'],
  [/\b(?:curl|wget)\b[\s\S]*(?:-o|--output|\|\s*(?:sh|bash|zsh|powershell))\b/i, 'download writes a file or pipes into a shell'],
  [/\bNew-Item\b|\bSet-Content\b|\bAdd-Content\b|\bOut-File\b|\bCopy-Item\b|\bMove-Item\b|\bRemove-Item\b|\bRename-Item\b/i, 'PowerShell cmdlet writes or removes files'],
]

export function classifyBashApproval(
  command: string,
  platform: Platform,
  mode: WriteApprovalMode = 'auto',
): BashApproval {
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

  // review 模式才拦的第二档：会改动工作区文件，但本身不算高危
  if (mode === 'review') {
    for (const [pattern, reason] of MUTATING_CHECKS) {
      if (pattern.test(normalized)) return { required: true, reason }
    }
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
