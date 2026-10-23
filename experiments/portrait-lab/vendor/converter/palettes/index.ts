import type { Palette, RGB } from '../pipeline/types';
import { hexToRgb } from '../pipeline/color';

function p(id: string, name: string, hexes: string[]): Palette {
  return { id, name, colors: hexes.map(hexToRgb) as RGB[] };
}

/**
 * Built-in fixed palettes.
 *
 * These are a stylistic choice rather than a faithful one — picking Game Boy
 * commits the image to four greens no matter what was in it. The adaptive
 * palette is the default for that reason; these are here for when the user
 * wants a specific era rather than a good likeness.
 *
 * Adding one is adding an entry to this list. Nothing else changes.
 */
export const PALETTES: Palette[] = [
  p('gameboy', 'Game Boy', ['0f380f', '306230', '8bac0f', '9bbc0f']),
  p('pico8', 'PICO-8', [
    '000000', '1d2b53', '7e2553', '008751',
    'ab5236', '5f574f', 'c2c3c7', 'fff1e8',
    'ff004d', 'ffa300', 'ffec27', '00e436',
    '29adff', '83769c', 'ff77a8', 'ffccaa',
  ]),
  p('sweetie16', 'Sweetie 16', [
    '1a1c2c', '5d275d', 'b13e53', 'ef7d57',
    'ffcd75', 'a7f070', '38b764', '257179',
    '29366f', '3b5dc9', '41a6f6', '73eff7',
    'f4f4f4', '94b0c2', '566c86', '333c57',
  ]),
  p('cga', 'CGA 16', [
    '000000', '0000aa', '00aa00', '00aaaa',
    'aa0000', 'aa00aa', 'aa5500', 'aaaaaa',
    '555555', '5555ff', '55ff55', '55ffff',
    'ff5555', 'ff55ff', 'ffff55', 'ffffff',
  ]),
  p('nes', 'NES', [
    '000000', 'fcfcfc', 'f8f8f8', 'bcbcbc',
    '7c7c7c', 'a4e4fc', '3cbcfc', '0078f8',
    'b8b8f8', '6888fc', 'd8b8f8', '9878f8',
    'f8b8f8', 'f878f8', 'f8a4c0', 'f85898',
    'f0d0b0', 'fca044', 'e45c10', 'f0bc3c',
    'b8f818', '58d854', '00a800', '00b800',
  ]),
  p('grayscale4', 'Grayscale 4', ['000000', '555555', 'aaaaaa', 'ffffff']),
  p('grayscale8', 'Grayscale 8', [
    '000000', '242424', '484848', '6d6d6d',
    '919191', 'b6b6b6', 'dadada', 'ffffff',
  ]),
  p('mono', 'Monochrome', ['000000', 'ffffff']),
  p('amber', 'Amber CRT', ['0c0600', '43290a', '9c6116', 'ffb000']),
];

const BY_ID = new Map(PALETTES.map((pal) => [pal.id, pal]));

/** Falls back to the first palette rather than throwing — a bad id in a
 *  hand-edited preset should not take down the app. */
export function getPalette(id: string): Palette {
  return BY_ID.get(id) ?? PALETTES[0];
}
