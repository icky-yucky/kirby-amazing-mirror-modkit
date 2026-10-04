/**
 * GBA BIOS run-length compression (type 0x30), used by the game for collision maps.
 * Header: 0x30 then the 24-bit decompressed size. Then chunks led by a flag byte: bit 7 set is a run
 * of (flag & 0x7f) + 3 copies of the next byte; clear is (flag & 0x7f) + 1 literal bytes.
 */
import type { LzResult } from "./lz77";

export function rleDecode(buf: Uint8Array, off: number, maxSize = 0x20000): LzResult | null {
  if (off < 0 || off + 4 > buf.length || buf[off] !== 0x30) return null;
  const size = buf[off + 1] | (buf[off + 2] << 8) | (buf[off + 3] << 16);
  if (size < 1 || size > maxSize) return null;
  const out = new Uint8Array(size);
  let ip = off + 4, op = 0;
  while (op < size) {
    if (ip >= buf.length) return null;
    const flag = buf[ip++];
    if (flag & 0x80) {
      const len = (flag & 0x7f) + 3;
      if (ip >= buf.length) return null;
      const v = buf[ip++];
      for (let k = 0; k < len && op < size; k++) out[op++] = v;
    } else {
      const len = (flag & 0x7f) + 1;
      for (let k = 0; k < len && op < size; k++) {
        if (ip >= buf.length) return null;
        out[op++] = buf[ip++];
      }
    }
  }
  return { data: out, used: ip - off };
}

export function rleEncode(src: Uint8Array): Uint8Array {
  const n = src.length;
  const out: number[] = [0x30, n & 255, (n >> 8) & 255, (n >> 16) & 255];
  let i = 0;
  let lit: number[] = [];
  const flush = (): void => {
    while (lit.length) {
      const k = Math.min(128, lit.length);
      out.push(k - 1, ...lit.splice(0, k));
    }
  };
  while (i < n) {
    let run = 1;
    while (i + run < n && src[i + run] === src[i] && run < 130) run++;
    if (run >= 3) {
      flush();
      out.push(0x80 | (run - 3), src[i]);
      i += run;
    } else {
      lit.push(src[i]);
      i++;
    }
  }
  flush();
  return Uint8Array.from(out);
}
