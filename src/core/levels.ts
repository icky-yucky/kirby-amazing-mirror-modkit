import { Rom, Write } from "./rom";
import { lz77Decode, lz77Encode } from "./lz77";
import { rleDecode, rleEncode } from "./rle";

/*
 * Level (room) tile layers. Verified on the USA ROM:
 *  - every map asset has a 9-word descriptor [x][w | h<<16][0 x5][ptr to LZ77 map][tag<<16];
 *    the tag is the scene number (area * 100 + room)
 *  - a scene table (40-byte entries, indexed by scene number) holds the tileset asset id (u16 at +0x14)
 *    and the palette asset id (u16 at +0x16); two pointer tables turn ids into asset descriptors
 *  - the map is w*h 16-bit tile entries: tile 0-9, hflip 10, vflip 11, palette row 12-15
 */

export interface LevelTables { scene: number; tileAssets: number; palAssets: number; collIndexBase: number }
/** USA ROM (B8KE). */
export const USA_TABLES: LevelTables = { scene: 0x9331ac, tileAssets: 0xd6499c, palAssets: 0xd63288, collIndexBase: 42 };

export interface Level {
  tag: number;
  area: number;
  room: number;
  desc: number;          // ROM offset of the map descriptor
  w: number;
  h: number;
  tilesOff: number;      // LZ77 tile data
  tilesDesc: number;     // descriptor: [ptr to the tile data][ptr to its end][end + 4]
  palPtr: number;        // BG palette rows (raw 15-bit colors)
  palRows: number;
}

export const levelName = (l: Pick<Level, "area" | "room">): string => `Area ${l.area}, room ${String(l.room).padStart(2, "0")}`;

/** Pointer stored in the map descriptor, and the decoded map entries it points at. */
export function readMap(rom: Rom, level: Level): { entries: Uint16Array; off: number; used: number } | null {
  const ptr = rom.u32(level.desc + 28);
  if (!rom.isPtr(ptr)) return null;
  const off = ptr & 0xffffff;
  const r = lz77Decode(rom.data, off);
  if (!r || r.data.length !== level.w * level.h * 2) return null;
  const entries = new Uint16Array(level.w * level.h);
  for (let i = 0; i < entries.length; i++) entries[i] = r.data[i * 2] | (r.data[i * 2 + 1] << 8);
  return { entries, off, used: r.used };
}

export function readTiles(rom: Rom, level: Level): Uint8Array {
  return lz77Decode(rom.data, level.tilesOff)?.data ?? new Uint8Array(0);
}

/** Finds every room with a map, tileset and palette. */
export function findLevels(rom: Rom, t: LevelTables = USA_TABLES): Level[] {
  const levels: Level[] = [];
  const seen = new Set<number>();
  const d = rom.data;
  for (let a = 0; a + 36 <= rom.length; a += 4) {
    const tg = rom.u32(a + 32);
    if (tg === 0 || (tg & 0xffff) !== 0) continue;
    if (!rom.isPtr(rom.u32(a + 28))) continue;
    if (rom.u32(a + 8) | rom.u32(a + 12) | rom.u32(a + 16) | rom.u32(a + 20) | rom.u32(a + 24)) continue;
    const wh = rom.u32(a + 4), w = wh & 0xffff, h = wh >>> 16;
    if (!w || !h || w * h > 0x8000) continue;
    const tag = tg >>> 16;
    if (seen.has(tag)) continue;
    const m = lz77Decode(d, rom.u32(a + 28) & 0xffffff);
    if (!m || m.data.length !== w * h * 2) continue;
    const info = sceneAssets(rom, tag, t);
    if (!info) continue;
    seen.add(tag);
    levels.push({ tag, area: Math.floor(tag / 100), room: tag % 100, desc: a, w, h, ...info });
  }
  return levels.sort((x, y) => x.tag - y.tag);
}

