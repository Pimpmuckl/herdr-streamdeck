$ErrorActionPreference = "Stop"

if (-not $env:HERDR_PANE_ID) { throw "Herdr did not provide a focused pane" }

$directory = Join-Path $env:LOCALAPPDATA "Herdr Stream Deck"
$request = Join-Path $directory "pin-request.json"
$temporary = "$request.$PID.tmp"
$payload = @{
    paneId = $env:HERDR_PANE_ID
    requestedAt = [DateTime]::UtcNow.ToString("o")
} | ConvertTo-Json -Compress

New-Item -ItemType Directory -Force $directory | Out-Null
[IO.File]::WriteAllText($temporary, $payload, [Text.UTF8Encoding]::new($false))
Move-Item -Force $temporary $request
