import type { Frame } from './types';
import { createFrame } from './types';
import { luminance } from './color';

/**
 * Kuwahara filter — the stage that turns a photograph into something a person
 * could have drawn.
 *
 * This is the single most important difference between pixel art and a
 * pixelated photo. A photo has texture noise everywhere, so downsampling it
 * yields thousands of almost-identical colours and the result reads as a
 * filter. Real pixel art is built from *flat regions*: a cheek is one colour,
 * not forty.
 *
 * Kuwahara flattens while keeping edges hard, which is exactly backwards from
 * an ordinary blur. For each pixel it looks at four overlapping quadrants of
 * the surrounding window, and outputs the mean colour of whichever quadrant
 * has the lowest variance. Inside a flat region every quadrant agrees, so the
 * region flattens further. On an edge, the quadrant that does not straddle
 * the edge wins, so the pixel takes a colour from one side rather than a
 * blend — the edge stays crisp and actually gets sharper with each pass.
 *
 * Several small passes flatten more convincingly, and far more cheaply, than
 * one large-radius pass.
 */
export function flatten(src: Frame, amount: number): Frame {
  if (amount <= 0) return src;

  const iterations = Math.max(1, Math.round(amount * 3));
  const radius = 2 + Math.round(amount * 2);

  // Built once and refilled per pass; the dimensions never change.
  const sums = createSummedAreaTables(src.width, src.height);

  let current = src;
  for (let i = 0; i < iterations; i++) {
    current = kuwaharaPass(current, radius, sums);
  }
  return current;
}

/**
 * Summed-area tables, so each quadrant costs four lookups instead of
 * re-reading every pixel inside it.
 *
 * Measured, not assumed: at the heaviest settings the straightforward
 * version dominated the profile of an entire conversion. At radius 4 each
 * pixel was reading its 25-pixel quadrant four times over — on the order of
 * 400 array reads per pixel, for a window whose totals can be had from four
 * corners of a prefix sum. Cost also stops growing with the radius, so a
 * wider flatten is no longer more expensive than a narrow one.
 *
 * The results are identical, not approximate: every value is an integer, and
 * the tables are sized so the sums stay exact.
 *  - colour and luminance sums reach 255 x 1.4M, inside Uint32's range
 *  - squared luminance reaches 65025 x 1.4M, which overflows Uint32, so it
 *    gets a Float64Array — still exact, since it is far below 2^53
 * Differencing two exact integers gives an exact quadrant total, so no error
 * accumulates however large the image is.
 */
interface SummedAreaTables {
  /** Padded row stride: width + 1, with a zero row and column at the edges. */
  stride: number;
  r: Uint32Array;
  g: Uint32Array;
  b: Uint32Array;
  l: Uint32Array;
  l2: Float64Array;
}

function createSummedAreaTables(width: number, height: number): SummedAreaTables {
  const stride = width + 1;
  const size = stride * (height + 1);
  // The leading zero row and column are never written, so they stay zero and
  // the tables need no clearing between passes.
  return {
    stride,
    r: new Uint32Array(size),
    g: new Uint32Array(size),
    b: new Uint32Array(size),
    l: new Uint32Array(size),
    l2: new Float64Array(size),
  };
}

function fillSummedAreaTables(src: Frame, t: SummedAreaTables): void {
  const { width, height } = src;
  const s = src.data;
  const { stride, r, g, b, l, l2 } = t;

  for (let y = 0; y < height; y++) {
    let rowR = 0;
    let rowG = 0;
    let rowB = 0;
    let rowL = 0;
    let rowL2 = 0;

    const cur = (y + 1) * stride;
    const above = y * stride;
    let i = y * width * 4;

    for (let x = 0; x < width; x++, i += 4) {
      const cr = s[i];
      const cg = s[i + 1];
      const cb = s[i + 2];
      // Rounded so the tables stay integral and therefore exact.
      const cl = Math.round(luminance(cr, cg, cb));

      rowR += cr;
      rowG += cg;
      rowB += cb;
      rowL += cl;
      rowL2 += cl * cl;

      const k = cur + x + 1;
      const up = above + x + 1;
      r[k] = r[up] + rowR;
      g[k] = g[up] + rowG;
      b[k] = b[up] + rowB;
      l[k] = l[up] + rowL;
      l2[k] = l2[up] + rowL2;
    }
  }
}

/** Inclusive rectangle total from a summed-area table. */
function rectSum(
  table: Uint32Array | Float64Array,
  stride: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  const bottom = (y1 + 1) * stride;
  const top = y0 * stride;
  return table[bottom + x1 + 1] - table[top + x1 + 1] - table[bottom + x0] + table[top + x0];
}

