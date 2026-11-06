import type { Frame, Settings } from './types';
import { createFrame } from './types';
import { luminance } from './color';

/**
 * Tonal adjustments, applied to the full-resolution source before
 * downsampling.
 *
 * Order matters here: doing this first means the downsampler averages
 * already-corrected pixels, so a contrast boost sharpens the blocks rather
 * than crushing an already-flattened image.
 */
export function adjust(src: Frame, settings: Settings): Frame {
  const { brightness, contrast, saturation } = settings;
  if (brightness === 0 && contrast === 0 && saturation === 0) return src;

  const out = createFrame(src.width, src.height);
  const s = src.data;
  const d = out.data;

  // Asymmetric curve: negative flattens towards mid grey, positive steepens.
  // The 0.92 cap keeps contrast: 1 from becoming a pure threshold.
  const k = contrast >= 0 ? 1 / (1 - contrast * 0.92) : 1 + contrast;
  const offset = brightness * 110;
  const sat = 1 + saturation;

  for (let i = 0; i < s.length; i += 4) {
    let r = s[i];
    let g = s[i + 1];
    let b = s[i + 2];

    if (brightness !== 0) {
      r += offset;
      g += offset;
      b += offset;
    }

    if (contrast !== 0) {
      r = (r - 128) * k + 128;
      g = (g - 128) * k + 128;
      b = (b - 128) * k + 128;
    }

    if (saturation !== 0) {
      const l = luminance(r, g, b);
      r = l + (r - l) * sat;
      g = l + (g - l) * sat;
      b = l + (b - l) * sat;
    }

    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
    d[i + 3] = s[i + 3];
  }

  return out;
}

/**
 * Unsharp mask against a 3x3 box blur.
 *
 * Downsampling averages detail away, so an image that looked crisp at full
 * size can arrive at 96px wide reading as mush. Sharpening first gives the
 * averager more definition to preserve — this is what keeps eyes, edges and
 * text legible at tiny resolutions.
 */
export function sharpen(src: Frame, amount: number): Frame {
  if (amount <= 0) return src;

  const { width, height } = src;
  const out = createFrame(width, height);
  const s = src.data;
  const d = out.data;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;

      for (let c = 0; c < 3; c++) {
        let sum = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= height) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= width) continue;
            sum += s[(yy * width + xx) * 4 + c];
            n++;
          }
        }
        const blurred = sum / n;
        d[i + c] = s[i + c] + (s[i + c] - blurred) * amount * 2;
      }

      d[i + 3] = s[i + 3];
    }
  }

  return out;
}
