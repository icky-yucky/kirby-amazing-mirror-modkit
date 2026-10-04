import { describe, expect, it } from "vitest";
import {
  colToHex, colToRgb, grayscale, hslAdjust, invert, parseHexColor, rgbToCol, swapChannels,
} from "../src/core/color";
import { Project, SHARED_ROW, findColorTable } from "../src/core/project";
import { Rom, applyIps } from "../src/core/rom";
import { findDb, loadDb, renderFrame } from "../src/core/sprites";
import { PAL_BANK, SCRIPTS, TILE_BANK, buildRom, buildRomBytes } from "./fixture";

describe("color", () => {
  it("round-trips 15-bit colors through RGB", () => {
    for (const v of [0, 0x7fff, 0x625f, 0x1234, 0x03e0, 0x001f, 0x7c00]) {
      const [r, g, b] = colToRgb(v);
      expect(rgbToCol(r, g, b)).toBe(v);
    }
  });
  it("formats and parses hex colors", () => {
    expect(colToHex(0x7fff)).toBe("#ffffff");
    expect(colToHex(0)).toBe("#000000");
    expect(parseHexColor("#ff8000")).toEqual([255, 128, 0]);
  });
  it("hslAdjust with zeros is (nearly) identity", () => {
    for (const v of [0x625f, 0x1c96, 0x7e0b]) {
      const o = hslAdjust(v, 0, 0, 0);
      const a = colToRgb(v), b = colToRgb(o);
      for (let i = 0; i < 3; i++) expect(Math.abs(a[i] - b[i])).toBeLessThanOrEqual(8);
    }
  });
  it("hue shift by 180 moves red toward cyan", () => {
    const [r, , b] = colToRgb(hslAdjust(0x001f, 180, 0, 0));
    expect(r).toBeLessThan(b);
  });
  it("grayscale equalizes channels and invert flips them", () => {
    const g = grayscale(0x625f);
    expect(g & 31).toBe((g >> 5) & 31);
    expect(g & 31).toBe((g >> 10) & 31);
    expect(invert(0x7fff)).toBe(0);
    expect(invert(0)).toBe(0x7fff);
  });
  it("swapChannels reorders r,g,b", () => {
    const c = 5 | (10 << 5) | (20 << 10);
    expect(swapChannels(c, "bgr")).toBe(20 | (10 << 5) | (5 << 10));
    expect(swapChannels(c, "grb")).toBe(10 | (5 << 5) | (20 << 10));
  });
});

describe("Rom edits", () => {
  it("writes, undoes, and resets", () => {
    const rom = buildRom();
    expect(rom.writeBytes([{ off: 0x800, val: 0xab }])).toBe(true);
    expect(rom.data[0x800]).toBe(0xab);
    expect(rom.canUndo).toBe(true);
    rom.undo();
    expect(rom.data[0x800]).toBe(0);
    rom.writeBytes([{ off: 0x800, val: 1 }]);
    rom.reset();
    expect(rom.anyChanged()).toBe(false);
  });
  it("ignores writes that change nothing", () => {
    const rom = buildRom();
    expect(rom.writeBytes([{ off: 0x800, val: 0 }])).toBe(false);
    expect(rom.canUndo).toBe(false);
  });
  it("merges a gesture into one undo step", () => {
    const rom = buildRom();
    rom.writeColors([{ off: 0x800, val: 0x1111 }], true);
    rom.writeColors([{ off: 0x800, val: 0x2222 }], true);
    rom.writeColors([{ off: 0x800, val: 0x3333 }], true);
    rom.endGesture();
    rom.undo();
    expect(rom.u16(0x800)).toBe(0);
    expect(rom.canUndo).toBe(false);
  });
  it("IPS patch reproduces the edits byte for byte", () => {
    const rom = buildRom();
    rom.writeColors([{ off: 0x800, val: 0x1234 }, { off: 0x900, val: 0x4321 }]);
    const patched = applyIps(rom.orig, rom.buildIps());
    expect(Array.from(patched)).toEqual(Array.from(rom.data));
  });
  it("IPS avoids the EOF offset collision", () => {
    const big = new Uint8Array(0x500000);
    const rom = new Rom(big);
    rom.writeBytes([{ off: 0x454f46, val: 7 }]);
    const patched = applyIps(rom.orig, rom.buildIps());
    expect(patched[0x454f46]).toBe(7);
  });
  it("saves and reloads edits", () => {
    const a = buildRom();
    a.writeColors([{ off: 0x800, val: 0x7777 }]);
    const json = a.exportEdits("test");
    const b = buildRom();
    expect(b.importEdits(json)).toBeGreaterThan(0);
    expect(b.u16(0x800)).toBe(0x7777);
  });
  it("reads the header", () => {
    expect(buildRom().header()).toEqual({ title: "AGB KIRBY AM", code: "B8KE" });
  });
});

