# Kirby & the Amazing Mirror - Mod Kit

Browser-based tools for modding **Kirby & the Amazing Mirror** (GBA, USA). No install, no accounts:
open an HTML file, load **your own** ROM, edit, and download a patched ROM or an IPS patch.
Your original file is never modified, and nothing is uploaded anywhere.

> This repository contains **no game data**. You need your own legally obtained ROM
> (`Kirby & The Amazing Mirror (USA).gba`). Everything here was verified against that ROM.

## Sprite Studio - `app/KirbySpriteStudio.html`
- Browse **every sprite** (900+ animations) from a dropdown or thumbnail gallery; pick animation and frame; play animations.
- See the **fully assembled sprite** (tiles + OAM pieces, with flips), not loose tiles.
- **Click a pixel** to pick its palette color and recolor it, or switch to *Paint pixel* to edit tile data.
- **Overall color**: one pick recolors a whole sprite's palette (shading kept) across every frame and animation using it.
- **Kirby colors**: all 16 color slots (baseline Kirby, the three friends, the spray paints). Recolor body/shoes with
  automatic shading, point a slot at a different palette row, or open the full 15-color editor.
- Hue / saturation / brightness, grayscale, invert, channel swap; undo; save/load edits; export ROM or IPS.

## Palette Lab - `app/KirbyPaletteLab.html`
Raw palette and tile viewer for exploring arbitrary ROM data (palette scanner, LZ77 tile scanner, find-by-color).

## Quick start
1. Open `app/KirbySpriteStudio.html` in Chrome / Edge / Firefox.
2. Click **Open ROM…** (or drag the ROM onto the page).
3. Edit, then **Download modded ROM** or **Download IPS patch**.

## For reverse engineers
- [`docs/MODDING_NOTES.md`](docs/MODDING_NOTES.md) - verified ROM structures and offsets (sprite database, palette bank,
  Kirby color slots, engine functions, debugging recipes).
- [`docs/ROADMAP.md`](docs/ROADMAP.md) - what's done and what's next (enemies, items, maps, text, music).
- `tools/setup.ps1` downloads **mGBA** and **radare2** from their official GitHub releases (git-ignored).
- `tools/dbg/` - PowerShell/bash helpers that drive mGBA through its GDB stub (launch, attach, key input, breakpoints,
  memory reads). See the header of each script.

## Contributing
Findings are only recorded once verified in the emulator. Open an issue with the offset, how you verified it, and
(ideally) a before/after screenshot. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License
MIT for the code and docs in this repo. Kirby & the Amazing Mirror is © its owners and is not included or licensed here.
