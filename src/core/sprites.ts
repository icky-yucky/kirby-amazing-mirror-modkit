import { colToRgb } from "./color";
import { Rom } from "./rom";

/*
 * The game keeps every sprite in one database: a table of animations (B), per-animation frame
 * metadata (C), per-animation OAM piece lists (D), a bank of 16-color palettes (P) and one big
 * bank of 4bpp tiles (T). It is found through a self-referencing header; the five pointers sit
 * at header+12.
 */

export interface Piece { x: number; y: number; w: number; h: number; tile: number; hf: number; vf: number }
export interface Frame { f: number; A: number; pieces: Piece[] }
export interface Box { x: number; y: number; w: number; h: number }
export interface Anim { id: number; pal: number; frames: Frame[]; box: Box }
export interface SpriteDb { q: number; P: number; T: number; palRows: number; anims: Anim[] }

const SHAPES: Record<string, [number, number]> = {
  "0,0": [8, 8], "0,1": [16, 16], "0,2": [32, 32], "0,3": [64, 64],
  "1,0": [16, 8], "1,1": [32, 8], "1,2": [32, 16], "1,3": [64, 32],
  "2,0": [8, 16], "2,1": [8, 32], "2,2": [16, 32], "2,3": [32, 64],
};

const adr = Rom.addr;

/** Finds the five-pointer block (B, C, D, P, T). Returns its ROM offset or -1. */
export function findDb(rom: Rom): number {
  for (let p = 0; p + 32 <= rom.length; p += 4) {
    if (rom.u32(p + 8) !== 0x08000000 + p) continue;
    const q = p + 12;
    const v = [0, 4, 8, 12, 16].map((k) => rom.u32(q + k));
    if (!v.every((x) => rom.isPtr(x))) continue;
    const P = adr(v[3]), T = adr(v[4]);
    if (P >= T || T - P > 0x40000 || !rom.isPtr(rom.u32(adr(v[0]))) || !rom.isPtr(rom.u32(adr(v[2])))) continue;
    return q;
  }
  return -1;
}

function pieceAt(rom: Rom, pp: number): Piece | null {
  const a0 = rom.u16(pp), a1 = rom.u16(pp + 2), a2 = rom.u16(pp + 4), shp = (a0 >> 14) & 3;
  const sh = SHAPES[shp + "," + ((a1 >> 14) & 3)];
  if (shp === 3 || !sh || (a0 & 0x300) === 0x200) return null;
  let x = a1 & 511; if (x > 255) x -= 512;
  let y = a0 & 255; if (y > 127) y -= 256;
  return { x, y, w: sh[0], h: sh[1], tile: a2 & 1023, hf: (a1 >> 12) & 1, vf: (a1 >> 13) & 1 };
}

