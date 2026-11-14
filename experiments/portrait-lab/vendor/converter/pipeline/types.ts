/**
 * Core pipeline types.
 *
 * Nothing in `pipeline/` may import from `ui/` or `state/`. These types
 * describe raw pixels and plain settings — no DOM, no React, no files.
 */

/**
 * Pixel storage, pinned to a plain ArrayBuffer.
 *
 * TypeScript 5.7+ made the typed arrays generic over their backing buffer.
 * `ImageData` and worker transfers both require a non-shared `ArrayBuffer`,
 * so we say so once here rather than casting at every canvas boundary.
 */
export type PixelData = Uint8ClampedArray<ArrayBuffer>;

/** A single frame of RGBA pixels. The pipeline's only currency. */
export interface Frame {
  data: PixelData;
  width: number;
  height: number;
}

export type RGB = [number, number, number];

export interface Palette {
  id: string;
  name: string;
  colors: RGB[];
}

export type PaletteMode = 'adaptive' | 'fixed';

/**
 * 'natural' takes the image's colours as they are. 'ramped' rebuilds them as
 * hue-shifted ramps the way a pixel artist would choose them.
 */
export type PaletteStyle = 'natural' | 'ramped';

export type DitherMode =
  | 'none'
  | 'bayer2'
  | 'bayer4'
  | 'bayer8'
  | 'floydSteinberg';

/**
 * The complete description of a conversion.
 *
 * Flat and JSON-serializable on purpose: a preset is just one of these, and
 * so is whatever the user has dragged the sliders to. Add new fields with a
 * sensible default so existing presets keep working.
 */
export interface Settings {
  /** Width of the pixel-art output, in real pixels. Height follows aspect. */
  targetWidth: number;

  /** 'adaptive' derives a palette from the image; 'fixed' uses a built-in. */
  paletteMode: PaletteMode;
  /** Number of colours to derive when paletteMode is 'adaptive'. */
  colorCount: number;
  /** Which built-in palette to use when paletteMode is 'fixed'. */
  paletteId: string;
  paletteStyle: PaletteStyle;

  /* --- Stylisation: what separates pixel art from a pixelated photo --- */

  /** 0..1. Flattens photographic texture into solid regions (Kuwahara). */
  flatten: number;
  /** Cel-shading bands. 0 or 1 disables banding. */
  bands: number;
  /** 0..1. Weight of drawn contour lines. 0 disables line extraction. */
  lineWeight: number;
  /** 0..1. Removes orphaned pixels after quantisation. */
  cleanup: number;

  /* --- Background removal --- */

  removeBackground: boolean;
  /** 0..1. How far the fill may stray from the background colour. */
  bgTolerance: number;
  /** An explicit background colour, or null to detect it from the borders. */
  bgColor: RGB | null;
  /** 0..1. Halo and speckle cleanup around the cut edge. */
  bgRefine: number;
  /** Also remove background-coloured areas enclosed by the subject. */
  bgRemoveEnclosed: boolean;

  dither: DitherMode;
  /** 0 = off, 1 = full strength. */
  ditherStrength: number;

  /** All in -1..1, where 0 is unchanged. */
  brightness: number;
  contrast: number;
  saturation: number;
  /** 0..1. Applied before downsampling, to keep detail from washing out. */
  sharpness: number;

  /** 0..1. Darkens the light side of colour boundaries. */
  outline: number;

  /** Alpha below this becomes fully transparent, at or above fully opaque. */
  alphaThreshold: number;
}

export interface ConvertResult {
  frame: Frame;
  /** The palette actually used, so the UI can display it. */
  palette: RGB[];
}

export function createFrame(width: number, height: number): Frame {
  return { data: new Uint8ClampedArray(width * height * 4), width, height };
}
