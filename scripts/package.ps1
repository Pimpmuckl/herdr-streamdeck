param(
    [string]$OutputDirectory = "dist",
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
    $package = Get-Content "package.json" -Raw | ConvertFrom-Json
    npm run build
    npx streamdeck validate dev.herdr.streamdeck.sdPlugin --no-update-check
    & "$PSScriptRoot\package-profile.ps1" -OutputDirectory $OutputDirectory -Version $package.version -DryRun:$DryRun
    $staging = Join-Path ([IO.Path]::GetTempPath()) "herdr-streamdeck-pack-$([guid]::NewGuid())"
    $packSource = Join-Path $staging "dev.herdr.streamdeck.sdPlugin"
    New-Item -ItemType Directory $staging | Out-Null
    Copy-Item "dev.herdr.streamdeck.sdPlugin" $packSource -Recurse
    Copy-Item "LICENSE", "THIRD_PARTY_NOTICES.md" $packSource
    Copy-Item "licenses" (Join-Path $packSource "licenses") -Recurse

    try {
        if ($DryRun) {
            npx streamdeck pack $packSource --dry-run --no-update-check
            return
        }

        $output = Join-Path $root $OutputDirectory
        New-Item -ItemType Directory -Force $output | Out-Null
        npx streamdeck pack $packSource --force --output $output --no-update-check
        $created = Join-Path $output "dev.herdr.streamdeck.streamDeckPlugin"
        $versioned = Join-Path $output "herdr-streamdeck-$($package.version).streamDeckPlugin"
        Move-Item -Force $created $versioned
        Write-Host "Created $versioned"
    } finally {
        Remove-Item -LiteralPath $staging -Recurse -Force
    }
} finally {
    Pop-Location
}
