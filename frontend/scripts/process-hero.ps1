Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\SUBHADEEP\.gemini\antigravity-ide\brain\a801aedf-d21f-423d-88f9-c45c71dc4af1\hero_editorial_banner_1786192634021.png"
$dstPath = "d:\IMAGINEAIRY-SINGLE-VENDOR-ECOMMERCE\public\images\hero-desktop.png"

$src = [System.Drawing.Bitmap]::FromFile($srcPath)
$targetWidth = 1920
$targetHeight = 840

$canvas = New-Object System.Drawing.Bitmap $targetWidth, $targetHeight
$g = [System.Drawing.Graphics]::FromImage($canvas)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

# Extract background texture from left of source (x: 0 to 450) and scale across entire width (0 to 1920)
$bgSlice = $src.Clone((New-Object System.Drawing.Rectangle 0, 0, 450, 1024), $src.PixelFormat)
$g.DrawImage($bgSlice, (New-Object System.Drawing.Rectangle 0, 0, $targetWidth, $targetHeight))

# Prepare the model image scaled to 900x900
$modelBmp = New-Object System.Drawing.Bitmap 900, 900
$mg = [System.Drawing.Graphics]::FromImage($modelBmp)
$mg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$mg.DrawImage($src, (New-Object System.Drawing.Rectangle 0, 0, 900, 900), 0, 0, 1024, 1024, [System.Drawing.GraphicsUnit]::Pixel)
$mg.Dispose()

# Feather the left 250px of $modelBmp so its alpha goes from 0 to 255 smoothly
$featherWidth = 250
for ($x = 0; $x -lt $featherWidth; $x++) {
    $alphaFactor = [Math]::Pow(($x / $featherWidth), 1.5) # smooth non-linear curve
    for ($y = 0; $y -lt 900; $y++) {
        $p = $modelBmp.GetPixel($x, $y)
        $newAlpha = [int]($p.A * $alphaFactor)
        $modelBmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($newAlpha, $p.R, $p.G, $p.B))
    }
}

# Draw feathered model onto canvas at x=1020, y=-30
$modelX = $targetWidth - 900
$g.DrawImage($modelBmp, $modelX, -30)

$canvas.Save($dstPath, [System.Drawing.Imaging.ImageFormat]::Png)

$modelBmp.Dispose()
$bgSlice.Dispose()
$g.Dispose()
$canvas.Dispose()
$src.Dispose()

Write-Output "Flawless feathered 16:7 Hero Banner generated!"
