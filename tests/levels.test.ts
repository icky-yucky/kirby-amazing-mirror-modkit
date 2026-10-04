import { describe, expect, it } from "vitest";
import { collisionUsage, findLevels, findFreeSpace, readCollision, readMap, readTiles, saveCollision, saveMap, saveTileset, tileEntry } from "../src/core/levels";
import { rleDecode, rleEncode } from "../src/core/rle";
import { lz77Decode, lz77Encode } from "../src/core/lz77";
import { Rom } from "../src/core/rom";

const rnd = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 0x100000000);

describe("lz77", () => {
  const roundtrip = (src: Uint8Array) => {
    const enc = lz77Encode(src);
    const dec = lz77Decode(enc, 0)!;
    expect(dec).not.toBeNull();
    expect(Array.from(dec.data)).toEqual(Array.from(src));
    expect(dec.used).toBe(enc.length);
    return enc;
  };
  it("round-trips noise, runs, patterns and tiny inputs", () => {
    const r = rnd(7);
    roundtrip(Uint8Array.from({ length: 3000 }, () => Math.floor(r() * 256)));
    roundtrip(new Uint8Array(5000).fill(0xab));
    roundtrip(Uint8Array.from({ length: 4000 }, (_, i) => (i % 7) * 3));
    roundtrip(Uint8Array.from([1]));
    roundtrip(Uint8Array.from([1, 2]));
    roundtrip(Uint8Array.from({ length: 9000 }, (_, i) => (i % 4 === 0 ? i & 255 : 0)));
  });
  it("actually compresses repetitive data", () => {
    const enc = roundtrip(new Uint8Array(8000).fill(7));
    expect(enc.length).toBeLessThan(1000);   // the format tops out near 9:1 (18 bytes per 2-byte match)
  });
  it("never emits a distance of 1 (unsafe for the BIOS VRAM decompressor)", () => {
    const enc = lz77Encode(new Uint8Array(100).fill(9));
    let ip = 4, count = 0;
    const size = enc[1] | (enc[2] << 8);
    let op = 0;
    while (op < size) {
      const flags = enc[ip++];
      for (let b = 7; b >= 0 && op < size; b--) {
        if (flags & (1 << b)) {
          const b0 = enc[ip++], b1 = enc[ip++];
          expect((((b0 & 15) << 8) | b1) + 1).toBeGreaterThanOrEqual(2);
          op += (b0 >> 4) + 3;
          count++;
        } else { ip++; op++; }
      }
    }
    expect(count).toBeGreaterThan(0);
  });
  it("rejects data without the LZ77 header", () => {
    expect(lz77Decode(Uint8Array.from([0x11, 4, 0, 0, 0]), 0)).toBeNull();
  });
});

// ---- a tiny ROM with one level (scene tag 2) laid out like the real game ----
const T = { scene: 0x1000, tileAssets: 0x2000, palAssets: 0x2100, collIndexBase: 3 };
const MAP = 0x7000, TILES = 0x4000, PAL = 0x5000, FREE = 0x10000;

function buildLevelRom(w = 6, h = 4): { rom: Rom; entries: Uint16Array; coll: Uint8Array } {
  const buf = new Uint8Array(0x30000);
  const dv = new DataView(buf.buffer);
  const w32 = (o: number, v: number) => dv.setUint32(o, v >>> 0, true);
  const ptr = (o: number) => 0x08000000 + o;
  buf.fill(0xff, FREE, 0x30000);
  // scene entry for tag 2: tileset asset 0, palette asset 0
  dv.setUint16(T.scene + 2 * 40 + 0x14, 0, true);
  dv.setUint16(T.scene + 2 * 40 + 0x16, 0, true);
  // tile asset descriptor at 0x3000: first word points at the LZ tiles
  w32(T.tileAssets, ptr(0x3000));
  w32(0x3000, ptr(TILES));
  buf.set(lz77Encode(Uint8Array.from({ length: 64 }, (_, i) => i)), TILES);
  // palette asset: 2 raw rows then a descriptor right after them
  for (let i = 0; i < 32; i++) dv.setUint16(PAL + i * 2, (i * 37) & 0x7fff, true);
  w32(T.palAssets, ptr(PAL + 64));
  w32(PAL + 64, ptr(PAL));
  // map descriptor at 0x6000: [x][w|h<<16][0 x5][ptr][tag<<16]
  w32(0x6004, w | (h << 16));
  w32(0x6000 + 28, ptr(MAP));
  w32(0x6000 + 32, 2 << 16);
  // collision asset: palette-table entry (collIndexBase + id 0) -> [ptr to RLE data][ptr to its end]
  const coll = Uint8Array.from({ length: (w >> 1) * (h >> 1) }, (_, i) => (i % 3 === 0 ? 0x0d : 0));
  const ce = rleEncode(coll);
  w32(T.palAssets + 3 * 4, ptr(0x8000));
  w32(0x8000, ptr(0x8100));
  w32(0x8004, ptr(0x8100 + ((ce.length + 3) & ~3)));
  buf.set(ce, 0x8100);
  const entries = Uint16Array.from({ length: w * h }, (_, i) => tileEntry(i % 2, false, false, 0));
  const raw = new Uint8Array(entries.length * 2);
  entries.forEach((e, i) => { raw[i * 2] = e & 255; raw[i * 2 + 1] = e >> 8; });
  buf.set(lz77Encode(raw), MAP);
  return { rom: new Rom(buf, "level.gba"), entries, coll };
}

