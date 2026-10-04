import { hex } from "./color";

export interface Write { off: number; val: number }
interface UndoEntry { off: number; old: number; val: number }

/**
 * A ROM image plus the pristine original, with byte-level undo, diffing, and IPS/JSON export.
 * Everything that edits the game goes through writeBytes() so undo and export stay correct.
 */
export class Rom {
  readonly orig: Uint8Array;
  readonly data: Uint8Array;
  private undoStack: Map<number, UndoEntry>[] = [];
  private gesture: Map<number, UndoEntry> | null = null;

  constructor(bytes: Uint8Array, public name = "rom.gba") {
    this.orig = bytes;
    this.data = bytes.slice();
  }

  get length(): number { return this.data.length; }
  get canUndo(): boolean { return this.undoStack.length > 0; }

  u16(o: number): number { return o >= 0 && o + 2 <= this.data.length ? this.data[o] | (this.data[o + 1] << 8) : 0; }
  u32(o: number): number {
    const d = this.data;
    return o >= 0 && o + 4 <= d.length ? (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0 : 0;
  }
  s32(o: number): number { return this.u32(o) | 0; }
  origU16(o: number): number { return this.orig[o] | (this.orig[o + 1] << 8); }

  /** A GBA ROM pointer (0x08xxxxxx) that lands inside this file. */
  isPtr(v: number): boolean { return v >>> 24 === 8 && (v & 0xffffff) + 4 <= this.data.length; }
  static addr(v: number): number { return v & 0xffffff; }

  /** Header title (for example "AGB KIRBY AM") and the 4-char game code (for example "B8KE"). */
  header(): { title: string; code: string } {
    const dec = new TextDecoder();
    return {
      title: dec.decode(this.data.slice(0xa0, 0xac)).replace(/\0/g, ""),
      code: dec.decode(this.data.slice(0xac, 0xb0)),
    };
  }

  /**
   * Writes bytes. With coalesce=true, consecutive calls merge into one undo step (for live
   * color-picker drags) until endGesture(). Returns true if anything actually changed.
   */
  writeBytes(list: Write[], coalesce = false): boolean {
    const entry = new Map<number, UndoEntry>();
    for (const c of list) {
      if (this.data[c.off] === c.val) continue;
      entry.set(c.off, { off: c.off, old: this.data[c.off], val: c.val });
      this.data[c.off] = c.val;
    }
    if (!entry.size) return false;
    if (coalesce) {
      if (!this.gesture) { this.gesture = new Map(); this.undoStack.push(this.gesture); }
      for (const e of entry.values()) {
        const g = this.gesture.get(e.off);
        this.gesture.set(e.off, { off: e.off, old: g ? g.old : e.old, val: e.val });
      }
    } else this.undoStack.push(entry);
    return true;
  }

  /** Writes 16-bit little-endian values (palette colors). */
  writeColors(list: Write[], coalesce = false): boolean {
    return this.writeBytes(list.flatMap((c) => [{ off: c.off, val: c.val & 255 }, { off: c.off + 1, val: c.val >> 8 }]), coalesce);
  }

  endGesture(): void { this.gesture = null; }

  undo(): boolean {
    this.gesture = null;
    const g = this.undoStack.pop();
    if (!g) return false;
    for (const e of g.values()) this.data[e.off] = e.old;
    return true;
  }

  /** Discards all edits. */
  reset(): void { this.data.set(this.orig); this.clearUndo(); }
  clearUndo(): void { this.undoStack.length = 0; this.gesture = null; }

  anyChanged(): boolean {
    for (let i = 0; i < this.data.length; i++) if (this.data[i] !== this.orig[i]) return true;
    return false;
  }

  /** Contiguous changed regions [start, end), merging gaps shorter than 6 bytes. */
  changedRuns(): [number, number][] {
    const runs: [number, number][] = [];
    const { data, orig } = this;
    let i = 0;
    while (i < data.length) {
      if (data[i] !== orig[i]) {
        const s = i;
        let last = i;
        while (i < data.length && i - last < 6) { if (data[i] !== orig[i]) last = i; i++; }
        runs.push([s, last + 1]);
        i = last + 1;
      } else i++;
    }
    return runs;
  }

  /** Standard IPS patch (avoids the "EOF" offset collision and the 64 KB record limit). */
  buildIps(): Uint8Array {
    const parts: Uint8Array[] = [new TextEncoder().encode("PATCH")];
    for (let [s, e] of this.changedRuns()) {
      if (s === 0x454f46) s--;
      while (e - s > 0) {
        const len = Math.min(e - s, 0xffff);
        parts.push(new Uint8Array([s >> 16, (s >> 8) & 255, s & 255, len >> 8, len & 255]), this.data.slice(s, s + len));
        s += len;
      }
    }
    parts.push(new TextEncoder().encode("EOF"));
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }

  /** Human-readable list of edits for saving and sharing. */
  exportEdits(tool: string): string {
    const edits = this.changedRuns().map(([s, e]) => ({
      offset: s,
      hex: [...this.data.slice(s, e)].map((b) => hex(b, 2)).join(""),
    }));
    return JSON.stringify({ tool, rom: this.name, edits }, null, 1);
  }

  /** Applies a JSON edit list and returns the number of bytes written. Throws on malformed input. */
  importEdits(json: string): number {
    const j = JSON.parse(json) as { edits: { offset: number; hex: string }[] };
    let n = 0;
    for (const ed of j.edits) {
      for (let i = 0; i < ed.hex.length; i += 2) {
        const o = ed.offset + i / 2;
        if (o < this.data.length) { this.data[o] = parseInt(ed.hex.substr(i, 2), 16); n++; }
      }
    }
    this.clearUndo();
    return n;
  }
}

/** Applies an IPS patch to a copy of `base`. */
export function applyIps(base: Uint8Array, ips: Uint8Array): Uint8Array {
  const out = base.slice();
  let p = 5;
  while (p + 3 < ips.length) {
    const off = (ips[p] << 16) | (ips[p + 1] << 8) | ips[p + 2];
    const len = (ips[p + 3] << 8) | ips[p + 4];
    out.set(ips.subarray(p + 5, p + 5 + len), off);
    p += 5 + len;
  }
  return out;
}
