<#
.SYNOPSIS
  Start the Steamline agent loop (heartbeat + provision) with minimal setup on Windows.

.DESCRIPTION
  - Creates steamline-agent.env from the example if missing (you paste STEAMLINE_API_KEY once).
  - Reads APP_PUBLIC_URL from .env.local when the API URL is not passed.
  - Sets STEAMLINE_API_KEY for the child process.

.EXAMPLE
  npm run agent:run
  npm run agent:run -- http://localhost:3000
#>
param(
  [Parameter(Position = 0)]
  [string]$ApiUrl = ""
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

if (-not $ApiUrl -and $args.Count -gt 0) {
  $ApiUrl = [string]$args[0]
}

$example = Join-Path $Root "steamline-agent.env.example"
$envFile = Join-Path $Root "steamline-agent.env"

if (-not (Test-Path $envFile)) {
  if (Test-Path $example) {
    Copy-Item $example $envFile
  }
  else {
    @"
# Paste STEAMLINE_API_KEY from enroll output (JSON field apiKey)
STEAMLINE_API_KEY=
"@ | Set-Content -Path $envFile -Encoding UTF8
  }
  Write-Host ""
  Write-Host "Created steamline-agent.env in this folder." -ForegroundColor Cyan
  Write-Host "1. Open steamline-agent.env in Notepad (or your editor)." -ForegroundColor Yellow
  Write-Host "2. After the = sign, paste the apiKey from when you enrolled the host." -ForegroundColor Yellow
  Write-Host "3. Save the file, then run: npm run agent:run" -ForegroundColor Yellow
  Write-Host ""
  exit 1
}

$key = $null
foreach ($line in Get-Content $envFile) {
  $t = $line.Trim()
  if (-not $t -or $t.StartsWith("#")) { continue }
  if ($t -match '^\s*STEAMLINE_API_KEY\s*=\s*(.*)$') {
    $val = $matches[1].Trim()
    if ($val.StartsWith('"') -and $val.EndsWith('"')) {
      $val = $val.Substring(1, $val.Length - 2)
    }
    if ($val.StartsWith("'") -and $val.EndsWith("'")) {
      $val = $val.Substring(1, $val.Length - 2)
    }
    if ($val.Length -gt 0) {
      $key = $val
    }
    break
  }
}

if (-not $key) {
  Write-Host ""
  Write-Host "STEAMLINE_API_KEY is missing or empty in steamline-agent.env" -ForegroundColor Red
  Write-Host "Paste the apiKey from the enroll command output (JSON field apiKey), save, then run again." -ForegroundColor Yellow
  Write-Host ""
  exit 1
}

$env:STEAMLINE_API_KEY = $key

$url = $ApiUrl
if (-not $url) {
  $el = Join-Path $Root ".env.local"
  if (Test-Path $el) {
    foreach ($line in Get-Content $el) {
      if ($line -match '^\s*APP_PUBLIC_URL\s*=\s*(.+)\s*$') {
        $url = $matches[1].Trim().Trim('"').Trim("'")
        break
      }
    }
  }
}
if (-not $url) {
  $url = "http://localhost:3000"
}

Write-Host "Agent URL: $url" -ForegroundColor Cyan
Write-Host "Starting heartbeat + provision loop (Ctrl+C to stop)..." -ForegroundColor Cyan
npm run agent -- run $url