describe("levels", () => {
  it("finds the level with its tileset and palette", () => {
    const { rom } = buildLevelRom();
    const lv = findLevels(rom, T);
    expect(lv).toHaveLength(1);
    expect(lv[0]).toMatchObject({ tag: 2, area: 0, room: 2, w: 6, h: 4, tilesOff: TILES, palPtr: PAL, palRows: 2 });
  });
  it("reads the map entries", () => {
    const { rom, entries } = buildLevelRom();
    const lv = findLevels(rom, T)[0];
    expect(Array.from(readMap(rom, lv)!.entries)).toEqual(Array.from(entries));
  });
  it("saves an edit in place when it compresses to no more than the original", () => {
    const { rom, entries } = buildLevelRom(40, 20);
    const lv = findLevels(rom, T)[0];
    entries.fill(tileEntry(3, false, false, 1));
    const r = saveMap(rom, lv, entries);
    expect(r.relocated).toBe(false);
    expect(r.off).toBe(MAP);
    expect(Array.from(readMap(rom, lv)!.entries)).toEqual(Array.from(entries));
  });
  it("relocates into free space when the edit no longer fits, and undo restores everything", () => {
    const { rom, entries } = buildLevelRom(40, 20);
    const lv = findLevels(rom, T)[0];
    const r0 = rnd(3);
    const noisy = Uint16Array.from({ length: entries.length }, () => Math.floor(r0() * 65536));
    const before = Array.from(rom.data);
    const r = saveMap(rom, lv, noisy);
    expect(r.relocated).toBe(true);
    expect(r.off).toBeGreaterThanOrEqual(FREE);
    expect(rom.u32(lv.desc + 28)).toBe(0x08000000 + r.off);
    expect(Array.from(readMap(rom, lv)!.entries)).toEqual(Array.from(noisy));
    rom.undo();
    expect(Array.from(rom.data)).toEqual(before);
    expect(Array.from(readMap(rom, lv)!.entries)).toEqual(Array.from(entries));
  });
  it("reports when there is no free space", () => {
    const { rom, entries } = buildLevelRom(40, 20);
    rom.data.fill(0, FREE);
    const lv = findLevels(rom, T)[0];
    const r0 = rnd(5);
    const noisy = Uint16Array.from({ length: entries.length }, () => Math.floor(r0() * 65536));
    expect(findFreeSpace(rom, 100)).toBe(-1);
    expect(() => saveMap(rom, lv, noisy)).toThrow(/free space/);
  });
  it("builds tile entries", () => {
    expect(tileEntry(5, true, false, 3)).toBe(5 | 0x400 | 0x3000);
    expect(tileEntry(1023, false, true, 15)).toBe(1023 | 0x800 | 0xf000);
  });
});

describe("rle", () => {
  it("round-trips runs, literals and long runs", () => {
    const r = rnd(11);
    for (const src of [
      new Uint8Array(500).fill(13),
      Uint8Array.from({ length: 300 }, () => Math.floor(r() * 4)),
      Uint8Array.from({ length: 1000 }, (_, i) => (i % 200 < 150 ? 0 : i & 255)),
      Uint8Array.from([5]), Uint8Array.from([5, 5]), Uint8Array.from([5, 5, 5]),
    ]) {
      const enc = rleEncode(src);
      const dec = rleDecode(enc, 0)!;
      expect(Array.from(dec.data)).toEqual(Array.from(src));
      expect(dec.used).toBe(enc.length);
    }
  });
  it("compresses runs", () => {
    expect(rleEncode(new Uint8Array(1000).fill(0)).length).toBeLessThan(40);
  });
  it("rejects the wrong header", () => {
    expect(rleDecode(Uint8Array.from([0x10, 4, 0, 0, 1, 2, 3, 4]), 0)).toBeNull();
  });
});

