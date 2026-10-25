import type { RGB } from './types';

/**
 * Perceptual-ish colour distance ("redmean").
 *
 * Plain RGB distance picks visibly wrong palette entries — it treats a shift
 * in blue as being as important as the same shift in green, which the eye
 * does not. Redmean is a cheap approximation that weights channels by how
 * much we actually notice them, and it is dramatically better than RGB for
 * palette mapping at a fraction of the cost of a real Lab conversion.
 *
 * Returns a squared, unnormalised value — only useful for comparisons.
 */
export function colorDistance(
  r1: number,
  g1: number,
  b1: number,
  r2: number,
  g2: number,
  b2: number,
): number {
  const rmean = (r1 + r2) >> 1;
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return (
    (((512 + rmean) * dr * dr) >> 8) +
    4 * dg * dg +
    (((767 - rmean) * db * db) >> 8)
  );
}

/** Rec. 709 luminance. Used for edge detection and greyscale mixing. */
export function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Nearest-palette-colour lookup with a memo cache.
 *
 * A quantisation pass asks the same question thousands of times — a 128x128
 * frame has 16k pixels but usually far fewer distinct colours. Caching on the
 * packed RGB value turns most lookups into a single map hit.
 */
export class PaletteMap {
  private readonly cache = new Map<number, number>();

  constructor(readonly colors: RGB[]) {}

  /** Index of the closest palette colour. */
  nearestIndex(r: number, g: number, b: number): number {
    const key = (r << 16) | (g << 8) | b;
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;

    let best = 0;
    let bestDistance = Infinity;
    for (let i = 0; i < this.colors.length; i++) {
      const c = this.colors[i];
      const d = colorDistance(r, g, b, c[0], c[1], c[2]);
      if (d < bestDistance) {
        bestDistance = d;
        best = i;
        if (d === 0) break;
      }
    }

    this.cache.set(key, best);
    return best;
  }
}

/** HSL with hue in degrees (0-360), saturation and lightness in 0..1. */
export type HSL = [number, number, number];

export function rgbToHsl([r, g, b]: RGB): HSL {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const delta = max - min;

  if (delta === 0) return [0, 0, l];

  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / delta + (gn < bn ? 6 : 0)) * 60;
  else if (max === gn) h = ((bn - rn) / delta + 2) * 60;
  else h = ((rn - gn) / delta + 4) * 60;

  return [h, s, l];
}

export function hslToRgb([h, s, l]: HSL): RGB {
  const hn = ((h % 360) + 360) % 360;
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hn / 60) % 2) - 1));
  const m = l - c / 2;

  let rgb: [number, number, number];
  if (hn < 60) rgb = [c, x, 0];
  else if (hn < 120) rgb = [x, c, 0];
  else if (hn < 180) rgb = [0, c, x];
  else if (hn < 240) rgb = [0, x, c];
  else if (hn < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];

  return [
    Math.round(Math.min(255, Math.max(0, (rgb[0] + m) * 255))),
    Math.round(Math.min(255, Math.max(0, (rgb[1] + m) * 255))),
    Math.round(Math.min(255, Math.max(0, (rgb[2] + m) * 255))),
  ];
}

/**
 * Rotate a hue towards a target hue, by at most `amount` degrees, along the
 * shorter way round the wheel.
 *
 * Used to build hue-shifted ramps: shadows lean towards blue, highlights
 * towards yellow, which is what stops a palette reading as "the same colour,
 * but darker".
 */
export function rotateHueToward(hue: number, target: number, amount: number): number {
  let delta = ((target - hue + 540) % 360) - 180;
  if (Math.abs(delta) > amount) delta = Math.sign(delta) * amount;
  return (hue + delta + 360) % 360;
}

export function hexToRgb(hex: string): RGB {
  const v = parseInt(hex.replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function rgbToHex([r, g, b]: RGB): string {
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}
