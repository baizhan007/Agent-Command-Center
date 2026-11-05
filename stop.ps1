$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$PidFile = Join-Path $Root '.acc-runtime\pids.json'
if (-not (Test-Path $PidFile)) { Write-Host 'ACC is not running.'; exit 0 }
$Processes = Get-Content $PidFile -Raw | ConvertFrom-Json
foreach ($ProcessId in @($Processes.frontend, $Processes.backend)) {
  $Process = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
  $IsAccBackend = $Process.ExecutablePath -eq (Join-Path $Root 'backend\.venv\Scripts\python.exe') -and $Process.CommandLine -match 'uvicorn acc\.main:app'
  $IsAccFrontend = $Process.ExecutablePath -eq (Get-Command node).Source -and $Process.CommandLine -like "*$Root\frontend\node_modules\vite\bin\vite.js*"
  if ($IsAccBackend -or $IsAccFrontend) { Stop-Process -Id $ProcessId -Force }
}
Remove-Item -LiteralPath $PidFile -Force
Write-Host 'ACC stopped.'
