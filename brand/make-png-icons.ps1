# Rasterize brand/logo-icon.svg geometry to PNG favicons via local Edge headless.
# No network needed. Outputs to brand\icons\. Verify results in the console output.
# Usage: powershell -ExecutionPolicy Bypass -File brand\make-png-icons.ps1
$ErrorActionPreference = 'Stop'

$brandDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$outDir   = Join-Path $brandDir 'icons'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$edgeCandidates = @(
    (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
    (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe')
)
$edge = $edgeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { throw 'Edge not found; cannot rasterize. SVG assets remain valid.' }

# Same geometry as brand/logo-icon.svg (kept in sync manually; preview.html shows the SVG).
$iconSvg = @'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="7.5" fill="#08152F"/>
  <path d="M7 21.5 13 15 19 19 25 10" fill="none" stroke="#FFFFFF" stroke-width="3"
        stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="7" cy="21.5" r="2.5" fill="#4C8DFF"/>
  <circle cx="25" cy="10" r="3" fill="#1E6BFF"/>
</svg>
'@

$targets = @(
    @{ Size = 32;  Name = 'favicon-32.png' }
    @{ Size = 48;  Name = 'favicon-48.png' }
    @{ Size = 180; Name = 'apple-touch-icon-180.png' }
    @{ Size = 192; Name = 'icon-192.png' }
    @{ Size = 512; Name = 'icon-512.png' }
)

$tmpHtml = Join-Path $env:TEMP 'ax-icon-render.html'
$failed = @()

foreach ($t in $targets) {
    $s = $t.Size
    $html = "<!doctype html><html><head><meta charset=`"utf-8`"><style>" +
            "html,body{margin:0;padding:0;width:${s}px;height:${s}px;overflow:hidden;background:transparent}" +
            "svg{display:block;width:${s}px;height:${s}px}" +
            "</style></head><body>$iconSvg</body></html>"
    Set-Content -Path $tmpHtml -Value $html -Encoding UTF8
    $outPng = Join-Path $outDir $t.Name
    if (Test-Path $outPng) { Remove-Item $outPng -Force }

    $uri = ($tmpHtml -replace '\\', '/') -replace '^', 'file:///'
    # NOTE: this Edge build requires --headless=new and an explicit
    # --user-data-dir; plain --headless produced no screenshot (verified).
    # A fresh profile per size avoids profile-reuse races between launches.
    $edgeProfileRun = Join-Path $env:TEMP ('ax-edge-profile-' + $t.Size)
    if (Test-Path $edgeProfileRun) { Remove-Item $edgeProfileRun -Recurse -Force -ErrorAction SilentlyContinue }
    $arguments = @(
        '--headless=new', '--disable-gpu', '--hide-scrollbars',
        ('--user-data-dir="' + $edgeProfileRun + '"'),
        '--force-device-scale-factor=1', '--default-background-color=00000000',
        '--virtual-time-budget=2000',
        ('--screenshot="' + $outPng + '"'),
        "--window-size=$s,$s",
        ('"' + $uri + '"')
    )
    $null = Start-Process -FilePath $edge -ArgumentList $arguments -Wait -PassThru -NoNewWindow

    Start-Sleep -Milliseconds 300
    if ((Test-Path $outPng) -and ((Get-Item $outPng).Length -gt 0)) {
        $len = (Get-Item $outPng).Length
        "OK   $($t.Name)  ${s}x${s}  ($len bytes)"
    } else {
        $failed += $t.Name
        "FAIL $($t.Name)  ${s}x${s}"
    }
}

if (Test-Path $tmpHtml) { Remove-Item $tmpHtml -Force }
Remove-Item (Join-Path $env:TEMP 'ax-edge-profile*') -Recurse -Force -ErrorAction SilentlyContinue
if ($failed.Count -gt 0) { throw "PNG generation failed for: $($failed -join ', ')" }
'Done. All PNG icons generated in brand\icons\'
