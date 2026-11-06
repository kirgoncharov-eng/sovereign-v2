import type { Settings } from '../pipeline/types';

/**
 * The starting point for a new image.
 *
 * These defaults matter more than any single feature: most people will never
 * touch a control, so this is the result the tool is judged on.
 *
 * They are deliberately *stylised* rather than faithful. A faithful
 * conversion of a photograph is a small photograph, and it reads as a filter.
 * Flattening, banded shading, ramped colour and contour lines are all on by
 * default because together they are what make the output read as pixel art.
 */
export const DEFAULT_SETTINGS: Settings = {
  targetWidth: 128,

  paletteMode: 'adaptive',
  colorCount: 24,
  paletteId: 'pico8',
  paletteStyle: 'ramped',

  flatten: 0.5,
  bands: 6,
  lineWeight: 0.35,
  cleanup: 0.5,

  removeBackground: false,
  bgTolerance: 0.35,
  bgColor: null,
  bgRefine: 0.5,
  bgRemoveEnclosed: true,

  dither: 'none',
  ditherStrength: 0.5,

  brightness: 0,
  contrast: 0.12,
  saturation: 0.2,
  sharpness: 0.3,

  outline: 0.2,
  alphaThreshold: 128,
};

export interface Preset {
  id: string;
  name: string;
  /** One line explaining the look, shown as a tooltip. */
  description: string;
  settings: Settings;
}

function preset(
  id: string,
  name: string,
  description: string,
  overrides: Partial<Settings>,
): Preset {
  return { id, name, description, settings: { ...DEFAULT_SETTINGS, ...overrides } };
}

/**
 * A preset is nothing but a named Settings object.
 *
 * That is the whole design: adding a style is adding an entry here, and never
 * requires touching the conversion pipeline. If it ever does, the pipeline is
 * wrong.
 */
export const PRESETS: Preset[] = [
  preset('balanced', 'Pixel Art', 'The default. Flattened, banded and outlined.', {}),

  preset('cartoon', 'Cartoon', 'Heavy flattening, few shades, bold ink lines.', {
    targetWidth: 144,
    colorCount: 20,
    flatten: 0.85,
    bands: 4,
    lineWeight: 0.85,
    cleanup: 0.7,
    contrast: 0.2,
    saturation: 0.25,
    outline: 0.15,
  }),

  preset('celshaded', 'Cel Shaded', 'Flat blocks of colour with crisp shading steps.', {
    targetWidth: 160,
    colorCount: 28,
    flatten: 0.75,
    bands: 3,
    lineWeight: 0.35,
    cleanup: 0.6,
    saturation: 0.35,
    outline: 0.25,
  }),

  preset('classic8bit', 'Classic 8-bit', 'Chunky pixels, few colours, ordered dithering.', {
    targetWidth: 96,
    colorCount: 16,
    flatten: 0.6,
    bands: 4,
    lineWeight: 0.5,
    cleanup: 0.5,
    dither: 'bayer4',
    ditherStrength: 0.5,
    contrast: 0.2,
    saturation: 0.35,
    outline: 0.3,
  }),

  preset('sixteenbit', '16-bit', 'Richer palette and finer detail, like a 90s console.', {
    targetWidth: 192,
    colorCount: 48,
    flatten: 0.45,
    bands: 6,
    lineWeight: 0.35,
    cleanup: 0.4,
    dither: 'bayer2',
    ditherStrength: 0.3,
    saturation: 0.25,
    sharpness: 0.4,
    outline: 0.2,
  }),

  preset('sprite', 'Game Sprite', 'Small, punchy and heavily outlined.', {
    targetWidth: 64,
    colorCount: 12,
    flatten: 0.9,
    bands: 3,
    lineWeight: 0.9,
    cleanup: 0.9,
    dither: 'none',
    contrast: 0.3,
    saturation: 0.45,
    sharpness: 0.5,
    outline: 0.5,
  }),

  preset('lowres', 'Low-res', 'Very few pixels. Shapes and colour only.', {
    targetWidth: 40,
    colorCount: 8,
    flatten: 0.9,
    bands: 3,
    lineWeight: 0.3,
    cleanup: 1,
    dither: 'none',
    contrast: 0.25,
    saturation: 0.35,
    sharpness: 0.6,
    outline: 0.2,
  }),

  preset('highdetail', 'High Detail', 'Maximum fidelity while still reading as pixel art.', {
    targetWidth: 256,
    colorCount: 64,
    flatten: 0.3,
    bands: 8,
    lineWeight: 0.25,
    cleanup: 0.3,
    dither: 'floydSteinberg',
    ditherStrength: 0.45,
    sharpness: 0.4,
    outline: 0.1,
  }),

  preset('arcade', 'Retro Arcade', 'Saturated CGA palette with a hard dither.', {
    targetWidth: 112,
    paletteMode: 'fixed',
    paletteId: 'cga',
    flatten: 0.6,
    bands: 4,
    lineWeight: 0.4,
    cleanup: 0.4,
    dither: 'bayer8',
    ditherStrength: 0.75,
    contrast: 0.25,
    saturation: 0.5,
    outline: 0.2,
  }),

  preset('gameboy', 'Game Boy', 'Four shades of green, the way it was.', {
    targetWidth: 160,
    paletteMode: 'fixed',
    paletteId: 'gameboy',
    flatten: 0.5,
    bands: 4,
    lineWeight: 0.4,
    cleanup: 0.3,
    dither: 'bayer4',
    ditherStrength: 0.8,
    contrast: 0.3,
    sharpness: 0.45,
    outline: 0,
  }),

  preset('mono', 'Monochrome', 'Pure black and white, held together by dithering.', {
    targetWidth: 128,
    paletteMode: 'fixed',
    paletteId: 'mono',
    flatten: 0.4,
    bands: 0,
    lineWeight: 0,
    cleanup: 0,
    dither: 'floydSteinberg',
    ditherStrength: 1,
    contrast: 0.2,
    sharpness: 0.5,
    outline: 0,
  }),

  preset('limited', 'Limited Palette', 'A handful of ramped colours. Bold and graphic.', {
    targetWidth: 128,
    colorCount: 10,
    flatten: 0.85,
    bands: 3,
    lineWeight: 0.55,
    cleanup: 0.8,
    dither: 'none',
    contrast: 0.3,
    saturation: 0.45,
    sharpness: 0.45,
    outline: 0.3,
  }),

  preset('photographic', 'Photographic', 'No stylisation — plain downscale and quantise.', {
    targetWidth: 192,
    colorCount: 48,
    paletteStyle: 'natural',
    flatten: 0,
    bands: 0,
    lineWeight: 0,
    cleanup: 0,
    dither: 'floydSteinberg',
    ditherStrength: 0.5,
    outline: 0,
  }),
];
