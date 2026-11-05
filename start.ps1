$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Runtime = Join-Path $Root '.acc-runtime'
$BackendPython = Join-Path $Root 'backend\.venv\Scripts\python.exe'
$ViteEntry = Join-Path $Root 'frontend\node_modules\vite\bin\vite.js'
if (-not (Test-Path (Join-Path $Root '.env'))) { throw 'Missing .env. Run .\install.ps1 and configure .env first.' }
if (-not (Test-Path $BackendPython)) { throw 'Missing backend environment. Run .\install.ps1 first.' }
New-Item -ItemType Directory -Force $Runtime | Out-Null
$EnvValues = Get-Content (Join-Path $Root '.env') | Where-Object { $_ -match '^\s*ACC_[A-Z0-9_]+\s*=' }
foreach ($Line in $EnvValues) { $Pair = $Line -split '=', 2; [Environment]::SetEnvironmentVariable($Pair[0].Trim(), $Pair[1].Trim(), 'Process') }
$Backend = Start-Process -FilePath $BackendPython -ArgumentList @('-m', 'uvicorn', 'acc.main:app', '--host', '127.0.0.1', '--port', '8765') -WorkingDirectory (Join-Path $Root 'backend') -WindowStyle Hidden -PassThru
$Node = (Get-Command node).Source
$Frontend = Start-Process -FilePath $Node -ArgumentList @($ViteEntry, '--host', '127.0.0.1', '--port', '5173') -WorkingDirectory (Join-Path $Root 'frontend') -WindowStyle Hidden -PassThru
Set-Content -Path (Join-Path $Runtime 'pids.json') -Value (@{ backend = $Backend.Id; frontend = $Frontend.Id } | ConvertTo-Json)
Start-Sleep -Seconds 2
Write-Host 'Agent Command Center started:' -ForegroundColor Green
Write-Host '  Web:     http://127.0.0.1:5173'
Write-Host '  API:     http://127.0.0.1:8765/api/health'
Write-Host 'Stop with .\stop.ps1'
