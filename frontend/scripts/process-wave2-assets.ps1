Add-Type -AssemblyName System.Drawing

$brain = "C:\Users\SUBHADEEP\.gemini\antigravity-ide\brain\a801aedf-d21f-423d-88f9-c45c71dc4af1"
$public = "d:\IMAGINEAIRY-SINGLE-VENDOR-ECOMMERCE\public\images"

function Crop-Image {
    param(
        [string]$SourcePath,
        [string]$DestPath,
        [int]$TargetWidth,
        [int]$TargetHeight,
        [int]$SrcX = 0,
        [int]$SrcY = 0,
        [int]$SrcWidth = -1,
        [int]$SrcHeight = -1
    )
    $src = [System.Drawing.Bitmap]::FromFile($SourcePath)
    if ($SrcWidth -eq -1) { $SrcWidth = $src.Width }
    if ($SrcHeight -eq -1) { $SrcHeight = $src.Height }

    $canvas = New-Object System.Drawing.Bitmap $TargetWidth, $TargetHeight
    $g = [System.Drawing.Graphics]::FromImage($canvas)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    $srcRect = New-Object System.Drawing.Rectangle $SrcX, $SrcY, $SrcWidth, $SrcHeight
    $destRect = New-Object System.Drawing.Rectangle 0, 0, $TargetWidth, $TargetHeight
    $g.DrawImage($src, $destRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)

    $canvas.Save($DestPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $canvas.Dispose()
    $src.Dispose()
}

# --- 1. Shop the Look (4:5 Aspect Ratio, 800x1000) ---
Write-Output "Processing Looks..."
# Look 1: Golden Hour (Pearl & crystal layered styling)
Crop-Image -SourcePath "$brain\hero_desktop_banner_1786192388445.png" `
           -DestPath "$public\looks\golden-hour.png" `
           -TargetWidth 800 -TargetHeight 1000 `
           -SrcX 200 -SrcY 40 -SrcWidth 800 -SrcHeight 980

# Look 2: Quiet Luxe (Minimalist chic worn profile)
Crop-Image -SourcePath "$brain\product_lumen_worn_1786193363433.png" `
           -DestPath "$public\looks\quiet-luxe.png" `
           -TargetWidth 800 -TargetHeight 1000 `
           -SrcX 100 -SrcY 0 -SrcWidth 820 -SrcHeight 1024

# Look 3: Festive Glow (Emerald green & gold choker look)
Crop-Image -SourcePath "$brain\hero_desktop_wide_1786192575355.png" `
           -DestPath "$public\looks\festive-glow.png" `
           -TargetWidth 800 -TargetHeight 1000 `
           -SrcX 350 -SrcY 250 -SrcWidth 670 -SrcHeight 770

# --- 2. Collection Stories (4:3 Landscape, 960x720) ---
Write-Output "Processing Collections..."
# Collection 1: The Pearl Edit
Crop-Image -SourcePath "$brain\product_lumen_drops_1786193340724.png" `
           -DestPath "$public\collections\pearl-edit.png" `
           -TargetWidth 960 -TargetHeight 720 `
           -SrcX 0 -SrcY 120 -SrcWidth 1024 -SrcHeight 768

# Collection 2: The Festive Edit
Crop-Image -SourcePath "$brain\hero_desktop_wide_1786192575355.png" `
           -DestPath "$public\collections\festive-edit.png" `
           -TargetWidth 960 -TargetHeight 720 `
           -SrcX 150 -SrcY 260 -SrcWidth 870 -SrcHeight 650

# Collection 3: Everyday Gold
Crop-Image -SourcePath "$brain\product_aurora_choker_1786193384686.png" `
           -DestPath "$public\collections\everyday-gold.png" `
           -TargetWidth 960 -TargetHeight 720 `
           -SrcX 0 -SrcY 100 -SrcWidth 1024 -SrcHeight 768

# Collection 4: Statement Jewellery
Crop-Image -SourcePath "$brain\product_vesper_cuff_1786193429706.png" `
           -DestPath "$public\collections\statement-jewellery.png" `
           -TargetWidth 960 -TargetHeight 720 `
           -SrcX 0 -SrcY 120 -SrcWidth 1024 -SrcHeight 768

# --- 3. Shop by Occasion (1:1 Square, 800x800) ---
Write-Output "Processing Occasions..."
# Occasion 1: Wedding (Regal choker & chandelier earrings)
Crop-Image -SourcePath "$brain\hero_desktop_wide_1786192575355.png" `
           -DestPath "$public\occasions\wedding.png" `
           -TargetWidth 800 -TargetHeight 800 `
           -SrcX 380 -SrcY 260 -SrcWidth 640 -SrcHeight 640

# Occasion 2: Festive (Multi-layer pearls & gold)
Crop-Image -SourcePath "$brain\hero_desktop_banner_1786192388445.png" `
           -DestPath "$public\occasions\festive.png" `
           -TargetWidth 800 -TargetHeight 800 `
           -SrcX 300 -SrcY 80 -SrcWidth 720 -SrcHeight 720

# Occasion 3: Party (Sparkling crystal cluster & drop earrings)
Crop-Image -SourcePath "$brain\category_earrings_1786193201202.png" `
           -DestPath "$public\occasions\party.png" `
           -TargetWidth 800 -TargetHeight 800 `
           -SrcX 150 -SrcY 100 -SrcWidth 800 -SrcHeight 800

# Occasion 4: Everyday (Stacking rings on linen)
Crop-Image -SourcePath "$brain\category_rings_1786193249054.png" `
           -DestPath "$public\occasions\everyday.png" `
           -TargetWidth 800 -TargetHeight 800 `
           -SrcX 100 -SrcY 100 -SrcWidth 800 -SrcHeight 800

Write-Output "All Wave 2 visual assets successfully generated and cropped!"
