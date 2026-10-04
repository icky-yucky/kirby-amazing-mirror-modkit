param([string]$Addr = "8155478", [int]$MaxSec = 120, [int]$MaxStops = 200, [string]$Out = "$PSScriptRoot\bp.txt")
. "$PSScriptRoot\lib.ps1"
$h = (Get-Process mGBA | Select-Object -First 1).MainWindowHandle
$g = New-Object G; $g.Connect(2345); try { $null = $g.Recv() } catch {}
$g.Send("Z0,$Addr,2"); "bp: " + $g.Recv()
$t00 = Get-Date; $keys = @("Enter","X"); $n = 0; $log = @(); $i = 0
while (((Get-Date)-$t00).TotalSeconds -lt $MaxSec -and $i -lt $MaxStops) {
  $g.Send("c"); $g.Ack(); $stop = $null; $t0 = Get-Date
  while (-not $stop -and ((Get-Date)-$t0).TotalSeconds -lt 30) { $stop = $g.TryRecv(); if (-not $stop) { Key $h $VK[$keys[$n % 2]]; $n++; Start-Sleep -Milliseconds 300 } }
  if (-not $stop) { $log += "no stop"; break }
  $r = Get-Regs $g
  $cmd = $g.Mem($r[5], 16); $obj = $g.Mem($r[3] + 0x18, 12)
  $log += ("{0,3} t={1:N0}s pc={2:X8} lr={3:X8} r5={4:X8} cmd={5} r3={6:X8} obj18={7}" -f $i, ((Get-Date)-$t00).TotalSeconds, $r[15], $r[14], $r[5], (($cmd | % { $_.ToString("x2") }) -join ""), $r[3], (($obj | % { $_.ToString("x2") }) -join ""))
  $i++
}
$log | Set-Content $Out
$g.Send("z0,$Addr,2"); try { $null = $g.Recv() } catch {}
$g.Send("c")
$log
