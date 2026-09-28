$ErrorActionPreference = "Stop"
Write-Host ""
Write-Host "Starting EverBond AI on http://localhost:3000 ..." -ForegroundColor Magenta
Write-Host ""

if (!(Test-Path "package.json")) {
  Write-Host "package.json was not found. Open PowerShell inside this folder first." -ForegroundColor Red
  exit 1
}

npm install
npm run dev
