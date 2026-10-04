# Downloads the helper tools (mGBA emulator, radare2 disassembler) from their official GitHub releases
# into tools/. They are git-ignored. Run from the repo root:  powershell -ExecutionPolicy Bypass -File tools/setup.ps1
$ErrorActionPreference = "Stop"
$tools = $PSScriptRoot
function Get-Release($repo, $pattern) {
  $rel = Invoke-RestMethod "https://api.github.com/repos/$repo/releases/latest" -Headers @{ "User-Agent" = "kirby-modkit" }
  $asset = $rel.assets | Where-Object { $_.name -match $pattern } | Select-Object -First 1
  if (-not $asset) { throw "No asset matching $pattern in $repo" }
  $asset
}
if (-not (Get-ChildItem $tools -Directory -Filter "mGBA-*" -ErrorAction SilentlyContinue)) {
  $a = Get-Release "mgba-emu/mgba" '^mGBA-[\d.]+-win64\.7z$'
  Write-Host "Downloading $($a.name)..."; $z = Join-Path $tools "mgba.7z"
  Invoke-WebRequest $a.browser_download_url -OutFile $z; tar -xf $z -C $tools; Remove-Item $z
}
if (-not (Test-Path (Join-Path $tools "radare2"))) {
  $a = Get-Release "radareorg/radare2" '^radare2-[\d.]+-w64\.zip$'
  Write-Host "Downloading $($a.name)..."; $z = Join-Path $tools "r2.zip"
  Invoke-WebRequest $a.browser_download_url -OutFile $z; Expand-Archive $z -DestinationPath (Join-Path $tools "radare2"); Remove-Item $z
}
Write-Host "Done. mGBA and radare2 are in $tools"
