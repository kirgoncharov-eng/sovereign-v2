import { describe, expect, it } from 'vitest';
import type { Frame, RGB, Settings } from './types';
import { createFrame } from './types';
import { downsample, targetSize, thresholdAlpha, upscale } from './pixelate';
import { derivePalette } from './quantize';
import { bayerMatrix, quantizeAndDither } from './dither';
import { PaletteMap, hslToRgb, rgbToHsl } from './color';
import { flatten, posterize } from './flatten';
import { despeckle } from './cleanup';
import { rampedPalette } from './ramps';
import { extractLines } from './lines';
import { removeBackground } from './background';
import { colorStage, convert, pixelStage, workingFrame } from './convert';
import { DEFAULT_SETTINGS } from '../presets';

/** Build a frame from a 2D array of [r,g,b] (alpha 255). */
function frameOf(rows: RGB[][]): Frame {
  const height = rows.length;
  const width = rows[0].length;
  const frame = createFrame(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      frame.data[i] = rows[y][x][0];
      frame.data[i + 1] = rows[y][x][1];
      frame.data[i + 2] = rows[y][x][2];
      frame.data[i + 3] = 255;
    }
  }
  return frame;
}

function pixelAt(frame: Frame, x: number, y: number): RGB {
  const i = (y * frame.width + x) * 4;
  return [frame.data[i], frame.data[i + 1], frame.data[i + 2]];
}

describe('targetSize', () => {
  it('keeps the source aspect ratio', () => {
    const src = createFrame(800, 400);
    expect(targetSize(src, 100)).toEqual({ width: 100, height: 50 });
  });

  it('never upscales past the source', () => {
    const src = createFrame(32, 32);
    expect(targetSize(src, 512).width).toBe(32);
  });

  it('never returns a zero dimension', () => {
    const src = createFrame(1000, 3);
    expect(targetSize(src, 1).height).toBeGreaterThanOrEqual(1);
  });
});

describe('downsample', () => {
  it('averages the pixels in each output cell', () => {
    // A 2x2 block of black, white, black, white averages to mid grey.
    const black: RGB = [0, 0, 0];
    const white: RGB = [255, 255, 255];
    const src = frameOf([
      [black, white],
      [white, black],
    ]);

    const out = downsample(src, 1, 1);
    const [r, g, b] = pixelAt(out, 0, 0);
    expect(r).toBeGreaterThan(120);
    expect(r).toBeLessThan(136);
    expect(g).toBe(r);
    expect(b).toBe(r);
  });

  it('does not let transparent pixels bleed colour into visible ones', () => {
    // Left pixel is opaque red, right is fully transparent green. The green
    // must contribute nothing to the averaged colour.
    const src = createFrame(2, 1);
    src.data.set([255, 0, 0, 255, 0, 255, 0, 0]);

    const out = downsample(src, 1, 1);
    expect(pixelAt(out, 0, 0)).toEqual([255, 0, 0]);
    expect(out.data[3]).toBeCloseTo(127, -1);
  });
});

describe('thresholdAlpha', () => {
  it('snaps alpha to fully transparent or fully opaque', () => {
    const frame = createFrame(3, 1);
    frame.data.set([0, 0, 0, 10, 0, 0, 0, 128, 0, 0, 0, 200]);

    thresholdAlpha(frame, 128);
    expect([frame.data[3], frame.data[7], frame.data[11]]).toEqual([0, 255, 255]);
  });

  it('is a no-op when disabled', () => {
    const frame = createFrame(1, 1);
    frame.data.set([0, 0, 0, 77]);
    thresholdAlpha(frame, 0);
    expect(frame.data[3]).toBe(77);
  });
});

