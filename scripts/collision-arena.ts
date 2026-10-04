// Builds collision test arenas: ROMs where area 1, room 1 is a flat floor with one labeled cell per collision value.
// usage: npx vite-node scripts/collision-arena.ts "<rom.gba>" "<out folder>"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { buildCollisionArena } from "../src/core/arena";
import { findLevels, readCollision } from "../src/core/levels";
import { Rom } from "../src/core/rom";

const [inPath, outDir] = process.argv.slice(2);
const bytes = new Uint8Array(readFileSync(inPath));
mkdirSync(outDir, { recursive: true });

const base = new Rom(bytes.slice());
const seen = new Set<number>();
for (const l of findLevels(base)) readCollision(base, l)?.values.forEach((v) => seen.add(v));
// known from the emulator test: these kill Kirby, so they go last (in the final arena)
const deadly = new Set([0x01, 0x02, 0x03, 0x04, 0x09, 0x0a, 0x16, 0x17]);
const all = [...seen].filter((v) => v !== 0 && v !== 0x0d).sort((a, b) => a - b);
const values = [...all.filter((v) => !deadly.has(v)), ...all.filter((v) => deadly.has(v))];

const PER = 20;
const lines = [
  "# Collision test arenas", "",
  "Open arenaN.gba, start a new game and go through the first mirror. The forest stage is now a flat floor.",
  "Walk right: each labeled cell is one collision value (the two hex digits above it). Note what each does.", "",
];
for (let a = 0; a * PER < values.length; a++) {
  const rom = new Rom(bytes.slice());
  const level = findLevels(rom).find((l) => l.tag === 101)!;
  const chunk = values.slice(a * PER, (a + 1) * PER);
  const cells = buildCollisionArena(rom, level, chunk);
  writeFileSync(`${outDir}/arena${a + 1}.gba`, rom.data);
  lines.push(`## arena${a + 1}.gba`, "", "| cell | value | what happened |", "|---|---|---|");
  cells.forEach((c, i) => lines.push(`| ${i + 1} | ${c.label} |  |`));
  lines.push("");
  console.log(`arena${a + 1}.gba: ${cells.map((c) => c.label).join(" ")}`);
}
writeFileSync(`${outDir}/README.md`, lines.join("\n"));
