// Lists, for every collision value, its number and the rooms that use it, so examples (slopes, hazards, ...) can be reviewed in the editor.
// usage: npx vite-node scripts/collision-usage.ts "<rom.gba>" "<out.md>"
import { readFileSync, writeFileSync } from "node:fs";
import { collisionOrder } from "../src/core/collcolor";
import { collisionUsage, findLevels } from "../src/core/levels";
import { Rom } from "../src/core/rom";

const [romPath, out] = process.argv.slice(2);
const rom = new Rom(new Uint8Array(readFileSync(romPath)));
const levels = findLevels(rom);
const byTag = new Map(levels.map((l) => [l.tag, l]));
const usage = collisionUsage(rom, levels);
const order = collisionOrder(usage.keys());
const room = (tag: number) => { const l = byTag.get(tag)!; return `A${l.area}-R${String(l.room).padStart(2, "0")}`; };

const lines = [
  "# Collision values and the rooms that use them", "",
  "Each value has a **number** (#1 to #" + order.length + ", the non-empty values in ascending order; #1 to #15 equal the hex values 01 to 0F).",
  "The same number and color appear on the value buttons and on the map overlay in the editor's Levels tab, Collision layer.",
  "Room names are `A<area>-R<room>`. Counts are blocks of 16x16 pixels. Add what you learn to the last column.", "",
  "| # | hex | blocks | rooms | where (most blocks first) | what it does |", "|---|---|---|---|---|---|",
];
order.forEach((v, i) => {
  const u = usage.get(v)!;
  const shown = u.rooms.slice(0, 12).map((r) => `${room(r.tag)} (${r.count})`).join(", ");
  lines.push(`| ${i + 1} | 0x${v.toString(16).padStart(2, "0")} | ${u.blocks} | ${u.rooms.length} | ${shown}${u.rooms.length > 12 ? `, +${u.rooms.length - 12} more` : ""} | |`);
});
lines.push("", `${order.length} non-empty values across ${levels.length} rooms. Value 0 is empty.`);
writeFileSync(out, lines.join("\n") + "\n");
console.log(`wrote ${out}: ${order.length} values`);
