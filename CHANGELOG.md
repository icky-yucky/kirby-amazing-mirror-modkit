# Changelog

## Unreleased
- Collision numbers (#1 to #79) and one distinct color per value, shared by the value buttons, the map overlay and the docs; jump to a value by its number.
- Collision value finder: every value is a button, the panel lists the rooms that use it (click to open), and a toggle highlights only that value. `docs/collision-values-by-room.md` lists them all.
- Collision test arenas (labeled floor cells, one per collision value) and a tileset save function with relocation.
- First batch of collision value results documented.

## 0.4.0
- Level editor (experimental): browse 286 rooms, paint/fill/pick/erase tiles, automatic LZ77 recompression with relocation into free space.
- Collision layer: overlay and edit each room's collision map (16x16 blocks), RLE recompression with relocation. Tile edits verified in game; collision values other than 0 and 0D are unmapped.
- Faster LZ77 encoder (hash chains), tests against the real ROM when available (skipped otherwise).
- `scripts/add-platform.ts`: example of using the core library from Node.

## 0.3.1
- Kirby colors: "Meta Knight colors" checkbox on the baseline Kirby slot (colors only; uncheck restores pink).

## 0.3.0
- Migrated the app to TypeScript (Vite, single-file build) with typed core modules and unit tests.
- CI: typecheck, tests and build on every push; releases attach the built HTML files.
- Overall color tool: recolor a whole sprite palette around its dominant color.

## 0.2.0
- Kirby color slots: recolor baseline Kirby, friends and spray paints; retarget slots to other palette rows.
- Verified the color-slot table (0x3BB558) and palette roles in the emulator.

## 0.1.0
- Sprite Studio: sprite/animation/frame browser with assembled sprites, click-to-pick pixels, paint mode, palette tools,
  undo, IPS/ROM export.
- Palette Lab: raw palette/tile viewer and scanners.
