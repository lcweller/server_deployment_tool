<#
.SYNOPSIS
  Step 1 style smoke: production build, migration script, optional Docker image build.

.DESCRIPTION
  - npm run build (Next.js standalone)
  - node scripts/run-migrations.cjs (needs DATABASE_URL in env or .env.local)
  - docker build -t steamline:local .  (skipped if Docker is not available)

  Usage (from repo root):
    .\scripts\smoke-verify.ps1
#>

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

function Write-Step([string]$msg) {
  Write-Host ""
  Write-Host "==> $msg" -ForegroundColor Cyan
}

Write-Step "npm run build"
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Step "Load DATABASE_URL for migration smoke (optional)"
if (-not $env:DATABASE_URL) {
  if (Test-Path ".env.local") {
    Get-Content ".env.local" | ForEach-Object {
      if ($_ -match '^\s*DATABASE_URL\s*=\s*(.+)$') {
        $env:DATABASE_URL = $Matches[1].Trim().Trim([char]34).Trim([char]39)
      }
    }
  }
}
if ($env:DATABASE_URL) {
  node scripts/run-migrations.cjs
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} else {
  Write-Host "Skip migrations (set DATABASE_URL or add it to .env.local)." -ForegroundColor Yellow
}

Write-Step "docker build (optional)"
docker info *> $null
if ($LASTEXITCODE -eq 0) {
  docker build -t steamline:local .
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  Write-Host "Image tag: steamline:local" -ForegroundColor Green
} else {
  Write-Host "Docker not available - skipped image build." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Smoke verify finished." -ForegroundColor Green
