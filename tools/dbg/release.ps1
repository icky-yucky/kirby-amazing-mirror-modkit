# Clears every breakpoint/watchpoint the helpers may have left behind and resumes the game.
. "$PSScriptRoot\lib.ps1"
$g = New-Object G; $g.Connect(2345); try { $null = $g.Recv() } catch {}
foreach ($a in "8159304","8159308","8159314","8159318","81592f4","81592f0","8155478","818005a","818347e","81e3366","82125e6","8262ff8","82701e0","8290aae","82c14ee","81684ee","81728e2","818fbf4","825f70a","825f722","825f74a","82651fe","826fe92","8271f54","828088e","828ebba") { $g.Send("z0,$a,2"); try { $null = $g.Recv() } catch {} }
foreach ($a in "202cbd0","3002c60","6010000","3003000") { foreach ($l in "4","80","400","200") { $g.Send("z2,$a,$l"); try { $null = $g.Recv() } catch {} } }
$g.Send("c"); "released"
