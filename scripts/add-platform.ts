// Example of using the core library from Node: adds a floating grass platform to area 1, room 1 (tiles AND collision)
// and writes a new ROM.   usage: npx vite-node scripts/add-platform.ts "<rom.gba>" "<out.gba>"
import { readFileSync, writeFileSync } from "node:fs";
import { findLevels, readCollision, readMap, saveCollision, saveMap } from "../src/core/levels";
import { Rom } from "../src/core/rom";

const [inPath, outPath] = process.argv.slice(2);
const rom = new Rom(new Uint8Array(readFileSync(inPath)), "rom.gba");
const level = findLevels(rom).find((l) => l.tag === 101)!;

// picture: reuse the grass-top and dirt tiles the room already draws; tile rows 12-13 are collision block row 6
const entries = readMap(rom, level)!.entries.slice();
const top = [0x00b0, 0x00b1, 0x00b2, 0x00b3], under = [0x00d0, 0x0016, 0x00d2, 0x00d3];
for (let x = 12; x < 28; x++) {
  entries[12 * level.w + x] = top[x % 4];
  entries[13 * level.w + x] = under[x % 4];
}
const a = saveMap(rom, level, entries);

// physics: the same area is solid (collision blocks are 16x16 pixels, so tile columns 12-27 are block columns 6-13)
const coll = readCollision(rom, level)!;
const values = coll.values.slice();
for (let bx = 6; bx < 14; bx++) values[6 * coll.w + bx] = 0x0d;
const b = saveCollision(rom, level, values);

console.log(`tiles: ${a.relocated ? "relocated to 0x" + a.off.toString(16) : "in place"}, ${a.bytes} bytes (was ${a.original})`);
console.log(`collision: ${b.relocated ? "relocated to 0x" + b.off.toString(16) : "in place"}, ${b.bytes} bytes (was ${b.original})`);
writeFileSync(outPath, rom.data);