describe("sprite database", () => {
  it("finds and parses the database", () => {
    const rom = buildRom();
    expect(findDb(rom)).toBe(0x10c);
    const db = loadDb(rom)!;
    expect(db.P).toBe(PAL_BANK);
    expect(db.T).toBe(TILE_BANK);
    expect(db.palRows).toBe(8);
    expect(db.anims).toHaveLength(1);
    const a = db.anims[0];
    expect(a.pal).toBe(3);
    expect(a.frames).toHaveLength(1);
    expect(a.frames[0].pieces).toHaveLength(1);
    expect(a.box).toEqual({ x: 0, y: 0, w: 8, h: 8 });
  });
  it("returns null for a ROM without the database", () => {
    const bytes = buildRomBytes();
    bytes.fill(0, 0x100, 0x120);
    expect(loadDb(new Rom(bytes))).toBeNull();
  });
  it("renders pixels and maps clicks back to ROM bytes", () => {
    const rom = buildRom();
    const db = loadDb(rom)!;
    const a = db.anims[0];
    const pal = new Array<number>(16).fill(0);
    pal[2] = 0x001f; // pure red
    const r = renderFrame(rom, db, a, a.frames[0], pal, { hit: true });
    // 8x8 sprite in a (8 + 2 margin) square; pixel (1,1) is the first sprite pixel
    const k = 1 * r.CW + 1;
    expect(r.px[k * 4]).toBe(255);
    expect(r.px[k * 4 + 3]).toBe(255);
    expect(r.hidx![k]).toBe(2);
    expect(r.hit![k] >> 1).toBe(TILE_BANK);
    expect(r.px[3]).toBe(0); // margin is transparent
  });
  it("dims other colors when highlighting one", () => {
    const rom = buildRom();
    const db = loadDb(rom)!;
    const a = db.anims[0];
    const pal = new Array<number>(16).fill(0x7fff);
    const r = renderFrame(rom, db, a, a.frames[0], pal, { highlight: 5 });
    expect(r.px[(1 * r.CW + 1) * 4 + 3]).toBe(70);
  });
});

describe("Project and Kirby color slots", () => {
  it("finds the color-slot table", () => {
    const t = findColorTable(buildRom())!;
    expect(t.slots).toHaveLength(4);
    expect(t.slots[0].overlay).toBe(true);
    expect(t.slots[1].overlay).toBe(false);
    expect(t.slots[0].script).toBe(SCRIPTS);
  });
  it("reads slot rows and retargets them", () => {
    const rom = buildRom();
    const p = Project.open(rom)!;
    expect([0, 1, 2, 3].map((i) => p.slotRow(i))).toEqual([2, 6, 7, 8]);
    p.setSlotRow(1, 5);
    expect(p.slotRow(1)).toBe(5);
    rom.undo();
    expect(p.slotRow(1)).toBe(6);
  });
  it("sends colors 12-14 of overlay rows to the shared row", () => {
    const p = Project.open(buildRom())!;
    expect(p.isShared(2, 13)).toBe(true);
    expect(p.isShared(2, 4)).toBe(false);
    expect(p.isShared(6, 13)).toBe(false);
    expect(p.palOff(2, 13)).toBe(PAL_BANK + SHARED_ROW * 32 + 26);
    expect(p.palOff(6, 13)).toBe(PAL_BANK + 6 * 32 + 26);
  });
  it("rampRecolor keeps the shading order of a ramp", () => {
    const rom = buildRom();
    const p = Project.open(rom)!;
    // build a light-to-dark pink ramp in row 2 (the template) so lightness varies
    const ramp = [0x7b5f, 0x6e9f, 0x625f, 0x51de, 0x393b, 0x1c96, 0x084c];
    ramp.forEach((v, i) => rom.writeColors([{ off: PAL_BANK + 2 * 32 + (2 + i) * 2, val: v }]));
    // the template is read from the ORIGINAL rom, so rebuild the project on a rom that has the ramp baked in
    const bytes = rom.data.slice();
    const p2 = Project.open(new Rom(bytes))!;
    const changes = p2.rampRecolor(6, [2, 3, 4, 5, 6, 7, 8], 4, "#3070ff");
    expect(changes).toHaveLength(7);
    const lum = (c: number) => { const [r, g, b] = colToRgb(c); return r + g + b; };
    const vals = changes.map((c) => c.val);
    expect(lum(vals[0])).toBeGreaterThan(lum(vals[6]));
    expect(p).toBeTruthy();
  });
  it("Meta Knight colors switch on and restore Kirby exactly when off", () => {
    const rom = buildRom();
    const p = Project.open(rom)!;
    expect(p.isMetaKnightSkin()).toBe(false);
    rom.writeColors(p.metaKnightSkin(true));
    expect(p.isMetaKnightSkin()).toBe(true);
    expect(rom.anyChanged()).toBe(true);
    rom.writeColors(p.metaKnightSkin(false));
    expect(p.isMetaKnightSkin()).toBe(false);
    expect(rom.anyChanged()).toBe(false);
  });
  it("Meta Knight colors only touch slot 0 and leave friends alone", () => {
    const rom = buildRom();
    const p = Project.open(rom)!;
    const friendRows = [1, 2, 3].map((i) => p.slotRow(i));
    rom.writeColors(p.metaKnightSkin(true));
    for (const row of friendRows) for (let i = 1; i < 12; i++) expect(p.isModified(row, i)).toBe(false);
  });
  it("overallRecolor leaves near-black and near-white colors alone", () => {
    const rom = buildRom();
    rom.writeColors([
      { off: PAL_BANK + 3 * 32 + 2, val: 0x0000 }, // outline
      { off: PAL_BANK + 3 * 32 + 6, val: 0x7fff }, // highlight
    ]);
    const p = Project.open(new Rom(rom.data.slice()))!;
    const r = p.overallRecolor(3, "#ff2020", p.db.anims[0]);
    const offs = new Set(r.changes.map((c) => c.off));
    expect(offs.has(PAL_BANK + 3 * 32 + 2)).toBe(false);
    expect(offs.has(PAL_BANK + 3 * 32 + 6)).toBe(false);
    expect(r.idx).toBe(2);
  });
});
