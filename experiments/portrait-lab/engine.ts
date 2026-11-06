import { convert } from './vendor/converter/pipeline/convert';
import { PALETTES } from './vendor/converter/palettes';
import { DEFAULT_SETTINGS } from './vendor/converter/presets';
import type { Frame } from './vendor/converter/pipeline/types';

// Пробная палитра эксперимента, ещё не художественный стандарт Gemini.
export const COLOR_PALETTE: [number, number, number][] = [
  [20, 22, 22], [35, 36, 32], [52, 48, 39], [72, 61, 47],
  [94, 73, 54], [119, 88, 64], [144, 106, 76], [169, 126, 91],
  [192, 149, 111], [212, 174, 134], [230, 197, 157], [244, 220, 185],
  [71, 76, 62], [94, 102, 81], [128, 133, 108], [169, 170, 140],
  [44, 57, 63], [65, 82, 90], [93, 111, 117], [135, 151, 153],
  [92, 48, 41], [133, 68, 52], [174, 95, 70], [224, 217, 195],
];

// Тона опираются на тёмный контур, волосы и бумагу amb_russia.webp; это ещё не утверждённый пресет.
export const PALETTE: [number, number, number][] = [
  [42, 32, 22], [65, 53, 39], [85, 71, 57], [105, 91, 72],
  [129, 115, 92], [163, 149, 124], [195, 181, 156], [229, 216, 188],
];
export const PALETTES_BY_NAME = { cabinet: PALETTE, color: COLOR_PALETTE };

export function stylize(frame: Frame, width = 64, strength = 0.5, paletteName: keyof typeof PALETTES_BY_NAME = 'cabinet') {
  if (![48, 64, 96].includes(width)) throw new Error('Unsupported portrait size');
  if (!Number.isFinite(strength) || strength < 0 || strength > 1) throw new Error('Invalid strength');
  if (!frame.width || !frame.height || frame.data.length !== frame.width * frame.height * 4) {
    throw new Error('Invalid frame');
  }
  // Upstream exposes mutable palette objects; change only the local module's palette.
  if (!PALETTES_BY_NAME[paletteName]) throw new Error('Invalid palette');
  PALETTES[0].colors = PALETTES_BY_NAME[paletteName].map(color => [...color]);
  return convert(frame, {
    ...DEFAULT_SETTINGS, targetWidth: width, paletteMode: 'fixed', paletteId: PALETTES[0].id,
    flatten: strength, bands: 0, lineWeight: strength * 0.35,
    cleanup: 0.25, contrast: 0.05, saturation: 0,
    outline: 0.1, sharpness: 0.2, dither: 'none', removeBackground: false,
  }).frame;
}