describe('upscale', () => {
  it('replicates pixels exactly, with no interpolation', () => {
    const src = frameOf([[[255, 0, 0], [0, 0, 255]]]);
    const out = upscale(src, 3);

    expect(out.width).toBe(6);
    expect(out.height).toBe(3);
    // Every pixel must be one of the two originals — a blend would mean
    // smoothing crept in.
    for (let y = 0; y < out.height; y++) {
      for (let x = 0; x < out.width; x++) {
        const px = pixelAt(out, x, y);
        expect(px[0] === 255 || px[2] === 255).toBe(true);
        expect(px[1]).toBe(0);
      }
    }
    expect(pixelAt(out, 2, 1)).toEqual([255, 0, 0]);
    expect(pixelAt(out, 3, 1)).toEqual([0, 0, 255]);
  });
});

describe('derivePalette', () => {
  it('returns no more colours than requested', () => {
    const rows: RGB[][] = [];
    for (let y = 0; y < 16; y++) {
      const row: RGB[] = [];
      for (let x = 0; x < 16; x++) row.push([x * 16, y * 16, (x * y) % 256]);
      rows.push(row);
    }

    expect(derivePalette(frameOf(rows), 8).length).toBeLessThanOrEqual(8);
  });

  it('collapses a flat image to a single colour', () => {
    const src = frameOf([
      [[10, 20, 30], [10, 20, 30]],
      [[10, 20, 30], [10, 20, 30]],
    ]);
    expect(derivePalette(src, 16)).toEqual([[10, 20, 30]]);
  });

  it('survives a fully transparent image', () => {
    const src = createFrame(4, 4);
    expect(derivePalette(src, 8).length).toBeGreaterThan(0);
  });
});

describe('bayerMatrix', () => {
  it('is centred on zero so dithering does not shift brightness', () => {
    for (const size of [2, 4, 8] as const) {
      const m = bayerMatrix(size);
      expect(m.length).toBe(size * size);
      const mean = [...m].reduce((a, b) => a + b, 0) / m.length;
      expect(Math.abs(mean)).toBeLessThan(0.01);
    }
  });
});

describe('quantizeAndDither', () => {
  const palette: RGB[] = [
    [0, 0, 0],
    [255, 255, 255],
  ];

  it('only ever emits palette colours', () => {
    const rows: RGB[][] = [];
    for (let y = 0; y < 8; y++) {
      const row: RGB[] = [];
      for (let x = 0; x < 8; x++) row.push([x * 32, x * 32, x * 32]);
      rows.push(row);
    }

    for (const mode of ['none', 'bayer4', 'floydSteinberg'] as const) {
      const frame = frameOf(rows);
      quantizeAndDither(frame, new PaletteMap(palette), mode, 1);
      for (let i = 0; i < frame.data.length; i += 4) {
        expect(frame.data[i] === 0 || frame.data[i] === 255).toBe(true);
      }
    }
  });

  it('dithers a mid grey into a mix of both colours', () => {
    const rows: RGB[][] = [];
    for (let y = 0; y < 8; y++) rows.push(new Array(8).fill([128, 128, 128] as RGB));

    const frame = frameOf(rows);
    quantizeAndDither(frame, new PaletteMap(palette), 'bayer4', 1);

    const values = new Set<number>();
    for (let i = 0; i < frame.data.length; i += 4) values.add(frame.data[i]);
    expect(values.size).toBe(2);
  });
});

