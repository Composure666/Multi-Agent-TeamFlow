import { describe, expect, it } from 'vitest'

import { adaptCommandForWindowsPowerShell } from './windows-command-compat'

describe('adaptCommandForWindowsPowerShell', () => {
  it('leaves plain PowerShell commands untouched', () => {
    const result = adaptCommandForWindowsPowerShell('Get-ChildItem -Force')
    expect(result.rewritten).toBe(false)
    expect(result.command).toBe('Get-ChildItem -Force')
    expect(result.error).toBeUndefined()
  })

  it('rewrites rm -rf', () => {
    const result = adaptCommandForWindowsPowerShell('rm -rf node_modules')
    expect(result.rewritten).toBe(true)
    expect(result.command).toBe('Remove-Item -Recurse -Force -Path node_modules')
  })

  it('rewrites mkdir -p', () => {
    expect(adaptCommandForWindowsPowerShell('mkdir -p dist/assets').command).toBe(
      'New-Item -ItemType Directory -Force -Path dist/assets',
    )
  })

  it('rewrites cp -r and touch', () => {
    expect(adaptCommandForWindowsPowerShell('cp -r src dist').command).toBe(
      'Copy-Item -Recurse -Force -Path src -Destination dist',
    )
    expect(adaptCommandForWindowsPowerShell('touch README.md').command).toBe(
      'New-Item -ItemType File -Force -Path README.md',
    )
  })

  it('maps /dev/null to $null', () => {
    expect(adaptCommandForWindowsPowerShell('python gen.py 2>/dev/null').command).toBe(
      'python gen.py 2>$null',
    )
  })

  it('translates && chains into guarded PowerShell', () => {
    expect(adaptCommandForWindowsPowerShell('pnpm build && pnpm test').command).toBe(
      'pnpm build; if ($?) { pnpm test }',
    )
    expect(adaptCommandForWindowsPowerShell('a && b && c').command).toBe(
      'a; if ($?) { b; if ($?) { c } }',
    )
  })

  it('translates || chains into negated guards', () => {
    expect(adaptCommandForWindowsPowerShell('pnpm test || echo failed').command).toBe(
      'pnpm test; if (-not $?) { echo failed }',
    )
  })

  it('ignores && and || inside quoted strings', () => {
    const result = adaptCommandForWindowsPowerShell('python -c "print(1) && print(2)"')
    expect(result.rewritten).toBe(false)
    expect(result.command).toBe('python -c "print(1) && print(2)"')
  })

  it('does not mistake 2>&1 for an && operator', () => {
    const result = adaptCommandForWindowsPowerShell('pnpm build 2>&1')
    expect(result.rewritten).toBe(false)
  })

  it('rejects bash-only syntax it cannot translate safely', () => {
    expect(adaptCommandForWindowsPowerShell('sudo pnpm install').error).toContain('sudo')
    expect(adaptCommandForWindowsPowerShell('cat <<EOF > a.txt').error).toContain('Heredoc')
    expect(adaptCommandForWindowsPowerShell('python gen.py \\\n  --out dist').error).toContain(
      'continuation',
    )
  })

  it('does not mistake a Windows path ending in a backslash for a line continuation', () => {
    const result = adaptCommandForWindowsPowerShell('Get-ChildItem .\\dist\\')
    expect(result.error).toBeUndefined()
    expect(result.rewritten).toBe(false)
  })

  it('rejects mixed && and || instead of guessing precedence', () => {
    expect(adaptCommandForWindowsPowerShell('a && b || c').error).toContain('ambiguous')
  })
})
