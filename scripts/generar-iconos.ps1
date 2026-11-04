# Genera los iconos de la PWA a partir del PNG de diseno (public/icons/app-icon.png).
# Uso: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/generar-iconos.ps1
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$raiz = Split-Path -Parent $PSScriptRoot
if (-not $raiz) { $raiz = Split-Path -Parent $MyInvocation.MyCommand.Path }
$origen = Join-Path $raiz "public\icons\app-icon.png"

$original = [System.Drawing.Bitmap]::FromFile($origen)
Write-Host ("origen: {0}x{1}" -f $original.Width, $original.Height)

$muestraX = [int][Math]::Max(2, $original.Width * 0.05)
$muestraY = [int]($original.Height * 0.5)
$fondo = $original.GetPixel($muestraX, $muestraY)
Write-Host ("fondo: #{0:X2}{1:X2}{2:X2} alfa={3}" -f $fondo.R, $fondo.G, $fondo.B, $fondo.A)

function Guardar-Icono {
  param([int]$Tam, [double]$Escala, [bool]$ConFondo, [string]$Ruta)
  $lienzo = New-Object System.Drawing.Bitmap($Tam, $Tam, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($lienzo)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)
  if ($ConFondo) {
    $pincel = New-Object System.Drawing.SolidBrush($fondo)
    $g.FillRectangle($pincel, 0, 0, $Tam, $Tam)
    $pincel.Dispose()
  }
  $lado = [int][Math]::Round($Tam * $Escala)
  $x = [int](($Tam - $lado) / 2)
  $g.DrawImage($original, $x, $x, $lado, $lado)
  $g.Dispose()
  $lienzo.Save($Ruta, [System.Drawing.Imaging.ImageFormat]::Png)
  $lienzo.Dispose()
  Write-Host ("OK  {0}" -f $Ruta)
}

Guardar-Icono -Tam 192 -Escala 1.0 -ConFondo $false -Ruta (Join-Path $raiz "public\icons\icon-192-v3.png")
Guardar-Icono -Tam 512 -Escala 1.0 -ConFondo $false -Ruta (Join-Path $raiz "public\icons\icon-512-v3.png")
Guardar-Icono -Tam 512 -Escala 0.8 -ConFondo $true -Ruta (Join-Path $raiz "public\icons\icon-maskable-512-v3.png")
Guardar-Icono -Tam 180 -Escala 0.92 -ConFondo $true -Ruta (Join-Path $raiz "public\apple-touch-icon-v3.png")
Guardar-Icono -Tam 256 -Escala 1.0 -ConFondo $false -Ruta (Join-Path $raiz "app\icon.png")

$original.Dispose()