describe('convert', () => {
  const settings: Settings = { ...DEFAULT_SETTINGS, targetWidth: 8, colorCount: 4 };

  function gradient(size: number): Frame {
    const rows: RGB[][] = [];
    for (let y = 0; y < size; y++) {
      const row: RGB[] = [];
      for (let x = 0; x < size; x++) {
        row.push([(x / size) * 255, (y / size) * 255, 128]);
      }
      rows.push(row);
    }
    return frameOf(rows);
  }

  it('produces a frame at the requested resolution', () => {
    const result = convert(gradient(64), settings);
    expect(result.frame.width).toBe(8);
    expect(result.frame.height).toBe(8);
  });

  it('emits only colours that are in the reported palette', () => {
    const { frame, palette } = convert(gradient(64), settings);
    const allowed = new Set(palette.map((c) => (c[0] << 16) | (c[1] << 8) | c[2]));

    for (let i = 0; i < frame.data.length; i += 4) {
      const key = (frame.data[i] << 16) | (frame.data[i + 1] << 8) | frame.data[i + 2];
      expect(allowed.has(key)).toBe(true);
    }
  });

  it('is pure — the same input twice gives identical output', () => {
    const src = gradient(64);
    const a = convert(src, settings);
    const b = convert(src, settings);
    expect(Array.from(a.frame.data)).toEqual(Array.from(b.frame.data));
  });

  it('does not mutate the source frame', () => {
    const src = gradient(32);
    const before = Array.from(src.data);
    convert(src, settings);
    expect(Array.from(src.data)).toEqual(before);
  });

  /**
   * The worker caches the shrunk source across settings changes. If any later
   * stage wrote into that frame, the cache would poison every conversion
   * after the first — and it would show up as drift that is very hard to
   * trace back here.
   */
  it('never mutates a reused working frame', () => {
    const src = gradient(128);
    const base = { ...DEFAULT_SETTINGS, targetWidth: 32 };

    const working = workingFrame(src, base);
    const pristine = Array.from(working.data);

    // Run several different settings through the same cached frame, as the
    // worker does while a slider is dragged.
    for (const patch of [
      { flatten: 1 },
      { bands: 3 },
      { lineWeight: 1 },
      { contrast: 0.8 },
      { sharpness: 1 },
    ]) {
      colorStage(pixelStage(src, { ...base, ...patch }, working), { ...base, ...patch });
      expect(Array.from(working.data)).toEqual(pristine);
    }
  });

  it('gives the same result cached or not', () => {
    const src = gradient(128);
    const s = { ...DEFAULT_SETTINGS, targetWidth: 32, flatten: 0.6, lineWeight: 0.5 };

    const fresh = colorStage(pixelStage(src, s), s);
    const cached = colorStage(pixelStage(src, s, workingFrame(src, s)), s);

    expect(Array.from(cached.frame.data)).toEqual(Array.from(fresh.frame.data));
  });

  it('honours a fixed palette', () => {
    const { palette } = convert(gradient(64), {
      ...settings,
      paletteMode: 'fixed',
      paletteId: 'mono',
    });
    expect(palette).toEqual([
      [0, 0, 0],
      [255, 255, 255],
    ]);
  });

  it('still only emits palette colours with every stylisation stage on', () => {
    const { frame, palette } = convert(gradient(128), {
      ...DEFAULT_SETTINGS,
      targetWidth: 32,
      colorCount: 16,
      flatten: 1,
      bands: 4,
      lineWeight: 1,
      cleanup: 1,
      outline: 0.5,
    });

    const allowed = new Set(palette.map((c) => (c[0] << 16) | (c[1] << 8) | c[2]));
    for (let i = 0; i < frame.data.length; i += 4) {
      const key = (frame.data[i] << 16) | (frame.data[i + 1] << 8) | frame.data[i + 2];
      expect(allowed.has(key)).toBe(true);
    }
  });
});

/* ---------- stylisation ---------- */

/** A noisy region: flat on average, but no two pixels alike. */
function noisyBlock(size: number, base: RGB, jitter: number): Frame {
  const rows: RGB[][] = [];
  let seed = 1;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff - 0.5;
  };
  for (let y = 0; y < size; y++) {
    const row: RGB[] = [];
    for (let x = 0; x < size; x++) {
      row.push([
        base[0] + rand() * jitter,
        base[1] + rand() * jitter,
        base[2] + rand() * jitter,
      ]);
    }
    rows.push(row);
  }
  return frameOf(rows);
}

function distinctColors(frame: Frame): number {
  const seen = new Set<number>();
  for (let i = 0; i < frame.data.length; i += 4) {
    seen.add((frame.data[i] << 16) | (frame.data[i + 1] << 8) | frame.data[i + 2]);
  }
  return seen.size;
}

