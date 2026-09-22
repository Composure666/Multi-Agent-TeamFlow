Add-Type -AssemblyName System.Drawing
# 路径基于脚本自身位置解析(scripts/ 的上一级 = 仓库根),不硬编码绝对路径,
# 这样仓库改名 / 换机器 / 换盘符都不需要改这个脚本。
$RepoRoot = Split-Path -Parent $PSScriptRoot
$sheet = [System.Drawing.Bitmap]::new(1200, 320)
$g = [System.Drawing.Graphics]::FromImage($sheet)
$g.Clear([System.Drawing.Color]::FromArgb(240, 240, 245))
$files = @(
  (Join-Path $RepoRoot 'public\icons\agenthub-mark-16.png'),
  (Join-Path $RepoRoot 'public\icons\agenthub-mark-32.png'),
  (Join-Path $RepoRoot 'public\icons\agenthub-mark-192.png'),
  (Join-Path $RepoRoot 'public\icons\agenthub-mark-512.png'),
  (Join-Path $RepoRoot 'electron\build\icon-256.png'),
  (Join-Path $RepoRoot 'electron\build\icon.png'),
  (Join-Path $RepoRoot 'public\icons\apple-touch-icon.png')
)
$x = 20
foreach ($f in $files) {
  $img = [System.Drawing.Image]::FromFile($f)
  $g.DrawImage($img, $x, 20, 150, 150)
  $img.Dispose()
  $x += 170
}
$g.Dispose()
$sheet.Save((Join-Path $RepoRoot 'icon-contact-sheet.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$sheet.Dispose()
Write-Host 'saved'
