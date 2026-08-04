$ErrorActionPreference = "Stop"

$root = Split-Path $PSScriptRoot -Parent
$source = Join-Path $root "dev.herdr.streamdeck.sdPlugin"
$herdr = (Get-Command herdr -CommandType Application -ErrorAction Stop).Source
$output = Join-Path $root "dist"
$package = Join-Path $output "herdr-streamdeck.streamDeckPlugin"
$zip = "$package.zip"
$staging = Join-Path ([IO.Path]::GetTempPath()) "herdr-streamdeck-install-$([guid]::NewGuid())"
$stagedPlugin = Join-Path $staging "dev.herdr.streamdeck.sdPlugin"

if (-not (Test-Path (Join-Path $source "bin\plugin.js"))) {
    throw "The prebuilt Stream Deck plugin is missing."
}

New-Item -ItemType Directory -Force $output, $staging | Out-Null
try {
    Copy-Item $source $stagedPlugin -Recurse
    Remove-Item -LiteralPath (Join-Path $stagedPlugin "logs") -Recurse -Force -ErrorAction SilentlyContinue
    [IO.File]::WriteAllText(
        (Join-Path $stagedPlugin "herdr-path.txt"),
        $herdr,
        [Text.UTF8Encoding]::new($false)
    )
    Remove-Item -Force $package, $zip -ErrorAction SilentlyContinue
    Compress-Archive -Path $stagedPlugin -DestinationPath $zip -CompressionLevel Optimal
    Move-Item $zip $package
    Start-Process $package
    Write-Host "Opened the Stream Deck installer. Accept its install prompt to finish."
} finally {
    Remove-Item -LiteralPath $staging -Recurse -Force
}
