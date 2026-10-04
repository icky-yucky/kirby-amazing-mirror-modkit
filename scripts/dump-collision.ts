// Writes a room's collision map (decoded, row-major bytes) to a file; used by the emulator test to verify it is in the right room.
// usage: npx vite-node scripts/dump-collision.ts "<rom.gba>" 101 "<out.bin>"
import { readFileSync, writeFileSync } from "node:fs";
import { findLevels, readCollision } from "../src/core/levels";
import { Rom } from "../src/core/rom";

const [romPath, tag, out] = process.argv.slice(2);
const rom = new Rom(new Uint8Array(readFileSync(romPath)));
const level = findLevels(rom).find((l) => l.tag === Number(tag))!;
writeFileSync(out, readCollision(rom, level)!.values);
console.log(`wrote ${out}`);
