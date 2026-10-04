param([string]$ExpectedFile = "$PSScriptRoot\vt\expected_collision.bin", [int]$RamBase = 0x2024ED0)
. "$PSScriptRoot\lib.ps1"
$expected = [IO.File]::ReadAllBytes($ExpectedFile)
$g = New-Object G; $g.Connect(2345); try { $null = $g.Recv() } catch {}
# copy of the harness check, printing its parts
function In-Stage1 {
  $g.Raw(3); try { $null = $g.Recv() } catch {}
  $vram = $g.Mem(0x06000000 + 30 * 0x800 + 17 * 64, 16)
  $want = @(0xb1, 0xb2, 0xb3, 0xb0, 0xb1, 0xb2, 0xb3, 0xb0)
  $tilesOk = 0
  for ($i = 0; $i -lt 8; $i++) { if ([BitConverter]::ToUInt16($vram, $i * 2) -eq $want[$i]) { $tilesOk++ } }
  $live = $g.Mem($RamBase, $expected.Length)
  $same = 0
  for ($i = 0; $i -lt $expected.Length; $i++) { if ($live[$i] -eq $expected[$i]) { $same++ } }
  Write-Host "tilesOk=$tilesOk same=$same expectedLen=$($expected.Length) ramBase=$RamBase"
  return [bool]($tilesOk -eq 8 -and $same -eq $expected.Length)
}
$r = In-Stage1
"result: $r"
$g.Send("c")
