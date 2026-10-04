# Sends mGBA's "save state to slot N" hotkey (Shift+F<N>). Load later with F<N>, or: mGBA.exe -t <file.ss1> rom.gba
param([int]$Slot = 1)
. "$PSScriptRoot\lib.ps1"
$h = (Get-Process mGBA | Select-Object -First 1).MainWindowHandle
[G]::Front($h); Start-Sleep -Milliseconds 300
[G]::keybd_event(0x10, 0, 0, 0); Start-Sleep -Milliseconds 80
[G]::Tap([byte](0x6F + $Slot), 120)
[G]::keybd_event(0x10, 0, 2, 0)
"sent Shift+F$Slot"
