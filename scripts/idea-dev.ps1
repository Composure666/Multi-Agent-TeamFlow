$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$runtimeRoot = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies'
$nodeBin = Join-Path $runtimeRoot 'node\bin'
$toolBin = Join-Path $runtimeRoot 'bin'
$pnpm = Join-Path $toolBin 'pnpm.cmd'

if (-not (Test-Path -LiteralPath $pnpm)) {
  throw "pnpm was not found at $pnpm"
}

$env:PATH = "$nodeBin;$toolBin;$env:PATH"
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'

& $pnpm dev
