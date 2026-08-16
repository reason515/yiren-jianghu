<#
  重启本地 H5（5200）与 API（4000）。
  不触碰 Docker 基础设施、数据库或 Redis，适合代码/迁移完成后的日常联调。
#>

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$pnpm = Join-Path $env:ProgramFiles "nodejs\pnpm.cmd"
if (-not (Test-Path -LiteralPath $pnpm)) { $pnpm = "pnpm.cmd" }

function Stop-Listener([int]$Port) {
  $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
  foreach ($listener in $listeners) {
    Write-Host "Stopping process $($listener.OwningProcess) on port $Port..."
    Stop-Process -Id $listener.OwningProcess -Force
  }
}

Stop-Listener 4000
Stop-Listener 5200

Write-Host "Building Worker runtime..."
& $pnpm --filter @yjh/worker build
if ($LASTEXITCODE -ne 0) { throw "Worker build failed; services were not restarted." }

Write-Host "Starting API on http://localhost:4000..."
Start-Process -FilePath $pnpm -ArgumentList @("--filter", "@yjh/api", "dev") -WorkingDirectory $repoRoot -WindowStyle Hidden

Write-Host "Starting H5 on http://localhost:5200..."
Start-Process -FilePath $pnpm -ArgumentList @("--filter", "@yjh/h5-client", "dev") -WorkingDirectory $repoRoot -WindowStyle Hidden

$deadline = (Get-Date).AddSeconds(30)
do {
  Start-Sleep -Milliseconds 500
  try {
    $health = Invoke-RestMethod -Uri "http://localhost:4000/health" -TimeoutSec 2
  } catch {
    $health = $null
  }
} while ($null -eq $health -and (Get-Date) -lt $deadline)

if ($null -eq $health) {
  throw "API failed to start within 30 seconds. Check the background API process output."
}

Write-Host "Ready: H5 http://localhost:5200  |  API $($health.status)"