describe("collision", () => {
  it("reads a room's collision map through the scene entry", () => {
    const { rom, coll } = buildLevelRom(40, 20);
    const lv = findLevels(rom, T)[0];
    const c = readCollision(rom, lv, T)!;
    expect(c).toMatchObject({ w: 20, h: 10 });
    expect(Array.from(c.values)).toEqual(Array.from(coll));
  });
  it("saves collision in place when it fits", () => {
    const { rom, coll } = buildLevelRom(40, 20);
    const lv = findLevels(rom, T)[0];
    const v = coll.slice();
    v.fill(0x0d);
    const r = saveCollision(rom, lv, v, T);
    expect(r.relocated).toBe(false);
    expect(Array.from(readCollision(rom, lv, T)!.values)).toEqual(Array.from(v));
  });
  it("relocates collision that grew and fixes both descriptor pointers; undo restores", () => {
    const { rom } = buildLevelRom(40, 20);
    const lv = findLevels(rom, T)[0];
    saveCollision(rom, lv, new Uint8Array(200), T);          // shrink first so the next, noisy save has to move
    rom.clearUndo();
    const before = Array.from(rom.data);
    const r0 = rnd(21);
    const noisy = Uint8Array.from({ length: 200 }, () => Math.floor(r0() * 200) + 1);
    const r = saveCollision(rom, lv, noisy, T);
    expect(r.relocated).toBe(true);
    const c = readCollision(rom, lv, T)!;
    expect(c.off).toBe(r.off);
    expect(Array.from(c.values)).toEqual(Array.from(noisy));
    expect(rom.u32(c.desc + 4)).toBeGreaterThan(rom.u32(c.desc));
    rom.undo();
    expect(Array.from(rom.data)).toEqual(before);
  });
});

describe("tileset save", () => {
  it("saves a changed tileset in place when it fits", () => {
    const { rom } = buildLevelRom();
    const lv = findLevels(rom, T)[0];
    const tiles = readTiles(rom, lv).slice();
    tiles.fill(0, 0, 32);
    const r = saveTileset(rom, lv, tiles);
    expect(Array.from(readTiles(rom, lv))).toEqual(Array.from(tiles));
    expect(r.original).toBeGreaterThan(0);
  });
  it("relocates a tileset that grew, updating the descriptor pointers; undo restores", () => {
    const { rom } = buildLevelRom();
    const lv = findLevels(rom, T)[0];
    const before = Array.from(rom.data);
    const r0 = rnd(77);
    const noisy = Uint8Array.from({ length: 64 * 32 }, () => Math.floor(r0() * 256));
    const r = saveTileset(rom, lv, noisy);
    expect(r.relocated).toBe(true);
    expect(rom.u32(lv.tilesDesc)).toBe(0x08000000 + r.off);
    expect(rom.u32(lv.tilesDesc + 4)).toBeGreaterThan(rom.u32(lv.tilesDesc));
    const lv2 = findLevels(rom, T)[0];
    expect(Array.from(readTiles(rom, lv2))).toEqual(Array.from(noisy));
    rom.undo();
    expect(Array.from(rom.data)).toEqual(before);
  });
});

describe("arena glyphs", () => {
  it("draws a digit in two colors inside an 8x8 tile", async () => {
    const { glyphTile, poleTile } = await import("../src/core/arena");
    const t = glyphTile("A", 6, 2);
    expect(t).toHaveLength(32);
    const px = (x: number, y: number) => (x & 1 ? t[y * 4 + (x >> 1)] >> 4 : t[y * 4 + (x >> 1)] & 15);
    const colors = new Set<number>();
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) colors.add(px(x, y));
    expect([...colors].sort()).toEqual([2, 6]);
    expect(px(0, 0)).toBe(2);             // background in the corner
    expect(() => glyphTile("Z", 1, 0)).toThrow();
    expect(poleTile(5).some((b) => b !== 0)).toBe(true);
  });
});

describe("collision usage", () => {
  it("counts blocks and rooms per value, most blocks first", () => {
    const { rom, coll } = buildLevelRom(40, 20);
    const levels = findLevels(rom, T);
    const u = collisionUsage(rom, levels, T);
    const expected13 = coll.filter((v) => v === 0x0d).length;
    expect(u.get(0x0d)!.blocks).toBe(expected13);
    expect(u.get(0x0d)!.rooms).toEqual([{ tag: 2, count: expected13 }]);
    expect(u.get(0)!.blocks).toBe(coll.length - expected13);
    expect(u.has(0x55)).toBe(false);
  });
});

describe("collision numbers and colors", () => {
  it("numbers non-empty values ascending, so 1 to 15 match the hex values", async () => {
    const { collisionOrder } = await import("../src/core/collcolor");
    const order = collisionOrder([0, 0x0d, 5, 5, 0x14, 1, 0x48, 0x0f]);
    expect(order).toEqual([1, 5, 0x0d, 0x0f, 0x14, 0x48]);
    expect(collisionOrder([0])).toEqual([]);
  });
  it("gives every value its own color, solid ground red, empty none", async () => {
    const { collisionOrder, collisionStyle, cssColor } = await import("../src/core/collcolor");
    const order = collisionOrder(Array.from({ length: 80 }, (_, i) => i));      // 79 non-empty values
    const colors = new Set<string>();
    for (const v of order) colors.add(cssColor(collisionStyle(v, order)!));
    expect(colors.size).toBe(order.length);
    expect(collisionStyle(0, order)).toBeNull();
    expect(collisionStyle(0x0d, order)!.h).toBe(0);
    expect(collisionStyle(0x0d, order)!.number).toBe(order.indexOf(0x0d) + 1);
    expect(collisionStyle(200, [1, 2])).not.toBeNull();                          // values outside the list still get a color
  });
});
