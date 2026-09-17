import { describe, expect, it } from 'vitest'

import type { RunToolEvidence } from '@/server/dispatch-run-evidence'
import type { DispatchPlanItem } from '@/shared/types'

import { evaluateTaskResultReport, isVerificationCommand } from './task-result-report'

/**
 * 完成门禁的「验证命令识别」表面锁定。
 *
 * 背景（2026-09-17 线上）：代码任务完成后，AgentRunner 要求存在一条**成功的非 prepare
 * 验证命令**证据。旧实现把整串命令丢进一份只认包管理器与已知测试框架的正则白名单，
 * 于是两类真实形态全部落空：
 *   1. 零依赖项目自写的校验脚本 —— `node landing/qa/check.mjs`（42 项全 PASS、exitCode=0）；
 *   2. 复合 / 多行命令 —— 白名单里的 `(?=.*…)` 前瞻跨不过换行。
 * 交付被判 failed，agent 只能反复重跑同一条已经绿了的命令。
 *
 * 这个文件同时钉住**正面**（必须认）与**反面**（不能认）两侧：
 * 放开识别绝不能把「起服务」「只读探测」「词形巧合」「`||` 假绿」放进门禁。
 */

const task: DispatchPlanItem = {
  id: 't1',
  agentId: 'ag_worker',
  task: 'Implement the landing page',
  taskKind: 'code',
}

function evidence(commands: string[], exitCode = 0): RunToolEvidence {
  return {
    fileWrites: [],
    commands: commands.map((command) => ({
      command,
      cwd: 'E:/repo',
      exitCode,
      timedOut: false,
      isError: exitCode !== 0,
    })),
  }
}

function gateAccepts(command: string): boolean {
  return evaluateTaskResultReport(task, { status: 'complete', summary: 'Done.' }, evidence([command]))
    .ok
}

const RECOGNIZED: readonly string[] = [
  // 本次线上形态：项目自写的零依赖校验脚本
  'node landing/qa/check.mjs',
  'cd landing && node landing/qa/check.mjs',
  'cd landing/qa && node check.mjs',
  'node landing/qa/check.mjs; echo done',
  'cd landing\nnode landing/qa/check.mjs',
  // 脚本 runner 家族：验证语义在脚本名里
  'node qa/check.mjs',
  'python qa/check.py',
  'python3 scripts/validate.py',
  'npx tsx qa/check.ts',
  'bash scripts/verify.sh',
  'sh verify-site.sh',
  'node --test',
  'node --check landing/app.js',
  'timeout 300 node landing/qa/check.mjs',
  'env NODE_ENV=test node landing/qa/check.mjs',
  'bun run qa/smoke.ts',
  // 既有白名单形态不能回归
  'pnpm build',
  'npm test',
  'npm run build',
  'npm run build 2>&1',
  'npm run typecheck',
  'npm run qa',
  'npm run verify',
  'pnpm test src/server/foo.test.ts',
  'mvn compile',
  'go test ./...',
  'cargo check',
  'pytest',
  'python -m pytest',
  'python -m unittest',
  'tsc --noEmit',
  'dotnet build',
  './gradlew build',
  'next build',
  'vite build',
  'ruff check .',
  'mypy src',
  'deno test',
]

const NOT_RECOGNIZED: readonly string[] = [
  // 只读探测
  'ls',
  'ls -la',
  'cat package.json',
  'echo tsc',
  'grep -r test src',
  'git status',
  'which node',
  // 装依赖是准备动作，不是验证
  'pnpm install',
  'npm ci',
  // 起服务 / 跑应用：跑得起来不代表验证过
  'node server.js',
  'node dist/index.js',
  'node landing/app.mjs',
  'npm run dev',
  'npm run start',
  'npm run serve',
  'npm run watch',
  'npx serve dist',
  'python manage.py runserver',
  // 模块存在性探测
  `node -e "require('fs')"`,
  'python -c "import PIL"',
  // 词形巧合（含 test/check 子串但不是验证脚本）
  'node latest.mjs',
  'node contest.js',
  // `A || B` 里的 B 只在 A 失败时才跑：exit 0 恰恰说明验证没过
  'npm test || echo skipped',
  'npm run build || true',
  // 别的工具把脚本当参数，脚本没有真的被执行
  'docker run --rm node check.mjs',
  'xargs node < list.txt',
]

describe('isVerificationCommand', () => {
  for (const command of RECOGNIZED) {
    it(`recognizes ${JSON.stringify(command)}`, () => {
      expect(isVerificationCommand(command)).toBe(true)
      expect(gateAccepts(command)).toBe(true)
    })
  }

  for (const command of NOT_RECOGNIZED) {
    it(`rejects ${JSON.stringify(command)}`, () => {
      expect(isVerificationCommand(command)).toBe(false)
      expect(gateAccepts(command)).toBe(false)
    })
  }
})
