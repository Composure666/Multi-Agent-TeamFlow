import { describe, expect, it } from 'vitest'

import { classifyBashApproval } from './bash-command-approval'

describe('classifyBashApproval', () => {
  it('requires approval for dependency-changing or destructive commands', () => {
    expect(classifyBashApproval('pnpm install', 'posix')).toMatchObject({ required: true })
    expect(classifyBashApproval('npm ci', 'posix')).toMatchObject({ required: true })
    expect(classifyBashApproval('npx create-vite@latest app', 'posix')).toMatchObject({ required: true })
    expect(classifyBashApproval('python -m pip install requests', 'posix')).toMatchObject({ required: true })
    expect(classifyBashApproval('git reset --hard HEAD~1', 'posix')).toMatchObject({ required: true })
    expect(classifyBashApproval('rm -rf dist', 'posix')).toMatchObject({ required: true })
  })

  it('does not require approval for read-only or ordinary validation commands', () => {
    expect(classifyBashApproval('pnpm build', 'posix')).toEqual({ required: false, reason: '' })
    expect(classifyBashApproval('git status --short', 'posix')).toEqual({
      required: false,
      reason: '',
    })
    expect(classifyBashApproval('ls -la', 'posix')).toEqual({ required: false, reason: '' })
  })
})
