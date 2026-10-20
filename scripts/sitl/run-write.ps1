# Stage 5: full write procedure on SITL with fault injection (tests/sitl.write.test.ts). SITL only, never a real craft.
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
  if (-not (Start-Sitl $tag)) { Write-Output "SITL $tag not reachable"; continue }
  $env:SITL_TAG = $tag
  $r = npx vitest run tests/sitl.write.test.ts 2>&1 | Out-String
  $r | Out-File -Encoding utf8 (Join-Path $env:TEMP "sitl-write-$tag.log")
  if ($r -match 'Tests\s+6 passed') { Write-Output "write: PASS (6/6)" } else { Write-Output "write: FAIL"; ($r -split "`n" | Select-String -Pattern 'Error|expected|FAIL|ERROR|passed|failed|\+ |- ' | Select-Object -First 40) }
}
& wsl.exe -d Ubuntu-24.04 -- bash -c "~/sitl.sh stop" 2>&1 | Out-Null
Remove-Item Env:SITL_TAG -ErrorAction SilentlyContinue
