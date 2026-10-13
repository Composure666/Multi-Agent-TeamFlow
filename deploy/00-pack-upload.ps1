<#
    00-pack-upload.ps1
    ==================
    Pack this repository (source only, no node_modules / .next / release) into a
    tarball and upload it to the deploy server.

    WHY A TARBALL INSTEAD OF `git clone` ON THE SERVER
    --------------------------------------------------
      1. The Gitee repo is PRIVATE. `git clone` on the server stalls asking for a
         username / password, so an unattended deploy cannot work.
      2. This deploy/ directory is NOT committed to the repo. A clone would not
         contain these scripts at all.

    So the supported flow is: pack locally -> scp -> extract on the server ->
    run 02-deploy.sh with SKIP_GIT=1.

    USAGE (from anywhere; paths are resolved from the script location)
    -----------------------------------------------------------------
      powershell -ExecutionPolicy Bypass -File deploy\00-pack-upload.ps1

      # custom target / user / branch
      powershell -ExecutionPolicy Bypass -File deploy\00-pack-upload.ps1 -Server 1.2.3.4 -User ubuntu
      powershell -ExecutionPolicy Bypass -File deploy\00-pack-upload.ps1 -Branch dev_he

      # only build the tarball, do not touch the network
      powershell -ExecutionPolicy Bypass -File deploy\00-pack-upload.ps1 -SkipUpload

      # build + upload + extract remotely into /opt/agenthub/src
      powershell -ExecutionPolicy Bypass -File deploy\00-pack-upload.ps1 -RemoteExtract

    SSH KEY
    -------
      If %USERPROFILE%\.ssh\deploy_key exists it is used automatically
      and no password prompt appears at all. This matters because the Windows
      OpenSSH password prompt switches the console into raw mode, where IME and
      some keyboard input never reach ssh -- users on Chinese IMEs frequently
      cannot type their password there at all.

      Create the key once and install the public half on the server:
        ssh-keygen -t ed25519 -f $env:USERPROFILE\.ssh\deploy_key -N ""
        # then paste the contents of deploy_key.pub into the server's
        # ~/.ssh/authorized_keys (see deploy/CLICK-DEPLOY.html)

      Override with -IdentityFile, or pass -IdentityFile '' to force a password.

      NOTE (verified 2026-09-16): on the Lighthouse box the public key lives in the
      **ubuntu** account only -- root has no authorized_keys, so `-User root` cannot
      log in. The default here is therefore `ubuntu`, and the tarball goes to /tmp/
      (ubuntu cannot write /root). Privileged steps then use ubuntu's passwordless
      sudo.
#>

param(
    [string]$Server    = '<SERVER_IP>',
    [string]$User      = 'ubuntu',
    [string]$Branch    = 'master',
    [string]$IdentityFile = (Join-Path $env:USERPROFILE '.ssh\deploy_key'),
    [switch]$SkipUpload,
    [switch]$RemoteExtract
)

$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$OutDir   = Join-Path (Split-Path -Parent $RepoRoot) 'agenthub-deploy'
$OutFile  = Join-Path $OutDir 'agenthub-src.tar.gz'
$TarExe   = Join-Path $env:SystemRoot 'System32\tar.exe'
$ScpExe   = Join-Path $env:SystemRoot 'System32\OpenSSH\scp.exe'
$SshExe   = Join-Path $env:SystemRoot 'System32\OpenSSH\ssh.exe'

# Directories / files that must never enter the package.
#   - huge build or runtime artifacts
#   - local secrets (.env.local lives in /etc/agenthub/agenthub.env on the server)
#   - assistant scratch folders
$Excludes = @(
    'node_modules', '.next', 'release', '.agenthub-data', 'dist-electron',
    'output', 'deliverables', 'apps/mobile',
    '.git', '.workbuddy', '.idea', '.codex', '.codebuddy',
    '.playwright-cli', '.tmp-probe', '.pnpm-store', '.turbo',
    'playwright-report', 'test-results', 'coverage',
    '.env.local', 'debug.log', 'agenthub-dev.log', 'tsconfig.tsbuildinfo',
    '.vitest-result.txt', 'icon_new.png'
)

foreach ($exe in @($TarExe)) {
    if (-not (Test-Path $exe)) { throw "required binary not found: $exe" }
}

