Add-Type -AssemblyName System.Drawing
$sheet = [System.Drawing.Bitmap]::new(1200, 320)
$g = [System.Drawing.Graphics]::FromImage($sheet)
$g.Clear([System.Drawing.Color]::FromArgb(240, 240, 245))
$files = @(
  'C:\Users\he\Documents\bitdance-agenthub\public\icons\agenthub-mark-16.png',
  'C:\Users\he\Documents\bitdance-agenthub\public\icons\agenthub-mark-32.png',
  'C:\Users\he\Documents\bitdance-agenthub\public\icons\agenthub-mark-192.png',
  'C:\Users\he\Documents\bitdance-agenthub\public\icons\agenthub-mark-512.png',
  'C:\Users\he\Documents\bitdance-agenthub\electron\build\icon-256.png',
  'C:\Users\he\Documents\bitdance-agenthub\electron\build\icon.png',
  'C:\Users\he\Documents\bitdance-agenthub\public\icons\apple-touch-icon.png'
)
$x = 20
foreach ($f in $files) {
  $img = [System.Drawing.Image]::FromFile($f)
  $g.DrawImage($img, $x, 20, 150, 150)
  $img.Dispose()
  $x += 170
}
$g.Dispose()
$sheet.Save('C:\Users\he\Documents\bitdance-agenthub\icon-contact-sheet.png', [System.Drawing.Imaging.ImageFormat]::Png)
$sheet.Dispose()
Write-Host 'saved'
