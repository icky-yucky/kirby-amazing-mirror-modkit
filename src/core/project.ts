import { clamp, colToHsl, hslToCol, parseHexColor, rgbToCol, rgbToHsl, hslToRgb } from "./color";
import { Rom, Write } from "./rom";
import { Anim, SpriteDb, loadDb, renderFrame } from "./sprites";

/*
 * Kirby color slots (verified in the emulator): a table of 16 small palette-load scripts, one per
 * Kirby color. Slots 0-3 are the lobby/player colors (pink, then three friends); slots 4-15 are the
 * spray paints. Each script holds a palette row number. Scripts that end in -3 also overlay colors
 * 12-14 from row 1.
 */
export interface ColorSlot { script: number; rowAddr: number; overlay: boolean }
export interface ColorTable { tbl: number; slots: ColorSlot[] }

export const SHARED_ROW = 1;
export const META_KNIGHT = { body: "#3b47b0", shoes: "#e3a52b" };
const SLOT_NAMES = ["Kirby: baseline (pink)", "Friend 1 (yellow)", "Friend 2 (red)", "Friend 3 (green)"];
export const slotName = (i: number): string => (i < 4 ? SLOT_NAMES[i] : `Spray paint ${i - 3}`);

export function findColorTable(rom: Rom): ColorTable | null {
  const adr = Rom.addr;
  for (let p = 0; p + 16 <= rom.length; p += 4) {
    const sc = [0, 1, 2, 3].map((k) => rom.u32(p + k * 4));
    if (!sc.every((v) => rom.isPtr(v))) continue;
    if (!sc.every((v) => { const a = adr(v); return rom.s32(a) === -2 && rom.s32(a + 8) === 16 && rom.s32(a + 12) === 1; })) continue;
    if (sc.map((v) => rom.s32(adr(v) + 4)).join() !== "2,6,7,8") continue;
    const slots: ColorSlot[] = [];
    for (let k = 0; k < 64; k++) {
      const v = rom.u32(p + k * 4);
      if (!rom.isPtr(v)) break;
      const a = adr(v);
      if (rom.s32(a) !== -2 || rom.s32(a + 8) !== 16) break;
      slots.push({ script: a, rowAddr: a + 4, overlay: rom.s32(a + 20) === -3 });
    }
    return { tbl: p, slots };
  }
  return null;
}

/** Everything the editors need: the ROM, the sprite database, and the Kirby color slots. */
export class Project {
  readonly db: SpriteDb;
  readonly slots: ColorTable | null;
  /** Live slider preview: palette index to color, drawn but not written. */
  preview: Map<number, number> | null = null;
  knownRows: Record<number, string> = {};

  private constructor(readonly rom: Rom, db: SpriteDb) {
    this.db = db;
    this.slots = findColorTable(rom);
    this.buildKnownRows();
  }

  /** Returns null when the ROM has no sprite database. */
  static open(rom: Rom): Project | null {
    const db = loadDb(rom);
    return db && db.anims.length ? new Project(rom, db) : null;
  }

  // ---- color slots ----
  slotRow(i: number): number { return this.rom.s32(this.slots!.slots[i].rowAddr); }
  overlayRows(): number[] {
    return this.slots ? this.slots.slots.filter((s) => s.overlay).map((s) => this.rom.s32(s.rowAddr)) : [2, 6, 7, 8];
  }
  isShared(row: number, idx: number): boolean { return idx >= 12 && idx <= 14 && this.overlayRows().includes(row); }
  private buildKnownRows(): void {
    this.knownRows = { [SHARED_ROW]: "shared accent colors 12-14" };
    this.slots?.slots.forEach((s, i) => {
      const r = this.rom.s32(s.rowAddr);
      if (this.knownRows[r] === undefined) this.knownRows[r] = slotName(i);
    });
  }
  /** Retargets a slot to a different palette row. */
  setSlotRow(i: number, row: number): void {
    const a = this.slots!.slots[i].rowAddr;
    this.rom.writeBytes([0, 1, 2, 3].map((k) => ({ off: a + k, val: (row >> (8 * k)) & 255 })));
  }
  /** Kirby's own animations list palette row 0, but the game draws them with slot 0's row. */
  rowFor(anim: Anim): number { return anim.pal === 0 && this.slots ? this.slotRow(0) : anim.pal; }

  // ---- palettes ----
  /** ROM offset of a palette color. Colors 12-14 of overlay rows live in the shared row. */
  palOff(row: number, idx = 0): number { return this.db.P + (this.isShared(row, idx) ? SHARED_ROW : row) * 32 + idx * 2; }
  color(row: number, idx: number): number { return this.rom.u16(this.palOff(row, idx)); }
  getPalette(row: number, usePreview = false): number[] {
    const p: number[] = [];
    for (let c = 0; c < 16; c++) p.push(this.color(row, c));
    if (usePreview && this.preview) for (const [i, v] of this.preview) p[i] = v;
    return p;
  }
  usedBy(row: number): number { return this.db.anims.filter((a) => a.pal === row).length; }
  isModified(row: number, idx: number): boolean {
    const o = this.palOff(row, idx);
    return this.rom.u16(o) !== this.rom.origU16(o);
  }

