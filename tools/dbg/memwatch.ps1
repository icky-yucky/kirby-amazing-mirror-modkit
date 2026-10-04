# Sets a write watchpoint and logs each hit (pc, lr, regs, stack return addresses). Optionally presses a key once
# so the whole test runs over a single GDB connection.
# usage: memwatch.ps1 -Addr 2024ed0 -Len 256 -MaxStops 4 -MaxSec 40 -PressKey Up -PressAt 2
param([string]$Addr = "202cbd0", [int]$Len = 4, [int]$MaxStops = 6, [int]$MaxSec = 60, [string]$PressKey = "", [int]$PressAt = 2, [string]$Out = "$PSScriptRoot\memwatch.txt")
. "$PSScriptRoot\lib.ps1"
$g = New-Object G; $g.Connect(2345); try { $null = $g.Recv() } catch {}
$g.Send("Z2,$Addr,$($Len.ToString('x'))"); "wp: " + $g.Recv()
$h = (Get-Process mGBA | Select-Object -First 1).MainWindowHandle
$t00 = Get-Date; $log = @(); $i = 0; $pressed = $false
while (((Get-Date) - $t00).TotalSeconds -lt $MaxSec -and $i -lt $MaxStops) {
  $g.Send("c"); $stop = $null
  while (-not $stop -and ((Get-Date) - $t00).TotalSeconds -lt $MaxSec) {
    $stop = $g.TryRecv()
    if (-not $stop) {
      if ($PressKey -and -not $pressed -and ((Get-Date) - $t00).TotalSeconds -gt $PressAt) { $pressed = $true; Key $h $VK[$PressKey] 150 } else { Start-Sleep -Milliseconds 15 }
    }
  }
  if (-not $stop) { $log += "no stop"; break }
  $r = Get-Regs $g; $sp = $r[13]; $stk = $g.Mem($sp, 0x100); $rets = @()
  for ($k = 0; $k + 4 -le $stk.Length; $k += 4) { $w = [BitConverter]::ToUInt32($stk, $k); if (($w -shr 24) -eq 8 -and ($w -band 1) -eq 1) { $rets += ("{0:X8}" -f $w) } }
  $log += ("{0} t={1:N1}s pc={2:X8} lr={3:X8} sp={4:X8} r0-12={5} rets={6}" -f $i, ((Get-Date) - $t00).TotalSeconds, $r[15], $r[14], $sp, (($r[0..12] | % { $_.ToString("X8") }) -join ","), ($rets -join " "))
  $i++
}
$log | Set-Content $Out
$g.Send("z2,$Addr,$($Len.ToString('x'))"); try { $null = $g.Recv() } catch {}
$g.Send("c")
$log
