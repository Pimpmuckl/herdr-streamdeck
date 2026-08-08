param([switch]$OpenProfile)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$herdr = if ($env:HERDR_PATH) {
    $candidate = Get-Item -LiteralPath $env:HERDR_PATH -ErrorAction Stop
    if ($candidate.PSIsContainer) {
        throw "HERDR_PATH must point to the Herdr executable."
    }
    $candidate.FullName
} else {
    (Get-Command herdr -CommandType Application -ErrorAction Stop).Source
}
Push-Location $root
try {
    npm ci
    npm run build
    & $herdr plugin link $root --enabled
    [IO.File]::WriteAllText(
        (Join-Path $root "dev.herdr.streamdeck.sdPlugin\herdr-path.txt"),
        $herdr,
        [Text.UTF8Encoding]::new($false)
    )
    npx streamdeck link dev.herdr.streamdeck.sdPlugin
    $version = (Get-Content "package.json" -Raw | ConvertFrom-Json).version
    & "$PSScriptRoot\package-profile.ps1" -Version $version
    $profile = Join-Path $root "dist\Herdr-Stream-Deck-Plus-$version.streamDeckProfile"
    if ($OpenProfile) {
        Start-Process $profile
    } else {
        Write-Host "Import $profile in Stream Deck."
    }
} finally {
    Pop-Location
}
