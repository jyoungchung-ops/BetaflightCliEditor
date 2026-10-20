# SITL 0단계 검증 일괄 실행 (Windows PowerShell). 각 버전마다:
#   1) 빈 eeprom 으로 SITL 시작 → 앱 리더(화이트리스트)로 읽기 (tests/sitl.integration.test.ts) → fixtures/sitl-<tag>/
#   2) SITL 재시작 → SITL 전용 실험 (scripts/sitl/probe.mjs) → fixtures/sitl-<tag>/probe.json
# 전제: WSL Ubuntu-24.04 에 ~/bf-sitl/<tag>/obj/main/betaflight_SITL.elf 빌드, ~/sitl.sh 설치
param([string[]]$Tags = @('4.5.3', '4.5.5', '2025.12.5', '2026.6.2'))
$ErrorActionPreference = 'Continue'
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
Set-Location (Join-Path $PSScriptRoot '..\..')

function Start-Sitl($tag) {
  $o = & wsl.exe -d Ubuntu-24.04 -- bash -c "~/sitl.sh start $tag" 2>&1 | Out-String
  ($o -replace "`0", '').Trim()
  for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 500
    $c = New-Object System.Net.Sockets.TcpClient
    try { $c.Connect('127.0.0.1', 5761); if ($c.Connected) { $c.Close(); Start-Sleep -Milliseconds 500; return $true } } catch {} finally { $c.Close() }
  }
  return $false
}

foreach ($tag in $Tags) {
  Write-Output "===================== $tag"
  New-Item -ItemType Directory -Force "fixtures\sitl-$tag" | Out-Null
  if (-not (Start-Sitl $tag)) { Write-Output "SITL $tag not reachable"; continue }
  $env:SITL_TAG = $tag
  $r = npx vitest run tests/sitl.integration.test.ts 2>&1 | Out-String
  if ($r -match 'Tests\s+1 passed') { Write-Output "read: PASS" } else { Write-Output "read: FAIL"; ($r -split "`n" | Select-String -Pattern 'Error|expected|FAIL' | Select-Object -First 6) }
  if (-not (Start-Sitl $tag)) { Write-Output "SITL $tag not reachable (probe)"; continue }
  node scripts/sitl/probe.mjs "fixtures\sitl-$tag\probe.json" 2>&1
}
& wsl.exe -d Ubuntu-24.04 -- bash -c "~/sitl.sh stop" 2>&1 | Out-Null
Remove-Item Env:SITL_TAG -ErrorAction SilentlyContinue
