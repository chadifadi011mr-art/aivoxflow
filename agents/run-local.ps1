# run-local.ps1 - run the content pipeline with locally-stored secrets.
#
# Secret values live in agents/.local.env (gitignored). This wrapper loads that
# file into the process environment and invokes the requested agent script.
# The key is never printed and never passed on a command line.
#
# NOTE: this file must stay 7-bit ASCII. Windows PowerShell 5.1 reads BOM-less
# scripts with the ANSI code page, so any non-ASCII character (such as an em
# dash) can corrupt string parsing and silently skip the env loading below.
#
#   .\agents\run-local.ps1 doctor           # validate config + key
#   .\agents\run-local.ps1 doctor --probe   # also run one tiny text + image call
#   .\agents\run-local.ps1 run <stage> ...  # run one pipeline stage
#   .\agents\run-local.ps1 scheduler --once # one scheduler pass
param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$AgentArgs
)
$ErrorActionPreference = 'Stop'

$envFile = Join-Path $PSScriptRoot '.local.env'
if (-not (Test-Path $envFile)) {
  Write-Host "Missing agents\.local.env - copy agents\.local.env.example to agents\.local.env and fill it in with Notepad." -ForegroundColor Red
  exit 2
}

foreach ($line in Get-Content $envFile) {
  $t = $line.Trim()
  if ($t -and -not $t.StartsWith('#') -and $t.Contains('=')) {
    $i = $t.IndexOf('=')
    $name = $t.Substring(0, $i).Trim()
    $value = $t.Substring($i + 1).Trim()
    if ($name) { Set-Item -Path "Env:$name" -Value $value }
  }
}

if (-not $AgentArgs -or $AgentArgs.Count -eq 0) {
  $AgentArgs = @('doctor')
}

$script = Join-Path $PSScriptRoot ($AgentArgs[0] + '.mjs')
if (-not (Test-Path $script)) {
  Write-Host "Unknown agent '$($AgentArgs[0])' - expected doctor | plan | run | scheduler" -ForegroundColor Red
  exit 2
}

$rest = @()
if ($AgentArgs.Count -gt 1) { $rest = $AgentArgs[1..($AgentArgs.Count - 1)] }
node $script @rest
exit $LASTEXITCODE
