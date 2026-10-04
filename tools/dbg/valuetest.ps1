# Tests collision values one at a time in the running game (stage 1 of the original ROM, from the saved hub state).
# For each value: reload the hub state, enter the stage, VERIFY we are really in stage 1 (the live collision array must equal the
# ROM's), write the value into 4 floor blocks (rows below stay solid so a missing floor is only a dip), walk right, release,
# and record Kirby's screen position and the camera at every sample. Aborts after two failed reloads in a row.
# usage: valuetest.ps1 -Values "0,13,1,2,3" -Out vt\results.csv
# This script presses keys in the mGBA window it controls: do not use the keyboard while it runs.
param([string]$Values = "0,13", [int]$Start = 1, [int]$Len = 4, [int]$Row = 9, [int]$RamBase = 0x2024ED0, [int]$Width = 86,
      [double]$WalkSec = 1.6, [double]$SlideSec = 1.2, [string]$Out = "$PSScriptRoot\vt\results.csv",
      [string]$Expected = "$PSScriptRoot\vt\expected_collision.bin")
. "$PSScriptRoot\lib.ps1"
New-Item -ItemType Directory -Force (Split-Path $Out) | Out-Null
$expected = [IO.File]::ReadAllBytes($Expected)
$g = New-Object G; $g.Connect(2345); try { $null = $g.Recv() } catch {}
$h = (Get-Process mGBA | Select-Object -First 1).MainWindowHandle
function Wait-Run($sec) { $t = Get-Date; while (((Get-Date) - $t).TotalSeconds -lt $sec) { Start-Sleep -Milliseconds 50 } }
function Release-Keys { foreach ($k in 0x27, 0x26, 0x58, 0x5A, 0x0D) { [G]::keybd_event([byte]$k, 0, 2, 0) } }
function Sample($g) {
  $g.Raw(3); try { $null = $g.Recv() } catch {}
  $oam = $g.Mem(0x07000000, 256); $cam = $g.Mem(0x0300368C, 2)
  $kx = -1; $ky = -1
  for ($i = 0; $i -lt 32; $i++) {
    $a0 = [BitConverter]::ToUInt16($oam, $i * 8); $a1 = [BitConverter]::ToUInt16($oam, $i * 8 + 2); $a2 = [BitConverter]::ToUInt16($oam, $i * 8 + 4)
    if ((($a0 -shr 8) -band 3) -eq 2) { continue }
    if ((($a2 -shr 12) -eq 0) -and (($a2 -band 1023) -eq 0) -and (($a0 -band 255) -ge 60) -and (($a0 -band 255) -lt 200) -and (($a1 -band 511) -lt 230)) { $kx = $a1 -band 511; $ky = $a0 -band 255; break }
  }
  $g.Send("c")
  return @($kx, $ky, [BitConverter]::ToUInt16($cam, 0))
}
# true when the game is paused in stage 1 with the untouched collision map in RAM
function In-Stage1 {
  $g.Raw(3); try { $null = $g.Recv() } catch {}
  $live = $g.Mem($RamBase, $expected.Length)
  for ($i = 0; $i -lt $expected.Length; $i++) { if ($live[$i] -ne $expected[$i]) { return $false } }
  return $true
}
$g.Send("c")
"value,phase,t,kx,ky,cam" | Set-Content $Out
$failures = 0
try {
  foreach ($v in ($Values.Split(",") | % { [int]$_ })) {
    $ok = $false
    for ($attempt = 1; $attempt -le 2 -and -not $ok; $attempt++) {
      Release-Keys
      Key $h $VK["F1"] 150; Wait-Run 2.5
      Key $h $VK["Up"] 250; Wait-Run 6.3
      if (In-Stage1) { $ok = $true } else { $g.Send("c"); Write-Host "value ${v}: not in stage 1 (attempt $attempt), retrying" }
    }
    if (-not $ok) {
      "$v,NOT_IN_STAGE,0,-1,-1,0" | Add-Content $Out
      $failures++
      Write-Host "value ${v}: could not reach stage 1, skipped"
      if ($failures -ge 2) { throw "Two reloads in a row failed to reach stage 1. Stopping so nothing is tested in the wrong room." }
      continue
    }
    $failures = 0
    # the game is paused here, in stage 1, with the original collision data
    for ($i = 0; $i -lt $Len; $i++) { $g.WriteMem($RamBase + $Row * $Width + $Start + $i, [byte[]]@([byte]$v)) }
    $g.Send("c")
    [G]::Front($h); [G]::keybd_event(0x27, 0, 0, 0)
    $t0 = Get-Date; $missing = 0
    while (((Get-Date) - $t0).TotalSeconds -lt $WalkSec) {
      Start-Sleep -Milliseconds 90; $s = Sample $g
      "{0},walk,{1:N2},{2},{3},{4}" -f $v, ((Get-Date) - $t0).TotalSeconds, $s[0], $s[1], $s[2] | Add-Content $Out
      if ($s[0] -lt 0) { $missing++ } else { $missing = 0 }
      if ($missing -ge 4) { break }                      # Kirby is gone: he died, do not keep walking
    }
    Release-Keys
    if ($missing -lt 4) {
      $t1 = Get-Date
      while (((Get-Date) - $t1).TotalSeconds -lt $SlideSec) {
        Start-Sleep -Milliseconds 90; $s = Sample $g
        "{0},slide,{1:N2},{2},{3},{4}" -f $v, ((Get-Date) - $t1).TotalSeconds, $s[0], $s[1], $s[2] | Add-Content $Out
      }
    }
    Write-Host ("tested {0}{1}" -f $v, $(if ($missing -ge 4) { " (Kirby died)" } else { "" }))
  }
} finally { Release-Keys }
