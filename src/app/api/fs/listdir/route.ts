import { readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

import { NextRequest, NextResponse } from 'next/server'

import { IS_WINDOWS } from '@/server/platform'
import { isPathSafe } from '@/server/workspace-utils'

/**
 * GET /api/fs/listdir?path=<absPath>
 *
 * 列出指定目录下的**子目录**（用于 DirPickerDialog）。
 * - path 不传：默认 homedir()
 * - path === '__drives__'：返回当前可用盘符（Windows 专属虚拟根；POSIX 上返回 /）
 * - 其他：必须是绝对路径 + 是目录 + 通过 isPathSafe
 * - 隐藏 dotfile（不在 DirPicker 里展示，避免噪音）
 * - 返回 parent 用于「上一级」导航；根目录时 parent 为 null，但 Windows 盘符根（如 C:\）的 parent 为 '__drives__'
 * - entry.path 可选；存在时前端应直接用它做下一跳（用于盘符 → C:\）
 */

const DRIVES_SENTINEL = '__drives__'

// Windows 已知隐藏 / 系统目录名（大小写不敏感）。Node fs.statSync 不暴露 hidden attribute；
// 引入第三方包代价大，命名硬编码已覆盖 95% 噪音目录，详见 specs/11-platform.md。
const WINDOWS_HIDDEN_NAMES = new Set(
  [
    'AppData',
    '$Recycle.Bin',
    'System Volume Information',
    'Recovery',
    'PerfLogs',
    'Config.Msi',
    'MSOCache',
    'OneDriveTemp',
    'ProgramData',
  ].map((n) => n.toLowerCase()),
)

function listAvailableDrives(): string[] {
  if (!IS_WINDOWS) return ['/']
  const drives: string[] = []
  for (let i = 65; i <= 90; i++) {
    const root = `${String.fromCharCode(i)}:\\`
    try {
      statSync(root)
      drives.push(root)
    } catch {
      // drive not present
    }
  }
  return drives
}

export async function GET(req: NextRequest) {
  const requested = req.nextUrl.searchParams.get('path')
  const target = requested?.trim() || homedir()

  if (target === DRIVES_SENTINEL) {
    const drives = listAvailableDrives()
    return NextResponse.json({
      path: DRIVES_SENTINEL,
      parent: null,
      entries: drives.map((d) => ({
        name: d.replace(/[\\/]$/, '') || d,
        isDirectory: true,
        path: d,
      })),
    })
  }

  if (!path.isAbsolute(target)) {
    return NextResponse.json({ error: 'path must be absolute' }, { status: 400 })
  }

  const resolved = path.resolve(target)

  // 允许浏览 home 自身（用作起点）但仍走 isPathSafe 拦截已知敏感子路径
  if (resolved !== path.resolve(homedir()) && !isPathSafe(resolved)) {
    return NextResponse.json({ error: 'Path not allowed' }, { status: 403 })
  }

  let stat
  try {
    stat = statSync(resolved)
  } catch {
    return NextResponse.json({ error: 'Path does not exist' }, { status: 404 })
  }
  if (!stat.isDirectory()) {
    return NextResponse.json({ error: 'Not a directory' }, { status: 400 })
  }

  let raw
  try {
    raw = readdirSync(resolved, { withFileTypes: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Cannot read directory: ${msg}` }, { status: 403 })
  }

  const isWin = IS_WINDOWS
  const entries = raw
    .filter((e) => !e.name.startsWith('.'))
    .filter((e) => !isWin || !WINDOWS_HIDDEN_NAMES.has(e.name.toLowerCase()))
    .map((e) => ({ name: e.name, isDirectory: e.isDirectory() }))
    .filter((e) => e.isDirectory) // 只暴露目录
    .sort((a, b) => a.name.localeCompare(b.name))

  const parent = (() => {
    const p = path.dirname(resolved)
    if (p !== resolved) return p
    // 已到根。Windows 上盘符根（C:\）暴露虚拟 drives 列表作为上一级
    return IS_WINDOWS ? DRIVES_SENTINEL : null
  })()

  return NextResponse.json({
    path: resolved,
    parent,
    entries,
  })
}
