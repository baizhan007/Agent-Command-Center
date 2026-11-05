$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Python = Join-Path $Root 'backend\.venv\Scripts\python.exe'
if (-not (Test-Path $Python)) { throw 'Run .\install.ps1 first to create the Python environment.' }
Push-Location (Join-Path $Root 'backend')
try {
  & $Python -m pip install pyinstaller
  if ($LASTEXITCODE -ne 0) { throw 'Could not install PyInstaller.' }
  & $Python -m PyInstaller --noconfirm --clean --onefile --name acc-api --paths . --collect-all alembic --collect-all sqlalchemy --collect-submodules acc --add-data 'alembic.ini;.' --add-data 'alembic;alembic' --distpath (Join-Path $Root 'frontend\desktop\backend') acc\desktop.py
  if ($LASTEXITCODE -ne 0) { throw 'Could not package the ACC API.' }
} finally { Pop-Location }
Push-Location (Join-Path $Root 'frontend')
try {
  & npm.cmd ci
  if ($LASTEXITCODE -ne 0) { throw 'Could not install frontend dependencies.' }
  & npm.cmd run desktop:dist
  if ($LASTEXITCODE -ne 0) { throw 'Could not build the Windows desktop app.' }
  $PackageDir = Join-Path (Get-Location) 'release\win-unpacked'
  $PackageZip = Join-Path (Get-Location) 'release\ACC-Desktop-0.1.0.zip'
  if (Test-Path $PackageZip) { Remove-Item -LiteralPath $PackageZip -Force }
  Compress-Archive -Path (Join-Path $PackageDir '*') -DestinationPath $PackageZip -CompressionLevel Optimal
} finally { Pop-Location }
$RootZip = Join-Path $Root 'ACC-Desktop-0.1.0.zip'
Copy-Item -LiteralPath $PackageZip -Destination $RootZip -Force
$ExtractedDir = Join-Path $Root 'ACC-Desktop-0.1.0'
New-Item -ItemType Directory -Path $ExtractedDir -Force | Out-Null
Copy-Item -Path (Join-Path $PackageDir '*') -Destination $ExtractedDir -Recurse -Force
Write-Host "Desktop package created and synchronized to $RootZip and $ExtractedDir" -ForegroundColor Green
