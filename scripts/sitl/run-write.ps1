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

# Keep one WSL session attached for the whole run: with no session WSL may stop the distro/VM and kill SITL mid-test.
$keep = Start-Process -FilePath wsl.exe -ArgumentList '-d', 'Ubuntu-24.04', '--', 'sleep', 'infinity' -WindowStyle Hidden -PassThru

foreach ($tag in $Tags) {
  Write-Output "===================== $tag"
  if (-not (Start-Sitl $tag)) { Write-Output "SITL $tag not reachable"; continue }
  $env:SITL_TAG = $tag
  $r = npx vitest run tests/sitl.write.test.ts 2>&1 | Out-String
  $r | Out-File -Encoding utf8 (Join-Path $env:TEMP "sitl-write-$tag.log")
  if ($r -match 'Tests\s+(\d+) passed' -and $r -notmatch '\d+ failed') { Write-Output "write: PASS ($($Matches[1]) tests)" } else { Write-Output "write: FAIL"; ($r -split "`n" | Select-String -Pattern 'Error|expected|FAIL|ERROR|passed|failed|\+ |- ' | Select-Object -First 40) }
}
& wsl.exe -d Ubuntu-24.04 -- bash -c "~/sitl.sh stop" 2>&1 | Out-Null
if ($keep -and -not $keep.HasExited) { Stop-Process -Id $keep.Id -Force -ErrorAction SilentlyContinue }
Remove-Item Env:SITL_TAG -ErrorAction SilentlyContinue
