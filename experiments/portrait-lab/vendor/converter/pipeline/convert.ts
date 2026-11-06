import type { ConvertResult, Frame, PixelData, RGB, Settings } from './types';
import { PaletteMap } from './color';
import { adjust, sharpen } from './adjust';
import { flatten, posterize } from './flatten';
import { downsample, targetSize, thresholdAlpha } from './pixelate';
import { derivePalette } from './quantize';
import { rampedPalette } from './ramps';
import { quantizeAndDither } from './dither';
import { removeBackground } from './background';
import { compositeLines, downsampleMask, extractLines } from './lines';
import { despeckle } from './cleanup';
import { applyOutline } from './edges';
import { getPalette } from '../palettes';

/**
 * The pipeline.
 *
 *   adjust → sharpen → flatten → posterise → pixelate
 *          → quantize + dither → despeckle → lines → outline
 *
 * The middle three stages are what make this a pixel-art converter rather
 * than a pixelate filter. Shrinking a photograph and reducing its colours is
 * a faithful reproduction of a photograph at low resolution; it is not what a
 * person drawing pixel art produces. They flatten regions to solid colour,
 * step the lighting into bands, draw contours, and never leave a stray pixel.
 * Those are the stages, and they happen *before* the downsample, because
 * abstraction has to occur while there is still detail to abstract.
 *
 * Pure: the same frame and settings always produce the same result, with no
 * globals and no shared state. That is what lets it run in a worker, in a
 * test, or one day over every frame of a video without modification.
 *
 * Note what is *not* here: upscaling. The output is the pixel art at its true
 * resolution. Scaling for display or export happens at the edges of the
 * system, with nearest-neighbour only.
 */
export function convert(src: Frame, settings: Settings): ConvertResult {
  return colorStage(pixelStage(src, settings), settings);
}

/** Stage one's output: the shrunk frame, plus contours if they were asked for. */
export interface Prepared {
  frame: Frame;
  lines: Float32Array | null;
}

/**
 * Stylisation happens at a multiple of the output resolution, not at full
 * source resolution.
 *
 * Kuwahara and the blur passes cost real time per pixel, and running them on
 * a 24-megapixel photo to produce a 128px image is waste — the detail is
 * about to be averaged away regardless. Working at roughly four output pixels
 * per axis keeps the flattening at the right visual scale while keeping the
 * slider responsive.
 */
const STYLISE_SCALE = 4;
const MAX_STYLISE_PIXELS = 1_400_000;

function styliseSize(src: Frame, outW: number, outH: number) {
  let width = Math.min(src.width, outW * STYLISE_SCALE);
  let height = Math.max(1, Math.round((width * outH) / outW));

  if (width * height > MAX_STYLISE_PIXELS) {
    const shrink = Math.sqrt(MAX_STYLISE_PIXELS / (width * height));
    width = Math.max(outW, Math.round(width * shrink));
    height = Math.max(outH, Math.round(height * shrink));
  }

  return { width, height };
}

/**
 * Stage 1 — everything that depends on the full-resolution source.
 *
 * Split out from `convert` purely so the worker can cache it: this is the
 * expensive half, and it does not change when the user is only adjusting
 * palette or dithering. See `stageOneKey`.
 */
/**
 * The source shrunk to stylisation resolution — the first thing stage one
 * does, and on a large import the most expensive single step in it.
 *
 * Kept separate so the worker can cache it. Within one image the result
 * depends on nothing but `targetWidth`, which means dragging flatten,
 * shading steps, line art or any of the tonal controls can reuse it — and
 * those are exactly the controls worth dragging. With it cached, a settings
 * change stops touching the full-resolution source at all, which is the
 * single largest remaining cost in stage one.
 */
export function workingFrame(src: Frame, settings: Settings): Frame {
  const out = targetSize(src, settings.targetWidth);
  const work = styliseSize(src, out.width, out.height);
  return work.width < src.width ? downsample(src, work.width, work.height) : src;
}

/** What `workingFrame` depends on, for the worker's cache. */
export function workingKey(settings: Settings): number {
  return settings.targetWidth;
}

