/** GBA colors are 15-bit BGR555: bits 0-4 red, 5-9 green, 10-14 blue. */
export type Rgb = [number, number, number];
export type Hsl = [number, number, number];

export const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
export const hex = (n: number, w = 6): string => n.toString(16).toUpperCase().padStart(w, "0");

const to5 = (v: number): number => Math.round((v * 31) / 255);
const from5 = (v: number): number => (v << 3) | (v >> 2);

export const colToRgb = (v: number): Rgb => [from5(v & 31), from5((v >> 5) & 31), from5((v >> 10) & 31)];
export const rgbToCol = (r: number, g: number, b: number): number =>
  clamp(to5(r), 0, 31) | (clamp(to5(g), 0, 31) << 5) | (clamp(to5(b), 0, 31) << 10);
export const colToHex = (v: number): string => "#" + colToRgb(v).map((x) => hex(x, 2)).join("").toLowerCase();
export const colToCss = (v: number): string => {
  const [r, g, b] = colToRgb(v);
  return `rgb(${r},${g},${b})`;
};
/** "#rrggbb" to [r, g, b] (0-255). */
export const parseHexColor = (h: string): Rgb => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

export function rgbToHsl(r: number, g: number, b: number): Hsl {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  let h = 0, s = 0;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}

export function hslToRgb(h: number, s: number, l: number): Rgb {
  h = (((h % 360) + 360) % 360) / 360;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t: number): number => {
    t = (t + 1) % 1;
    return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

export const colToHsl = (v: number): Hsl => rgbToHsl(...colToRgb(v));
export const hslToCol = (h: number, s: number, l: number): number => {
  const o = hslToRgb(h, s, l);
  return rgbToCol(o[0], o[1], o[2]);
};

/** Hue shift (degrees) plus saturation and lightness adjustments, each -100..100 percent. */
export function hslAdjust(col: number, dh: number, ds: number, dl: number): number {
  let [h, s, l] = colToHsl(col);
  h += dh;
  s = clamp(ds >= 0 ? s + (1 - s) * (ds / 100) : s * (1 + ds / 100), 0, 1);
  l = clamp(dl >= 0 ? l + (1 - l) * (dl / 100) : l * (1 + dl / 100), 0, 1);
  return hslToCol(h, s, l);
}

export const grayscale = (c: number): number => {
  const r = c & 31, g = (c >> 5) & 31, b = (c >> 10) & 31;
  const y = Math.round(r * 0.3 + g * 0.59 + b * 0.11);
  return y | (y << 5) | (y << 10);
};
export const invert = (c: number): number => ~c & 0x7fff;

export type ChannelOrder = "rbg" | "grb" | "gbr" | "brg" | "bgr";
export function swapChannels(c: number, order: ChannelOrder): number {
  const ch: Record<string, number> = { r: c & 31, g: (c >> 5) & 31, b: (c >> 10) & 31 };
  const [a, b, d] = order.split("") as [string, string, string];
  return ch[a] | (ch[b] << 5) | (ch[d] << 10);
}
