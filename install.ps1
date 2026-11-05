$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Python = Get-Command py -ErrorAction SilentlyContinue
if (-not $Python) { throw 'Python Launcher (py) is required.' }
if ((& py -3.11 --version 2>&1) -notmatch 'Python 3\.11\.') { throw 'Python 3.11 is required.' }
$NodeVersion = (& node --version).Trim().TrimStart('v').Split('.')
$NodeMajor = [int]$NodeVersion[0]
$NodeMinor = [int]$NodeVersion[1]
if (-not (($NodeMajor -eq 20 -and $NodeMinor -ge 19) -or ($NodeMajor -eq 22 -and $NodeMinor -ge 12) -or $NodeMajor -ge 24)) {
  throw 'Use Node.js 20.19+, 22.12+, or 24+ for the pinned Vite toolchain.'
}
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Git for Windows is required.' }

Push-Location (Join-Path $Root 'backend')
try {
  if (-not (Test-Path '.venv\Scripts\python.exe')) { & py -3.11 -m venv .venv }
  & .\.venv\Scripts\python.exe -m pip install --upgrade pip
  & .\.venv\Scripts\python.exe -m pip install -e '.[test]'
} finally { Pop-Location }

Push-Location (Join-Path $Root 'frontend')
try { & npm.cmd ci } finally { Pop-Location }

if (-not (Test-Path (Join-Path $Root '.env'))) {
  Copy-Item (Join-Path $Root '.env.example') (Join-Path $Root '.env')
  $Token = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
  $ConfigPath = Join-Path $Root '.env'
  $ConfigText = [System.IO.File]::ReadAllText($ConfigPath).Replace('replace-with-a-long-random-local-token', $Token)
  [System.IO.File]::WriteAllText($ConfigPath, $ConfigText, [System.Text.UTF8Encoding]::new($false))
  Write-Host 'Created .env with a generated API token. Set ACC_ALLOWED_ROOTS before starting.' -ForegroundColor Yellow
}
Write-Host 'ACC dependencies installed.' -ForegroundColor Green
