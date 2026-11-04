# Genera los iconos de la PWA a partir del PNG de diseno (public/icons/app-icon.png).
# El PNG original trae las esquinas blancas; aqui se vuelven transparentes para
# que el icono se vea bien en cualquier fondo y para el maskable.
# Uso: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/generar-iconos.ps1
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$raiz = Split-Path -Parent $PSScriptRoot
if (-not $raiz) { $raiz = Split-Path -Parent $MyInvocation.MyCommand.Path }
$origen = Join-Path $raiz "public\icons\app-icon.png"

$original = [System.Drawing.Bitmap]::FromFile($origen)
Write-Host ("origen: {0}x{1}" -f $original.Width, $original.Height)

$ancho = $original.Width
$alto = $original.Height

# Radio de las esquinas: primer pixel no blanco de la fila superior.
$radio = 0
for ($x = 0; $x -lt $ancho; $x++) {
  $c = $original.GetPixel($x, 0)
  if (($c.R -lt 230) -or ($c.G -lt 230) -or ($c.B -lt 230)) { $radio = $x; break }
}
if ($radio -le 0) { $radio = [int][Math]::Round($ancho * 0.22) }
Write-Host ("radio de esquina: {0}px" -f $radio)

# Copia del original con las esquinas blancas hechas transparencia.
$limpio = New-Object System.Drawing.Bitmap($original)
$cajas = @(
  @(0, 0),
  @(($ancho - $radio), 0),
  @(0, ($alto - $radio)),
  @(($ancho - $radio), ($alto - $radio))
)
foreach ($caja in $cajas) {
  $x0 = [int]$caja[0]
  $y0 = [int]$caja[1]
  for ($y = $y0; $y -lt ($y0 + $radio); $y++) {
    for ($x = $x0; $x -lt ($x0 + $radio); $x++) {
      $c = $limpio.GetPixel($x, $y)
      $luz = (0.2126 * $c.R) + (0.7152 * $c.G) + (0.0722 * $c.B)
      if ($luz -gt 140) {
        $limpio.SetPixel($x, $y, [System.Drawing.Color]::Transparent)
      }
    }
  }
}

$muestraX = [int][Math]::Max(2, $ancho * 0.05)
$muestraY = [int]($alto * 0.5)
$fondo = $limpio.GetPixel($muestraX, $muestraY)
Write-Host ("fondo: #{0:X2}{1:X2}{2:X2}" -f $fondo.R, $fondo.G, $fondo.B)

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
  $radioDestino = [single]($radio * $Escala)
  $recorte = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = [single]($radioDestino * 2)
  $recorte.AddArc([single]$x, [single]$x, $d, $d, 180, 90)
  $recorte.AddArc([single]($x + $lado - $d), [single]$x, $d, $d, 270, 90)
  $recorte.AddArc([single]($x + $lado - $d), [single]($x + $lado - $d), $d, $d, 0, 90)
  $recorte.AddArc([single]$x, [single]($x + $lado - $d), $d, $d, 90, 90)
  $recorte.CloseFigure()
  $g.SetClip($recorte)
  $g.DrawImage($limpio, $x, $x, $lado, $lado)
  $g.ResetClip()
  $recorte.Dispose()
  $g.Dispose()
  $lienzo.Save($Ruta, [System.Drawing.Imaging.ImageFormat]::Png)
  $lienzo.Dispose()
  Write-Host ("OK  {0}" -f $Ruta)
}

Guardar-Icono -Tam 192 -Escala 1.0 -ConFondo $false -Ruta (Join-Path $raiz "public\icons\icon-192-v3.png")
Guardar-Icono -Tam 512 -Escala 1.0 -ConFondo $false -Ruta (Join-Path $raiz "public\icons\icon-512-v3.png")
Guardar-Icono -Tam 512 -Escala 1.02 -ConFondo $true -Ruta (Join-Path $raiz "public\icons\icon-maskable-512-v3.png")
Guardar-Icono -Tam 180 -Escala 1.02 -ConFondo $true -Ruta (Join-Path $raiz "public\apple-touch-icon-v3.png")
Guardar-Icono -Tam 256 -Escala 1.0 -ConFondo $false -Ruta (Join-Path $raiz "app\icon.png")

$limpio.Dispose()
$original.Dispose()
