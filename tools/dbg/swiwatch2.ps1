# Logs every BIOS decompression call (all call sites in the game's code): swi number, src, dst, caller.
# Appends live to swi2.txt. Optionally presses a key once after a delay (single GDB connection, so no interference).
# usage: swiwatch2.ps1 -MaxSec 40 -PressKey Up -PressAt 3
param([int]$MaxSec = 40, [string]$Out = "$PSScriptRoot\swi2.txt", [string]$PressKey = "", [int]$PressAt = 3)
. "$PSScriptRoot\lib.ps1"
$sites = "8159304","8159308","8159314","8159318","818005a","818347e","81e3366","82125e6","8262ff8","82701e0","8290aae","82c14ee","81684ee","81728e2","818fbf4","825f70a","825f722","825f74a","82651fe","826fe92","8271f54","828088e","828ebba"
$g = New-Object G; $g.Connect(2345); try { $null = $g.Recv() } catch {}
foreach ($a in $sites) { $g.Send("Z0,$a,2"); try { $null = $g.Recv() } catch {} }
"started" | Set-Content $Out
$t00 = Get-Date; $pressed = $false
$h = (Get-Process mGBA | Select-Object -First 1).MainWindowHandle
while (((Get-Date) - $t00).TotalSeconds -lt $MaxSec) {
  $g.Send("c"); $stop = $null
  while (-not $stop -and ((Get-Date) - $t00).TotalSeconds -lt $MaxSec) {
    $stop = $g.TryRecv()
    if (-not $stop) {
      if ($PressKey -and -not $pressed -and ((Get-Date) - $t00).TotalSeconds -gt $PressAt) { $pressed = $true; Key $h $VK[$PressKey] 150 }
      else { Start-Sleep -Milliseconds 15 }
    }
  }
  if (-not $stop) { break }
  $r = Get-Regs $g; $pc = $r[15] -band 0xfffffffe
  $op = $g.Mem($pc, 2)
  ("{0:N2}s swi={1:X2} pc={2:X8} src={3:X8} dst={4:X8} lr={5:X8}" -f ((Get-Date) - $t00).TotalSeconds, $op[0], $pc, $r[0], $r[1], $r[14]) | Add-Content $Out
}
foreach ($a in $sites) { $g.Send("z0,$a,2"); try { $null = $g.Recv() } catch {} }
$g.Send("c")
