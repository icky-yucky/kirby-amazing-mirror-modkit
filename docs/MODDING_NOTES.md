# Kirby & the Amazing Mirror (USA) - verified ROM notes

Everything here was checked against the real game in mGBA (not guessed). Offsets are ROM file offsets
(GBA address = 0x08000000 + offset). Tools: `src/KirbySpriteStudio.html` (build: `npm run build`) (sprite/palette/color-slot editor),
`src/public/KirbyPaletteLab.html` (raw palette/tile viewer), `tools/mGBA-*` (emulator), `tools/radare2-*` (disassembler),
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

## Level data (partially verified)
Verified on the first real stage (scene tag 0x65, "Rainbow Route" area 1, forest):
- **Asset descriptors** sit right after (or before) each asset in the ROM. Layout of a tile-map descriptor, as words:
  `[x][w | h<<16][0][0][0][0][0][ptr to LZ77 map][tag<<16]`. The map is `w*h` 16-bit GBA tile entries
  (tile 0-9, hflip 10, vflip 11, palette 12-15), LZ77 (type 0x10) compressed. The tag is a scene number (0x65 = 101).
  Scanning the ROM for this pattern finds 287 map assets.
- Stage 1 ground map: LZ block 0x946F60, 172 x 26 tiles, drawn on BG3 (screenblock 30, charblock 2).
- Stage 1 tiles: LZ block 0x9C2E28 (768 tiles, loaded to VRAM 0x06008000). Its descriptor holds three pointers then the tag.
- Stage 1 BG palette rows 0-5 come from 0x86E16C (runtime color = ROM color +1 per channel, like sprites).
- Far backdrop: raw (uncompressed) 45 x 20 map at 0xA54818, tiles LZ 0xA4D880, palette rows 6-13 at 0xA4D780.
- Scene loader: function at 0x080008B0. It reads a scene table at 0x9331AC (40-byte entries, indexed from about 101)
  whose u16 fields at +0x14 and +0x16 are asset IDs, looked up in pointer tables at 0xD6499C and 0xD63288 and
  decompressed into VRAM with the BIOS LZ77 wrapper at 0x08159304 (r0 = source, r1 = destination).
- BIOS call wrappers: 0x081592F0 CpuFastSet, 0x081592F4 CpuSet, 0x08159304 LZ77 to VRAM, 0x08159308 LZ77 to WRAM,
  0x08159314 and 0x08159318 run-length.
- The hub and stage use a fixed 32x32 BG window, so wide maps are streamed into VRAM as the camera scrolls.

Not yet found: collision (which tiles are solid), enemy and object placement, the full scene-to-assets table, and
which assets other scenes use (only 14 scenes match the tile-descriptor pattern so far).

## Emulator workflow additions
- `tools/dbg/savestate.ps1` / `loadstate.ps1` send Shift+F1 / F1 to mGBA. A hub save state is kept in `tools/states/`.
- `tools/dbg/dump.ps1` snapshots IO, palette, VRAM, OAM, EWRAM, IWRAM to `tools/dbg/dump/`.
- `tools/dbg/swiwatch2.ps1` breakpoints every BIOS decompress call and logs source, destination and caller; it can press
  a key itself (`-PressKey Up`) so only one GDB client is connected. Two clients at once interfere.
- `tools/dbg/release.ps1` clears leftover breakpoints and resumes the game if a script dies mid-run.
- Breakpoints on constantly used functions (CpuSet) stall the game; keep them to rare calls.

## Level editor notes
- 286 rooms resolve a map, tileset and palette through the scene table (see Level data). Scene number = area * 100 + room.
- Free space: the ROM ends with about 835 KB of 0xFF padding starting near 0xF330A8. Relocated maps are written there.
- BIOS LZ77 note: the encoder never emits distance-1 matches so the stream is safe for both the WRAM and VRAM decompressors.
- Open question: after entering a stage the game made no further BIOS decompress calls for the map, and a save state taken in
  the hub still showed the original map when run with an edited ROM. The leading explanation is that the next room's map is
  decompressed while the player is still in the hub (state RAM already held it), so edited maps must be tested from a fresh boot.
