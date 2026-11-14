import type { Frame, RGB } from './types';
import { colorDistance } from './color';

export interface BackgroundOptions {
  /** 0..1. How far the fill may stray from the reference colour. */
  tolerance: number;
  /** Explicit background colour, or null to detect it from the borders. */
  color: RGB | null;
  /** 0..1. Strength of the halo and speckle cleanup afterwards. */
  refine: number;
  /** Also remove background-coloured areas enclosed by the subject. */
  removeEnclosed: boolean;
}

/**
 * Remove a solid background, setting alpha to zero where it is found.
 *
 * Run on the flattened frame *before* palette derivation. That ordering does
 * two things: the flatten stage has already collapsed the background into a
 * genuinely uniform region, which is the hard part of background removal
 * solved by a stage that exists for other reasons; and deleting it first
 * stops the palette spending entries on colours that are about to become
 * transparent.
 *
 * The naive version of this — flood fill from a corner with one tolerance —
 * fails in five predictable ways. Each is handled below:
 *
 *  1. Gradient backgrounds (vignettes, lit walls, skies). A single tolerance
 *     against one seed colour either stops partway or swallows the subject.
 *     Handled by testing continuity against the *neighbouring pixel* rather
 *     than the seed, so the fill walks along a gradient, with a generous
 *     global bound to stop it drifting somewhere unrelated.
 *  2. Soft or anti-aliased subject edges leaving a coloured halo. Handled by
 *     the defringe pass.
 *  3. Background visible through the subject — between an arm and a body —
 *     which no edge-connected fill can reach. Handled by the enclosed pass.
 *  4. Backgrounds that are several colours (sky above, wall below). Handled
 *     by detecting up to four reference colours instead of one.
 *  5. Noise leaving speckle in the mask. Handled by the cleanup pass.
 *
 * Deliberately *not* handled: separating a subject from a busy or textured
 * background. That is semantic segmentation, it needs a model, and a
 * multi-megabyte download would break this project's promise to be small and
 * work offline immediately. This removes solid backgrounds, and says so.
 */
