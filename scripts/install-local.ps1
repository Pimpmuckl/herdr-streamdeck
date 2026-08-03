param([switch]$OpenProfile)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
    npm ci
    npm run build
    herdr plugin link --enabled $root
    npx streamdeck link dev.herdr.streamdeck.sdPlugin
    & "$PSScriptRoot\package-profile.ps1"
    $version = (Get-Content "package.json" -Raw | ConvertFrom-Json).version
    $profile = Join-Path $root "dist\Herdr-Stream-Deck-Plus-$version.streamDeckProfile"
    if ($OpenProfile) {
        Start-Process $profile
    } else {
        Write-Host "Import $profile in Stream Deck."
    }
} finally {
    Pop-Location
}
