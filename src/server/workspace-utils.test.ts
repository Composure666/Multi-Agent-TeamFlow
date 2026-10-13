import { lstatSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import type { WorkspaceRow } from '@/db/schema'

import {
  assertPathWithinWorkspace,
  getEffectiveCwd,
  isPathSafe,
  isPathWithin,
  resolveSafePath,
} from './workspace-utils'

/** 路径是否存在且确实是一个符号链接/junction。 */
function isSymlink(p: string): boolean {
  try {
    return lstatSync(p).isSymbolicLink()
  } catch {
    return false
  }
}

function workspace(overrides: Partial<WorkspaceRow> = {}): WorkspaceRow {
  return {
    id: 'ws_test',
    conversationId: 'conv_test',
    rootPath: path.join(process.cwd(), '.tmp', 'workspace'),
    mode: 'sandbox',
    boundPath: null,
    createdAt: 0,
    ...overrides,
  }
}

describe('getEffectiveCwd', () => {
  it('uses boundPath for local workspaces when present', () => {
    const boundPath = path.join(process.cwd(), 'local-project')
    expect(getEffectiveCwd(workspace({ mode: 'local', boundPath }))).toBe(boundPath)
  })

  it('falls back to rootPath for sandbox or missing local boundPath', () => {
    const rootPath = path.join(process.cwd(), 'sandbox-root')
    expect(getEffectiveCwd(workspace({ rootPath, mode: 'sandbox', boundPath: null }))).toBe(
      rootPath,
    )
    expect(getEffectiveCwd(workspace({ rootPath, mode: 'local', boundPath: null }))).toBe(
      rootPath,
    )
  })
})

describe('isPathWithin', () => {
  it('accepts equal paths and real descendants', () => {
    const root = path.join(process.cwd(), '.tmp', 'workspace')
    expect(isPathWithin(root, root)).toBe(true)
    expect(isPathWithin(path.join(root, 'src', 'file.ts'), root)).toBe(true)
  })

  it('rejects parent escapes and prefix traps', () => {
    const root = path.join(process.cwd(), '.tmp', 'workspace')
    expect(isPathWithin(path.resolve(root, '..', 'outside.txt'), root)).toBe(false)
    expect(isPathWithin(path.join(path.dirname(root), 'workspace-evil'), root)).toBe(false)
  })

  it.runIf(process.platform === 'win32')('is case-insensitive on Windows', () => {
    const root = path.join(process.cwd(), '.tmp', 'workspace')
    expect(isPathWithin(path.join(root.toUpperCase(), 'FILE.TS'), root.toLowerCase())).toBe(true)
  })
})

describe('resolveSafePath', () => {
  it('resolves relative and absolute paths inside the workspace', () => {
    const rootPath = path.join(process.cwd(), '.tmp', 'workspace')
    const ws = workspace({ rootPath })

    expect(resolveSafePath(ws, path.join('src', 'file.ts'))).toBe(
      path.resolve(rootPath, 'src', 'file.ts'),
    )
    expect(resolveSafePath(ws, path.resolve(rootPath, 'README.md'))).toBe(
      path.resolve(rootPath, 'README.md'),
    )
  })

  it('rejects parent escapes and absolute paths outside the workspace', () => {
    const rootPath = path.join(process.cwd(), '.tmp', 'workspace')
    const ws = workspace({ rootPath })

    expect(resolveSafePath(ws, '..')).toBeNull()
    expect(resolveSafePath(ws, path.join(path.dirname(rootPath), 'outside.txt'))).toBeNull()
    expect(resolveSafePath(ws, path.join(path.dirname(rootPath), 'workspace-evil'))).toBeNull()
  })
})

describe('resolveSafePath · 符号链接逃逸', () => {
  const tmpDirs: string[] = []
  afterEach(() => {
    for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true })
  })

  /** 造一个 workspace，并在外侧放一个「秘密文件」。 */
  function fixture() {
    const base = mkdtempSync(path.join(tmpdir(), 'agenthub-ws-'))
    tmpDirs.push(base)
    const wsRoot = path.join(base, 'workspace')
    const outside = path.join(base, 'outside')
    mkdirSync(wsRoot, { recursive: true })
    mkdirSync(outside, { recursive: true })
    const secret = path.join(outside, 'secret.txt')
    writeFileSync(secret, 'TOP SECRET\n', 'utf8')
    return { base, wsRoot, outside, secret }
  }

  /** 建目录链接：Windows 用 junction（无需管理员/开发者模式），POSIX 用 symlink。建不了返回 false。 */
  function linkDir(target: string, linkPath: string): boolean {
    try {
      symlinkSync(target, linkPath, process.platform === 'win32' ? 'junction' : 'dir')
      return true
    } catch {
      return false
    }
  }

  it('拒绝指向 workspace 外的符号链接文件', () => {
    const { wsRoot, secret } = fixture()
    const link = path.join(wsRoot, 'pwn.txt')
    try {
      symlinkSync(secret, link, 'file')
    } catch {
      return
    }
    // ⚠️ Windows 上（无开发者模式 / 非管理员）文件 symlink 会被「静默降级成复制一个普通文件」——
    // 那样它本来就在 workspace 内，不构成逃逸。只有真建出链接才断言。
    if (!isSymlink(link)) return
    const ws = workspace({ rootPath: wsRoot })
    expect(resolveSafePath(ws, 'pwn.txt')).toBeNull()
    expect(() => assertPathWithinWorkspace(ws, 'pwn.txt')).toThrow('outside workspace')
  })

  it('拒绝经由符号链接目录逃逸', () => {
    const { wsRoot, outside } = fixture()
    if (!linkDir(outside, path.join(wsRoot, 'esc'))) return
    const ws = workspace({ rootPath: wsRoot })
    // 纯文本层面 esc/secret.txt 在 wsRoot 内 —— 旧实现会放行
    expect(resolveSafePath(ws, path.join('esc', 'secret.txt'))).toBeNull()
    expect(() => assertPathWithinWorkspace(ws, path.join('esc', 'secret.txt'))).toThrow(
      'outside workspace',
    )
  })

  it('不误伤 workspace 内的普通路径', () => {
    const { wsRoot } = fixture()
    mkdirSync(path.join(wsRoot, 'src'), { recursive: true })
    const ws = workspace({ rootPath: wsRoot })
    // 已存在的真实目录
    expect(resolveSafePath(ws, 'src')).toBe(path.join(wsRoot, 'src'))
    // 还不存在的新文件（父目录存在）—— 写新文件必须仍然放行
    expect(resolveSafePath(ws, path.join('src', 'new.ts'))).toBe(path.join(wsRoot, 'src', 'new.ts'))
  })

  it('拒绝指向 workspace 外的绝对路径（原有行为不回退）', () => {
    const { wsRoot, secret } = fixture()
    const ws = workspace({ rootPath: wsRoot })
    expect(resolveSafePath(ws, secret)).toBeNull()
  })
})

