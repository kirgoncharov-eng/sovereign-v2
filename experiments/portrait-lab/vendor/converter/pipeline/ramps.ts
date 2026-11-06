import type { Frame, RGB } from './types';
import { hslToRgb, rgbToHsl, rotateHueToward } from './color';
import { derivePalette } from './quantize';

/** Shadows lean towards blue, highlights towards yellow. */
const SHADOW_HUE = 250;
const HIGHLIGHT_HUE = 55;

/**
 * Kept deliberately modest. The hue shift is what makes a ramp look chosen
 * rather than sampled, but past roughly this much it stops reading as
 * "shadows are cooler" and starts reading as "this person is purple" —
 * skin tones go maroon first and worst.
 */
const MAX_HUE_SHIFT = 16;

/**
 * Below this, ramps stop making sense — two ramps of three shades is already
 * six colours, so anything tighter has to fall back to plain clustering.
 */
const MIN_RAMPED_COLORS = 6;

/**
 * Build a palette out of hue-shifted ramps rather than raw cluster averages.
 *
 * Median cut answers "what colours are in this image?", and the honest answer
 * for a photograph is: a lot of desaturated near-neighbours. Technically
 * faithful, and it is why straight quantisation looks muddy.
 *
 * A pixel artist picks a few base hues and builds a *ramp* for each, and
 * crucially the ramp is not one colour at five brightnesses — the hue rotates
 * along it. Shadows drift towards blue, highlights towards yellow, and
 * saturation peaks in the midtones and falls off at both ends. That hue
 * rotation is most of what makes a palette look chosen rather than sampled.
 */
export function rampedPalette(frame: Frame, colorCount: number): RGB[] {
  if (colorCount < MIN_RAMPED_COLORS) return derivePalette(frame, colorCount);

  // Shorter ramps when the budget is tight, so that ramps x length stays
  // within the number of colours the user actually asked for.
  const rampLength = colorCount <= 9 ? 3 : colorCount <= 20 ? 4 : 5;
  const rampCount = Math.max(2, Math.min(16, Math.floor(colorCount / rampLength)));
  const bases = derivePalette(frame, rampCount);

  const out: RGB[] = [];
  const seen = new Set<number>();

  for (const base of bases) {
    for (const color of buildRamp(base, rampLength)) {
      const key = (color[0] << 16) | (color[1] << 8) | color[2];
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(color);
    }
  }

  if (out.length === 0) return bases;
  return out.slice(0, colorCount);
}

function buildRamp(base: RGB, length: number): RGB[] {
  const [hue, saturation, lightness] = rgbToHsl(base);

  const low = Math.max(0.08, lightness - 0.26);
  const high = Math.min(0.93, lightness + 0.22);

  const ramp: RGB[] = [];
  for (let i = 0; i < length; i++) {
    const t = length === 1 ? 0.5 : i / (length - 1);

    const l = low + (high - low) * t;

    // Rotate away from the base hue in both directions, strongest at the ends.
    const distance = Math.abs(t - 0.5) * 2;
    const shift = distance * MAX_HUE_SHIFT;
    const h =
      t < 0.5
        ? rotateHueToward(hue, SHADOW_HUE, shift)
        : rotateHueToward(hue, HIGHLIGHT_HUE, shift);

    // Saturation arcs: muted at both ends, richest through the middle.
    // Highlights lose a little more than shadows, which is how light behaves.
    const arc = 0.72 + 0.48 * Math.sin(t * Math.PI);
    const s = Math.min(1, saturation * arc * (t > 0.85 ? 0.8 : 1));

    ramp.push(hslToRgb([h, s, l]));
  }

  return ramp;
}
