@echo off
setlocal

set "PROJECT_ROOT=%~dp0.."
cd /d "%PROJECT_ROOT%"

set "RUNTIME_ROOT=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies"
set "NODE_BIN=%RUNTIME_ROOT%\node\bin"
set "TOOL_BIN=%RUNTIME_ROOT%\bin"
set "PNPM=%TOOL_BIN%\pnpm.cmd"

if not exist "%PNPM%" (
  echo pnpm was not found at %PNPM%
  exit /b 1
)

set "PATH=%NODE_BIN%;%TOOL_BIN%;%PATH%"
set "ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/"

call "%PNPM%" dev
