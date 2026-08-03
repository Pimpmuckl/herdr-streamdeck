param(
    [Parameter(Position = 0)]
    [string] $OutputPath
)

$ErrorActionPreference = 'Stop'

if (-not ('StreamDeckCapture.NativeMethods' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;

namespace StreamDeckCapture
{
    public static class NativeMethods
    {
        public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

        [StructLayout(LayoutKind.Sequential)]
        public struct RECT
        {
            public int Left;
            public int Top;
            public int Right;
            public int Bottom;
        }

        [DllImport("user32.dll")]
        public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);

        [DllImport("user32.dll")]
        public static extern bool IsWindowVisible(IntPtr hWnd);

        [DllImport("user32.dll", SetLastError = true)]
        public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int maxCount);

        [DllImport("user32.dll", SetLastError = true)]
        public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);

        [DllImport("user32.dll", SetLastError = true)]
        public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdc, uint flags);
    }
}
'@
}

$processes = @(Get-Process -Name 'StreamDeck' -ErrorAction SilentlyContinue)
if ($processes.Count -eq 0) {
    throw 'StreamDeck.exe is not running.'
}

$processIds = [Collections.Generic.HashSet[uint32]]::new()
foreach ($process in $processes) {
    [void] $processIds.Add([uint32] $process.Id)
}

$script:windowHandle = [IntPtr]::Zero
$callback = [StreamDeckCapture.NativeMethods+EnumWindowsProc] {
    param([IntPtr] $handle, [IntPtr] $state)

    if (-not [StreamDeckCapture.NativeMethods]::IsWindowVisible($handle)) {
        return $true
    }

    [uint32] $processId = 0
    [void] [StreamDeckCapture.NativeMethods]::GetWindowThreadProcessId($handle, [ref] $processId)
    if (-not $processIds.Contains($processId)) {
        return $true
    }

    $title = [Text.StringBuilder]::new(256)
    [void] [StreamDeckCapture.NativeMethods]::GetWindowText($handle, $title, $title.Capacity)
    if ($title.ToString() -eq 'Stream Deck') {
        $script:windowHandle = $handle
        return $false
    }

    return $true
}
[void] [StreamDeckCapture.NativeMethods]::EnumWindows($callback, [IntPtr]::Zero)

if ($script:windowHandle -eq [IntPtr]::Zero) {
    throw 'No visible top-level Stream Deck window owned by StreamDeck.exe was found.'
}

$rect = [StreamDeckCapture.NativeMethods+RECT]::new()
if (-not [StreamDeckCapture.NativeMethods]::GetWindowRect($script:windowHandle, [ref] $rect)) {
    throw "Could not read the Stream Deck window bounds (Win32 error $([Runtime.InteropServices.Marshal]::GetLastWin32Error()))."
}

$width = $rect.Right - $rect.Left
$height = $rect.Bottom - $rect.Top
if ($width -le 0 -or $height -le 0) {
    throw "The Stream Deck window has invalid dimensions: ${width}x${height}."
}

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $OutputPath = Join-Path ([IO.Path]::GetTempPath()) "streamdeck-live-$([guid]::NewGuid().ToString('N')).png"
}
$resolvedOutputPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath)
$parentPath = Split-Path -Parent $resolvedOutputPath
if (-not (Test-Path -LiteralPath $parentPath -PathType Container)) {
    throw "Output directory does not exist: $parentPath"
}

Add-Type -AssemblyName System.Drawing
$bitmap = [Drawing.Bitmap]::new($width, $height, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [Drawing.Graphics]::FromImage($bitmap)
$deviceContext = $graphics.GetHdc()
try {
    $captured = [StreamDeckCapture.NativeMethods]::PrintWindow($script:windowHandle, $deviceContext, 2)
}
finally {
    $graphics.ReleaseHdc($deviceContext)
    $graphics.Dispose()
}

try {
    if (-not $captured) {
        throw "PrintWindow could not capture the Stream Deck window (Win32 error $([Runtime.InteropServices.Marshal]::GetLastWin32Error()))."
    }
    $bitmap.Save($resolvedOutputPath, [Drawing.Imaging.ImageFormat]::Png)
}
finally {
    $bitmap.Dispose()
}

if (-not (Test-Path -LiteralPath $resolvedOutputPath -PathType Leaf) -or (Get-Item -LiteralPath $resolvedOutputPath).Length -eq 0) {
    throw "Capture did not produce a non-empty PNG: $resolvedOutputPath"
}

[pscustomobject]@{
    OutputPath = $resolvedOutputPath
    Width = $width
    Height = $height
}
