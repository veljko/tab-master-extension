$manifestPath = Join-Path $PSScriptRoot "manifest.json"
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$version = $manifest.version

$distDir = Join-Path $PSScriptRoot "dist"
$zipName = "tab-master-extension-v$version.zip"
$zipPath = Join-Path $distDir $zipName

New-Item -ItemType Directory -Force -Path $distDir | Out-Null

if (Test-Path $zipPath) { Remove-Item $zipPath }

$files = @(
    "manifest.json",
    "background.js",
    "content.js",
    "options.html",
    "options.js",
    "icons\icon16.png",
    "icons\icon48.png",
    "icons\icon128.png"
)

# Build zip manually so folder structure (icons/) is preserved
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($zipPath, 'Create')
foreach ($rel in $files) {
    $full = Join-Path $PSScriptRoot $rel
    $entryName = $rel -replace '\\', '/'
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $full, $entryName) | Out-Null
}
$zip.Dispose()

Write-Host "Created: $zipPath"