function sceneAssets(rom: Rom, tag: number, t: LevelTables): Pick<Level, "tilesOff" | "tilesDesc" | "palPtr" | "palRows"> | null {
  const a = t.scene + tag * 40;
  if (a + 40 > rom.length) return null;
  const id1 = rom.u16(a + 0x14), id2 = rom.u16(a + 0x16);
  if (id1 === 0xffff || id2 === 0xffff) return null;
  const p1 = rom.u32(t.tileAssets + id1 * 4), p2 = rom.u32(t.palAssets + id2 * 4);
  if (!rom.isPtr(p1) || !rom.isPtr(p2)) return null;
  const d1 = p1 & 0xffffff, d2 = p2 & 0xffffff;
  const tp = rom.u32(d1), pp = rom.u32(d2);
  if (!rom.isPtr(tp) || !rom.isPtr(pp)) return null;
  const tilesOff = tp & 0xffffff;
  if (rom.data[tilesOff] !== 0x10) return null;
  const palPtr = pp & 0xffffff;
  const palRows = Math.max(1, Math.min(16, Math.floor((d2 - palPtr) / 32)));
  return { tilesOff, tilesDesc: d1, palPtr, palRows };
}

/** Compressed-data padding at the end of the ROM is 0xFF; find a run of it big enough for `need` bytes. */
export function findFreeSpace(rom: Rom, need: number): number {
  const margin = 16;
  let run = 0;
  for (let i = rom.length - 1; i >= 0; i--) {
    if (rom.data[i] === 0xff) {
      run++;
      continue;
    }
    // run of 0xFF ends at i + 1 .. i + run
    if (run >= need + margin * 2) return (i + 1 + margin + 3) & ~3;
    run = 0;
  }
  return -1;
}

export interface SaveResult { relocated: boolean; off: number; bytes: number; original: number }

/**
 * Recompresses the map and writes it back. It goes in place when it fits in the original slot,
 * otherwise it is relocated into free space at the end of the ROM and every pointer to the old copy
 * is updated.
 */
export function saveMap(rom: Rom, level: Level, entries: Uint16Array): SaveResult {
  const cur = readMap(rom, level);
  if (!cur) throw new Error("Could not read the current map from the ROM");
  const raw = new Uint8Array(entries.length * 2);
  for (let i = 0; i < entries.length; i++) { raw[i * 2] = entries[i] & 255; raw[i * 2 + 1] = entries[i] >> 8; }
  const enc = lz77Encode(raw);
  const writes: Write[] = [];
  let off = cur.off, relocated = false;
  if (enc.length > cur.used) {
    const free = findFreeSpace(rom, enc.length);
    if (free < 0) throw new Error("Not enough free space left in the ROM for this edit");
    off = free;
    relocated = true;
    const oldPtr = 0x08000000 + cur.off, newPtr = 0x08000000 + free;
    for (let a = 0; a + 4 <= rom.length; a += 4) {
      if (rom.u32(a) === oldPtr) for (let k = 0; k < 4; k++) writes.push({ off: a + k, val: (newPtr >> (8 * k)) & 255 });
    }
  }
  for (let i = 0; i < enc.length; i++) writes.push({ off: off + i, val: enc[i] });
  rom.writeBytes(writes);
  return { relocated, off, bytes: enc.length, original: cur.used };
}

export const tileEntry = (tile: number, hflip: boolean, vflip: boolean, palRow: number): number =>
  (tile & 1023) | (hflip ? 1 << 10 : 0) | (vflip ? 1 << 11 : 0) | ((palRow & 15) << 12);

// ---- collision ----
/*
 * Each room also has a collision map: one byte per 16x16-pixel block (half the tile map's resolution),
 * stored with BIOS run-length compression. The scene entry's u16 at +0x18 is the collision id; the same
 * asset table used for palettes holds it at index (collIndexBase + id). That entry points at a two-word
 * descriptor [ptr to RLE data][ptr to the end of that data].
 * Values seen across the game: 0 empty, 0x0D solid, 5-8 slopes (shape only); the rest are not yet understood.
 */
