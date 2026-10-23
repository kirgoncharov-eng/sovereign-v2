import type { Frame } from './types';
import { PaletteMap } from './color';

/**
 * Remove orphaned pixels.
 *
 * This is the clearest tell of an automated conversion. In hand-made pixel
 * art every pixel is deliberate, and a lone pixel of a colour none of its
 * neighbours share simply never happens. Quantising a photograph produces
 * them constantly, and the eye reads the speckle as noise — as a filter
 * artefact rather than a drawing.
 *
 * Any pixel with too few like-coloured neighbours is replaced by whichever
 * colour surrounds it most. Cheap, and it does more for the "hand-made" read
 * than any amount of extra palette work.
 */
export function despeckle(
  frame: Frame,
  indices: Uint16Array,
  map: PaletteMap,
  amount: number,
): void {
  if (amount <= 0) return;

  const passes = amount > 0.66 ? 2 : 1;
  // How many matching neighbours a pixel needs to be left alone. At the
  // lowest setting only fully isolated pixels go.
  const required = amount > 0.33 ? 2 : 1;

  const { width, height } = frame;
  const colors = map.colors;
  const d = frame.data;

  for (let pass = 0; pass < passes; pass++) {
    const source = indices.slice();
    const tally = new Map<number, number>();

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = y * width + x;
        if (d[p * 4 + 3] === 0) continue;

        const own = source[p];
        tally.clear();
        let same = 0;

        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= height) continue;
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const xx = x + dx;
            if (xx < 0 || xx >= width) continue;

            const n = source[yy * width + xx];
            if (n === own) same++;
            tally.set(n, (tally.get(n) ?? 0) + 1);
          }
        }

        if (same >= required) continue;

        let winner = own;
        let winnerCount = 0;
        for (const [index, seen] of tally) {
          if (seen > winnerCount) {
            winnerCount = seen;
            winner = index;
          }
        }

        if (winner === own) continue;

        indices[p] = winner;
        const c = colors[winner];
        d[p * 4] = c[0];
        d[p * 4 + 1] = c[1];
        d[p * 4 + 2] = c[2];
      }
    }
  }
}
