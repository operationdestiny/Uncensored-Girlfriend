param([Parameter(Mandatory=$true)][string]$Target)
$ErrorActionPreference = "Stop"
if (-not (Test-Path -LiteralPath $Target -PathType Container)) {
  throw "Target repository folder not found: $Target"
}
$PatchFiles = Join-Path $PSScriptRoot "files"
Copy-Item -Path (Join-Path $PatchFiles "*") -Destination $Target -Recurse -Force
$aWrite = "EverBond social publishing patch copied into: $Target"
Write-Host $aWrite
Write-Host "Next: read PATCH_README.md, run the Pinterest SQL once, configure Vercel OAuth/env values, and deploy."