describe('assertPathWithinWorkspace', () => {
  it('returns resolved paths inside the workspace', () => {
    const rootPath = path.join(process.cwd(), '.tmp', 'workspace')
    const ws = workspace({ rootPath })

    expect(assertPathWithinWorkspace(ws, 'notes.md')).toBe(path.resolve(rootPath, 'notes.md'))
  })

  it('throws with context for escapes', () => {
    const ws = workspace()
    expect(() => assertPathWithinWorkspace(ws, '../outside.txt')).toThrow(
      'Path "../outside.txt" is outside workspace',
    )
  })
})

describe('isPathSafe', () => {
  it('rejects home and sensitive home children', () => {
    const home = homedir()

    expect(isPathSafe(home)).toBe(false)
    expect(isPathSafe(path.join(home, '.ssh'))).toBe(false)
    expect(isPathSafe(path.join(home, '.ssh', 'config'))).toBe(false)
  })

  it('allows ordinary project directories', () => {
    expect(isPathSafe(path.join(homedir(), 'agenthub-project'))).toBe(true)
  })

  it.runIf(process.platform === 'win32')('rejects Windows system and UNC paths', () => {
    const systemDrive = process.env.SystemDrive ?? 'C:'
    expect(isPathSafe(`${systemDrive}\\Windows`)).toBe(false)
    expect(isPathSafe('\\\\?\\C:\\Windows')).toBe(false)
    expect(isPathSafe('\\\\server\\share\\project')).toBe(false)
  })

  it.runIf(process.platform !== 'win32')('rejects POSIX system paths', () => {
    expect(isPathSafe('/etc')).toBe(false)
    expect(isPathSafe('/usr/bin')).toBe(false)
  })
})
