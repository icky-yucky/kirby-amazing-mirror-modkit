# Sets a write watchpoint and logs each hit (pc, lr, regs, stack return addresses) while YOU play.
# usage: memwatch.ps1 -Addr 202cbd0 -Len 4 -MaxStops 6 -MaxSec 180
param([string]$Addr = "202cbd0", [int]$Len = 4, [int]$MaxStops = 6, [int]$MaxSec = 180, [string]$Out = "$PSScriptRoot\memwatch.txt")
. "$PSScriptRoot\lib.ps1"
$g = New-Object G; $g.Connect(2345); try { $null = $g.Recv() } catch {}
$g.Send("Z2,$Addr,$($Len.ToString('x'))"); "wp: " + $g.Recv()
$t00 = Get-Date; $log = @(); $i = 0
while (((Get-Date)-$t00).TotalSeconds -lt $MaxSec -and $i -lt $MaxStops) {
  $g.Send("c"); $g.Ack(); $stop = $null
  while (-not $stop -and ((Get-Date)-$t00).TotalSeconds -lt $MaxSec) { $stop = $g.TryRecv(); if (-not $stop) { Start-Sleep -Milliseconds 200 } }
  if (-not $stop) { $log += "no stop"; break }
  $r = Get-Regs $g; $sp = $r[13]; $stk = $g.Mem($sp, 0x100); $rets = @()
  for ($k = 0; $k + 4 -le $stk.Length; $k += 4) { $w = [BitConverter]::ToUInt32($stk, $k); if (($w -shr 24) -eq 8 -and ($w -band 1) -eq 1) { $rets += ("{0:X8}" -f $w) } }
  $log += ("{0} t={1:N0}s pc={2:X8} lr={3:X8} sp={4:X8} r0-12={5} rets={6}" -f $i, ((Get-Date)-$t00).TotalSeconds, $r[15], $r[14], $sp, (($r[0..12] | % { $_.ToString("X8") }) -join ","), ($rets -join " "))
  $i++
}
$log | Set-Content $Out
$g.Send("z2,$Addr,$($Len.ToString('x'))"); try { $null = $g.Recv() } catch {}
$g.Send("c")
$log