export function removeBackground(frame: Frame, options: BackgroundOptions): void {
  const { width, height } = frame;
  const count = width * height;
  const d = frame.data;

  const refs = options.color ? [options.color] : detectBorderColors(frame);
  if (refs.length === 0) return;

  // Tolerances are expressed as a per-channel difference and converted, so
  // the slider behaves the way a person expects rather than tracking a
  // squared, channel-weighted quantity.
  const localMax = channelDelta(3 + options.tolerance * 24);
  const globalMax = channelDelta(18 + options.tolerance * 104);

  const isBackground = new Uint8Array(count);
  const queue = new Int32Array(count);
  let head = 0;
  let tail = 0;

  const nearReference = (p: number, max: number): boolean => {
    const i = p * 4;
    for (const ref of refs) {
      if (colorDistance(d[i], d[i + 1], d[i + 2], ref[0], ref[1], ref[2]) <= max) {
        return true;
      }
    }
    return false;
  };

  // Pixels the source already had as transparent count as background, so the
  // fill flows through them instead of treating them as a wall.
  for (let p = 0; p < count; p++) {
    if (d[p * 4 + 3] === 0) {
      isBackground[p] = 1;
      queue[tail++] = p;
    }
  }

  const seed = (p: number) => {
    if (isBackground[p] || !nearReference(p, globalMax)) return;
    isBackground[p] = 1;
    queue[tail++] = p;
  };
  for (let x = 0; x < width; x++) {
    seed(x);
    seed((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    seed(y * width);
    seed(y * width + width - 1);
  }

  floodFrom(queue, head, tail, isBackground, d, width, height, localMax, (p) =>
    nearReference(p, globalMax),
  );

  if (options.removeEnclosed) {
    removeEnclosedRegions(frame, isBackground, refs, globalMax * 0.55);
  }

  defringe(frame, isBackground, refs, globalMax, options.refine);
  tidyMask(frame, isBackground, options.refine);
  removeSmallIslands(isBackground, width, height, options.refine);

  for (let p = 0; p < count; p++) {
    if (isBackground[p]) d[p * 4 + 3] = 0;
  }

  bleedEdgeColors(frame);
}

/**
 * Breadth-first fill whose continuity test is against the pixel we came
 * from, not against the seed.
 *
 * This is what lets a vignetted or unevenly lit background come away in one
 * piece: each step only has to be small, so the fill follows a gradient
 * indefinitely. `withinBounds` is the leash that stops it walking off across
 * the whole image.
 */
function floodFrom(
  queue: Int32Array,
  head: number,
  tail: number,
  isBackground: Uint8Array,
  d: Uint8ClampedArray,
  width: number,
  height: number,
  localMax: number,
  withinBounds: (p: number) => boolean,
): void {
  while (head < tail) {
    const p = queue[head++];
    const i = p * 4;
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const x = p % width;
    const y = (p / width) | 0;

    const visit = (q: number) => {
      if (isBackground[q]) return;
      const j = q * 4;
      // A large step means we just hit a boundary. The continuity test is
      // the edge barrier; no separate edge detector is needed.
      if (colorDistance(r, g, b, d[j], d[j + 1], d[j + 2]) > localMax) return;
      if (!withinBounds(q)) return;
      isBackground[q] = 1;
      queue[tail++] = q;
    };

    if (x > 0) visit(p - 1);
    if (x + 1 < width) visit(p + 1);
    if (y > 0) visit(p - width);
    if (y + 1 < height) visit(p + width);
  }
}

/**
 * The dominant colours around the image border.
 *
 * Taking a single corner pixel is fragile — it might be a speck of noise, or
 * the one dark corner of a vignette. Bucketing the whole border and keeping
 * every colour that accounts for a meaningful share of it handles a
 * two-tone background (sky over wall) as easily as a plain one.
 */
function detectBorderColors(frame: Frame): RGB[] {
  const { width, height } = frame;
  const d = frame.data;

  const buckets = new Map<number, { r: number; g: number; b: number; n: number }>();
  let total = 0;

  const sample = (p: number) => {
    const i = p * 4;
    if (d[i + 3] === 0) return;
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    // 5 bits per channel: coarse enough to group a noisy wall, fine enough
    // to keep a sky and a hedge apart.
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      bucket.n++;
    } else {
      buckets.set(key, { r, g, b, n: 1 });
    }
    total++;
  };

  for (let x = 0; x < width; x++) {
    sample(x);
    sample((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    sample(y * width);
    sample(y * width + width - 1);
  }

  if (total === 0) return [];

  // Keep taking buckets until most of the border is accounted for, rather
  // than keeping only ones above a share threshold.
  //
  // A flat background is one bucket holding ~95% of the border and stops
  // immediately. A gradient is dozens of buckets holding a handful of pixels
  // each, and a share threshold would discard every one of them — leaving
  // references only at the extreme ends and a global bound that excludes the
  // middle of the very gradient we are trying to follow. Accumulating
  // instead makes the references span the range the background actually
  // covers.
  const ordered = [...buckets.values()]
    .filter((b) => b.n >= 2)
    .sort((a, b) => b.n - a.n);

  const refs: RGB[] = [];
  let covered = 0;
  for (const b of ordered) {
    refs.push([
      Math.round(b.r / b.n),
      Math.round(b.g / b.n),
      Math.round(b.b / b.n),
    ]);
    covered += b.n;
    if (refs.length >= MAX_REFERENCES || covered / total >= 0.9) break;
  }

  return refs;
}

/**
 * Enough to span a gradient, few enough that the per-pixel reference check
 * stays cheap.
 */
const MAX_REFERENCES = 16;

/**
 * Catch background that the edge-connected fill cannot reach — the gap
 * between an arm and a body, or the hole in a doughnut.
 *
 * Held to a tighter tolerance than the main fill, because an enclosed region
 * is exactly where a false positive does the most damage: it punches a hole
 * straight through the subject.
 */
function removeEnclosedRegions(
  frame: Frame,
  isBackground: Uint8Array,
  refs: RGB[],
  maxDistance: number,
): void {
  const { width, height } = frame;
  const count = width * height;
  const d = frame.data;

  // Components are formed only from pixels that already look like the
  // background. Grouping every non-background pixel instead would merge a
  // hole with the subject surrounding it into one region whose average
  // colour is the subject's, and the hole would never be found.
  const candidate = new Uint8Array(count);
  for (let p = 0; p < count; p++) {
    if (isBackground[p]) continue;
    const i = p * 4;
    for (const ref of refs) {
      if (colorDistance(d[i], d[i + 1], d[i + 2], ref[0], ref[1], ref[2]) <= maxDistance) {
        candidate[p] = 1;
        break;
      }
    }
  }

  const seen = new Uint8Array(count);
  const stack: number[] = [];
  const region: number[] = [];

  for (let start = 0; start < count; start++) {
    if (!candidate[start] || seen[start]) continue;

    stack.length = 0;
    region.length = 0;
    stack.push(start);
    seen[start] = 1;
    let touchesBorder = false;

    while (stack.length > 0) {
      const p = stack.pop()!;
      region.push(p);

      const x = p % width;
      const y = (p / width) | 0;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        touchesBorder = true;
      }

      const visit = (q: number) => {
        if (seen[q] || !candidate[q]) return;
        seen[q] = 1;
        stack.push(q);
      };
      if (x > 0) visit(p - 1);
      if (x + 1 < width) visit(p + 1);
      if (y > 0) visit(p - width);
      if (y + 1 < height) visit(p + width);
    }

    // A region reaching the border is part of the silhouette, not a hole.
    if (touchesBorder || region.length < 4) continue;
    for (const p of region) isBackground[p] = 1;
  }
}

/**
 * Strip the halo of part-background pixels left along the subject's edge.
 *
 * A pixel on the boundary is a blend of the two sides. If it is closer to the
 * background than to the subject beside it, it belonged to the background and
 * keeping it leaves the coloured fringe that makes a cut-out look cheap.
 */
function defringe(
  frame: Frame,
  isBackground: Uint8Array,
  refs: RGB[],
  globalMax: number,
  refine: number,
): void {
  const passes = Math.round(refine * 2);
  if (passes === 0) return;

  const { width, height } = frame;
  const d = frame.data;

  for (let pass = 0; pass < passes; pass++) {
    const doomed: number[] = [];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = y * width + x;
        if (isBackground[p]) continue;

        let touchesBackground = false;
        let sr = 0;
        let sg = 0;
        let sb = 0;
        let kept = 0;

        const inspect = (q: number) => {
          if (isBackground[q]) {
            touchesBackground = true;
          } else {
            sr += d[q * 4];
            sg += d[q * 4 + 1];
            sb += d[q * 4 + 2];
            kept++;
          }
        };
        if (x > 0) inspect(p - 1);
        if (x + 1 < width) inspect(p + 1);
        if (y > 0) inspect(p - width);
        if (y + 1 < height) inspect(p + width);

        if (!touchesBackground || kept === 0) continue;

        const i = p * 4;
        const toSubject = colorDistance(
          d[i], d[i + 1], d[i + 2],
          sr / kept, sg / kept, sb / kept,
        );
        let toBackground = Infinity;
        for (const ref of refs) {
          const dist = colorDistance(d[i], d[i + 1], d[i + 2], ref[0], ref[1], ref[2]);
          if (dist < toBackground) toBackground = dist;
        }

        if (toBackground < toSubject && toBackground <= globalMax) doomed.push(p);
      }
    }

    if (doomed.length === 0) return;
    for (const p of doomed) isBackground[p] = 1;
  }
}

