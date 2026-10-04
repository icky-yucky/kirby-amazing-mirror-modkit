# usage: nav.ps1 -Keys "Right:1500,X,Up" -Rounds 1 -Interval 3000   (Name or Name:holdMs; sequence repeats for Interval ms each round)
param([string]$Keys = "Enter,X", [int]$Rounds = 1, [int]$Interval = 3000, [string]$Shot = "$PSScriptRoot\shot.png", [int]$Gap = 400)
. "$PSScriptRoot\lib.ps1"
$h = (Get-Process mGBA | Select-Object -First 1).MainWindowHandle
$g = New-Object G; $g.Connect(2345); try { $null = $g.Recv() } catch {}
for ($r = 0; $r -lt $Rounds; $r++) { $g.Send("c"); $g.Ack(); $t0 = Get-Date
  do { foreach ($k in $Keys.Split(",")) { if (-not $k) { continue }; $p = $k.Split(":"); $ms = 90; if ($p.Count -gt 1) { $ms = [int]$p[1] }; Key $h $VK[$p[0]] $ms; Start-Sleep -Milliseconds $Gap } } while (((Get-Date)-$t0).TotalMilliseconds -lt $Interval) }
Shot $h $Shot
