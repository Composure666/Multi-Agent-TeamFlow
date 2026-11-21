// 同步首页「数字证明」里的测试通过数（G3，C7 根治）。
//
// 用法（在仓库根目录执行）：
//   node scripts/sync-home-test-count.mjs
//
// 做法：跑一遍全量 `vitest run --reporter=json`，取通过数写回
// `src/components/home/home-data.ts` 里 `{ value: '…', label: '测试通过' }` 的 value，
// 只改这一处数字，不动文件其他内容。
//
// 注意：
// - 不接 `next build`：全量测试约 60s，会拖慢每次构建；只在需要时手动跑。
// - 跑之前确保 better-sqlite3 在 node ABI（测试跑系统 Node 24）：
//   先跑 `node scripts/ensure-node-sqlite.mjs`（或直接 `pnpm test`，它自带这一步）。
// - JSON reporter 输出形状以实测为准（vitest 4.x）：顶层字段 `numPassedTests` /
//   `numFailedTests` / `success` / `testResults[].status`；不要猜字段名，
//   升级 vitest 后先小跑一次核对。
// - 有用例失败（`numFailedTests > 0`）时不写回，直接报错退出，
//   避免把一次跑红的数字当成首页数字；只有文件级失败（加载/hook 超时，
//   失败用例数为 0）时仍写回如实的通过数，但会打印警告列出失败的文件。

import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const homeDataPath = path.join(repoRoot, 'src/components/home/home-data.ts')
// 只认「测试通过」这一条，避免误改其他数字。
const TEST_COUNT_RE = /\{\s*value:\s*'(\d+)'\s*,\s*label:\s*'测试通过'\s*\}/

function parseJsonReporterOutput(stdout) {
  try {
    return JSON.parse(stdout)
  } catch {
    // 容错：若 stdout 前后混入其他输出，只截取最外层 JSON 对象再解析。
    const start = stdout.indexOf('{')
    const end = stdout.lastIndexOf('}')
    if (start === -1 || end <= start) throw new Error('vitest JSON 输出中找不到 JSON 对象')
    return JSON.parse(stdout.slice(start, end + 1))
  }
}

// vitest 套件失败时退出码非 0，用 spawnSync（不抛错）才能拿到 JSON 输出再自行判断。
const result = spawnSync(
  path.join(repoRoot, 'node_modules/.bin/vitest'),
  ['run', '--reporter=json'],
  { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 64 * 1024 * 1024 },
)
if (!result.stdout) {
  throw new Error(`vitest 未输出 JSON（退出码 ${result.status}，${result.error?.message ?? '无 stdout'}）`)
}
const report = parseJsonReporterOutput(result.stdout)

if (report.numFailedTests !== 0) {
  throw new Error(`vitest 有 ${report.numFailedTests} 个用例失败，不同步首页数字`)
}
const passed = report.numPassedTests
if (!Number.isInteger(passed) || passed <= 0) {
  throw new Error(`vitest JSON 输出里没有合法的通过数：numPassedTests=${passed}`)
}
if (report.success !== true) {
  // 只有文件级失败（加载/hook 超时），失败用例数为 0，通过数仍是如实值；警告不断言。
  const failedFiles = (report.testResults ?? [])
    .filter((f) => f.status === 'failed')
    .map((f) => f.name)
  console.warn(`警告：vitest 未完全跑完（${failedFiles.length} 个文件失败，通过数仍如实为 ${passed}）：`)
  for (const f of failedFiles) console.warn(`  - ${f}`)
}

const source = readFileSync(homeDataPath, 'utf8')
const match = source.match(TEST_COUNT_RE)
if (!match) throw new Error(`${homeDataPath} 里找不到 label 为「测试通过」的数字条目`)
const current = Number(match[1])

if (current === passed) {
  console.log(`首页测试数已是最新：${passed}，无需改动。`)
  process.exit(0)
}

writeFileSync(homeDataPath, source.replace(TEST_COUNT_RE, `{ value: '${passed}', label: '测试通过' }`), 'utf8')
console.log(`首页测试数已同步：${current} → ${passed}`)
