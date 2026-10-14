import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Electron 打包用：生成 .next/standalone 自包含 server（详见 Spec 12 §2 / §6）
  output: 'standalone',

  // 不让 webpack bundle native / SDK 依赖；运行时走 require/import，保留 native binding 与子进程能力
  serverExternalPackages: [
    'better-sqlite3',
    '@anthropic-ai/claude-agent-sdk',
    '@openai/codex-sdk',
    '@openai/codex',
    '@modelcontextprotocol/sdk',
    'pptxgenjs',
    'pdf-parse',
    'ali-oss',
  ],

  outputFileTracingIncludes: {
    '/*': [
      'scripts/agenthub-codex-mcp.mjs',
      // pdf-parse loads pdf.worker.mjs at runtime; keep worker assets in standalone/Electron.
      'node_modules/pdf-parse/dist/**/*',
      'node_modules/pdfjs-dist/**/*',
      'node_modules/.pnpm/pdf-parse@*/node_modules/pdf-parse/dist/**/*',
      'node_modules/.pnpm/pdfjs-dist@*/node_modules/pdfjs-dist/**/*',
    ],
  },

  outputFileTracingExcludes: {
    '/*': [
      // ❗ 目录级排除必须写成 `<dir>/**`。顶层的 `*.md` / `*.txt` 只排得掉**顶层**文件
      //（glob 的 `*` 不跨 `/`），子目录里的 md 会照进不误。2026-10-14 实测：陈旧
      // `.next/standalone/` 里躺着 `deliverables/` 17 个文件（含内部审查与合规报告）、
      // `deploy/` 8 个、`docs/`、`e2e/`、`scripts/` —— 会随 Electron 安装包发给终端用户。
      '.agenthub-data/**',
      '.claude/**',
      '.git/**',
      '.tmp-probe/**',
      '.understand-anything/**',
      '.workbuddy/**',
      '*.md',
      '*.txt',
      'agenthub-dev.log',
      'components.json',
      'deliverables/**',
      'deploy/**',
      'docs/**',
      'drizzle.config.ts',
      'e2e/**',
      'eslint.config.mjs',
      'apps/**',
      'dist-electron/**',
      'electron/**',
      'next.config.ts',
      'openspec/**',
      'output/**',
      'packages/**',
      'playwright.config.ts',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      'postcss.config.mjs',
      'public/**',
      'release/**',
      'scripts/electron-*.mjs',
      'scripts/run-electron-node.mjs',
      'skills/**',
      'specs/**',
      'src/**',
      'tsconfig*.json',
      'tsconfig.tsbuildinfo',
      'vitest.config.ts',
    ],
  },
}

export default nextConfig