Write-Host "repo root : $RepoRoot"
Write-Host "output    : $OutFile"

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
if (Test-Path $OutFile) { Remove-Item $OutFile -Force }

$tarArgs = @('-czf', $OutFile)
foreach ($e in $Excludes) { $tarArgs += @('--exclude', $e) }
$tarArgs += @('-C', $RepoRoot, '.')

& $TarExe @tarArgs
if ($LASTEXITCODE -ne 0) { throw "tar exited with $LASTEXITCODE" }

$mb = [math]::Round((Get-Item $OutFile).Length / 1MB, 1)
Write-Host "[ok] packed $mb MB"

# Sanity check: refuse to ship if a forbidden top-level entry slipped in.
$listing = & $TarExe -tzf $OutFile
$forbidden = @('node_modules/', '.next/', 'release/', '.agenthub-data/', '.git/', 'dist-electron/', '.env.local')
$hits = @()
foreach ($line in $listing) {
    # tar lists members as "./path"; strip exactly one leading "./"
    $rel = [string]$line
    if ($rel.StartsWith('./')) { $rel = $rel.Substring(2) }
    foreach ($f in $forbidden) {
        if ($rel.StartsWith($f)) { $hits += $rel; break }
    }
}
if ($hits.Count -gt 0) {
    Write-Warning "package contains forbidden entries:"
    $hits | Select-Object -First 10 | ForEach-Object { Write-Warning "  $_" }
    throw "refusing to upload a package with forbidden entries"
}
Write-Host "[ok] package verified ($($listing.Count) entries, no forbidden paths)"

if ($SkipUpload) {
    Write-Host '[skip] upload not requested (-SkipUpload)'
    exit 0
}

if (-not (Test-Path $ScpExe)) { throw "scp not found: $ScpExe (install the Windows OpenSSH client)" }

$target = "${User}@${Server}"

# Shared ssh flags: accept an unknown host key on first contact, and never fall
# back to a password when a key was supplied.
$sshOpts = @('-o', 'StrictHostKeyChecking=accept-new')
$useKey  = $IdentityFile -and (Test-Path $IdentityFile)
if ($useKey) {
    $sshOpts += @('-i', $IdentityFile, '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes')
    Write-Host "[ok] ssh key     : $IdentityFile"
    Write-Host "[..] uploading to ${target}:/tmp/  (no password needed)"
} else {
    Write-Host "[..] uploading to ${target}:/tmp/  (you will be asked for the password)"
    Write-Host '     ! the password prompt does not echo and does not accept IME input;'
    Write-Host '       if typing does nothing, paste the password instead (right click).'
}

& $ScpExe @sshOpts $OutFile "${target}:/tmp/"
if ($LASTEXITCODE -ne 0) { throw "scp exited with $LASTEXITCODE" }
Write-Host '[ok] upload finished'

if ($RemoteExtract) {
    # 注意 du 必须带 sudo：/opt/agenthub 是 drwxr-x--- agenthub，ubuntu 身份 du 会
    # "Permission denied" 并让整条 ssh 命令以 1 退出 —— 于是**解包其实成功了，脚本却报
    # "remote extract exited with 1"**（本次就踩了这个，白查一轮）。
    $remote = 'set -e; ' +
              'sudo -n mkdir -p /opt/agenthub/src; ' +
              'sudo -n tar -xzf /tmp/agenthub-src.tar.gz -C /opt/agenthub/src; ' +
              'echo "[ok] extracted to /opt/agenthub/src"; ' +
              'sudo -n du -sh /opt/agenthub/src'
    & $SshExe @sshOpts $target $remote
    if ($LASTEXITCODE -ne 0) { throw "remote extract exited with $LASTEXITCODE" }
}

Write-Host ''
Write-Host 'NEXT STEPS ON THE SERVER'
Write-Host "  1) first time only:  bash /opt/agenthub/src/deploy/01-server-init.sh"
Write-Host "  2) build:            sudo -iu agenthub; cd /opt/agenthub/src; SKIP_GIT=1 bash deploy/02-deploy.sh"
Write-Host "  3) start service:    exit; sudo bash /opt/agenthub/src/deploy/03-install-service.sh"
Write-Host "  see deploy/RUNBOOK.md for the full checklist (branch: $Branch)"
