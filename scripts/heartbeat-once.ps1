<#
.SYNOPSIS
  Send a single agent heartbeat (requires STEAMLINE_API_KEY in the environment).

.EXAMPLE
  $env:STEAMLINE_API_KEY = "..."
  .\scripts\heartbeat-once.ps1 http://localhost:3000
#>
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$ApiBaseUrl
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

if (-not $env:STEAMLINE_API_KEY) {
  Write-Host "Set STEAMLINE_API_KEY to the apiKey returned during enroll." -ForegroundColor Yellow
  exit 1
}

npm run agent -- heartbeat $ApiBaseUrl
