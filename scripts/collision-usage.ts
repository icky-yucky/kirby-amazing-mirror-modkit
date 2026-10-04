// Lists, for every collision value, the rooms that use it, so examples (slopes, hazards, ...) can be reviewed in the editor.
// usage: npx vite-node scripts/collision-usage.ts "<rom.gba>" "<out.md>"
import { readFileSync, writeFileSync } from "node:fs";
import { collisionUsage, findLevels, levelName } from "../src/core/levels";
import { Rom } from "../src/core/rom";

const [romPath, out] = process.argv.slice(2);
const rom = new Rom(new Uint8Array(readFileSync(romPath)));
const levels = findLevels(rom);
const byTag = new Map(levels.map((l) => [l.tag, l]));
const usage = [...collisionUsage(rom, levels).values()].sort((a, b) => a.value - b.value);
const room = (tag: number) => { const l = byTag.get(tag)!; return `A${l.area}-R${String(l.room).padStart(2, "0")}`; };

const lines = [
  "# Collision values and the rooms that use them", "",
  "Room names are `A<area>-R<room>` (the editor's Levels tab: pick the area, then the room). Counts are blocks of 16x16 pixels.",
  "Rarest values first, since those are the most interesting to look at. Open the room, switch to the Collision layer, and pick the value",
  "in the editor to highlight where it sits.", "",
  "| value | blocks | rooms | where (most blocks first) |", "|---|---|---|---|",
];
for (const u of [...usage].sort((a, b) => a.rooms.length - b.rooms.length || a.value - b.value)) {
  const shown = u.rooms.slice(0, 14).map((r) => `${room(r.tag)} (${r.count})`).join(", ");
  lines.push(`| 0x${u.value.toString(16).padStart(2, "0")} | ${u.blocks} | ${u.rooms.length} | ${shown}${u.rooms.length > 14 ? `, +${u.rooms.length - 14} more` : ""} |`);
}
lines.push("", `${usage.length} distinct values across ${levels.length} rooms (${levelName(levels[0])} to ${levelName(levels[levels.length - 1])}).`);
writeFileSync(out, lines.join("\n") + "\n");
console.log(`wrote ${out}: ${usage.length} values`);