function kuwaharaPass(src: Frame, r: number, sums: SummedAreaTables): Frame {
  const { width, height } = src;
  const out = createFrame(width, height);
  const s = src.data;
  const d = out.data;
  const { stride } = sums;

  fillSummedAreaTables(src, sums);

  for (let y = 0; y < height; y++) {
    const yTop = Math.max(0, y - r);
    const yBottom = Math.min(height - 1, y + r);

    for (let x = 0; x < width; x++) {
      const xLeft = Math.max(0, x - r);
      const xRight = Math.min(width - 1, x + r);

      let bestVariance = Infinity;
      let bx0 = 0;
      let by0 = 0;
      let bx1 = 0;
      let by1 = 0;
      let bestN = 1;

      // Quadrants: top-left, top-right, bottom-left, bottom-right. Each
      // includes the centre pixel, so they overlap on the cross through it.
      for (let q = 0; q < 4; q++) {
        const x0 = q === 0 || q === 2 ? xLeft : x;
        const x1 = q === 0 || q === 2 ? x : xRight;
        const y0 = q < 2 ? yTop : y;
        const y1 = q < 2 ? y : yBottom;

        const n = (x1 - x0 + 1) * (y1 - y0 + 1);
        const sumL = rectSum(sums.l, stride, x0, y0, x1, y1);
        const sumL2 = rectSum(sums.l2, stride, x0, y0, x1, y1);

        const mean = sumL / n;
        const variance = sumL2 / n - mean * mean;

        if (variance < bestVariance) {
          bestVariance = variance;
          bx0 = x0;
          by0 = y0;
          bx1 = x1;
          by1 = y1;
          bestN = n;
        }
      }

      // Colour is only summed for the quadrant that wins, not all four.
      const o = (y * width + x) * 4;
      d[o] = rectSum(sums.r, stride, bx0, by0, bx1, by1) / bestN;
      d[o + 1] = rectSum(sums.g, stride, bx0, by0, bx1, by1) / bestN;
      d[o + 2] = rectSum(sums.b, stride, bx0, by0, bx1, by1) / bestN;
      d[o + 3] = s[o + 3];
    }
  }

  return out;
}

/**
 * Collapse lighting into discrete bands, preserving hue.
 *
 * Cel shading. Smooth falloff across a face is what makes a converted photo
 * look photographic; stepping it into three or four bands is what makes it
 * look drawn. Scaling RGB by the ratio of new to old luminance keeps the
 * colour and only moves the brightness, so skin stays skin.
 */
export function posterize(src: Frame, bands: number): Frame {
  if (bands < 2) return src;

  const { width, height } = src;
  const out = createFrame(width, height);
  const s = src.data;
  const d = out.data;
  const steps = bands - 1;

  const count = width * height;
  const lum = new Float32Array(count);
  for (let p = 0; p < count; p++) {
    lum[p] = luminance(s[p * 4], s[p * 4 + 1], s[p * 4 + 2]);
  }

  // Which band a pixel lands in is decided from a smoothed copy, not from
  // the pixel itself. Deciding per-pixel means any leftover noise sitting on
  // a band threshold flips individual pixels back and forth, and the band
  // boundary comes out as a ragged, crawling edge instead of a clean curve.
  // The colour still comes from the pixel; only the decision is smoothed.
  const guide = boxBlur(lum, width, height, 2);

  for (let p = 0; p < count; p++) {
    const i = p * 4;
    const banded = (Math.round((guide[p] / 255) * steps) / steps) * 255;

    // Normalise against the pixel's own luminance so every pixel in a band
    // ends up at exactly the band's brightness — flat, the way cel shading
    // is supposed to be.
    const scale = Math.min(6, banded / Math.max(lum[p], 1));

    d[i] = s[i] * scale;
    d[i + 1] = s[i + 1] * scale;
    d[i + 2] = s[i + 2] * scale;
    d[i + 3] = s[i + 3];
  }

  return out;
}

/** Separable box blur over a single-channel float image. */
function boxBlur(
  data: Float32Array,
  width: number,
  height: number,
  radius: number,
): Float32Array {
  const pass1 = new Float32Array(data.length);
  const window = radius * 2 + 1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) {
        const xx = Math.min(width - 1, Math.max(0, x + k));
        sum += data[y * width + xx];
      }
      pass1[y * width + x] = sum / window;
    }
  }

  const pass2 = new Float32Array(data.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) {
        const yy = Math.min(height - 1, Math.max(0, y + k));
        sum += pass1[yy * width + x];
      }
      pass2[y * width + x] = sum / window;
    }
  }

  return pass2;
}