export interface CollisionInfo { values: Uint8Array; w: number; h: number; off: number; used: number; desc: number }

function collisionDesc(rom: Rom, tag: number, t: LevelTables): number {
  const a = t.scene + tag * 40 + 0x18;
  if (a + 2 > rom.length) return -1;
  const id = rom.u16(a);
  if (id === 0xffff) return -1;
  const p = rom.u32(t.palAssets + (t.collIndexBase + id) * 4);
  return rom.isPtr(p) ? p & 0xffffff : -1;
}

export function readCollision(rom: Rom, level: Level, t: LevelTables = USA_TABLES): CollisionInfo | null {
  const desc = collisionDesc(rom, level.tag, t);
  if (desc < 0) return null;
  const ptr = rom.u32(desc);
  if (!rom.isPtr(ptr)) return null;
  const off = ptr & 0xffffff;
  const w = level.w >> 1, h = level.h >> 1;
  const r = rleDecode(rom.data, off);
  if (!r || r.data.length !== w * h) return null;
  return { values: r.data, w, h, off, used: r.used, desc };
}

/** Recompresses and writes the collision map; relocates into free space if it grew. */
export function saveCollision(rom: Rom, level: Level, values: Uint8Array, t: LevelTables = USA_TABLES): SaveResult {
  const cur = readCollision(rom, level, t);
  if (!cur) throw new Error("Could not read the current collision map from the ROM");
  const enc = rleEncode(values);
  const writes: Write[] = [];
  const put32 = (a: number, v: number): void => { for (let k = 0; k < 4; k++) writes.push({ off: a + k, val: (v >> (8 * k)) & 255 }); };
  let off = cur.off, relocated = false;
  if (enc.length > cur.used) {
    const free = findFreeSpace(rom, enc.length + 4);
    if (free < 0) throw new Error("Not enough free space left in the ROM for this edit");
    off = free;
    relocated = true;
    const oldPtr = 0x08000000 + cur.off;
    for (let a = 0; a + 4 <= rom.length; a += 4) if (rom.u32(a) === oldPtr) put32(a, 0x08000000 + free);
    put32(cur.desc + 4, 0x08000000 + free + ((enc.length + 3) & ~3));   // end-of-data pointer
  }
  for (let i = 0; i < enc.length; i++) writes.push({ off: off + i, val: enc[i] });
  rom.writeBytes(writes);
  return { relocated, off, bytes: enc.length, original: cur.used };
}

/**
 * Recompresses and writes the room's tileset (8x8 4bpp tiles, 32 bytes each). In place when it fits, otherwise relocated into
 * free space; the descriptor's end-of-data pointers and every other reference to the old copy are updated.
 */
export function saveTileset(rom: Rom, level: Level, tiles: Uint8Array): SaveResult {
  const cur = lz77Decode(rom.data, level.tilesOff);
  if (!cur) throw new Error("Could not read the current tileset from the ROM");
  const enc = lz77Encode(tiles);
  const writes: Write[] = [];
  const put32 = (a: number, v: number): void => { for (let k = 0; k < 4; k++) writes.push({ off: a + k, val: (v >> (8 * k)) & 255 }); };
  let off = level.tilesOff, relocated = false;
  if (enc.length > cur.used) {
    const free = findFreeSpace(rom, enc.length + 8);
    if (free < 0) throw new Error("Not enough free space left in the ROM for this edit");
    off = free;
    relocated = true;
    const oldPtr = 0x08000000 + level.tilesOff;
    for (let a = 0; a + 4 <= rom.length; a += 4) if (rom.u32(a) === oldPtr) put32(a, 0x08000000 + free);
    const end = 0x08000000 + free + ((enc.length + 3) & ~3);
    put32(level.tilesDesc + 4, end);
    put32(level.tilesDesc + 8, end + 4);
  }
  for (let i = 0; i < enc.length; i++) writes.push({ off: off + i, val: enc[i] });
  rom.writeBytes(writes);
  return { relocated, off, bytes: enc.length, original: cur.used };
}
