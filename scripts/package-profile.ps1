param(
    [string]$OutputDirectory = "dist",
    [string]$Version = "0.1.0",
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$source = Join-Path $root "profiles\Herdr Stream Deck+.streamDeckProfile.contents"
$target = Get-Content (Join-Path $root "profiles\profile.json") -Raw | ConvertFrom-Json
$profile = Get-ChildItem $source -Directory -Filter "*.sdProfile" -File:$false -Recurse:$false
if ($profile.Count -ne 1) { throw "Profile source must contain exactly one .sdProfile directory." }

$manifest = Get-Content (Join-Path $profile.FullName "manifest.json") -Raw | ConvertFrom-Json
$pageId = $manifest.Pages.Current
$pages = @($manifest.Pages.Pages)
if ($pageId -notin $pages) { throw "Current profile page is not listed: $pageId" }
if ($manifest.Pages.Default -in $pages) { throw "Default page ID must not duplicate an imported page." }
$pagePath = Join-Path $profile.FullName "Profiles\$($pageId.ToUpperInvariant())\manifest.json"
if (-not (Test-Path $pagePath)) { throw "Current profile page is missing: $pageId" }
$page = Get-Content $pagePath -Raw | ConvertFrom-Json
$keypad = $page.Controllers | Where-Object Type -eq "Keypad"
$encoder = $page.Controllers | Where-Object Type -eq "Encoder"

$expectedKeys = @("0,0", "1,0", "2,0", "3,0", "0,1", "1,1", "2,1", "3,1")
$expectedEncoders = @("0,0", "1,0", "2,0", "3,0")
$keyNames = @($keypad.Actions.PSObject.Properties.Name)
$encoderNames = @($encoder.Actions.PSObject.Properties.Name)
if ($target.DeviceType -ne 7 -or $target.DeviceModel -ne "20GBD9901" -or $manifest.Device.Model -ne $target.DeviceModel) {
    throw "Profile must target Stream Deck+ DeviceType 7, model 20GBD9901."
}
if (Compare-Object $expectedKeys $keyNames) { throw "Profile must assign all eight Stream Deck+ keys." }
if (Compare-Object $expectedEncoders $encoderNames) { throw "Profile must assign all four Stream Deck+ encoders." }
if ($keypad.Actions."3,0".UUID -ne "dev.herdr.streamdeck.attention" -or $keypad.Actions."3,1".UUID -ne "dev.herdr.streamdeck.command") {
    throw "Inbox and Command must occupy the top-right and bottom-right keys."
}
foreach ($coordinate in @("0,0", "1,0", "2,0", "0,1", "1,1", "2,1")) {
    if ($keypad.Actions.$coordinate.UUID -ne "dev.herdr.streamdeck.pin") { throw "Thread slot $coordinate must use the pinned-thread action." }
}

$actions = @($keypad.Actions.PSObject.Properties.Value) + @($encoder.Actions.PSObject.Properties.Value)
$ids = @($actions | ForEach-Object ActionID)
if (($ids | Sort-Object -Unique).Count -ne 12) { throw "Every profile action needs a unique ActionID UUID." }
$pluginManifest = Get-Content (Join-Path $root "dev.herdr.streamdeck.sdPlugin\manifest.json") -Raw | ConvertFrom-Json
$validActions = @($pluginManifest.Actions.UUID)
foreach ($action in $actions) {
    if ($action.UUID -notin $validActions -or $action.Plugin.UUID -ne $action.UUID) {
        throw "Profile action $($action.ActionID) does not reference a shipped action UUID."
    }
}

Write-Host "Validated Stream Deck+ profile: 8 keys, 4 encoders, 12 unique action IDs."
if ($DryRun) { return }

$output = Join-Path $root $OutputDirectory
New-Item -ItemType Directory -Force $output | Out-Null
$archive = Join-Path $output "Herdr-Stream-Deck-Plus-$Version.streamDeckProfile"
$zip = "$archive.zip"
Remove-Item -Force $archive, $zip -ErrorAction SilentlyContinue
Compress-Archive -Path (Join-Path $source "*") -DestinationPath $zip -CompressionLevel Optimal
Move-Item $zip $archive
Write-Host "Created $archive"
