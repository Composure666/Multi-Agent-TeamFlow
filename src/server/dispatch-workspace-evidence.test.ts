import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import type { DispatchPlanItem } from '@/shared/types'

import { evaluateWorkspaceEvidence } from './dispatch-workspace-evidence'

function withTempWorkspace(fn: (workspaceRoot: string) => void) {
  const dir = mkdtempSync(path.join(tmpdir(), 'agenthub-workspace-evidence-'))
  try {
    fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function writeFiles(root: string, relDir: string, count: number) {
  const dir = path.join(root, relDir)
  mkdirSync(dir, { recursive: true })
  for (let i = 1; i <= count; i++) {
    writeFileSync(path.join(dir, `File${i}.java`), `class File${i} {}`)
  }
}

function codeTask(overrides: Partial<DispatchPlanItem> = {}): DispatchPlanItem {
  return {
    id: 't_backend',
    agentId: 'ag_backend',
    taskKind: 'code',
    task: 'Implement backend files',
    targetPaths: [
      'backend/src/main/java/com/tourism/dto/',
      'backend/src/main/java/com/tourism/service/',
      'backend/src/main/java/com/tourism/controller/',
    ],
    expectedWorkspaceChanges: [
      'dto/request/ 目录下 9 个 Request DTO 文件',
      'dto/response/ 目录下 9 个 Response DTO 文件',
      'service/ 目录下 7 个 Service 接口文件',
      'service/impl/ 目录下 7 个 Service 实现文件',
      'controller/ 目录下 6 个 Controller 文件',
    ],
    ...overrides,
  }
}

describe('evaluateWorkspaceEvidence', () => {
  it('fails code tasks when declared workspace directories are empty or missing files', () => {
    withTempWorkspace((workspaceRoot) => {
      writeFiles(workspaceRoot, 'backend/src/main/java/com/tourism/dto/request', 9)
      writeFiles(workspaceRoot, 'backend/src/main/java/com/tourism/dto/response', 9)
      writeFiles(workspaceRoot, 'backend/src/main/java/com/tourism/service', 7)
      writeFiles(workspaceRoot, 'backend/src/main/java/com/tourism/service/impl', 7)
      mkdirSync(path.join(workspaceRoot, 'backend/src/main/java/com/tourism/controller'), {
        recursive: true,
      })

      expect(evaluateWorkspaceEvidence(codeTask(), workspaceRoot)).toEqual({
        ok: false,
        error:
          'Task "t_backend" workspace evidence is incomplete: expected at least 6 file(s) under backend/src/main/java/com/tourism/controller from expectedWorkspaceChanges "controller/ 目录下 6 个 Controller 文件", found 0',
      })
    })
  })

  it('passes when declared target paths and expected workspace file counts exist', () => {
    withTempWorkspace((workspaceRoot) => {
      writeFiles(workspaceRoot, 'backend/src/main/java/com/tourism/dto/request', 9)
      writeFiles(workspaceRoot, 'backend/src/main/java/com/tourism/dto/response', 9)
      writeFiles(workspaceRoot, 'backend/src/main/java/com/tourism/service', 7)
      writeFiles(workspaceRoot, 'backend/src/main/java/com/tourism/service/impl', 7)
      writeFiles(workspaceRoot, 'backend/src/main/java/com/tourism/controller', 6)

      expect(evaluateWorkspaceEvidence(codeTask(), workspaceRoot)).toEqual({ ok: true })
    })
  })

  it('ignores review tasks without workspace implementation gates', () => {
    withTempWorkspace((workspaceRoot) => {
      expect(
        evaluateWorkspaceEvidence(
          codeTask({ taskKind: 'review', targetPaths: ['backend/src/main/java/com/tourism/controller/'] }),
          workspaceRoot,
        ),
      ).toEqual({ ok: true })
    })
  })
})
