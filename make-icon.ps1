# Generate SYNCERA app icon — multi-size .ico with green gradient + activity heartbeat
Add-Type -AssemblyName System.Drawing

function Draw-SYNCERAIcon {
    param([int]$size)
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g   = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode     = 'AntiAlias'
    $g.InterpolationMode = 'HighQualityBicubic'
    $g.PixelOffsetMode   = 'HighQuality'
    $g.CompositingQuality= 'HighQuality'

    # Background — green gradient rounded square
    $rect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
    $brushBg = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(0, 0, 0, 0))
    $g.FillRectangle($brushBg, $rect)
    $brushBg.Dispose()

    # Rounded square path
    $radius = [int]($size * 0.22)
    $diameter = $radius * 2
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc(0, 0, $diameter, $diameter, 180, 90)
    $path.AddArc($size - $diameter, 0, $diameter, $diameter, 270, 90)
    $path.AddArc($size - $diameter, $size - $diameter, $diameter, $diameter, 0, 90)
    $path.AddArc(0, $size - $diameter, $diameter, $diameter, 90, 90)
    $path.CloseFigure()

    # Drop shadow (for larger sizes only)
    if ($size -ge 64) {
        $shadowOffset = [int]($size * 0.04)
        $shadowPath = New-Object System.Drawing.Drawing2D.GraphicsPath
        $shadowPath.AddArc(0, $shadowOffset, $diameter, $diameter, 180, 90)
        $shadowPath.AddArc($size - $diameter, $shadowOffset, $diameter, $diameter, 270, 90)
        $shadowPath.AddArc($size - $diameter, $size - $diameter + $shadowOffset - 2, $diameter, $diameter, 0, 90)
        $shadowPath.AddArc(0, $size - $diameter + $shadowOffset - 2, $diameter, $diameter, 90, 90)
        $shadowPath.CloseFigure()
        $shadowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(80, 37, 211, 102))
        $g.FillPath($shadowBrush, $shadowPath)
        $shadowBrush.Dispose()
        $shadowPath.Dispose()
    }

    # Green gradient fill (135deg: top-left light → bottom-right dark)
    $rectF = New-Object System.Drawing.RectangleF(0, 0, $size, $size)
    $gradient = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $rectF,
        [System.Drawing.Color]::FromArgb(255, 51, 232, 121),   # bright top-left
        [System.Drawing.Color]::FromArgb(255, 7, 94, 84),      # deep bottom-right
        135.0
    )
    $g.FillPath($gradient, $path)
    $gradient.Dispose()

    # Inner highlight (subtle top sheen)
    if ($size -ge 32) {
        $sheenRect = New-Object System.Drawing.RectangleF(0, 0, $size, $size * 0.5)
        $sheenBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
            $sheenRect,
            [System.Drawing.Color]::FromArgb(60, 255, 255, 255),
            [System.Drawing.Color]::FromArgb(0, 255, 255, 255),
            90.0
        )
        $sheenPath = New-Object System.Drawing.Drawing2D.GraphicsPath
        $halfRadius = [int]($size * 0.22)
        $sheenPath.AddArc(0, 0, $halfRadius * 2, $halfRadius * 2, 180, 90)
        $sheenPath.AddArc($size - $halfRadius * 2, 0, $halfRadius * 2, $halfRadius * 2, 270, 90)
        $sheenPath.AddLine($size, $size * 0.5, 0, $size * 0.5)
        $sheenPath.CloseFigure()
        $g.FillPath($sheenBrush, $sheenPath)
        $sheenBrush.Dispose()
        $sheenPath.Dispose()
    }

    # White heartbeat line (Activity icon path)
    # Path: M22 12 H18 L15 21 L9 3 L6 12 H2 (scaled to current size)
    # Original SVG viewBox 0..24
    $strokeWidth = [Math]::Max(2, [int]($size * 0.075))
    $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, $strokeWidth)
    $pen.StartCap   = 'Round'
    $pen.EndCap     = 'Round'
    $pen.LineJoin   = 'Round'

    # Convert SVG coords (0..24) to pixel coords with padding
    $pad = $size * 0.22
    $inner = $size - 2 * $pad
    $sx = { param($x) $pad + ($x / 24.0) * $inner }
    $sy = { param($y) $pad + ($y / 24.0) * $inner }

    $points = @(
        @{x=22; y=12}, @{x=18; y=12}, @{x=15; y=21}, @{x=9; y=3}, @{x=6; y=12}, @{x=2; y=12}
    )
    $pts = @()
    foreach ($p in $points) {
        $pts += New-Object System.Drawing.PointF([float](& $sx $p.x), [float](& $sy $p.y))
    }
    $g.DrawLines($pen, $pts)
    $pen.Dispose()

    $g.Dispose()
    return $bmp
}

