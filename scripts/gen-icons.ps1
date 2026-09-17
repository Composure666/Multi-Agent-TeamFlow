# gen-icons.ps1 — 图标生成入口（已改为调用 scripts/gen-icons.py）
#
# 为什么 PowerShell 不再自己出图：
#   旧实现用 System.Drawing 的 $bmp.Save($path, Png) —— GDI+ 的 PNG 编码器不做 filter /
#   调色板优化，512px 出来 **433KB**；脚本再把这张 PNG base64 塞进一个「SVG」（其实不含任何
#   矢量图形，只有 <image href="data:image/png;base64,...">）得到 **578KB 的假 SVG**。
#   而 src/app/layout.tsx 把它列为**首选 favicon** ⇒ 每次页面加载白下 434KB。
#   线上实测：GET /icons/agenthub-mark.svg -> 200, 433895 bytes。
#
#   改用 Pillow（scripts/gen-icons.py）后：缩放用 LANCZOS，编码在「RGBA 优化 PNG」与
#   「256 色调色板 PNG」之间逐尺寸取更小者。512px 从 433KB 降到 30KB（-93%），
#   逐像素平均误差 2.7/255、p99 仅 7/255（肉眼不可辨）。图标全家族总量 -90.2%。
#   同时不再生成任何「内嵌 base64 PNG 的假 SVG」。
#
# 历史脚本已合并/删除：scripts/generate-icons.py、scripts/rebuild-favicon-formats.py
#   （两者都是同一件事的早期实现，其中前者的源图是已过期的剪贴板 JPEG）。

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$generator = Join-Path $repoRoot 'scripts\gen-icons.py'

if (-not (Test-Path -LiteralPath $generator)) {
  throw "generator not found: $generator"
}

$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
  throw 'python not found on PATH (Pillow is required: pip install Pillow)'
}

& $python.Source $generator
if ($LASTEXITCODE -ne 0) {
  throw "gen-icons.py failed with exit code $LASTEXITCODE"
}

Write-Host 'icons regenerated via scripts/gen-icons.py'
