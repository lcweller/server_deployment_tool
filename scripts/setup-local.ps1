<#
.SYNOPSIS
  One-shot local setup: Docker (Postgres + Mailpit), Drizzle migrations, optional seed.

.DESCRIPTION
  1. Verifies Docker Desktop is running.
  2. Starts containers from docker-compose.yml.
  3. Waits until Postgres accepts connections.
  4. Ensures .env.local exists (copies from .env.example if missing).
  5. Runs npm run db:migrate and npm run db:seed.

  Usage (from project root):
    .\scripts\setup-local.ps1
    npm run setup:local
#>

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

function Write-Step([string]$msg) {
  Write-Host ""
  Write-Host "==> $msg" -ForegroundColor Cyan
}

Write-Step "Checking Docker"
docker info *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "Docker is not reachable. On Windows:" -ForegroundColor Yellow
  Write-Host "  1. Start 'Docker Desktop' from the Start menu." -ForegroundColor Yellow
  Write-Host "  2. Wait until the whale icon shows 'Engine running'." -ForegroundColor Yellow
  Write-Host "  3. Run this script again." -ForegroundColor Yellow
  Write-Host ""
  Write-Host "No Docker? Use any PostgreSQL 16+ URL in .env.local as DATABASE_URL" -ForegroundColor Yellow
  Write-Host "(e.g. Neon or Supabase free tier), then run: npm run db:migrate; npm run db:seed" -ForegroundColor Yellow
  Write-Host ""
  exit 1
}

Write-Step "Starting Postgres + Mailpit"
docker compose up -d postgres mailpit

Write-Step "Waiting for Postgres"
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
  docker exec steamline-postgres pg_isready -U steamline -d steamline 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) {
    $ready = $true
    break
  }
  Start-Sleep -Seconds 1
}
if (-not $ready) {
  Write-Host "Postgres did not become ready in time. Check: docker compose logs postgres" -ForegroundColor Red
  exit 1
}

if (-not (Test-Path "$Root\.env.local")) {
  Write-Step "Creating .env.local from .env.example"
  Copy-Item "$Root\.env.example" "$Root\.env.local"
  Write-Host "Edit .env.local if needed (CRON_SECRET, URLs)." -ForegroundColor Yellow
}

# Load .env.local into process env for drizzle-kit (it does not load .env.local by itself)
Get-Content "$Root\.env.local" -ErrorAction SilentlyContinue | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith("#")) { return }
  $eq = $line.IndexOf("=")
  if ($eq -lt 1) { return }
  $name = $line.Substring(0, $eq).Trim()
  $value = $line.Substring($eq + 1).Trim()
  if ($value.StartsWith('"') -and $value.EndsWith('"')) {
    $value = $value.Substring(1, $value.Length - 2)
  }
  [Environment]::SetEnvironmentVariable($name, $value, "Process")
}

if (-not $env:DATABASE_URL) {
  $env:DATABASE_URL = "postgresql://steamline:steamline@localhost:5432/steamline"
}

Write-Step "Applying database migrations (drizzle-kit migrate)"
npm run db:migrate
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Step "Seeding demo catalog (optional)"
npm run db:seed
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Step "Done"
Write-Host ""
Write-Host "  Mailpit (read verification emails):  http://localhost:8025" -ForegroundColor Green
Write-Host "  App:                                 npm run dev  ->  http://localhost:3000" -ForegroundColor Green
Write-Host ""
