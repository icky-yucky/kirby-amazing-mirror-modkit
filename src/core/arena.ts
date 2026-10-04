import { colToHsl } from "./color";
import { Level, readCollision, readMap, readTiles, saveCollision, saveMap, saveTileset, tileEntry } from "./levels";
import { Rom } from "./rom";

/*
 * Collision test arena: turns one room into a flat test floor with a labeled cell for each collision value, so every value can be
 * walked on and its behavior read off the screen. The label is two hex digits drawn from glyph tiles written over tiles the
 * arena itself does not use. Meant for throwaway test ROMs, not for real levels.
 */

const FONT: Record<string, string[]> = {
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
};

/** An 8x8 4bpp tile (32 bytes): a hex digit in color `fg` on a solid `bg` square. */
export function glyphTile(ch: string, fg: number, bg: number): Uint8Array {
  const rows = FONT[ch.toUpperCase()];
  if (!rows) throw new Error(`No glyph for "${ch}"`);
  const t = new Uint8Array(32);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const on = y < 7 && x >= 1 && x <= 5 && rows[y][x - 1] === "1";
      const idx = on ? fg : bg;
      t[y * 4 + (x >> 1)] |= x & 1 ? idx << 4 : idx;
    }
  }
  return t;
}

/** A thin vertical marker (2 pixels wide) in color `fg`; the rest transparent. */
export function poleTile(fg: number): Uint8Array {
  const t = new Uint8Array(32);
  for (let y = 0; y < 8; y++) t[y * 4 + 1] = fg | (fg << 4);     // pixels 2 and 3
  return t;
}

export interface ArenaCell { value: number; blockX: number; label: string }
export interface ArenaOptions { startBlock?: number; stepBlocks?: number; labelTileBase?: number }

/** Brightest and darkest non-transparent colors of palette row 0, to draw readable labels. */
function labelColors(rom: Rom, level: Level): { fg: number; bg: number } {
  let fg = 1, bg = 1, hi = -1, lo = 2;
  for (let c = 1; c < 16; c++) {
    const l = colToHsl(rom.u16(level.palPtr + c * 2))[2];
    if (l > hi) { hi = l; fg = c; }
    if (l < lo) { lo = l; bg = c; }
  }
  return { fg, bg };
}

/**
 * Rewrites the room as a test floor: sky everywhere, solid floor (collision 0x0D) in the bottom block rows, and one test cell per
 * value along the top floor row, each with a two-digit hex label and a pole above it. Returns where each value ended up.
 */
export function buildCollisionArena(rom: Rom, level: Level, values: number[], opts: ArenaOptions = {}): ArenaCell[] {
  const start = opts.startBlock ?? 6, step = opts.stepBlocks ?? 4, labelBase = opts.labelTileBase ?? 700;
  const coll = readCollision(rom, level);
  const map = readMap(rom, level);
  if (!coll || !map) throw new Error("Room has no readable map or collision");
  const floorRow = 9, tileFloorRow = floorRow * 2;
  const maxCells = Math.floor((coll.w - 2 - start) / step) + 1;
  if (values.length > maxCells) throw new Error(`Only ${maxCells} cells fit in this room (got ${values.length})`);

  // tiles: glyphs for 0-9 and A-F plus a pole, written over tiles the arena does not use
  const tiles = readTiles(rom, level).slice();
  const { fg, bg } = labelColors(rom, level);
  const digits = "0123456789ABCDEF";
  for (let i = 0; i < 16; i++) tiles.set(glyphTile(digits[i], fg, bg), (labelBase + i) * 32);
  tiles.set(poleTile(fg), (labelBase + 16) * 32);
  saveTileset(rom, level, tiles);

  // picture: copy the 4-column ground pattern from the room's left edge across the whole width
  const orig = map.entries;
  const out = new Uint16Array(orig.length);
  for (let r = tileFloorRow; r <= tileFloorRow + 3; r++) {
    for (let c = 0; c < level.w; c++) out[r * level.w + c] = orig[r * level.w + (c % 4)];
  }

  // physics: sky above, solid below
  const vals = new Uint8Array(coll.values.length);
  for (let r = floorRow; r < coll.h; r++) vals.fill(0x0d, r * coll.w, (r + 1) * coll.w);

  const cells: ArenaCell[] = [];
  values.forEach((v, i) => {
    const bx = start + i * step, label = v.toString(16).toUpperCase().padStart(2, "0");
    vals[floorRow * coll.w + bx] = v;
    const tx = bx * 2;
    out[(tileFloorRow - 4) * level.w + tx] = tileEntry(labelBase + digits.indexOf(label[0]), false, false, 0);
    out[(tileFloorRow - 4) * level.w + tx + 1] = tileEntry(labelBase + digits.indexOf(label[1]), false, false, 0);
    for (let r = tileFloorRow - 3; r < tileFloorRow; r++) out[r * level.w + tx] = tileEntry(labelBase + 16, false, false, 0);
    cells.push({ value: v, blockX: bx, label });
  });
  saveMap(rom, level, out);
  saveCollision(rom, level, vals);
  return cells;
}
