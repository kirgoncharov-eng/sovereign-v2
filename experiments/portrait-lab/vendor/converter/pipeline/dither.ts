import type { DitherMode, Frame } from './types';
import { PaletteMap } from './color';

/**
 * Recursive Bayer threshold matrix, normalised to -0.5..+0.5.
 *
 * Ordered dithering scatters the quantisation decision across a repeating
 * grid, producing the regular cross-hatch texture that reads as authentically
 * retro. It is also stateless per pixel, which matters for a future animation
 * mode: error diffusion makes neighbouring video frames shimmer, ordered
 * dithering does not.
 */
export function bayerMatrix(size: 2 | 4 | 8): Float32Array {
  let matrix = [[0]];
  let n = 1;

  while (n < size) {
    const next: number[][] = [];
    for (let y = 0; y < n * 2; y++) next.push(new Array(n * 2).fill(0));

    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const v = matrix[y][x] * 4;
        next[y][x] = v;
        next[y][x + n] = v + 2;
        next[y + n][x] = v + 3;
        next[y + n][x + n] = v + 1;
      }
    }

    matrix = next;
    n *= 2;
  }

  const total = size * size;
  const out = new Float32Array(total);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // The +0.5 centres the matrix on zero. Without it the values run
      // 0..(N-1)/N, whose mean sits half a step below centre, and every
      // ordered-dithered image comes out slightly darker than it should.
      out[y * size + x] = (matrix[y][x] + 0.5) / total - 0.5;
    }
  }
  return out;
}

/**
 * How far to nudge a colour before looking up its palette match.
 *
 * The right amount depends on how coarse the palette is: a 4-colour palette
 * leaves huge gaps that need a big nudge to blend across, while a 64-colour
 * palette needs barely any. Scaling by palette size means the strength slider
 * behaves consistently no matter which palette is selected.
 */
function ditherAmount(paletteSize: number, strength: number): number {
  const gap = 255 / Math.max(2, Math.cbrt(paletteSize) * 2);
  return Math.min(96, gap * 2) * strength;
}

/**
 * Map every pixel to a palette colour, optionally dithering.
 *
 * Quantisation and dithering happen together because dithering is not a
 * post-process: it works by biasing the palette decision itself.
 *
 * Returns the palette index per pixel, which the outline pass reuses.
 */
export function quantizeAndDither(
  frame: Frame,
  map: PaletteMap,
  mode: DitherMode,
  strength: number,
): Uint16Array {
  const { width, height } = frame;
  const d = frame.data;
  const indices = new Uint16Array(width * height);
  const colors = map.colors;
  const amount = ditherAmount(colors.length, strength);

  if (mode === 'floydSteinberg' && strength > 0) {
    floydSteinberg(frame, map, indices, strength);
    return indices;
  }

  const matrix =
    mode === 'bayer2' ? bayerMatrix(2)
    : mode === 'bayer4' ? bayerMatrix(4)
    : mode === 'bayer8' ? bayerMatrix(8)
    : null;
  const size = mode === 'bayer2' ? 2 : mode === 'bayer4' ? 4 : 8;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      const i = p * 4;

      let r = d[i];
      let g = d[i + 1];
      let b = d[i + 2];

      if (matrix && amount > 0) {
        const t = matrix[(y % size) * size + (x % size)] * amount;
        r = clamp255(r + t);
        g = clamp255(g + t);
        b = clamp255(b + t);
      }

      const idx = map.nearestIndex(r, g, b);
      indices[p] = idx;

      const c = colors[idx];
      d[i] = c[0];
      d[i + 1] = c[1];
      d[i + 2] = c[2];
    }
  }

  return indices;
}

/**
 * Floyd-Steinberg error diffusion.
 *
 * Pushes each pixel's quantisation error onto its not-yet-processed
 * neighbours, which reproduces gradients far more faithfully than ordered
 * dithering at the cost of a less regular, less "retro" texture.
 */
function floydSteinberg(
  frame: Frame,
  map: PaletteMap,
  indices: Uint16Array,
  strength: number,
): void {
  const { width, height } = frame;
  const d = frame.data;
  const colors = map.colors;

  // Work in floats so error accumulates without clipping at each step.
  const buf = new Float32Array(width * height * 3);
  for (let p = 0; p < width * height; p++) {
    buf[p * 3] = d[p * 4];
    buf[p * 3 + 1] = d[p * 4 + 1];
    buf[p * 3 + 2] = d[p * 4 + 2];
  }

  const spread = (p: number, err: number[], factor: number) => {
    buf[p * 3] += err[0] * factor;
    buf[p * 3 + 1] += err[1] * factor;
    buf[p * 3 + 2] += err[2] * factor;
  };

  for (let y = 0; y < height; y++) {
    // Serpentine scanning: alternating direction avoids the diagonal
    // streaking that plain left-to-right diffusion leaves behind.
    const leftToRight = y % 2 === 0;
    const xStart = leftToRight ? 0 : width - 1;
    const xEnd = leftToRight ? width : -1;
    const step = leftToRight ? 1 : -1;

    for (let x = xStart; x !== xEnd; x += step) {
      const p = y * width + x;
      const r = clamp255(buf[p * 3]);
      const g = clamp255(buf[p * 3 + 1]);
      const b = clamp255(buf[p * 3 + 2]);

      const idx = map.nearestIndex(Math.round(r), Math.round(g), Math.round(b));
      indices[p] = idx;
      const c = colors[idx];

      d[p * 4] = c[0];
      d[p * 4 + 1] = c[1];
      d[p * 4 + 2] = c[2];

      const err = [(r - c[0]) * strength, (g - c[1]) * strength, (b - c[2]) * strength];

      const ahead = x + step;
      const hasAhead = leftToRight ? ahead < width : ahead >= 0;
      const hasBelow = y + 1 < height;

      if (hasAhead) spread(p + step, err, 7 / 16);
      if (hasBelow) {
        if (hasAhead) spread(p + width + step, err, 1 / 16);
        spread(p + width, err, 5 / 16);
        const behind = x - step;
        if (leftToRight ? behind >= 0 : behind < width) {
          spread(p + width - step, err, 3 / 16);
        }
      }
    }
  }
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}
