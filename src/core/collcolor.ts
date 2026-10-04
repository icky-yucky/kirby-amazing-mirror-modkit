/*
 * Numbering and colors for collision values, shared by the editor's value buttons, the overlay drawn on the map, and the docs,
 * so "collision 10" always means the same value and the same color everywhere.
 *
 * Numbers: the distinct non-empty values in ascending order, starting at 1. Because values 01 to 0F come first, numbers 1 to 15 equal
 * the hex values; after that the numbers close the gaps (value 0x14 is number 16, and so on).
 * Colors: a golden-angle walk around the hue wheel with three lightness levels, so neighbors in the list look different.
 * Solid ground (0x0D) is always red.
 */

export interface CollisionStyle { number: number; h: number; s: number; l: number }

/** Distinct non-zero values in ascending order; the index plus one is the collision number. */
export const collisionOrder = (values: Iterable<number>): number[] => [...new Set(values)].filter((v) => v !== 0).sort((a, b) => a - b);

const GOLDEN = 137.508;
const LIGHTNESS = [52, 40, 62];

/** The style for a value, or null for the empty value 0. Values outside the list still get a stable color. */
export function collisionStyle(v: number, order: number[]): CollisionStyle | null {
  if (v === 0) return null;
  const at = order.indexOf(v);
  const number = at >= 0 ? at + 1 : 1000 + v;
  if (v === 0x0d) return { number, h: 0, s: 90, l: 52 };
  return { number, h: (number * GOLDEN) % 360, s: 85, l: LIGHTNESS[number % 3] };
}

export const cssColor = (s: CollisionStyle, alpha = 1): string => `hsla(${s.h.toFixed(1)},${s.s}%,${s.l}%,${alpha})`;
