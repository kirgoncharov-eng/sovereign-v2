import type { RGB } from './types';
import type { Frame } from './types';
import { PaletteMap, colorDistance, luminance } from './color';

/**
 * How far apart neighbouring palette colours typically are.
 *
 * This is the key to telling a real shape edge from gradient banding. A
 * smooth sky quantised to a small palette produces bands whose neighbours are
 * *adjacent* palette entries — one step apart. The edge of a hill or a face
 * jumps much further. Outlining anything one step apart draws dark contour
 * lines across every sky; requiring a multi-step jump traces only the shapes
 * we actually want outlined.
 */
function medianPaletteStep(colors: RGB[]): number {
  if (colors.length < 2) return Infinity;

  const nearest: number[] = [];
  for (let i = 0; i < colors.length; i++) {
    let best = Infinity;
    for (let j = 0; j < colors.length; j++) {
      if (i === j) continue;
      const d = colorDistance(
        colors[i][0], colors[i][1], colors[i][2],
        colors[j][0], colors[j][1], colors[j][2],
      );
      if (d < best) best = d;
    }
    nearest.push(best);
  }

  nearest.sort((a, b) => a - b);
  return nearest[nearest.length >> 1];
}

/**
 * Darken the lighter side of colour boundaries.
 *
 * Hand-drawn pixel art almost always outlines its shapes, which is a large
 * part of why converted photographs can look flat and "filtered" next to real
 * sprite work. Finding boundaries in the already-quantised index map is both
 * cheap and more reliable than running an edge detector on the source: by
 * this point the image has only a handful of colours, so a boundary between
 * two of them is exactly the shape edge we want to trace.
 *
 * The darkened result is re-snapped to the palette, so outlining can never
 * introduce a colour that is not supposed to be in the image.
 */
export function applyOutline(
  frame: Frame,
  indices: Uint16Array,
  map: PaletteMap,
  amount: number,
): void {
  if (amount <= 0) return;

  const { width, height } = frame;
  const d = frame.data;
  const colors = map.colors;
  const factor = 1 - amount * 0.5;

  // Read from a snapshot so a darkened pixel cannot seed further darkening
  // in the same pass, which would thicken outlines unpredictably.
  const source = indices.slice();
  const lum = new Float32Array(colors.length);
  for (let i = 0; i < colors.length; i++) {
    lum[i] = luminance(colors[i][0], colors[i][1], colors[i][2]);
  }

  // Precomputed because every pixel asks about up to four neighbours, and a
  // palette is at most a few dozen entries.
  const n = colors.length;
  const distance = new Float32Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = colorDistance(
        colors[i][0], colors[i][1], colors[i][2],
        colors[j][0], colors[j][1], colors[j][2],
      );
      distance[i * n + j] = d;
      distance[j * n + i] = d;
    }
  }

  const minEdge = medianPaletteStep(colors) * 4;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      if (d[p * 4 + 3] === 0) continue;

      const own = source[p];
      const ownLum = lum[own];
      let onLightSide = false;

      const isEdge = (neighbour: number): boolean =>
        neighbour !== own &&
        lum[neighbour] < ownLum - 18 &&
        distance[own * n + neighbour] > minEdge;

      // 4-neighbourhood: diagonals produce chunky, uneven corners at these
      // resolutions.
      if (x > 0 && isEdge(source[p - 1])) onLightSide = true;
      else if (x + 1 < width && isEdge(source[p + 1])) onLightSide = true;
      else if (y > 0 && isEdge(source[p - width])) onLightSide = true;
      else if (y + 1 < height && isEdge(source[p + width])) onLightSide = true;

      // A transparent neighbour is a silhouette edge, and wants an outline too.
      if (!onLightSide) {
        if (
          (x > 0 && d[(p - 1) * 4 + 3] === 0) ||
          (x + 1 < width && d[(p + 1) * 4 + 3] === 0) ||
          (y > 0 && d[(p - width) * 4 + 3] === 0) ||
          (y + 1 < height && d[(p + width) * 4 + 3] === 0)
        ) {
          onLightSide = true;
        }
      }

      if (!onLightSide || ownLum < 24) continue;

      const c = colors[own];
      const idx = map.nearestIndex(
        Math.round(c[0] * factor),
        Math.round(c[1] * factor),
        Math.round(c[2] * factor),
      );
      indices[p] = idx;
      const nc = colors[idx];
      d[p * 4] = nc[0];
      d[p * 4 + 1] = nc[1];
      d[p * 4 + 2] = nc[2];
    }
  }
}