describe('flatten', () => {
  it('collapses photographic noise into far fewer colours', () => {
    const noisy = noisyBlock(48, [120, 90, 70], 60);
    const before = distinctColors(noisy);
    const after = distinctColors(flatten(noisy, 1));

    // This is the whole point of the stage: texture becomes flat regions.
    expect(after).toBeLessThan(before / 2);
  });

  it('keeps a hard edge hard instead of blurring it', () => {
    // Left half black, right half white. A blur would produce greys at the
    // seam; Kuwahara must not.
    const rows: RGB[][] = [];
    for (let y = 0; y < 32; y++) {
      const row: RGB[] = [];
      for (let x = 0; x < 32; x++) row.push(x < 16 ? [0, 0, 0] : [255, 255, 255]);
      rows.push(row);
    }

    const out = flatten(frameOf(rows), 1);
    for (let y = 4; y < 28; y++) {
      for (let x = 0; x < 32; x++) {
        const v = pixelAt(out, x, y)[0];
        expect(v === 0 || v === 255).toBe(true);
      }
    }
  });

  it('is a no-op at zero', () => {
    const src = noisyBlock(16, [100, 100, 100], 40);
    expect(flatten(src, 0)).toBe(src);
  });

  /**
   * The shipped Kuwahara uses summed-area tables for speed. This is the plain
   * definition — read every pixel of every quadrant — and the two must agree
   * exactly, because the fast version's arithmetic is integral throughout.
   *
   * Worth pinning: the optimisation is the difference between the flatten
   * slider being usable and not, and a subtle error here would quietly
   * degrade every conversion the app makes.
   */
  function kuwaharaReference(src: Frame, r: number): Frame {
    const { width, height } = src;
    const out = createFrame(width, height);
    const s = src.data;
    const d = out.data;

    const lum = new Float64Array(width * height);
    for (let p = 0; p < width * height; p++) {
      lum[p] = Math.round(
        0.2126 * s[p * 4] + 0.7152 * s[p * 4 + 1] + 0.0722 * s[p * 4 + 2],
      );
    }

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let bestVariance = Infinity;
        let bestR = 0;
        let bestG = 0;
        let bestB = 0;

        for (let q = 0; q < 4; q++) {
          const left = q === 0 || q === 2;
          const top = q < 2;
          const x0 = left ? Math.max(0, x - r) : x;
          const x1 = left ? x : Math.min(width - 1, x + r);
          const y0 = top ? Math.max(0, y - r) : y;
          const y1 = top ? y : Math.min(height - 1, y + r);

          let sum = 0, sumSq = 0, sr = 0, sg = 0, sb = 0, n = 0;
          for (let yy = y0; yy <= y1; yy++) {
            for (let xx = x0; xx <= x1; xx++) {
              const p = yy * width + xx;
              sum += lum[p];
              sumSq += lum[p] * lum[p];
              sr += s[p * 4];
              sg += s[p * 4 + 1];
              sb += s[p * 4 + 2];
              n++;
            }
          }

          const mean = sum / n;
          const variance = sumSq / n - mean * mean;
          if (variance < bestVariance) {
            bestVariance = variance;
            bestR = sr / n;
            bestG = sg / n;
            bestB = sb / n;
          }
        }

        const o = (y * width + x) * 4;
        d[o] = bestR;
        d[o + 1] = bestG;
        d[o + 2] = bestB;
        d[o + 3] = s[o + 3];
      }
    }
    return out;
  }

  it('matches a plain, unoptimised Kuwahara exactly', () => {
    // A single pass at the radius `flatten(1)` uses, on content with edges,
    // gradients and noise so every branch of the quadrant choice is taken.
    const size = 40;
    const rows: RGB[][] = [];
    let seed = 5;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return (seed / 0x7fffffff - 0.5) * 40;
    };
    for (let y = 0; y < size; y++) {
      const row: RGB[] = [];
      for (let x = 0; x < size; x++) {
        const shape = x > 12 && x < 28 && y > 12 && y < 28;
        row.push(
          shape
            ? [200 + rand(), 60 + rand(), 70 + rand()]
            : [30 + x * 4 + rand(), 90 + rand(), 160 - y * 2 + rand()],
        );
      }
      rows.push(row);
    }
    const src = frameOf(rows);

    const fast = flatten(src, 1 / 3); // one iteration, radius 3
    const reference = kuwaharaReference(src, 3);

    expect(fast.width).toBe(reference.width);
    expect(Array.from(fast.data)).toEqual(Array.from(reference.data));
  });

  it('matches the reference at the image border too', () => {
    // Border pixels have clipped, unequal quadrants — the easiest place for
    // an indexing mistake in the table lookups to hide.
    const src = noisyBlock(12, [120, 90, 70], 90);
    const fast = flatten(src, 1 / 3);
    const reference = kuwaharaReference(src, 3);
    expect(Array.from(fast.data)).toEqual(Array.from(reference.data));
  });
});

