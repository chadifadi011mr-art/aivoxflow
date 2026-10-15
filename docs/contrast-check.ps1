# WCAG 2.1 contrast verification for the AIVOXFLOW palette.
# Reproducible check used for the brand starter. Run:
#   powershell -ExecutionPolicy Bypass -File docs\contrast-check.ps1
# Results are recorded in brand/AIVOXFLOW_Brand_Guide.md.
$ErrorActionPreference = 'Stop'

function Convert-ToLinearChannel([double]$v) {
    if ($v -le 0.03928) { return $v / 12.92 }
    return [Math]::Pow(($v + 0.055) / 1.055, 2.4)
}

function Get-RelativeLuminance([string]$hex) {
    $h = $hex.TrimStart('#')
    $r = [Convert]::ToInt32($h.Substring(0, 2), 16) / 255.0
    $g = [Convert]::ToInt32($h.Substring(2, 2), 16) / 255.0
    $b = [Convert]::ToInt32($h.Substring(4, 2), 16) / 255.0
    return 0.2126 * (Convert-ToLinearChannel $r) +
           0.7152 * (Convert-ToLinearChannel $g) +
           0.0722 * (Convert-ToLinearChannel $b)
}

function Get-ContrastRatio([string]$hexA, [string]$hexB) {
    $la = Get-RelativeLuminance $hexA
    $lb = Get-RelativeLuminance $hexB
    if ($la -lt $lb) { $t = $la; $la = $lb; $lb = $t }
    return [Math]::Round(($la + 0.05) / ($lb + 0.05), 2)
}

# NOTE: keep variable names distinct in a case-insensitive shell ($p vs $P collides).
$palette = @{
    'navy-900'      = '08152F'
    'navy-800'      = '0E2049'
    'electric-600'  = '0B57D0'
    'electric-500'  = '1E6BFF'
    'electric-400'  = '4C8DFF'
    'white'         = 'FFFFFF'
    'gray-50'       = 'F6F8FB'
    'gray-100'      = 'E9EDF4'
    'gray-400'      = '98A1B3'
    'gray-600'      = '59627A'
    'gray-800'      = '232A3B'
    'gray-900'      = '111524'
}

$pairs = @(
    @{ Label = 'Body text: gray-900 on white';            Fg = 'gray-900';     Bg = 'white' }
    @{ Label = 'Secondary: gray-600 on white';            Fg = 'gray-600';     Bg = 'white' }
    @{ Label = 'Secondary: gray-600 on gray-50';          Fg = 'gray-600';     Bg = 'gray-50' }
    @{ Label = 'Links light: electric-600 on white';      Fg = 'electric-600'; Bg = 'white' }
    @{ Label = 'Button: white on electric-500';           Fg = 'white';        Bg = 'electric-500' }
    @{ Label = 'Dark body: white on navy-900';            Fg = 'white';        Bg = 'navy-900' }
    @{ Label = 'Dark card: white on navy-800';            Fg = 'white';        Bg = 'navy-800' }
    @{ Label = 'Links dark: electric-400 on navy-900';    Fg = 'electric-400'; Bg = 'navy-900' }
    @{ Label = 'Muted dark: gray-400 on navy-900';        Fg = 'gray-400';     Bg = 'navy-900' }
    @{ Label = 'Chip: gray-800 on gray-100';              Fg = 'gray-800';     Bg = 'gray-100' }
    @{ Label = 'Accent text: electric-500 on navy-900';   Fg = 'electric-500'; Bg = 'navy-900' }
)

foreach ($pr in $pairs) {
    $ratio = Get-ContrastRatio $palette[$pr.Fg] $palette[$pr.Bg]
    $aa  = if ($ratio -ge 4.5) { 'AA' } else { 'FAIL' }
    $aaa = if ($ratio -ge 7)   { ' +AAA' } else { '' }
    '{0,-42} {1,6}:1  {2}{3}' -f $pr.Label, $ratio, $aa, $aaa
}
