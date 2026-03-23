$distDir = Join-Path $PSScriptRoot "dist"
$zipPath = Join-Path $distDir "tab-master-extension.zip"

New-Item -ItemType Directory -Force -Path $distDir | Out-Null

if (Test-Path $zipPath) { Remove-Item $zipPath }

$files = @(
    "manifest.json",
    "background.js",
    "options.html",
    "options.js",
    "icons\icon16.png",
    "icons\icon48.png",
    "icons\icon128.png"
)

Compress-Archive -Path ($files | ForEach-Object { Join-Path $PSScriptRoot $_ }) -DestinationPath $zipPath

Write-Host "Created: $zipPath"