  // ---- bulk recolor operations (return the changes; caller writes them) ----

  /** Recolors a shaded ramp from one chosen color, keeping the original light and dark structure. */
  rampRecolor(row: number, idxs: number[], baseIdx: number, hexColor: string): Write[] {
    const t = rgbToHsl(...parseHexColor(hexColor));
    // The pink ramp (row 2) is the shading template.
    const tmpl = (i: number) => { const o = this.db.P + 2 * 32 + i * 2; return colToHsl(this.rom.origU16(o)); };
    const b = tmpl(baseIdx);
    return idxs.map((i) => {
      const m = tmpl(i);
      const sat = clamp(t[1] * (m[1] / Math.max(b[1], 0.08)), 0, 1);
      const lit = clamp(t[2] + (m[2] - b[2]), 0.03, 0.97);
      const hue = t[0] + (m[0] - b[0]) * 0.5;
      return { off: this.palOff(row, i), val: hslToCol(hue, sat, lit) };
    });
  }

  /**
   * Meta Knight color scheme for baseline Kirby (slot 0): navy body, gold feet. This only changes
   * colors; Meta Knight's own sprites and moves are not part of this swap.
   * Returns the writes that switch it on, or restore Kirby's original colors when off.
   */
  metaKnightSkin(on: boolean): Write[] {
    const row = this.slotRow(0);
    if (!on) {
      return Array.from({ length: 11 }, (_, k) => k + 1).map((i) => {
        const o = this.palOff(row, i);
        return { off: o, val: this.rom.origU16(o) };
      });
    }
    return [
      ...this.rampRecolor(row, [2, 3, 4, 5, 6, 7, 8], 4, META_KNIGHT.body),
      ...this.rampRecolor(row, [9, 10, 11], 9, META_KNIGHT.shoes),
    ];
  }

  /** True when slot 0 currently wears the Meta Knight colors. */
  isMetaKnightSkin(): boolean {
    if (!this.slots) return false;
    return this.metaKnightSkin(true).every((w) => this.rom.u16(w.off) === w.val);
  }

  /** Most-used non-dark palette index across every animation that draws with this row. */
  dominantIndex(row: number, fallback: Anim): { idx: number; anims: number } {
    const counts = new Array<number>(16).fill(0);
    const anims = this.db.anims.filter((a) => this.rowFor(a) === row);
    for (const a of anims.length ? anims : [fallback]) {
      for (const fr of a.frames.slice(0, 40)) {
        const r = renderFrame(this.rom, this.db, a, fr, new Array<number>(16).fill(0), { hit: true });
        for (let i = 0; i < r.hidx!.length; i++) if (r.hit![i] >= 0) counts[r.hidx![i]]++;
      }
    }
    let best = 2, bc = -1;
    for (let i = 2; i < 16; i++) if (counts[i] > bc && colToHsl(this.color(row, i))[2] >= 0.14) { bc = counts[i]; best = i; }
    return { idx: best, anims: anims.length };
  }

  /** Shifts a whole palette toward `hexColor` around its dominant color; outlines and highlights stay. */
  overallRecolor(row: number, hexColor: string, fallback: Anim): { changes: Write[]; idx: number; anims: number } {
    const { idx, anims } = this.dominantIndex(row, fallback);
    const t = rgbToHsl(...parseHexColor(hexColor));
    const d = colToHsl(this.color(row, idx));
    const changes: Write[] = [];
    for (let i = 1; i < 16; i++) {
      const m = colToHsl(this.color(row, i));
      if (m[2] < 0.14 || m[2] > 0.93) continue;
      const sat = d[1] < 0.08 ? clamp(t[1] * (m[2] > 0.5 ? 0.6 : 1), 0, 1) : clamp(m[1] * (t[1] / d[1]), 0, 1);
      const o = hslToRgb(m[0] + (t[0] - d[0]), sat, clamp(m[2] + (t[2] - d[2]) * 0.8, 0.03, 0.97));
      changes.push({ off: this.palOff(row, i), val: rgbToCol(o[0], o[1], o[2]) });
    }
    return { changes, idx, anims };
  }

  /** Applies fn to the given palette indices of a row. */
  mapColors(row: number, idxs: number[], fn: (c: number) => number): Write[] {
    return idxs.map((i) => ({ off: this.palOff(row, i), val: fn(this.color(row, i)) }));
  }
}


