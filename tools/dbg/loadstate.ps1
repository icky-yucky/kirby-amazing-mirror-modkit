# Sends mGBA's "load state from slot N" hotkey (F<N>).
param([int]$Slot = 1)
. "$PSScriptRoot\lib.ps1"
$h = (Get-Process mGBA | Select-Object -First 1).MainWindowHandle
[G]::Front($h); Start-Sleep -Milliseconds 300
[G]::Tap([byte](0x6F + $Slot), 120)
"sent F$Slot"
