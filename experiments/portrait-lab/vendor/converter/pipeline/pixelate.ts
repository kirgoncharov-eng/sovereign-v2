import type { Frame } from './types';
import { createFrame } from './types';

/**
 * Target dimensions for a given source and requested width.
 * Height follows the source aspect ratio; both are at least 1px.
 */
export function targetSize(
  src: Frame,
  requestedWidth: number,
): { width: number; height: number } {
  const width = Math.max(1, Math.min(Math.round(requestedWidth), src.width));
  const height = Math.max(1, Math.round((width * src.height) / src.width));
  return { width, height };
}

/**
 * Area-average ("box") downsample.
 *
 * Every source pixel contributes to exactly one output pixel, weighted by how
 * much of it falls inside that output cell. Nearest-neighbour sampling would
 * be faster but throws away most of the image and produces the harsh, noisy
 * result people associate with a bad pixelate filter. Averaging is what makes
 * the output read as a deliberate low-resolution image rather than a damaged
 * high-resolution one.
 *
 * Colour is premultiplied by alpha while averaging so that transparent
 * regions do not bleed their (meaningless) colour into visible edges.
 */
export function downsample(src: Frame, outW: number, outH: number): Frame {
  const out = createFrame(outW, outH);
  const s = src.data;
  const d = out.data;

  const scaleX = src.width / outW;
  const scaleY = src.height / outH;

  for (let y = 0; y < outH; y++) {
    const y0 = Math.floor(y * scaleY);
    const y1 = Math.min(src.height, Math.max(y0 + 1, Math.ceil((y + 1) * scaleY)));

    for (let x = 0; x < outW; x++) {
      const x0 = Math.floor(x * scaleX);
      const x1 = Math.min(src.width, Math.max(x0 + 1, Math.ceil((x + 1) * scaleX)));

      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;

      for (let sy = y0; sy < y1; sy++) {
        let i = (sy * src.width + x0) * 4;
        for (let sx = x0; sx < x1; sx++, i += 4) {
          const alpha = s[i + 3];
          const w = alpha / 255;
          r += s[i] * w;
          g += s[i + 1] * w;
          b += s[i + 2] * w;
          a += alpha;
          n++;
        }
      }

      const o = (y * outW + x) * 4;
      const totalAlpha = a / 255;

      if (totalAlpha > 0) {
        // Un-premultiply: divide by summed alpha, not by pixel count.
        d[o] = r / totalAlpha;
        d[o + 1] = g / totalAlpha;
        d[o + 2] = b / totalAlpha;
      }
      d[o + 3] = a / n;
    }
  }

  return out;
}

/**
 * Snap alpha to fully transparent or fully opaque.
 *
 * Averaging produces soft, semi-transparent edges. Pixel art has hard edges,
 * so we pick a side. Without this, exported sprites get a blurry halo.
 */
export function thresholdAlpha(frame: Frame, threshold: number): void {
  if (threshold <= 0) return;
  const d = frame.data;
  for (let i = 3; i < d.length; i += 4) {
    d[i] = d[i] < threshold ? 0 : 255;
  }
}

/**
 * Integer nearest-neighbour upscale.
 *
 * Used for display and export only — never inside the pipeline. Any smoothing
 * here would undo the entire point of the tool.
 */
export function upscale(src: Frame, factor: number): Frame {
  const f = Math.max(1, Math.round(factor));
  if (f === 1) return src;

  const outW = src.width * f;
  const outH = src.height * f;
  const out = createFrame(outW, outH);
  const s = src.data;
  const d = out.data;

  for (let y = 0; y < outH; y++) {
    const sy = (y / f) | 0;
    for (let x = 0; x < outW; x++) {
      const sx = (x / f) | 0;
      const si = (sy * src.width + sx) * 4;
      const di = (y * outW + x) * 4;
      d[di] = s[si];
      d[di + 1] = s[si + 1];
      d[di + 2] = s[si + 2];
      d[di + 3] = s[si + 3];
    }
  }

  return out;
}