/** Parses every usable animation. Returns null when the ROM does not contain the database. */
export function loadDb(rom: Rom): SpriteDb | null {
  const q = findDb(rom);
  if (q < 0) return null;
  const B = adr(rom.u32(q)), D = adr(rom.u32(q + 8)), P = adr(rom.u32(q + 12)), T = adr(rom.u32(q + 16));
  const palRows = Math.floor((T - P) / 32);
  const anims: Anim[] = [];
  for (let i = 0; i < 3000; i++) {
    const ap = rom.u32(B + i * 4);
    if (!rom.isPtr(ap)) break;
    const images = new Map<number, { A: number; B: number }>();
    let pal = -1;
    for (let j = 0; j < 500; j++) {
      const rp = rom.u32(adr(ap) + j * 4);
      if (!rom.isPtr(rp)) break;
      const r = adr(rp);
      if (pal < 0) pal = rom.s32(r + 4);
      let k = 3;
      for (let n = 0; n < 40; n++) {
        const w = rom.s32(r + k * 4);
        if (w === -4 || w === -2 || w >>> 24 === 8 || w >>> 24 === 3) break;
        if (w === -1) {
          const A = rom.s32(r + (k + 1) * 4), Bc = rom.s32(r + (k + 2) * 4), f = rom.s32(r + (k + 4) * 4);
          if (Bc <= 0 || Bc > 300 || A < 0 || f < 0 || f > 2000) break;
          if (!images.has(f)) images.set(f, { A, B: Bc });
          k += 5;
        } else k++;
      }
    }
    // Piece lists: a new image starts whenever a piece uses tile 0.
    const dp = rom.u32(D + i * 4);
    const lists: Piece[][] = [];
    if (rom.isPtr(dp) && images.size) {
      const maxf = Math.max(...images.keys());
      let pp = adr(dp);
      let cur: Piece[] | null = null;
      for (let n = 0; n < 4000; n++) {
        const pc = pieceAt(rom, pp);
        if (!pc) break;
        if (pc.tile === 0 || !cur) { if (lists.length > maxf) break; cur = []; lists.push(cur); }
        cur.push(pc);
        pp += 6;
      }
    }
    const frames: Frame[] = [];
    for (const [f, im] of [...images].sort((a, b) => a[0] - b[0])) {
      const pl = lists[f];
      if (pl && pl.length && T + (im.A + 1) * 32 <= rom.length) frames.push({ f, A: im.A, pieces: pl });
    }
    if (pal >= 0 && pal < palRows && frames.length) {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const fr of frames) for (const p of fr.pieces) {
        x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x + p.w); y1 = Math.max(y1, p.y + p.h);
      }
      anims.push({ id: i, pal, frames, box: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } });
    }
  }
  return { q, P, T, palRows, anims };
}

export interface Rendered {
  px: Uint8ClampedArray;
  CW: number;
  CH: number;
  /** Per pixel: romByteOffset * 2 + nibble, or -1 for transparent (only when opts.hit). */
  hit: Int32Array | null;
  /** Per pixel: palette index (only when opts.hit). */
  hidx: Int8Array | null;
}

export interface RenderOpts { hit?: boolean; highlight?: number }

/**
 * Renders one frame into an RGBA buffer sized to the animation's bounding box. The optional hit map
 * lets a click be traced back to the exact tile byte and nibble in the ROM.
 */
export function renderFrame(rom: Rom, db: SpriteDb, anim: Anim, fr: Frame, palette: number[], opts: RenderOpts = {}): Rendered {
  const { x: bx, y: by, w: W, h: H } = anim.box;
  const M = 1, CW = W + 2 * M, CH = H + 2 * M;
  const px = new Uint8ClampedArray(CW * CH * 4);
  const hit = opts.hit ? new Int32Array(CW * CH).fill(-1) : null;
  const hidx = opts.hit ? new Int8Array(CW * CH) : null;
  const rgb = palette.map(colToRgb);
  const sel = opts.highlight;
  const data = rom.data;
  for (let n = fr.pieces.length - 1; n >= 0; n--) {              // OAM order: the first piece is on top
    const p = fr.pieces[n], tw = p.w >> 3;
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      const sx = p.hf ? p.w - 1 - x : x, sy = p.vf ? p.h - 1 - y : y;
      const t = fr.A + p.tile + (sy >> 3) * tw + (sx >> 3);
      const off = db.T + t * 32 + (sy & 7) * 4 + ((sx & 7) >> 1);
      if (off >= data.length) continue;
      const idx = sx & 1 ? data[off] >> 4 : data[off] & 15;
      if (!idx) continue;
      const cx = p.x - bx + x + M, cy = p.y - by + y + M;
      if (cx < 0 || cy < 0 || cx >= CW || cy >= CH) continue;
      const o = (cy * CW + cx) * 4, c = rgb[idx];
      px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2];
      px[o + 3] = sel !== undefined && sel !== idx ? 70 : 255;
      if (hit && hidx) { hit[cy * CW + cx] = off * 2 + (sx & 1); hidx[cy * CW + cx] = idx; }
    }
  }
  return { px, CW, CH, hit, hidx };
}
