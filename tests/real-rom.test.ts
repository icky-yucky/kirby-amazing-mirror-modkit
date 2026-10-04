import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findLevels, readMap, saveMap, tileEntry } from "../src/core/levels";
import { lz77Decode, lz77Encode } from "../src/core/lz77";
import { Rom, applyIps } from "../src/core/rom";

/**
 * Integration tests against the real USA ROM. They only run when the ROM is available locally
 * (set KIRBY_ROM or keep it in the default folder); in CI and on other machines they are skipped.
 */
const path = process.env.KIRBY_ROM ?? "Kirby & the Amazing Mirror/Kirby & The Amazing Mirror (USA).gba";
const have = existsSync(path);

describe.skipIf(!have)("real ROM", () => {
  const bytes = have ? new Uint8Array(readFileSync(path)) : new Uint8Array(0);

  it("finds every room and decodes its map", () => {
    const rom = new Rom(bytes.slice());
    const levels = findLevels(rom);
    expect(levels.length).toBeGreaterThan(250);
    for (const l of levels) expect(readMap(rom, l), `scene ${l.tag}`).not.toBeNull();
  });

  it("recompresses every map without loss, usually as small as the game's own", () => {
    const rom = new Rom(bytes.slice());
    let fits = 0, total = 0;
    for (const l of findLevels(rom)) {
      const m = readMap(rom, l)!;
      const raw = new Uint8Array(m.entries.length * 2);
      m.entries.forEach((e, i) => { raw[i * 2] = e & 255; raw[i * 2 + 1] = e >> 8; });
      const enc = lz77Encode(raw);
      expect(Array.from(lz77Decode(enc, 0)!.data), `scene ${l.tag}`).toEqual(Array.from(raw));
      total++;
      if (enc.length <= m.used) fits++;
    }
    console.log(`maps that recompress into their original slot: ${fits}/${total}`);
    expect(fits / total).toBeGreaterThan(0.7);   // the rest relocate to free space, which is covered separately
  }, 60000);

  it("an edited map survives a save, an IPS export and a reload", () => {
    const rom = new Rom(bytes.slice());
    const l = findLevels(rom).find((x) => x.tag === 101)!;
    const m = readMap(rom, l)!;
    const edited = m.entries.slice();
    for (let x = 10; x < 14; x++) edited[10 * l.w + x] = tileEntry(0xb0 + (x - 10), false, false, 0);
    saveMap(rom, l, edited);
    const patched = new Rom(applyIps(bytes, rom.buildIps()));
    const l2 = findLevels(patched).find((x) => x.tag === 101)!;
    expect(Array.from(readMap(patched, l2)!.entries)).toEqual(Array.from(edited));
  });
});

describe.skipIf(!have)("real ROM collision", () => {
  const bytes = have ? new Uint8Array(readFileSync(path)) : new Uint8Array(0);

  it("every room's collision map decodes to (w/2) x (h/2) blocks", async () => {
    const { readCollision } = await import("../src/core/levels");
    const rom = new Rom(bytes.slice());
    const levels = findLevels(rom);
    const missing = levels.filter((l) => !readCollision(rom, l)).map((l) => l.tag);
    console.log(`rooms without collision data: ${missing.join(", ") || "none"}`);
    expect(missing.length).toBeLessThanOrEqual(2);
  });

  it("an edited collision map survives save, IPS export and reload", async () => {
    const { readCollision, saveCollision } = await import("../src/core/levels");
    const rom = new Rom(bytes.slice());
    const l = findLevels(rom).find((x) => x.tag === 101)!;
    const c = readCollision(rom, l)!;
    const v = c.values.slice();
    for (let x = 6; x < 14; x++) v[6 * c.w + x] = 0x0d;       // a solid ledge above the start of the forest stage
    saveCollision(rom, l, v);
    const patched = new Rom(applyIps(bytes, rom.buildIps()));
    const l2 = findLevels(patched).find((x) => x.tag === 101)!;
    expect(Array.from(readCollision(patched, l2)!.values)).toEqual(Array.from(v));
  });
});

describe.skipIf(!have)("real ROM arena", () => {
  const bytes = have ? new Uint8Array(readFileSync(path)) : new Uint8Array(0);

  it("builds a labeled arena and the cells read back at the right spots", async () => {
    const { buildCollisionArena } = await import("../src/core/arena");
    const { readCollision } = await import("../src/core/levels");
    const rom = new Rom(bytes.slice());
    const level = findLevels(rom).find((x) => x.tag === 101)!;
    const values = [0x05, 0x06, 0x48, 0xf2, 0x01];
    const cells = buildCollisionArena(rom, level, values);
    const patched = new Rom(applyIps(bytes, rom.buildIps()));
    const l2 = findLevels(patched).find((x) => x.tag === 101)!;
    const c = readCollision(patched, l2)!;
    cells.forEach((cell) => expect(c.values[9 * c.w + cell.blockX]).toBe(cell.value));
    expect(c.values[9 * c.w + 2]).toBe(0x0d);                    // normal floor between cells
    expect(c.values[8 * c.w + cells[0].blockX]).toBe(0);         // sky above
    expect(() => buildCollisionArena(new Rom(bytes.slice()), level, new Array(50).fill(5))).toThrow(/fit/);
  });
});
