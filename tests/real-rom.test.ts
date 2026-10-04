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
