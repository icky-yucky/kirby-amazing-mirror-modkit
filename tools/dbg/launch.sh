#!/bin/bash
# Launch mGBA with the GDB stub on port 2345.  usage: launch.sh "<path to rom>"   (bash, Windows)
taskkill //F //IM mGBA.exe >/dev/null 2>&1; sleep 2
ROM="$(realpath "$1")"
cd "$(dirname "$0")/.." && cd mGBA-*/ || exit 1
(./mGBA.exe -3 -g "$ROM" > /dev/null 2>&1 &)
sleep 4
netstat -ano | grep 2345 | head -1
