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
    "options.html",
    "options.js",
    "icons\icon16.png",
    "icons\icon48.png",
    "icons\icon128.png"
)

Compress-Archive -Path ($files | ForEach-Object { Join-Path $PSScriptRoot $_ }) -DestinationPath $zipPath

Write-Host "Created: $zipPath"