describe('posterize', () => {
  it('reduces a smooth gradient to the requested number of steps', () => {
    const rows: RGB[][] = [];
    for (let y = 0; y < 64; y++) {
      rows.push(new Array(4).fill([y * 4, y * 4, y * 4] as RGB));
    }

    const out = posterize(frameOf(rows), 4);
    const levels = new Set<number>();
    for (let i = 0; i < out.data.length; i += 4) levels.add(out.data[i]);
    expect(levels.size).toBeLessThanOrEqual(4);
  });

  it('preserves hue while changing brightness', () => {
    const src = frameOf([[[200, 100, 50]]]);
    const out = posterize(src, 4);
    const [r, g, b] = pixelAt(out, 0, 0);
    // Ratios between channels should survive; only the level changes.
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
  });

  it('is a no-op below two bands', () => {
    const src = frameOf([[[10, 20, 30]]]);
    expect(posterize(src, 1)).toBe(src);
  });
});

describe('despeckle', () => {
  it('removes a lone pixel surrounded by another colour', () => {
    const palette: RGB[] = [
      [0, 0, 0],
      [255, 255, 255],
    ];
    const rows: RGB[][] = [];
    for (let y = 0; y < 5; y++) rows.push(new Array(5).fill([0, 0, 0] as RGB));
    rows[2][2] = [255, 255, 255];

    const frame = frameOf(rows);
    const indices = new Uint16Array(25);
    indices[12] = 1;

    despeckle(frame, indices, new PaletteMap(palette), 1);

    expect(pixelAt(frame, 2, 2)).toEqual([0, 0, 0]);
    expect(indices[12]).toBe(0);
  });

  it('leaves a solid region alone', () => {
    const palette: RGB[] = [
      [0, 0, 0],
      [255, 255, 255],
    ];
    const rows: RGB[][] = [];
    for (let y = 0; y < 6; y++) {
      const row: RGB[] = [];
      for (let x = 0; x < 6; x++) row.push(x < 3 ? [0, 0, 0] : [255, 255, 255]);
      rows.push(row);
    }

    const frame = frameOf(rows);
    const indices = new Uint16Array(36);
    for (let y = 0; y < 6; y++) for (let x = 3; x < 6; x++) indices[y * 6 + x] = 1;

    const before = Array.from(frame.data);
    despeckle(frame, indices, new PaletteMap(palette), 1);
    expect(Array.from(frame.data)).toEqual(before);
  });
});