function Save-Ico {
    param([string]$IcoPath, [System.Drawing.Bitmap[]]$Bitmaps)

    # Encode each bitmap as PNG bytes
    $entries = @()
    foreach ($bmp in $Bitmaps) {
        $ms = New-Object System.IO.MemoryStream
        $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
        $entries += @{ Bitmap = $bmp; PngBytes = $ms.ToArray() }
        $ms.Dispose()
    }

    $count = $entries.Count
    $headerSize = 6 + 16 * $count

    # Build the entire ICO as one byte[] using array assignment (bypass BinaryWriter quirks)
    $totalSize = $headerSize
    foreach ($e in $entries) { $totalSize += $e.PngBytes.Length }
    $out = New-Object byte[] $totalSize

    # ICONDIR header (6 bytes)
    $out[0] = 0; $out[1] = 0       # reserved
    $out[2] = 1; $out[3] = 0       # type=1 (ICO)
    $out[4] = [byte]($count -band 0xFF); $out[5] = [byte](($count -shr 8) -band 0xFF)

    # Directory entries (16 bytes each) + image data
    $offset = $headerSize
    for ($i = 0; $i -lt $count; $i++) {
        $e = $entries[$i]
        $entryBase = 6 + $i * 16
        $w = $e.Bitmap.Width;  if ($w -ge 256) { $w = 0 }
        $h = $e.Bitmap.Height; if ($h -ge 256) { $h = 0 }
        $size = $e.PngBytes.Length

        $out[$entryBase + 0]  = [byte]$w           # width (0 = 256)
        $out[$entryBase + 1]  = [byte]$h           # height
        $out[$entryBase + 2]  = 0                  # color count
        $out[$entryBase + 3]  = 0                  # reserved
        $out[$entryBase + 4]  = 1; $out[$entryBase + 5] = 0  # planes (UInt16 LE = 1)
        $out[$entryBase + 6]  = 32; $out[$entryBase + 7] = 0 # bpp (UInt16 LE = 32)
        # size (UInt32 LE)
        $out[$entryBase + 8]  = [byte]( $size        -band 0xFF)
        $out[$entryBase + 9]  = [byte](($size -shr 8) -band 0xFF)
        $out[$entryBase + 10] = [byte](($size -shr 16) -band 0xFF)
        $out[$entryBase + 11] = [byte](($size -shr 24) -band 0xFF)
        # offset (UInt32 LE)
        $out[$entryBase + 12] = [byte]( $offset        -band 0xFF)
        $out[$entryBase + 13] = [byte](($offset -shr 8) -band 0xFF)
        $out[$entryBase + 14] = [byte](($offset -shr 16) -band 0xFF)
        $out[$entryBase + 15] = [byte](($offset -shr 24) -band 0xFF)

        # Copy PNG data to its position
        [Array]::Copy($e.PngBytes, 0, $out, $offset, $size)
        $offset += $size
    }

    [System.IO.File]::WriteAllBytes($IcoPath, $out)
}

# Generate icon at multiple sizes for crisp rendering at any zoom level
$sizes = @(16, 24, 32, 48, 64, 128, 256)
$bitmaps = @()
foreach ($s in $sizes) {
    $bitmaps += Draw-SYNCERAIcon -size $s
}

# Output paths
$publicDir = ".\public"
if (-not (Test-Path $publicDir)) { New-Item -ItemType Directory -Path $publicDir | Out-Null }
$icoPath = Join-Path $publicDir 'icon.ico'

Save-Ico -IcoPath $icoPath -Bitmaps $bitmaps

# Cleanup
foreach ($b in $bitmaps) { $b.Dispose() }

Write-Host "OKCreated: $icoPath ($((Get-Item $icoPath).Length) bytes, $($sizes.Count) sizes embedded)"

# Also save 256x256 PNG for reference
$big = Draw-SYNCERAIcon -size 512
$big.Save((Join-Path $publicDir 'icon.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$big.Dispose()
Write-Host "OKCreated: $(Join-Path $publicDir 'icon.png')"
