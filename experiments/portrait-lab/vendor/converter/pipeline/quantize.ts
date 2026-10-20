import type { Frame, RGB } from './types';

/**
 * Derive a palette from the image itself, using median cut.
 *
 * Median cut treats the image's colours as a cloud in RGB space, then
 * repeatedly splits the most-spread box at its median until it has the
 * requested number of boxes. Averaging each box gives a palette that spends
 * its colours where the image actually needs them.
 *
 * This is what makes an arbitrary photograph look good: a fixed retro palette
 * is a strong stylistic choice, but an adaptive one is a faithful one.
 */
export function derivePalette(frame: Frame, count: number): RGB[] {
  const d = frame.data;
  const wanted = Math.max(2, Math.min(256, Math.round(count)));

  // Only opaque-ish pixels get a say; transparent ones have no real colour.
  const pixels: number[] = [];
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] >= 8) pixels.push(i);
  }
  if (pixels.length === 0) return [[0, 0, 0]];

  let buckets: number[][] = [pixels];

  while (buckets.length < wanted) {
    let target = -1;
    let targetScore = 0;
    let targetChannel = 0;

    // Split whichever bucket spans the most colour, weighted by how many
    // pixels it represents — a wide box covering two pixels matters less
    // than a narrower one covering half the image.
    for (let bi = 0; bi < buckets.length; bi++) {
      const bucket = buckets[bi];
      if (bucket.length < 2) continue;

      const { range, channel } = channelRange(d, bucket);
      const score = range * Math.log2(bucket.length + 1);
      if (score > targetScore) {
        targetScore = score;
        target = bi;
        targetChannel = channel;
      }
    }

    if (target === -1) break; // Image has fewer distinct colours than asked for.

    const bucket = buckets[target];
    bucket.sort((a, b) => d[a + targetChannel] - d[b + targetChannel]);
    const mid = bucket.length >> 1;
    buckets.splice(target, 1, bucket.slice(0, mid), bucket.slice(mid));
  }

  const palette = buckets.filter((b) => b.length > 0).map((b) => averageColor(d, b));
  return dedupe(palette);
}

function channelRange(
  d: Uint8ClampedArray,
  bucket: number[],
): { range: number; channel: number } {
  let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0;

  for (const i of bucket) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    if (r < rMin) rMin = r;
    if (r > rMax) rMax = r;
    if (g < gMin) gMin = g;
    if (g > gMax) gMax = g;
    if (b < bMin) bMin = b;
    if (b > bMax) bMax = b;
  }

  // Weight the spread the way the eye weights the channel, so we do not
  // spend palette entries resolving blue gradients nobody can see.
  const rSpread = (rMax - rMin) * 1.0;
  const gSpread = (gMax - gMin) * 1.4;
  const bSpread = (bMax - bMin) * 0.7;

  if (gSpread >= rSpread && gSpread >= bSpread) return { range: gSpread, channel: 1 };
  if (rSpread >= bSpread) return { range: rSpread, channel: 0 };
  return { range: bSpread, channel: 2 };
}

function averageColor(d: Uint8ClampedArray, bucket: number[]): RGB {
  let r = 0, g = 0, b = 0;
  for (const i of bucket) {
    r += d[i];
    g += d[i + 1];
    b += d[i + 2];
  }
  const n = bucket.length;
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

function dedupe(colors: RGB[]): RGB[] {
  const seen = new Set<number>();
  const out: RGB[] = [];
  for (const c of colors) {
    const key = (c[0] << 16) | (c[1] << 8) | c[2];
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out.length > 0 ? out : [[0, 0, 0]];
}
