// Only font files carry OFL terms. The game's code, prose and result images are not relicensed.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const CARD_FONTS = [
  { name: 'Handjet', file: 'handjet-bold.ttf', weight: 700, style: 'normal' },
  { name: 'Handjet', file: 'handjet-regular.ttf', weight: 400, style: 'normal' },
  { name: 'Serif', file: 'SovereignSerif-Bold.ttf', weight: 700, style: 'normal' },
  { name: 'Serif', file: 'SovereignSerif-Regular.ttf', weight: 400, style: 'normal' },
  { name: 'Serif', file: 'SovereignSerif-Italic.ttf', weight: 400, style: 'italic' },
] as const;

async function readCardFonts() {
  return Promise.all(CARD_FONTS.map(async ({ name, file, weight, style }) => ({
    name, weight, style, data: await readFile(join(process.cwd(), 'assets/fonts', file)),
  })));
}

let fonts: ReturnType<typeof readCardFonts> | null = null;
export const loadCardFonts = () => fonts ??= readCardFonts();
