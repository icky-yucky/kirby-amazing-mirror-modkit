// Builds test ROMs that lay one collision value per spot along the floor of area 1, room 1, so each value can be
// walked on and its behavior recorded. A green "flag" of grass tiles marks every 5th test spot.
// usage: npx vite-node scripts/collision-strips.ts "<rom.gba>" "<out folder>"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { findLevels, readCollision, readMap, saveCollision, saveMap } from "../src/core/levels";
import { Rom } from "../src/core/rom";

const [inPath, outDir] = process.argv.slice(2);
const bytes = new Uint8Array(readFileSync(inPath));
mkdirSync(outDir, { recursive: true });

// every collision value used anywhere in the game, except the two we already understand
const base = new Rom(bytes.slice());
const seen = new Set<number>();
for (const l of findLevels(base)) readCollision(base, l)?.values.forEach((v) => seen.add(v));
const values = [...seen].filter((v) => v !== 0 && v !== 0x0d).sort((a, b) => a - b);

const PER = 30, START = 8, STEP = 2, FLOOR_ROW = 9;
const lines = ["# Collision test strips", "", "Walk right along the floor of area 1, room 1. Each spot is one 16x16 block of the floor replaced",
  "by the listed value. A green flag marks every 5th spot. Spots are 2 blocks (32 pixels) apart with normal floor between.", ""];
for (let s = 0; s * PER < values.length; s++) {
  const rom = new Rom(bytes.slice());
  const level = findLevels(rom).find((l) => l.tag === 101)!;
  const coll = readCollision(rom, level)!;
  const vals = coll.values.slice();
  const map = readMap(rom, level)!.entries.slice();
  const chunk = values.slice(s * PER, (s + 1) * PER);
  lines.push(`## strip${s + 1}.gba`, "", "| spot | value | block x | what happened |", "|---|---|---|---|");
  chunk.forEach((v, i) => {
    const bx = START + i * STEP;
    vals[FLOOR_ROW * coll.w + bx] = v;
    lines.push(`| ${i + 1} | 0x${v.toString(16).padStart(2, "0")} | ${bx} |  |`);
    if ((i + 1) % 5 === 0) for (let r = 15; r <= 17; r++) map[r * level.w + bx * 2] = 0x00b0;   // flag above the spot
  });
  lines.push("");
  saveMap(rom, level, map);
  saveCollision(rom, level, vals);
  writeFileSync(`${outDir}/strip${s + 1}.gba`, rom.data);
  console.log(`strip${s + 1}.gba: ${chunk.length} values (${chunk.map((v) => v.toString(16)).join(" ")})`);
}
writeFileSync(`${outDir}/README.md`, lines.join("\n"));
