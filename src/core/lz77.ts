/**
 * GBA BIOS LZ77 (compression type 0x10), as used by the game for maps and tiles.
 * Header: 0x10 then the 24-bit decompressed size. Then groups of 8 items led by a flag byte
 * (MSB first). A 0 bit is one literal byte; a 1 bit is a 2-byte match: length (high nibble + 3),
 * distance (low nibble and next byte, + 1).
 */

export interface LzResult { data: Uint8Array; used: number }

export function lz77Decode(buf: Uint8Array, off: number, maxSize = 0x80000): LzResult | null {
  if (off < 0 || off + 4 > buf.length || buf[off] !== 0x10) return null;
  const size = buf[off + 1] | (buf[off + 2] << 8) | (buf[off + 3] << 16);
  if (!size || size > maxSize) return null;
  const out = new Uint8Array(size);
  let ip = off + 4, op = 0;
  while (op < size) {
    if (ip >= buf.length) return null;
    const flags = buf[ip++];
    for (let b = 7; b >= 0 && op < size; b--) {
      if (flags & (1 << b)) {
        if (ip + 1 >= buf.length) return null;
        const b0 = buf[ip++], b1 = buf[ip++];
        const len = (b0 >> 4) + 3, disp = (((b0 & 15) << 8) | b1) + 1;
        if (disp > op) return null;
        for (let k = 0; k < len && op < size; k++, op++) out[op] = out[op - disp];
      } else {
        if (ip >= buf.length) return null;
        out[op++] = buf[ip++];
      }
    }
  }
  return { data: out, used: ip - off };
}

const MAX_LEN = 18;
const MAX_DISP = 4096;

/**
 * Compresses with an optimal parse (fewest bits). Matches at distance 1 are avoided because the BIOS
 * VRAM variant cannot handle them, so the result is safe for either decompressor.
 */
export function lz77Encode(src: Uint8Array): Uint8Array {
  const n = src.length;
  // longest match (length, distance) at every position
  const mLen = new Uint8Array(n), mDist = new Uint16Array(n);
  // hash chains over 3-byte prefixes keep the search fast on large maps
  const head = new Int32Array(1 << 15).fill(-1), prev = new Int32Array(n).fill(-1);
  const hash = (i: number): number => ((src[i] << 10) ^ (src[i + 1] << 5) ^ src[i + 2]) & 0x7fff;
  for (let i = 0; i < n; i++) {
    let best = 0, bestD = 0;
    const maxL = Math.min(MAX_LEN, n - i);
    if (maxL >= 3) {
      const h = hash(i);
      let j = head[h];
      for (let steps = 0; j >= 0 && steps < 512; steps++, j = prev[j]) {
        const d = i - j;
        if (d > MAX_DISP) break;
        if (d < 2) continue;
        if (src[j] !== src[i] || src[j + 1] !== src[i + 1] || src[j + 2] !== src[i + 2]) continue;
        let l = 3;
        while (l < maxL && src[j + l] === src[i + l]) l++;
        if (l > best) { best = l; bestD = d; if (l === maxL) break; }
      }
      prev[i] = head[h];
      head[h] = i;
    }
    mLen[i] = best;
    mDist[i] = bestD;
  }
  // DP from the end: cost in bits (literal 9, match 17)
  const cost = new Uint32Array(n + 1);
  const pick = new Uint8Array(n);          // 0 = literal, otherwise match length
  for (let i = n - 1; i >= 0; i--) {
    let c = cost[i + 1] + 9, p = 0;
    for (let l = 3; l <= mLen[i]; l++) {
      const cm = cost[i + l] + 17;
      if (cm < c) { c = cm; p = l; }
    }
    cost[i] = c;
    pick[i] = p;
  }
  const out: number[] = [0x10, n & 255, (n >> 8) & 255, (n >> 16) & 255];
  let i = 0;
  while (i < n) {
    const flagPos = out.length;
    out.push(0);
    let flags = 0;
    for (let b = 7; b >= 0 && i < n; b--) {
      const l = pick[i];
      if (l === 0) {
        out.push(src[i]);
        i++;
      } else {
        flags |= 1 << b;
        const d = mDist[i] - 1;
        out.push(((l - 3) << 4) | (d >> 8), d & 255);
        i += l;
      }
    }
    out[flagPos] = flags;
  }
  return Uint8Array.from(out);
}
