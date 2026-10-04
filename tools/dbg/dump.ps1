# Pauses the game via the GDB stub and saves IO, palette, VRAM, OAM, EWRAM and IWRAM to tools/dbg/dump/<Tag>_*.bin, then resumes.
param([string]$Tag = "d0", [string]$Out = "$PSScriptRoot\dump")
. "$PSScriptRoot\lib.ps1"
New-Item -ItemType Directory -Force $Out | Out-Null
$h = (Get-Process mGBA | Select-Object -First 1).MainWindowHandle
$g = New-Object G; $g.Connect(2345); try { $null = $g.Recv() } catch {}
$g.Raw(3); try { $null = $g.Recv() } catch {}
Shot $h "$Out\${Tag}.png"
$regions = @{ io = @(0x04000000, 0x60); pal = @(0x05000000, 0x400); vram = @(0x06000000, 0x18000); oam = @(0x07000000, 0x400); ewram = @(0x02000000, 0x40000); iwram = @(0x03000000, 0x8000) }
foreach ($k in $regions.Keys) { [IO.File]::WriteAllBytes("$Out\${Tag}_$k.bin", $g.Mem($regions[$k][0], $regions[$k][1])) }
$g.Send("c")
"dumped $Tag"