/**
 * Remove speckle from the mask in both directions: lone background pixels
 * pitting the subject, and lone subject pixels floating in the background.
 *
 * Either one reads as a botched cut-out far more than a slightly wrong
 * boundary does.
 */
function tidyMask(frame: Frame, isBackground: Uint8Array, refine: number): void {
  if (refine <= 0) return;

  const { width, height } = frame;
  const passes = refine > 0.66 ? 2 : 1;

  for (let pass = 0; pass < passes; pass++) {
    const source = isBackground.slice();
    let changed = false;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = y * width + x;

        let same = 0;
        let neighbours = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= height) continue;
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const xx = x + dx;
            if (xx < 0 || xx >= width) continue;
            neighbours++;
            if (source[yy * width + xx] === source[p]) same++;
          }
        }

        if (neighbours > 0 && same <= 1) {
          isBackground[p] = source[p] ? 0 : 1;
          changed = true;
        }
      }
    }

    if (!changed) return;
  }
}

/**
 * Delete specks left over on both sides of the mask.
 *
 * Counting neighbours only catches a genuinely lone pixel; a two- or
 * three-pixel clump of noise survives it, and those clumps are exactly what
 * makes a cut-out look sloppy — a handful of orphaned dots floating in empty
 * space. Raising the neighbour threshold instead would start eating thin
 * subject detail like a strand of hair.
 *
 * Connected components solve it cleanly. Anything genuinely attached to the
 * subject is part of the subject's component however thin it is, so it can
 * never be removed; only truly detached specks are small enough to qualify.
 */
