// Example of using the core library from Node: adds a floating grass platform to area 1, room 1 and writes a new ROM.
// usage: npx vite-node scripts/add-platform.ts "<rom.gba>" "<out.gba>"
import { readFileSync, writeFileSync } from "node:fs";
import { findLevels, readMap, saveMap } from "../src/core/levels";
import { Rom } from "../src/core/rom";

const [inPath, outPath] = process.argv.slice(2);
const rom = new Rom(new Uint8Array(readFileSync(inPath)), "rom.gba");
const level = findLevels(rom).find((l) => l.tag === 101)!;
const entries = readMap(rom, level)!.entries.slice();
// reuse the grass-top and dirt tiles the room already draws (rows 18 and 19 at the left edge)
const top = [0x00b0, 0x00b1, 0x00b2, 0x00b3], under = [0x00d0, 0x0016, 0x00d2, 0x00d3];
for (let x = 12; x < 28; x++) {
  entries[13 * level.w + x] = top[x % 4];
  entries[14 * level.w + x] = under[x % 4];
}
const r = saveMap(rom, level, entries);
console.log(`saved: ${r.relocated ? "relocated to 0x" + r.off.toString(16) : "in place"}, ${r.bytes} bytes (was ${r.original})`);
writeFileSync(outPath, rom.data);
