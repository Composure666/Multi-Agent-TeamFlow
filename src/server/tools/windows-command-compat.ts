/**
 * Windows 下 bash 语法的兼容层。
 *
 * 背景：bash 工具在 Windows 上固定走 `powershell.exe`（Windows PowerShell 5.1），
 * 但 LLM 天然倾向写 POSIX 语法 —— `rm -rf`、`mkdir -p`、`2>/dev/null`、`&&` 链、
 * 反斜杠续行在 PS 5.1 里全都是语法/参数错误。以前这些命令会静默失败，
 * 被 `failed command evidence` 门禁记成 failed，进而触发重试放大。
 *
 * 策略：
 *  1. 能无歧义改写的（rm -rf / mkdir -p / cp -r / touch / /dev/null / && 链）直接改写；
 *  2. 无法安全改写的（heredoc、续行反斜杠、sudo）提前返回可读错误，
 *     让模型立刻重写，而不是浪费一轮执行 + 一次门禁失败。
 *
 * 注意：证据里记录的始终是**原始命令**，保证与 plan 里 requiredCommands 的比对语义不变。
 */

export interface WindowsCommandAdaptation {
  /** 真正交给 PowerShell 执行的命令 */
  command: string
  /** 是否发生过自动改写 */
  rewritten: boolean
  /** 无法自动改写且明确会在 PowerShell 5.1 失败时的可读原因 */
  error?: string
  /** 做了哪些改写，便于回显给模型 */
  notes: string[]
}

const UNSAFE_TO_ADAPT: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /^\s*sudo\s/,
    reason: 'sudo does not exist on Windows. Drop it and run the command directly.',
  },
  {
    pattern: /<<</,
    reason:
      'Here-strings (<<<) are bash syntax. Use a PowerShell here-string instead: @\'"\n...\n"\'@.',
  },
  {
    pattern: /\S+\s*<<\s*\S+/,
    reason:
      'Heredocs (<<EOF) are bash syntax. Write the content to a file with Set-Content, or use a PowerShell here-string.',
  },
  {
    // 只在「反斜杠 + 换行 + 后面还有内容」时判定为续行：
    // PowerShell 路径（如 .\\dist\\）也以反斜杠结尾，不能误伤。
    pattern: /\\[ \t]*\r?\n[ \t]*\S/,
    reason:
      'Backslash line continuations are bash syntax. Put the whole command on one line, or end the line with a PowerShell backtick (`).',
  },
]

interface SimpleRewrite {
  pattern: RegExp
  replace: (match: RegExpExecArray) => string
  note: string
}

const SIMPLE_REWRITES: SimpleRewrite[] = [
  {
    pattern: /^rm\s+-(?:rf|fr)\s+(.+)$/,
    replace: (m) => `Remove-Item -Recurse -Force -Path ${m[1].trim()}`,
    note: 'rm -rf -> Remove-Item -Recurse -Force',
  },
  {
    pattern: /^mkdir\s+-p\s+(.+)$/,
    replace: (m) => `New-Item -ItemType Directory -Force -Path ${m[1].trim()}`,
    note: 'mkdir -p -> New-Item -ItemType Directory -Force',
  },
  {
    pattern: /^cp\s+-(?:r|R|rf|fr)\s+(\S+)\s+(.+)$/,
    replace: (m) => `Copy-Item -Recurse -Force -Path ${m[1]} -Destination ${m[2].trim()}`,
    note: 'cp -r -> Copy-Item -Recurse -Force',
  },
  {
    pattern: /^touch\s+(\S+)$/,
    replace: (m) => `New-Item -ItemType File -Force -Path ${m[1]}`,
    note: 'touch -> New-Item -ItemType File -Force',
  },
]

export function adaptCommandForWindowsPowerShell(command: string): WindowsCommandAdaptation {
  for (const rule of UNSAFE_TO_ADAPT) {
    if (rule.pattern.test(command)) {
      return { command, rewritten: false, error: rule.reason, notes: [] }
    }
  }

  const andParts = splitTopLevel(command, '&&')
  const orParts = splitTopLevel(command, '||')
  if (andParts && orParts) {
    return {
      command,
      rewritten: false,
      error:
        'Mixing && and || is ambiguous to translate automatically. Rewrite as explicit PowerShell: run each statement separated by ";", and guard follow-ups with if ($?) { ... } or if (-not $?) { ... }.',
      notes: [],
    }
  }

  const notes: string[] = []
  let segments: string[]
  let guard: '$?' | '-not $?' | null = null

  if (andParts && andParts.length > 1) {
    segments = andParts
    guard = '$?'
    notes.push('&& chain -> "; if ($?) { ... }"')
  } else if (orParts && orParts.length > 1) {
    segments = orParts
    guard = '-not $?'
    notes.push('|| chain -> "; if (-not $?) { ... }"')
  } else {
    segments = [command]
  }

  const rewrittenSegments = segments.map((segment) => rewriteSegment(segment, notes))
  const next = guard ? joinGuarded(rewrittenSegments, guard) : rewrittenSegments.join('; ')

  if (next === command) return { command, rewritten: false, notes: [] }
  return { command: next, rewritten: true, notes }
}

function rewriteSegment(segment: string, notes: string[]): string {
  let out = segment.trim()

  for (const rule of SIMPLE_REWRITES) {
    const match = rule.pattern.exec(out)
    if (!match) continue
    out = rule.replace(match)
    notes.push(rule.note)
    break
  }

  if (out.includes('/dev/null')) {
    out = out.replace(/\/dev\/null/g, '$null')
    notes.push('/dev/null -> $null')
  }

  return out
}

function joinGuarded(segments: string[], condition: string): string {
  let result = segments[segments.length - 1]
  for (let i = segments.length - 2; i >= 0; i--) {
    result = `${segments[i]}; if (${condition}) { ${result} }`
  }
  return result
}

/**
 * 按顶层 `&&` / `||` 切分，跳过引号内的同形字符。
 * 返回 null 表示没找到该运算符。
 */
function splitTopLevel(command: string, operator: '&&' | '||'): string[] | null {
  const ch = operator[0]
  const parts: string[] = []
  let buffer = ''
  let quote: '"' | "'" | null = null
  let found = false
  let i = 0

  while (i < command.length) {
    const current = command[i]
    if (quote) {
      buffer += current
      if (current === quote) quote = null
      i += 1
      continue
    }
    if (current === '"' || current === "'") {
      quote = current
      buffer += current
      i += 1
      continue
    }
    if (current === ch && command[i + 1] === ch) {
      const prev = buffer.length > 0 ? buffer[buffer.length - 1] : ''
      const next = command[i + 2] ?? ''
      const isBoundary =
        (prev === '' || /\s/.test(prev)) && (next === '' || /\s/.test(next))
      if (isBoundary) {
        parts.push(buffer.trim())
        buffer = ''
        found = true
        i += 2
        continue
      }
      buffer += ch + ch
      i += 2
      continue
    }
    buffer += current
    i += 1
  }
  parts.push(buffer.trim())

  return found ? parts : null
}