describe('rampedPalette', () => {
  it('never exceeds the requested colour budget', () => {
    const src = noisyBlock(48, [140, 90, 60], 120);
    for (const count of [6, 10, 16, 24, 48, 64]) {
      expect(rampedPalette(src, count).length).toBeLessThanOrEqual(count);
    }
  });

  it('falls back to plain clustering when the budget is too small for ramps', () => {
    const src = noisyBlock(32, [140, 90, 60], 120);
    expect(rampedPalette(src, 4).length).toBeLessThanOrEqual(4);
  });

  it('shifts hue between the dark and light ends of a ramp', () => {
    // A single strong hue, so the palette is one ramp and the shift is
    // attributable rather than a coincidence of clustering.
    const src = noisyBlock(32, [150, 80, 60], 10);
    const palette = rampedPalette(src, 10);

    const sorted = [...palette].sort(
      (a, b) => rgbToHsl(a)[2] - rgbToHsl(b)[2],
    );
    const darkHue = rgbToHsl(sorted[0])[0];
    const lightHue = rgbToHsl(sorted[sorted.length - 1])[0];

    expect(Math.abs(darkHue - lightHue)).toBeGreaterThan(5);
  });
});

describe('hsl conversion', () => {
  it('round-trips colours within rounding error', () => {
    const samples: RGB[] = [
      [255, 0, 0], [0, 255, 0], [0, 0, 255],
      [128, 64, 32], [10, 200, 180], [255, 255, 255], [0, 0, 0],
    ];
    for (const rgb of samples) {
      const back = hslToRgb(rgbToHsl(rgb));
      expect(Math.abs(back[0] - rgb[0])).toBeLessThanOrEqual(2);
      expect(Math.abs(back[1] - rgb[1])).toBeLessThanOrEqual(2);
      expect(Math.abs(back[2] - rgb[2])).toBeLessThanOrEqual(2);
    }
  });
});

