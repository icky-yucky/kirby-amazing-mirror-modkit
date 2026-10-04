# Kirby & the Amazing Mirror Mod Kit

Browser-based tools for modding **Kirby & the Amazing Mirror** (GBA, USA). No install, no accounts:
open an HTML file, load **your own** ROM, edit, and download a patched ROM or an IPS patch.
Your original file is never modified, and nothing is uploaded anywhere.

> This repository contains **no game data**. You need your own legally obtained ROM
> (`Kirby & The Amazing Mirror (USA).gba`). Everything here was verified against that ROM.

## Get the tools
Grab `KirbySpriteStudio.html` (and optionally `KirbyPaletteLab.html`) from the
[Releases](../../releases) page and double-click it. Or build it yourself (see below).

## Sprite Studio
- Browse **every sprite** (900+ animations) from a dropdown or thumbnail gallery; pick animation and frame; play animations.
- See the **fully assembled sprite** (tiles plus OAM pieces, with flips), not loose tiles.
- **Click a pixel** to pick its palette color and recolor it, or switch to *Paint pixel* to edit tile data.
- **Overall color**: one pick recolors a whole sprite's palette (shading kept) across every frame and animation using it.
- **Kirby colors**: all 16 color slots (baseline Kirby, the three friends, the spray paints). Recolor body and shoes with
  automatic shading, point a slot at a different palette row, or open the full 15-color editor.
- Hue, saturation and brightness, grayscale, invert, channel swap; undo; save and load edits; export ROM or IPS.

## Level editor (experimental)
The **Levels** tab lists 286 rooms across 9 areas. Pick a room, then paint, fill, pick or erase tiles on its main tile layer, with flips and palette rows. Edits save into the ROM copy on every stroke (undoable). Maps are recompressed automatically; the ~80% that fit their original slot are written in place, the rest are moved into free space at the end of the ROM and their pointer is updated. Collision and enemy placement are not editable yet, and the in-game effect of an edited room is still being verified, so treat it as experimental.

## Collision
Switch the layer to **Collision** to see and edit what is solid, one value per 16x16-pixel block. Tiles and collision are separate: painting a platform needs both. Values 0 (empty) and 0D (solid ground) are verified; the rest are still being mapped.

## Palette Lab
Raw palette and tile viewer for exploring arbitrary ROM data (palette scanner, LZ77 tile scanner, find-by-color).

## Build from source
Needs Node 20 or newer.

```
npm install
npm run dev        # local dev server
npm test           # unit tests (use a synthetic ROM, no game data needed)
npm run typecheck
npm run build      # writes dist/KirbySpriteStudio.html, one self-contained file
```

Layout:

```
src/core/     typed, DOM-free logic: ROM access and edits, colors, sprite database, Kirby color slots
src/ui/       the editor UI (TypeScript + CSS)
tests/        vitest tests and a synthetic-ROM fixture
docs/         verified ROM notes and roadmap
tools/        emulator and disassembler helpers (setup.ps1 downloads mGBA and radare2)
```

## For reverse engineers
- [`docs/MODDING_NOTES.md`](docs/MODDING_NOTES.md): verified ROM structures and offsets (sprite database, palette bank,
  Kirby color slots, engine functions, debugging recipes).
- [`docs/ROADMAP.md`](docs/ROADMAP.md): what is done and what is next (enemies, items, maps, text, music).
- `tools/setup.ps1` downloads **mGBA** and **radare2** from their official GitHub releases (git-ignored).
- `tools/dbg/`: PowerShell and bash helpers that drive mGBA through its GDB stub (launch, attach, key input, breakpoints,
  memory reads). See the header of each script.

## Contributing
Findings are only recorded once verified in the emulator. Open an issue with the offset, how you verified it, and
ideally a before/after screenshot. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License
MIT for the code and docs in this repo. Kirby & the Amazing Mirror belongs to its owners and is not included or licensed here.
