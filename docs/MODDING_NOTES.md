# Kirby & the Amazing Mirror (USA) - verified ROM notes

Everything here was checked against the real game in mGBA (not guessed). Offsets are ROM file offsets
(GBA address = 0x08000000 + offset). Tools: `app/KirbySpriteStudio.html` (sprite/palette/color-slot editor),
`app/KirbyPaletteLab.html` (raw palette/tile viewer), `tools/mGBA-*` (emulator), `tools/radare2-*` (disassembler),
`tools/dbg/*.ps1` (GDB-stub helpers: launch, attach, key input, breakpoints).

## Sprites (all verified)
- Sprite database header at 0x3B9090 (self-pointer at +8). Five pointers at 0x3B909C:
  B = animation table, C = frame metadata, D = OAM piece lists, P = palette bank (0x4BB0EC, 483 rows x 32 bytes),
  T = raw 4bpp tile bank (0x4BED4C). 901 usable animations.
- Animation record: `-2, paletteRow, 16, 1` header, then `-1, tileStart, tileCount, duration, imageIndex` entries.
- Piece list = 3 halfwords (GBA OAM attr0/1/2). A new image starts at a piece whose tile index is 0.
- Runtime palette = ROM value +1 per channel (saturating), copied via a shadow buffer at IWRAM 0x03002C60.

## Kirby colors / spray paints (verified)
- Color-slot table at 0x3BB558: 16 pointers to palette-load scripts (0x3BB3C0, 0x3BB3DC, ... each 0x1C or 0x18 bytes).
  Script layout: `-2, ROW, 16, 1, -1, -3|-4`. Changing the ROW word (script+4) changes which palette row the slot uses.
- Slots 0-3 = baseline Kirby + three friends (rows 2, 6, 7, 8). Slots 4-15 = spray paints (rows 9..20).
  Slot 4 = white body / red shoes (row 9).
- Scripts ending in -3 (slots 0-3, 14, 15) also overlay palette colors 12-14 from row 1.
- Palette roles: index 0 transparent, 1 outline, 2-8 body ramp (4 = main body), 9-11 shoes (9 = main), 12-15 accents/eyes.
- Not covered: the HUD lives icon (bottom-left) uses its own palette.

## Emulator debugging recipes
- `mGBA.exe -g rom` opens a GDB stub on port 2345. Memory reads, `Z0` breakpoints and `Z2` write watchpoints work.
- DMA3 registers read back 0; use a breakpoint on the DMA setup code and read registers instead.
- VBlank handler at 0x08151DC4 copies shadow buffers (OAM, palette) to hardware; generic palette-load command
  executor is at ~0x08155400.
- Marker trick: write a unique value into every palette row, run, and read the live palette to see which row feeds it.