function removeSmallIslands(
  isBackground: Uint8Array,
  width: number,
  height: number,
  refine: number,
): void {
  if (refine <= 0) return;
  const minSize = Math.max(1, Math.round(refine * 8));

  flipSmallComponents(isBackground, width, height, 0, minSize);
  flipSmallComponents(isBackground, width, height, 1, minSize);
}

/** Flip components of `value` smaller than `minSize` to the other value. */
function flipSmallComponents(
  mask: Uint8Array,
  width: number,
  height: number,
  value: number,
  minSize: number,
): void {
  const count = width * height;
  const seen = new Uint8Array(count);
  const stack: number[] = [];
  const region: number[] = [];

  for (let start = 0; start < count; start++) {
    if (seen[start] || mask[start] !== value) continue;

    stack.length = 0;
    region.length = 0;
    stack.push(start);
    seen[start] = 1;

    // Bail out as soon as the component is provably large enough to keep:
    // the subject and the background are both enormous, and walking them in
    // full would dominate the cost of the whole pass.
    let tooBig = false;
    while (stack.length > 0) {
      const p = stack.pop()!;
      region.push(p);
      if (region.length > minSize) {
        tooBig = true;
        break;
      }

      const x = p % width;
      const y = (p / width) | 0;
      const visit = (q: number) => {
        if (seen[q] || mask[q] !== value) return;
        seen[q] = 1;
        stack.push(q);
      };
      if (x > 0) visit(p - 1);
      if (x + 1 < width) visit(p + 1);
      if (y > 0) visit(p - width);
      if (y + 1 < height) visit(p + width);
    }

    if (tooBig) {
      // Finish marking the component as seen so it is not rescanned.
      while (stack.length > 0) {
        const p = stack.pop()!;
        const x = p % width;
        const y = (p / width) | 0;
        const visit = (q: number) => {
          if (seen[q] || mask[q] !== value) return;
          seen[q] = 1;
          stack.push(q);
        };
        if (x > 0) visit(p - 1);
        if (x + 1 < width) visit(p + 1);
        if (y > 0) visit(p - width);
        if (y + 1 < height) visit(p + width);
      }
      continue;
    }

    const flipped = value === 1 ? 0 : 1;
    for (const p of region) mask[p] = flipped;
  }
}

/**
 * Copy edge colours outward into the transparent region.
 *
 * Invisible in this app, which composites correctly, but it matters the
 * moment the PNG is used anywhere else: software that scales or filters the
 * image samples the RGB of transparent pixels too, and black there produces
 * a dark fringe around the sprite. Bleeding the subject's colour outward is
 * the standard fix, and it costs one pass.
 */
function bleedEdgeColors(frame: Frame): void {
  const { width, height } = frame;
  const d = frame.data;
  const source = new Uint8ClampedArray(d);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      if (source[p * 4 + 3] !== 0) continue;

      let sr = 0;
      let sg = 0;
      let sb = 0;
      let n = 0;

      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          const q = yy * width + xx;
          if (source[q * 4 + 3] === 0) continue;
          sr += source[q * 4];
          sg += source[q * 4 + 1];
          sb += source[q * 4 + 2];
          n++;
        }
      }

      if (n === 0) continue;
      d[p * 4] = sr / n;
      d[p * 4 + 1] = sg / n;
      d[p * 4 + 2] = sb / n;
    }
  }
}

/** A per-channel difference, expressed in `colorDistance` units. */
function channelDelta(delta: number): number {
  return 9 * delta * delta;
}