export function pixelStage(
  src: Frame,
  settings: Settings,
  /** A cached `workingFrame` for this source and target width. */
  working: Frame = workingFrame(src, settings),
): Prepared {
  const out = targetSize(src, settings.targetWidth);

  /*
   * Shrink to the stylisation resolution first, then do the per-pixel work.
   *
   * Running adjust and sharpen on the full source instead costs roughly
   * twenty times as much — a 2400x1600 import is 3.8 million pixels, and
   * sharpening alone is a 3x3 convolution across every one of them — and it
   * buys nothing. Sharpening at full size and *then* averaging down by five
   * cancels most of the sharpening anyway, because the area filter eats the
   * very halos that were just added.
   *
   * Sharpening here, at four output pixels per axis, is where it actually
   * survives into the result.
   *
   * The saving is structural rather than a micro-optimisation: on a
   * 2400x1600 import these passes drop from 3.8 million pixels to roughly
   * 175 thousand. Measured back to back it was about an order of magnitude
   * off the whole stage, which is the difference between the flatten and
   * resolution sliders being unusable and being live.
   */
  const adjusted = sharpen(adjust(working, settings), settings.sharpness);
  const flattened = posterize(flatten(adjusted, settings.flatten), settings.bands);

  // Contours are found at the working resolution, where there is enough
  // detail for them to follow real forms, then shrunk to the output grid.
  let lines: Float32Array | null = null;
  if (settings.lineWeight > 0) {
    const sigma = Math.max(0.7, flattened.width / out.width / 1.8);
    const mask = extractLines(flattened, sigma, 0.16);
    lines = downsampleMask(mask, flattened.width, flattened.height, out.width, out.height);
  }

  const small = downsample(flattened, out.width, out.height);
  thresholdAlpha(small, settings.alphaThreshold);

  return { frame: small, lines };
}

/**
 * Stage 2 — everything that operates on the already-small frame. Cheap.
 *
 * Copies its input so a cached stage-one frame can be reused across many
 * calls; the quantiser writes colours in place.
 */
export function colorStage(prepared: Prepared, settings: Settings): ConvertResult {
  const small = prepared.frame;
  const frame: Frame = {
    data: new Uint8ClampedArray(small.data) as PixelData,
    width: small.width,
    height: small.height,
  };

  // Before the palette is derived, not after: `derivePalette` ignores
  // transparent pixels, so cutting the background first means every palette
  // entry gets spent on the subject instead of on colours we just deleted.
  if (settings.removeBackground) {
    removeBackground(frame, {
      tolerance: settings.bgTolerance,
      color: settings.bgColor,
      refine: settings.bgRefine,
      removeEnclosed: settings.bgRemoveEnclosed,
    });
  }

  const colors: RGB[] = choosePalette(frame, settings);
  const map = new PaletteMap(colors);

  const indices = quantizeAndDither(
    frame,
    map,
    settings.dither,
    settings.ditherStrength,
  );

  // Order matters: clean up speckle first so despeckling cannot erase the
  // contours, then draw lines, then trace remaining shape edges.
  despeckle(frame, indices, map, settings.cleanup);
  if (prepared.lines) {
    compositeLines(frame, indices, map, prepared.lines, settings.lineWeight);
  }
  applyOutline(frame, indices, map, settings.outline);

  return { frame, palette: colors };
}

function choosePalette(frame: Frame, settings: Settings): RGB[] {
  if (settings.paletteMode === 'fixed') return getPalette(settings.paletteId).colors;
  if (settings.paletteStyle === 'ramped') return rampedPalette(frame, settings.colorCount);
  return derivePalette(frame, settings.colorCount);
}

/**
 * Settings that stage one depends on. The worker reuses its cached
 * downsampled frame whenever this key is unchanged, which is what makes
 * dragging the palette and dither controls feel instant on a large photo.
 */
export function stageOneKey(s: Settings): string {
  return [
    s.targetWidth,
    s.brightness,
    s.contrast,
    s.saturation,
    s.sharpness,
    s.alphaThreshold,
    s.flatten,
    s.bands,
    s.lineWeight,
  ].join('|');
}
