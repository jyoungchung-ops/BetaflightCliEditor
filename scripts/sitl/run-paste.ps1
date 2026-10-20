# Stage 4: paste the generated changes file into SITL per version (tests/sitl.paste.test.ts). Never sends save.
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
  $r = npx vitest run tests/sitl.paste.test.ts 2>&1 | Out-String
  if ($r -match 'Tests\s+1 passed') { Write-Output "paste: PASS" } else { Write-Output "paste: FAIL"; ($r -split "`n" | Select-String -Pattern 'Error|expected|FAIL|ERROR' | Select-Object -First 30) }
}
& wsl.exe -d Ubuntu-24.04 -- bash -c "~/sitl.sh stop" 2>&1 | Out-Null
Remove-Item Env:SITL_TAG -ErrorAction SilentlyContinue
