# Logs every BIOS decompress / copy call (source, destination, caller) while YOU play. Output is appended live to swi.txt.
param([int]$MaxSec = 150, [string]$Out = "$PSScriptRoot\swi.txt")
. "$PSScriptRoot\lib.ps1"
$g = New-Object G; $g.Connect(2345); try { $null = $g.Recv() } catch {}
$bps = @{ "8159304" = "LZ_VRAM"; "8159308" = "LZ_WRAM"; "8159314" = "RL_VRAM"; "8159318" = "RL_WRAM" }
foreach ($a in $bps.Keys) { $g.Send("Z0,$a,2"); $null = $g.Recv() }
"" | Set-Content $Out
$t00 = Get-Date
while (((Get-Date)-$t00).TotalSeconds -lt $MaxSec) {
  $g.Send("c"); $stop = $null
  while (-not $stop -and ((Get-Date)-$t00).TotalSeconds -lt $MaxSec) { $stop = $g.TryRecv(); if (-not $stop) { Start-Sleep -Milliseconds 20 } }
  if (-not $stop) { break }
  $r = Get-Regs $g
  $name = $bps[("{0:x}" -f ($r[15] -band 0xfffffffe))]
  ("{0:N1}s {1} src={2:X8} dst={3:X8} r2={4:X8} lr={5:X8}" -f ((Get-Date)-$t00).TotalSeconds, $name, $r[0], $r[1], $r[2], $r[14]) | Add-Content $Out
}
foreach ($a in $bps.Keys) { $g.Send("z0,$a,2"); try { $null = $g.Recv() } catch {} }
$g.Send("c")