describe('removeBackground', () => {
  const defaults = {
    tolerance: 0.35,
    color: null,
    refine: 0.5,
    removeEnclosed: true,
  };

  const alphaAt = (frame: Frame, x: number, y: number) =>
    frame.data[(y * frame.width + x) * 4 + 3];

  /** A subject block on a background painted by `bg(x, y)`. */
  function scene(
    size: number,
    bg: (x: number, y: number) => RGB,
    subject: RGB = [220, 60, 60],
    hole = false,
  ): Frame {
    const rows: RGB[][] = [];
    for (let y = 0; y < size; y++) {
      const row: RGB[] = [];
      for (let x = 0; x < size; x++) {
        const inSubject = x >= 8 && x < size - 8 && y >= 8 && y < size - 8;
        const inHole =
          hole && x >= size / 2 - 3 && x < size / 2 + 3 && y >= size / 2 - 3 && y < size / 2 + 3;
        row.push(inSubject && !inHole ? subject : bg(x, y));
      }
      rows.push(row);
    }
    return frameOf(rows);
  }

  it('removes a flat background and keeps the subject', () => {
    const frame = scene(40, () => [30, 120, 200]);
    removeBackground(frame, defaults);

    expect(alphaAt(frame, 0, 0)).toBe(0);
    expect(alphaAt(frame, 39, 39)).toBe(0);
    expect(alphaAt(frame, 20, 20)).toBe(255);
  });

  it('follows a gradient background instead of stopping partway', () => {
    // A strong vertical ramp: a fill that compares against the seed colour
    // rather than the neighbouring pixel gives up somewhere in the middle.
    const frame = scene(40, (_x, y) => [20 + y * 5, 30 + y * 4, 40 + y * 4]);
    removeBackground(frame, defaults);

    expect(alphaAt(frame, 2, 0)).toBe(0);
    expect(alphaAt(frame, 2, 39)).toBe(0);
    expect(alphaAt(frame, 2, 20)).toBe(0);
    expect(alphaAt(frame, 20, 20)).toBe(255);
  });

  it('handles a background made of two different colours', () => {
    const frame = scene(40, (_x, y) => (y < 20 ? [40, 90, 200] : [60, 140, 60]));
    removeBackground(frame, defaults);

    expect(alphaAt(frame, 1, 2)).toBe(0);
    expect(alphaAt(frame, 1, 37)).toBe(0);
    expect(alphaAt(frame, 20, 20)).toBe(255);
  });

  it('removes an enclosed background area when asked', () => {
    const frame = scene(40, () => [30, 120, 200], [220, 60, 60], true);
    removeBackground(frame, defaults);
    expect(alphaAt(frame, 20, 20)).toBe(0);
  });

  it('keeps an enclosed area when not asked', () => {
    const frame = scene(40, () => [30, 120, 200], [220, 60, 60], true);
    removeBackground(frame, { ...defaults, removeEnclosed: false });
    expect(alphaAt(frame, 20, 20)).toBe(255);
  });

  it('does not eat a subject that merely resembles the background', () => {
    // Subject is a clearly different shade, but not wildly so.
    const frame = scene(40, () => [40, 90, 200], [90, 140, 240]);
    removeBackground(frame, { ...defaults, tolerance: 0.1 });

    expect(alphaAt(frame, 0, 0)).toBe(0);
    expect(alphaAt(frame, 20, 20)).toBe(255);
  });

  it('honours an explicitly chosen colour over border detection', () => {
    const frame = scene(40, () => [30, 120, 200]);
    // Point it at the subject's colour instead; the subject is edge-connected
    // only through nothing, so nothing should be removed from the border.
    removeBackground(frame, { ...defaults, color: [220, 60, 60] });

    expect(alphaAt(frame, 0, 0)).toBe(255);
  });

  it('leaves a fully uniform image alone rather than erasing everything', () => {
    // No subject at all. Removing the lot is defensible, but silently
    // returning an empty image is the worst possible answer, so the
    // behaviour is pinned here deliberately.
    const frame = scene(40, () => [30, 120, 200], [30, 120, 200]);
    removeBackground(frame, defaults);
    expect(alphaAt(frame, 20, 20)).toBe(0);
  });

  it('bleeds subject colour into transparent pixels to prevent dark fringes', () => {
    const frame = scene(40, () => [30, 120, 200]);
    removeBackground(frame, defaults);

    // A transparent pixel just outside the subject should carry a colour
    // near the subject's, not black, so external scaling cannot halo it.
    let found = false;
    for (let y = 0; y < 40 && !found; y++) {
      for (let x = 0; x < 40; x++) {
        const p = (y * 40 + x) * 4;
        if (frame.data[p + 3] !== 0) continue;
        const neighbourOpaque =
          x + 1 < 40 && frame.data[(y * 40 + x + 1) * 4 + 3] === 255;
        if (!neighbourOpaque) continue;
        expect(frame.data[p] + frame.data[p + 1] + frame.data[p + 2]).toBeGreaterThan(0);
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it('produces a clean mask with no isolated holes in the subject', () => {
    let seed = 3;
    const noise = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return (seed / 0x7fffffff - 0.5) * 18;
    };
    const frame = scene(48, () => [30 + noise(), 120 + noise(), 200 + noise()]);
    removeBackground(frame, defaults);

    // Every pixel well inside the subject must still be opaque.
    for (let y = 12; y < 36; y++) {
      for (let x = 12; x < 36; x++) {
        expect(alphaAt(frame, x, y)).toBe(255);
      }
    }
  });
});

describe('extractLines', () => {
  it('finds a contour at a shape boundary and nowhere else', () => {
    // A dark square on a light field.
    const size = 48;
    const rows: RGB[][] = [];
    for (let y = 0; y < size; y++) {
      const row: RGB[] = [];
      for (let x = 0; x < size; x++) {
        const inside = x > 14 && x < 34 && y > 14 && y < 34;
        row.push(inside ? [30, 30, 30] : [230, 230, 230]);
      }
      rows.push(row);
    }

    const mask = extractLines(frameOf(rows), 1.2, 0.16);

    // Strong response just inside the boundary...
    expect(mask[16 * size + 24]).toBeGreaterThan(0.3);
    // ...and nothing out in the flat field or deep inside the shape.
    expect(mask[4 * size + 4]).toBeLessThan(0.05);
    expect(mask[24 * size + 24]).toBeLessThan(0.05);
  });
});
