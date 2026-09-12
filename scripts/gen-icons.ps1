# gen-icons.ps1 — 用「图一」AI 机器人图标重新生成项目全部图标
# 输出：public/icons/* 、src/app/icon.png 、electron/build/* （含 .ico/.icns）、dist-electron/icon.png

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = 'C:\Users\he\Documents\bitdance-agenthub'
$srcPath = Join-Path $root 'icon_new.png'
$tmpDir = Join-Path $root '.tmp-icons'
if (-not (Test-Path $tmpDir)) { New-Item -ItemType Directory -Path $tmpDir | Out-Null }

# ── 载入源图（走流避免文件锁）──
$srcBytes = [IO.File]::ReadAllBytes($srcPath)
$srcMs = New-Object System.IO.MemoryStream(,$srcBytes)
$srcImg = [System.Drawing.Image]::FromStream($srcMs)

# ── 高质量缩放到正方形 PNG ──
function Write-ResizedPng {
  param([int]$Size, [string]$OutPath)
  $bmp = [System.Drawing.Bitmap]::new($Size, $Size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.DrawImage($srcImg, 0, 0, $Size, $Size)
  $g.Dispose()
  $bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "  ok ${Size}px -> $OutPath"
}

$sizes = @(16, 32, 48, 64, 128, 180, 192, 256, 512, 1024)
foreach ($s in $sizes) {
  Write-ResizedPng -Size $s -OutPath (Join-Path $tmpDir "$s.png")
}

# ── Web 图标（public/icons + src/app）──
$pubIcons = Join-Path $root 'public\icons'
Write-ResizedPng -Size 16  -OutPath (Join-Path $pubIcons 'agenthub-mark-16.png')
Write-ResizedPng -Size 32  -OutPath (Join-Path $pubIcons 'agenthub-mark-32.png')
Write-ResizedPng -Size 192 -OutPath (Join-Path $pubIcons 'agenthub-mark-192.png')
Write-ResizedPng -Size 512 -OutPath (Join-Path $pubIcons 'agenthub-mark-512.png')
# layout.tsx shortcut / apple 引用
Write-ResizedPng -Size 256 -OutPath (Join-Path $pubIcons 'agenthub-256.png')
Write-ResizedPng -Size 180 -OutPath (Join-Path $pubIcons 'apple-touch-icon.png')
# 旧文件一并统一到新图标（防别处引用）
Write-ResizedPng -Size 48  -OutPath (Join-Path $pubIcons 'agenthub-mark-48.png')
Write-ResizedPng -Size 64  -OutPath (Join-Path $pubIcons 'agenthub-mark-64.png')
Write-ResizedPng -Size 128 -OutPath (Join-Path $pubIcons 'agenthub-mark-128.png')
Write-ResizedPng -Size 180 -OutPath (Join-Path $pubIcons 'agenthub-mark-180.png')
Write-ResizedPng -Size 256 -OutPath (Join-Path $pubIcons 'agenthub-mark-256.png')
Write-ResizedPng -Size 180 -OutPath (Join-Path $pubIcons 'agenthub-180.png')
Write-ResizedPng -Size 192 -OutPath (Join-Path $pubIcons 'agenthub-192.png')
Write-ResizedPng -Size 512 -OutPath (Join-Path $pubIcons 'agenthub-512.png')
Write-ResizedPng -Size 16  -OutPath (Join-Path $pubIcons 'favicon-16.png')
Write-ResizedPng -Size 32  -OutPath (Join-Path $pubIcons 'favicon-32.png')
Write-ResizedPng -Size 512 -OutPath (Join-Path $pubIcons 'icon.png')
# Next.js App Router 默认 icon
Write-ResizedPng -Size 32  -OutPath (Join-Path $root 'src\app\icon.png')

# ── Electron 构建图标 ──
$elBuild = Join-Path $root 'electron\build'
foreach ($s in @(16, 32, 48, 64, 128, 256, 512)) {
  Write-ResizedPng -Size $s -OutPath (Join-Path $elBuild "icon-$s.png")
}
Write-ResizedPng -Size 512 -OutPath (Join-Path $elBuild 'icon.png')

# ── 生成 agenthub-mark.svg（内嵌 512px PNG 的 base64）──
$png512 = [IO.File]::ReadAllBytes((Join-Path $tmpDir '512.png'))
$b64 = [Convert]::ToBase64String($png512)
$svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="AgentHub">' +
  '<title>AgentHub</title>' +
  "<image href=""data:image/png;base64,$b64"" width=""512"" height=""512""/>" +
  '</svg>'
[IO.File]::WriteAllText((Join-Path $pubIcons 'agenthub-mark.svg'), $svg, (New-Object System.Text.UTF8Encoding($false)))
# 旧 agenthub.svg 也统一
[IO.File]::WriteAllText((Join-Path $pubIcons 'agenthub.svg'), $svg, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "  ok agenthub-mark.svg / agenthub.svg (embedded 512px PNG)"

# ── 构建 icon.ico（PNG 压缩帧：16/32/48/64/128/256）──
function New-IcoFile {
  param([string]$IcoPath, [int[]]$Sizes, [string]$Dir)
  $pngs = @()
  foreach ($s in $Sizes) { $pngs += ,(Join-Path $Dir "$s.png") }
  $count = $pngs.Count
  $ms = New-Object System.IO.MemoryStream
  $bw = New-Object System.IO.BinaryWriter($ms)
  $bw.Write([uint16]0)        # reserved
  $bw.Write([uint16]1)        # type = icon
  $bw.Write([uint16]$count)   # image count
  $blobs = @()
  foreach ($p in $pngs) { $blobs += ,([IO.File]::ReadAllBytes($p)) }
  $offset = 6 + 16 * $count
  for ($i = 0; $i -lt $count; $i++) {
    $sz = $Sizes[$i]
    $w = if ($sz -ge 256) { 0 } else { $sz }
    $bw.Write([byte]$w)      # width
    $bw.Write([byte]$w)      # height
    $bw.Write([byte]0)       # palette
    $bw.Write([byte]0)       # reserved
    $bw.Write([uint16]1)     # planes
    $bw.Write([uint16]32)    # bpp
    $bw.Write([uint32]$blobs[$i].Length)
    $bw.Write([uint32]$offset)
    $offset += $blobs[$i].Length
  }
  foreach ($b in $blobs) { $bw.Write($b) }
  $bw.Flush()
  [IO.File]::WriteAllBytes($IcoPath, $ms.ToArray())
  $bw.Dispose(); $ms.Dispose()
  Write-Host "  ok $IcoPath"
}
New-IcoFile -IcoPath (Join-Path $elBuild 'icon.ico') -Sizes @(16, 32, 48, 64, 128, 256) -Dir $tmpDir

# ── 构建 icon.icns（PNG 编码类型，ICNS 为大端格式，需手动写 BE）──
function Write-BE32 {
  param([System.IO.Stream]$Stream, [uint32]$Value)
  $le = [System.BitConverter]::GetBytes($Value)
  [Array]::Reverse($le)
  $Stream.Write($le, 0, 4)
}
function New-IcnsFile {
  param([string]$IcnsPath, [string]$Dir)
  $entries = @(
    @('icp4', 16),
    @('icp5', 32),
    @('icp6', 64),
    @('ic07', 128),
    @('ic08', 256),
    @('ic09', 512),
    @('ic10', 1024)
  )
  $blobs = @()
  $total = 8
  foreach ($e in $entries) {
    $data = [IO.File]::ReadAllBytes((Join-Path $Dir "$($e[1]).png"))
    $blobs += ,@($e[0], $data)
    $total += 8 + $data.Length
  }
  $ms = New-Object System.IO.MemoryStream
  $ms.Write([byte[]][char[]]@('i','c','n','s'), 0, 4)
  Write-BE32 -Stream $ms -Value ([uint32]$total)
  foreach ($b in $blobs) {
    $typeBytes = [System.Text.Encoding]::ASCII.GetBytes($b[0])
    $ms.Write($typeBytes, 0, 4)
    Write-BE32 -Stream $ms -Value ([uint32](8 + $b[1].Length))
    $ms.Write($b[1], 0, $b[1].Length)
  }
  [IO.File]::WriteAllBytes($IcnsPath, $ms.ToArray())
  $ms.Dispose()
  Write-Host "  ok $IcnsPath"
}
New-IcnsFile -IcnsPath (Join-Path $elBuild 'icon.icns') -Dir $tmpDir

# ── 运行时窗口图标：dist-electron/icon.png（main.ts __dirname/icon.png）──
Copy-Item (Join-Path $elBuild 'icon.png') (Join-Path $root 'dist-electron\icon.png') -Force
Write-Host "  ok dist-electron/icon.png"

# ── 清理 ──
$srcImg.Dispose(); $srcMs.Dispose()
Remove-Item $tmpDir -Recurse -Force
Write-Host 'ALL DONE'
