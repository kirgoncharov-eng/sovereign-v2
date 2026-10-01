// Портреты персонажей — карандашный рисунок, собранный кодом.
// Лицо — рельефная поверхность (череп, надбровья, глазницы, нос, скулы, губы, подбородок),
// освещённая сбоку. Тон переводится в штриховку разной плотности, поверх — черты лица
// и пряди волос. Все параметры выводятся из имени: один человек всегда выглядит одинаково.
import { hashSeed, seededRandom } from "../game/engine.ts";

export const PORTRAIT_W = 240;
export const PORTRAIT_H = 300;

type Rand = () => number;
type Pt = [number, number];

const cache = new Map<string, HTMLCanvasElement>();

export function portraitCanvas(name: string, female: boolean): HTMLCanvasElement {
  const key = `${name}|${female}`;
  let c = cache.get(key);
  if (!c) {
    c = document.createElement("canvas");
    c.width = PORTRAIT_W; c.height = PORTRAIT_H;
    render(c.getContext("2d")!, seededRandom(hashSeed("portrait", name)), female);
    cache.set(key, c);
  }
  return c;
}

// Области рисунка
const BG = 0, SKIN = 1, NECK = 2, HAIR = 3, JACKET = 4, SHIRT = 5, TIE = 6;
const INK = "34,32,29";

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const gauss = (u: number, v: number, cu: number, cv: number, su: number, sv: number) =>
  Math.exp(-(((u - cu) / su) ** 2 + ((v - cv) / sv) ** 2));

function render(ctx: CanvasRenderingContext2D, r: Rand, female: boolean) {
  const W = PORTRAIT_W, H = PORTRAIT_H, N = W * H;
  ctx.lineCap = "round"; ctx.lineJoin = "round";

  // ── Параметры лица ──────────────────────────────────────────────────────────
  const cx = W * (0.5 + (r() - 0.5) * 0.04);
  const cy = H * 0.41;
  const hw = W * (female ? 0.23 + r() * 0.025 : 0.26 + r() * 0.04);
  const hh = H * (0.275 + r() * 0.03);
  const jawN = female ? 2 + r() * 0.4 : 2.7 + r() * 1.2;     // 2 — круглый, 3.4 — квадратный подбородок
  const taper = female ? 0.45 + r() * 0.2 : 0.08 + r() * 0.22;  // сужение к подбородку
  const side = r() < 0.5 ? -1 : 1;                             // откуда свет
  const age = r();
  const stern = r();
  const noseL = 0.9 + r() * 0.3, noseW = 0.85 + r() * 0.35;
  const eyeGap = 0.35 + r() * 0.06;
  const hairDark = r() < 0.2 ? 0.28 : 0.5 + r() * 0.35;       // седые или тёмные
  const glasses = r() < 0.22;
  const yaw = (r() - 0.5) * 1.1;                               // лёгкий поворот головы
  const fu = yaw * 0.09;                                       // смещение черт лица
  const mustache = !female && r() < 0.2;

  const halfW = (v: number) => {
    if (v < 0) return Math.sqrt(Math.max(0, 1 - v * v));
    if (v >= 1) return 0;
    return Math.pow(1 - v * v, 1 / jawN) / (1 + taper * v * v);
  };
  const inFace = (u: number, v: number) => v > -1 && v < 1 && Math.abs(u) <= halfW(v);
  const chinYat = (x: number) => {
    const u = Math.abs((x - cx) / hw);
    let lo = 0, hi = 1;
    for (let i = 0; i < 14; i++) { const m = (lo + hi) / 2; if (halfW(m) > u) lo = m; else hi = m; }
    return cy + lo * hh;
  };

  // причёска
  const sr = r();
  const style = female ? (sr < 0.45 ? 0 : sr < 0.8 ? 1 : 2) : Math.floor(sr * 4); // жен.: длинные, каре, пучок
  const part = (r() - 0.5) * 0.5;
  const comb = r() < 0.5 ? -1 : 1;
  const hairline = (u: number) => {
    const base = female ? -0.4 : style === 1 ? -0.68 : -0.56;
    const dip = female ? -0.08 * Math.exp(-((u - part) ** 2) / 0.02) : 0.05 * Math.exp(-((u - comb * 0.35) ** 2) / 0.05);
    const ragged = female ? 0 : 0.035 * Math.sin(u * 11 + comb * 2) + 0.02 * Math.sin(u * 23);
    return base + (female ? 0.36 : 0.5) * u * u + dip + ragged;
  };
  const inHair = (u: number, v: number) => {
    const vol = female ? 1.08 : 1.035;
    const inCap = (u / vol) ** 2 + ((v + 0.04) / (vol - 0.01)) ** 2 <= 1;
    if (!female) {
      if (style === 3) return inCap && v > -0.62 && v < 0.06 && (u / 0.93) ** 2 + ((v + 0.12) / 0.98) ** 2 > 1;
      return inCap && v < hairline(u);
    }
    const cap = inCap && v < hairline(u);
    const bun = style === 2 && (u - part * 0.4) ** 2 + ((v + 1.12) / 0.8) ** 2 < 0.09;
    if (style === 2) return cap || bun || (inCap && Math.abs(u) > 0.9 && v < 0.1);
    const len = style === 0 ? 2.05 : 1.02;
    const outer = 1.12 + 0.2 * Math.max(0, v);
    const fall = v > -0.3 && v < len && Math.abs(u) < outer && !inFace(u, v) && !(v > 0.95 && Math.abs(u) < 0.5);
    return cap || fall;
  };

  // ── Карта областей, рельефа и тона ─────────────────────────────────────────
  const reg = new Uint8Array(N);
  const z = new Float32Array(N);
  const tone = new Float32Array(N);
  const shoulderY = (x: number) => H * 0.815 + ((x - cx) / (W * 0.5)) ** 2 * H * 0.09;
  const neckW = hw * (female ? 0.42 : 0.52);

  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, u = (x - cx) / hw, v = (y - cy) / hh;
    let region = BG;
    if (y >= shoulderY(x)) {
      const dx = Math.abs(x - cx), open = (y - H * 0.8) * (female ? 0.62 : 0.46);
      region = dx < open ? SHIRT : JACKET;
      if (!female && dx < 5.5 + (y - H * 0.84) * 0.12 && y > H * 0.84) region = TIE;
    } else if (Math.abs(x - cx) < neckW && v > 0.4) region = NECK;
    if (inFace(u, v)) region = SKIN;
    const ear = !female && (((Math.abs(u) - 0.99) / 0.13) ** 2 + ((v - 0.06) / 0.17) ** 2 < 1) && !inFace(u, v);
    if (ear) region = SKIN;
    if (inHair(u, v) && region !== JACKET && region !== SHIRT && region !== TIE) region = HAIR;
    reg[i] = region;

    if (region === SKIN) {
      let h = Math.sqrt(Math.max(0, 1 - u * u * 0.92 - v * v * 0.8));
      if (!ear) {
        h += 0.06 * (gauss(u, v, fu - 0.33, -0.24, 0.2, 0.07) + gauss(u, v, fu + 0.33, -0.24, 0.2, 0.07));   // надбровья
        h -= 0.1 * (gauss(u, v, fu - eyeGap, -0.02, 0.16, 0.1) + gauss(u, v, fu + eyeGap, -0.02, 0.16, 0.1)); // глазницы
        h += 0.13 * gauss(u, v, fu * 1.3, 0.12 * noseL, 0.095 * noseW, 0.25 * noseL);                        // спинка носа
        h += 0.1 * gauss(u, v, fu * 1.4, 0.36 * noseL, 0.11 * noseW, 0.07);                                 // кончик
        h += 0.05 * (gauss(u, v, fu * 1.3 - 0.12 * noseW, 0.38 * noseL, 0.06, 0.05) + gauss(u, v, fu * 1.3 + 0.12 * noseW, 0.38 * noseL, 0.06, 0.05));
        h += 0.05 * (gauss(u, v, -0.52, 0.16, 0.18, 0.13) + gauss(u, v, 0.52, 0.16, 0.18, 0.13));   // скулы
        h += 0.035 * gauss(u, v, fu, 0.6, 0.22, 0.05);                                                // верхняя губа
        h += 0.04 * gauss(u, v, fu, 0.7, 0.18, 0.05);                                                 // нижняя губа
        h -= 0.03 * gauss(u, v, 0, 0.8, 0.14, 0.035);                                                // ямка под губой
        h += 0.06 * gauss(u, v, 0, 0.92, 0.17, 0.09);                                                // подбородок
        h -= (0.02 + age * 0.04) * (gauss(u, v, -0.55, 0.52, 0.15, 0.17) + gauss(u, v, 0.55, 0.52, 0.15, 0.17));
      }
      z[i] = h * hw * 0.85;
    } else if (region === NECK) {
      z[i] = Math.sqrt(Math.max(0, 1 - ((x - cx) / neckW) ** 2)) * neckW * 0.9;
    } else if (region === HAIR) {
      z[i] = Math.sqrt(Math.max(0, 1 - (u / 1.25) ** 2 - ((v + 0.1) / 1.3) ** 2)) * hw;
    } else if (region === JACKET || region === TIE) {
      z[i] = Math.sqrt(Math.max(0, 1 - ((x - cx) / (W * 0.62)) ** 2)) * W * 0.25;
    }
  }

  const L = (() => { const l: [number, number, number] = [side * 0.55, -0.5, 0.67]; const m = Math.hypot(...l); return l.map(c => c / m); })();
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x, g = reg[i];
    if (g === BG) continue;
    const same = (j: number) => (reg[j] === g ? z[j] : z[i]);
    const gx = (same(i + 1) - same(i - 1)) / 2, gy = (same(i + W) - same(i - W)) / 2;
    const m = Math.hypot(gx, gy, 1);
    const lam = (-gx * L[0] - gy * L[1] + L[2]) / m;
    const u = (x - cx) / hw, v = (y - cy) / hh;
    let d = 0;
    if (g === SKIN) {
      d = clamp01(0.74 - lam * 0.82);
      d += 0.1 * (gauss(u, v, fu - eyeGap, -0.02, 0.2, 0.09) + gauss(u, v, fu + eyeGap, -0.02, 0.2, 0.09));
      d += 0.16 * gauss(u, v, fu * 1.3 - side * 0.1, 0.43 * noseL, 0.14, 0.04);                   // тень под носом
      d += 0.14 * gauss(u, v, fu, 0.61, 0.2, 0.035);
      if (mustache) d += 0.5 * gauss(u, v, fu, 0.575, 0.25, 0.04);                                    // верхняя губа темнее
      d += 0.12 * gauss(u, v, fu, 0.78, 0.13, 0.03);                                    // тень под нижней губой
      d *= 0.9;
    } else if (g === NECK) {
      d = clamp01(0.62 - lam * 0.6) + 0.45 * Math.exp(-(y - chinYat(x)) / (hh * 0.22));
    } else if (g === HAIR) {
      d = hairDark * (0.72 + 0.4 * (1 - lam));
    } else if (g === JACKET) {
      d = 0.58 + 0.25 * (1 - lam);
    } else if (g === SHIRT) {
      d = female ? 0.18 + 0.1 * (1 - lam) : 0.05 + 0.15 * Math.exp(-(y - H * 0.84) / 12);
    } else if (g === TIE) {
      d = 0.5 + 0.2 * (1 - lam);
    }
    tone[i] = clamp01(d);
  }

  // ── 1. Растушёвка: мягкий графит по тону ───────────────────────────────────
  const img = ctx.createImageData(W, H);
  const grainAt = makeGrain(r, W, H);
  for (let i = 0; i < N; i++) {
    const g = reg[i];
    let d = tone[i];
    if (g === BG) {
      const x = i % W, y = (i / W) | 0;
      // лёгкое пятно тона за головой со стороны тени
      const sx = side > 0 ? x / W : 1 - x / W;
      d = y < H * 0.85 ? 0.1 * clamp01(0.45 - sx) * 2 : 0;
    }
    const a = d * (g === HAIR || g === JACKET ? 0.45 : 0.32) * (0.65 + 0.35 * grainAt[i]);
    img.data[i * 4] = 34; img.data[i * 4 + 1] = 32; img.data[i * 4 + 2] = 29; img.data[i * 4 + 3] = Math.round(a * 255);
  }
  ctx.putImageData(img, 0, 0);

  const toneAt = (x: number, y: number, only: number[]) => {
    const xi = x | 0, yi = y | 0;
    if (xi < 0 || yi < 0 || xi >= W || yi >= H) return -1;
    const i = yi * W + xi;
    return only.includes(reg[i]) ? tone[i] : -1;
  };

  // ── 2. Штриховка по тону: чем темнее, тем больше слоёв ─────────────────────
  const skinLayers: [number, number, number][] = [[0.2, 1.0, 3.4], [0.36, 2.15, 3.6], [0.52, 0.35, 3.4], [0.68, 1.6, 3.0]];
  for (const [thr, ang, step] of skinLayers) hatchTone(ctx, r, W, H, (x, y) => toneAt(x, y, [SKIN, NECK]), ang + side * 0.1, step, thr, 0.55);
  for (const [thr, ang, step] of [[0.3, 1.15, 2.6], [0.55, 2.3, 3.0], [0.72, 0.5, 3.2]] as [number, number, number][])
    hatchTone(ctx, r, W, H, (x, y) => toneAt(x, y, [JACKET, TIE]), ang, step, thr, 0.6);
  hatchTone(ctx, r, W, H, (x, y) => toneAt(x, y, [SHIRT]), 1.2, 4, 0.15, 0.35);
  hatchTone(ctx, r, W, H, (x, y) => {
    const t = toneAt(x, y, [BG]);
    if (t < 0) return -1;
    const sx = side > 0 ? x / W : 1 - x / W;
    return y < H * 0.82 ? clamp01(0.42 - sx) * 0.8 : -1;
  }, 1.1, 6, 0.14, 0.22);

  // ── 3. Волосы: пряди по направлению роста ──────────────────────────────────
  const flow = (u: number, v: number): Pt => {
    let dx: number, dy: number;
    if (female && v > -0.25) { dx = Math.sign(u) * 0.18; dy = 1; }
    else if (female) { dx = u - part; dy = v + 1.1; }
    else { dx = u + comb * 0.7 * (style === 2 ? 1 : 0.25); dy = v + 1.3; }
    const m = Math.hypot(dx, dy) || 1;
    return [dx / m, dy / m];
  };
  const hairPts: Pt[] = [];
  for (let i = 0; i < N; i += 3) if (reg[i] === HAIR) hairPts.push([i % W, (i / W) | 0]);
  const strands = Math.min(900, hairPts.length);
  for (let k = 0; k < strands; k++) {
    let [x, y] = hairPts[(r() * hairPts.length) | 0];
    const d0 = tone[(y | 0) * W + (x | 0)];
    ctx.beginPath(); ctx.moveTo(x, y);
    const steps = 4 + ((r() * 6) | 0);
    for (let s = 0; s < steps; s++) {
      const [fx, fy] = flow((x - cx) / hw, (y - cy) / hh);
      x += fx * 3 + (r() - 0.5) * 0.8; y += fy * 3 + (r() - 0.5) * 0.8;
      if (toneAt(x, y, [HAIR]) < 0) break;
      ctx.lineTo(x, y);
    }
    ctx.lineWidth = 0.7 + r() * 0.8;
    ctx.strokeStyle = `rgba(${INK},${clamp01(d0 * 0.65 * (0.5 + r() * 0.6))})`;
    ctx.stroke();
  }
  // край причёски: несколько выбившихся прядей
  for (let k = 0; k < 40; k++) {
    let [x, y] = hairPts[(r() * hairPts.length) | 0];
    const u = (x - cx) / hw, v = (y - cy) / hh;
    if (u * u + v * v < 0.9) continue;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let s = 0; s < 6; s++) { const [fx, fy] = flow((x - cx) / hw, (y - cy) / hh); x += fx * 3.5 + (r() - 0.5) * 2; y += fy * 3.5 + (r() - 0.5) * 2; ctx.lineTo(x, y); }
    ctx.lineWidth = 0.6; ctx.strokeStyle = `rgba(${INK},${0.25 + hairDark * 0.3})`; ctx.stroke();
  }

  // ── 4. Линии: контур, шея, одежда ──────────────────────────────────────────
  const P = (u: number, v: number): Pt => [cx + u * hw, cy + v * hh];
  const line = (pts: Pt[], w: number, a: number, passes = 2, jit = 0.9) => pencil(ctx, r, pts, w, a, passes, jit);
  const contour = (s: number) => {
    const pts: Pt[] = [];
    for (let v = female ? 0.1 : -0.3; v <= 0.99; v += 0.06) pts.push(P(s * halfW(v) * 0.995, v));
    pts.push(P(0, 1));
    return pts;
  };
  line(contour(-1), side < 0 ? 1.3 : 2, side < 0 ? 0.55 : 0.8);
  line(contour(1), side > 0 ? 1.3 : 2, side > 0 ? 0.55 : 0.8);
  for (const s of [-1, 1]) {
    const nx = cx + s * neckW;
    line([[nx, chinYat(nx) - 4], [nx + s * 1, (chinYat(nx) + shoulderY(nx)) / 2], [nx + s * 3, shoulderY(nx) + 2]], 1.4, 0.6, 1);
    // плечо и ворот
    const pts: Pt[] = [];
    for (let t = 0; t <= 1.001; t += 0.1) { const x = nx + s * 3 + s * t * (W * 0.5 - neckW); pts.push([x, shoulderY(x) + 1]); }
    line(pts, 1.8, 0.75);
    if (!female) {
      line([[nx - s * 2, shoulderY(nx) - 3], [cx + s * 6, H * 0.915]], 1.5, 0.7, 1);                     // воротник рубашки
      line([[nx + s * 8, shoulderY(nx + s * 8) + 4], [cx + s * 16, H * 1.0]], 1.3, 0.6, 1);             // лацкан
    } else {
      line([[nx, shoulderY(nx)], [cx + s * 2, H * 0.97]], 1.3, 0.6, 1);
    }
  }
  if (!female) line([[cx - 5, H * 0.885], [cx + 5, H * 0.885], [cx + 7, H], [cx - 7, H], [cx - 5, H * 0.885]], 1.1, 0.6, 1, 0.4);

  // уши
  if (!female) for (const s of [-1, 1]) {
    line([P(s * 0.97, -0.1), P(s * 1.1, -0.06), P(s * 1.12, 0.1), P(s * 1.03, 0.22), P(s * 0.95, 0.24)], 1.3, 0.7, 1);
    line([P(s * 1.02, -0.02), P(s * 1.06, 0.08), P(s * 1.0, 0.16)], 0.9, 0.4, 1);
  }

  // ── 5. Черты лица ───────────────────────────────────────────────────────────
  const ew0 = 0.17 * hw * (female ? 1.08 : 1), eyeV = -0.02;
  const F = (u: number, v: number): Pt => P(fu + u * (1 - Math.sign(u) * yaw * 0.12), v);
  for (const s of [-1, 1]) {
    const ew = ew0 * (1 - s * yaw * 0.12);
    const [ex, ey] = F(s * eyeGap, eyeV);
    const inner = ex - s * ew, outer = ex + s * ew;
    const lidTop = ey - ew * 0.5;
    // складка века и само веко
    line([[inner, ey - ew * 0.25], [ex, lidTop - ew * 0.32], [outer + s * 2, ey - ew * 0.2]], 0.9, 0.35, 1);
    line([[inner, ey + 0.5], [ex - s * ew * 0.2, lidTop], [outer, ey - 1]], 1.9, 0.85, 2, 0.5);
    line([[inner + s * 2, ey + 2], [ex, ey + ew * 0.33], [outer - s * 1, ey + 1]], 0.9, 0.4, 1, 0.5);
    // радужка с бликом
    const ir = ew * 0.36, ix = ex + (r() - 0.5) * 1.5, iy = ey - ew * 0.02;
    ctx.save();
    ctx.beginPath(); ctx.moveTo(inner, ey); ctx.quadraticCurveTo(ex, lidTop - 1, outer, ey); ctx.quadraticCurveTo(ex, ey + ew * 0.4, inner, ey); ctx.clip();
    ctx.beginPath(); ctx.arc(ix, iy, ir, 0, Math.PI * 2); ctx.fillStyle = `rgba(${INK},0.55)`; ctx.fill();
    ctx.beginPath(); ctx.arc(ix, iy, ir * 0.45, 0, Math.PI * 2); ctx.fillStyle = `rgba(${INK},0.85)`; ctx.fill();
    ctx.restore();
    ctx.beginPath(); ctx.arc(ix - side * ir * 0.35, iy - ir * 0.35, ir * 0.22, 0, Math.PI * 2); ctx.fillStyle = "rgba(239,237,230,0.95)"; ctx.fill();
    if (female) for (let k = 0; k < 4; k++) {
      const t = 0.55 + k * 0.13, lx = ex + s * ew * t, ly = ey - ew * 0.42 * (1 - t * t) - 1;
      line([[lx, ly], [lx + s * 3, ly - 3.5]], 0.9, 0.7, 1, 0.2);
    }
    if (age > 0.55) line([[ex - ew * 0.6, ey + ew * 0.62], [ex, ey + ew * 0.8], [ex + ew * 0.6, ey + ew * 0.6]], 0.8, 0.28, 1);
    // бровь: короткие волоски вдоль дуги
    const bIn = F(s * (eyeGap - 0.2), -0.2 + stern * 0.05), bMid = F(s * (eyeGap + 0.02), -0.27 - (1 - stern) * 0.03), bOut = F(s * (eyeGap + 0.26), -0.22);
    const thick = female ? 2.2 : 4.2;
    for (let k = 0; k < (female ? 26 : 60); k++) {
      const t = r();
      const bx = (1 - t) ** 2 * bIn[0] + 2 * (1 - t) * t * bMid[0] + t * t * bOut[0];
      const by = (1 - t) ** 2 * bIn[1] + 2 * (1 - t) * t * bMid[1] + t * t * bOut[1] + (r() - 0.5) * thick * (1.2 - t);
      ctx.beginPath(); ctx.moveTo(bx, by + 1.5); ctx.lineTo(bx + s * (2.5 + t * 2), by - 1.5 + t * 1.5);
      ctx.lineWidth = 0.9; ctx.strokeStyle = `rgba(${INK},${(0.45 + hairDark * 0.4) * (0.6 + r() * 0.4)})`; ctx.stroke();
    }
  }

  // нос: крылья, ноздри и линия теневой стороны
  const tipV = 0.38 * noseL, nwU = 0.14 * noseW;
  for (const s of [-1, 1]) {
    line([F(s * nwU * 0.55, tipV + 0.02), F(s * nwU * 1.15, tipV - 0.02), F(s * nwU * 1.25, tipV + 0.05), F(s * nwU * 0.9, tipV + 0.09)], 1.2, 0.6, 1, 0.4);
    const [nx, ny] = F(s * nwU * 0.55, tipV + 0.075);
    ctx.beginPath(); ctx.ellipse(nx, ny, 2.6, 1.4, s * 0.3, 0, Math.PI * 2); ctx.fillStyle = `rgba(${INK},0.6)`; ctx.fill();
  }
  line([F(-side * 0.08, -0.02), F(-side * 0.1, tipV * 0.6), F(-side * nwU * 0.9, tipV - 0.01)], 1, 0.35, 1, 0.5);
  line([F(-nwU * 0.5, tipV + 0.1), F(0, tipV + 0.115), F(nwU * 0.5, tipV + 0.1)], 1, 0.4, 1, 0.3);

  // рот
  const mv = 0.645, mw = (female ? 0.29 : 0.27 + r() * 0.07);
  const corner = (stern - 0.45) * 0.035;
  line([F(-mw, mv + corner), F(-mw * 0.35, mv - 0.005), F(0, mv + 0.008), F(mw * 0.35, mv - 0.005), F(mw, mv + corner)], 1.6, 0.85, 2, 0.4);
  line([F(-mw * 0.55, mv - 0.05), F(-0.05, mv - 0.07), F(0, mv - 0.055), F(0.05, mv - 0.07), F(mw * 0.55, mv - 0.05)], 0.9, female ? 0.55 : 0.3, 1, 0.3);
  line([F(-mw * 0.5, mv + 0.09), F(0, mv + 0.11), F(mw * 0.5, mv + 0.09)], 0.9, female ? 0.5 : 0.3, 1, 0.4);
  if (age > 0.4) for (const s of [-1, 1]) line([F(s * nwU * 1.4, tipV + 0.02), F(s * (mw + 0.08), mv + 0.02), F(s * (mw + 0.06), mv + 0.12)], 0.9, 0.2 + age * 0.2, 1);
  if (age > 0.7) for (const k of [0, 1]) line([F(-0.35, -0.48 - k * 0.09), F(0, -0.5 - k * 0.09), F(0.35, -0.48 - k * 0.09)], 0.8, 0.22, 1);

  if (!female) {
    const f = r();
    if (mustache) {
      // усы: тон уже положен, сверху — редкие волоски вниз и в стороны
      for (let k = 0; k < 45; k++) {
        const t = r() * 2 - 1;
        const [bx, by] = F(t * mw * 0.9, mv - 0.075 + (r() - 0.5) * 0.04);
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + t * 2.5, by + 3.5);
        ctx.lineWidth = 0.8; ctx.strokeStyle = `rgba(${INK},${0.3 + hairDark * 0.3})`; ctx.stroke();
      }
    } else if (f < 0.25) {
      // щетина
      for (let k = 0; k < 420; k++) {
        const u = (r() * 2 - 1) * 0.85, v = 0.45 + r() * 0.55;
        if (!inFace(u, v) || (Math.abs(u) < mw + 0.05 && Math.abs(v - mv) < 0.07)) continue;
        const [x, y] = F(u, v);
        ctx.fillStyle = `rgba(${INK},${0.2 + r() * 0.25})`; ctx.fillRect(x, y, 1.1, 1.1);
      }
    }
  }

  if (glasses) {
    for (const s of [-1, 1]) {
      const [ex, ey] = F(s * eyeGap, eyeV + 0.01);
      const gw = ew0 * 1.55, gh = ew0 * 1.05;
      pencilEllipse(ctx, r, ex, ey, gw, gh, 1.5, 0.75);
      line([[ex + s * gw, ey - gh * 0.3], [cx + s * hw * 1.02, ey - gh * 0.4]], 1.3, 0.6, 1);
    }
    line([F(-eyeGap + ew0 / hw * 1.5, eyeV - 0.03), F(0, eyeV - 0.06), F(eyeGap - ew0 / hw * 1.5, eyeV - 0.03)], 1.3, 0.7, 1, 0.3);
  }

  if (female && r() < 0.5) {
    // серьги или бусы
    for (let k = 0; k < 11; k++) {
      const t = k / 10, x = cx - neckW * 1.05 + neckW * 2.1 * t, y = shoulderY(cx) - 4 + Math.sin(t * Math.PI) * H * 0.05;
      ctx.beginPath(); ctx.arc(x, y, 2.3, 0, Math.PI * 2); ctx.lineWidth = 0.9; ctx.strokeStyle = `rgba(${INK},0.6)`; ctx.stroke();
    }
  }

  paperTooth(ctx, grainAt, W, H);
}

// Штриховка по полю тона: параллельные линии, видимые там, где тон выше порога.
function hatchTone(ctx: CanvasRenderingContext2D, r: Rand, W: number, H: number, toneAt: (x: number, y: number) => number, angle: number, step: number, thr: number, maxA: number) {
  const dx = Math.cos(angle), dy = Math.sin(angle), px = -dy, py = dx;
  const D = Math.hypot(W, H) / 2, ox = W / 2, oy = H / 2;
  for (let off = -D; off < D; off += step * (0.8 + r() * 0.4)) {
    const phase = r() * 10, wob = 0.6 + r() * 0.8;
    let pts: Pt[] = [], sum = 0, run = 0, breakAt = 18 + r() * 30;
    const flush = () => {
      if (pts.length > 1) {
        const a = Math.min(maxA, (sum / pts.length - thr) * 2.2 + 0.12);
        ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
        for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
        ctx.lineWidth = 0.7 + r() * 0.6;
        ctx.strokeStyle = `rgba(${INK},${Math.max(0.06, a)})`;
        ctx.stroke();
      }
      pts = []; sum = 0; run = 0; breakAt = 18 + r() * 30;
    };
    for (let s = -D; s < D; s += 2) {
      const w = Math.sin(s * 0.045 + phase) * wob;
      const x = ox + px * (off + w) + dx * s, y = oy + py * (off + w) + dy * s;
      const t = toneAt(x, y);
      if (t > thr + (r() - 0.5) * 0.04) {
        pts.push([x, y]); sum += t; run += 2;
        if (run > breakAt) { flush(); s += 2 + r() * 3; }
      } else flush();
    }
    flush();
  }
}

function pencil(ctx: CanvasRenderingContext2D, r: Rand, pts: Pt[], w: number, a: number, passes: number, jit: number) {
  for (let p = 0; p < passes; p++) {
    const q = pts.map(([x, y]) => [x + (r() - 0.5) * jit * 2, y + (r() - 0.5) * jit * 2] as Pt);
    ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]);
    for (let i = 1; i < q.length - 1; i++) ctx.quadraticCurveTo(q[i][0], q[i][1], (q[i][0] + q[i + 1][0]) / 2, (q[i][1] + q[i + 1][1]) / 2);
    ctx.lineTo(q[q.length - 1][0], q[q.length - 1][1]);
    ctx.lineWidth = w * (p ? 0.7 : 1) * (0.85 + r() * 0.3);
    ctx.strokeStyle = `rgba(${INK},${a * (p ? 0.6 : 1)})`;
    ctx.stroke();
  }
}

function pencilEllipse(ctx: CanvasRenderingContext2D, r: Rand, x: number, y: number, rx: number, ry: number, w: number, a: number) {
  for (let p = 0; p < 2; p++) {
    ctx.beginPath();
    ctx.ellipse(x + (r() - 0.5), y + (r() - 0.5), rx + (r() - 0.5) * 1.5, ry + (r() - 0.5), (r() - 0.5) * 0.08, 0, Math.PI * 2);
    ctx.lineWidth = w * (p ? 0.7 : 1); ctx.strokeStyle = `rgba(${INK},${a * (p ? 0.5 : 1)})`; ctx.stroke();
  }
}

// Шум бумаги: сглаженный, чтобы графит ложился пятнами, а не пикселями.
function makeGrain(r: Rand, W: number, H: number): Float32Array {
  const g = new Float32Array(W * H);
  const cw = 6, gw = Math.ceil(W / cw) + 2, gh = Math.ceil(H / cw) + 2;
  const coarse = Array.from({ length: gw * gh }, () => r());
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const fx = x / cw, fy = y / cw, x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0;
    const c = (i: number, j: number) => coarse[(y0 + j) * gw + x0 + i];
    const v = (c(0, 0) * (1 - tx) + c(1, 0) * tx) * (1 - ty) + (c(0, 1) * (1 - tx) + c(1, 1) * tx) * ty;
    g[y * W + x] = v * 0.6 + r() * 0.4;
  }
  return g;
}

function paperTooth(ctx: CanvasRenderingContext2D, grain: Float32Array, W: number, H: number) {
  const img = ctx.getImageData(0, 0, W, H), d = img.data;
  for (let i = 0; i < W * H; i++) {
    const a = d[i * 4 + 3];
    if (!a) continue;
    const n = grain[i];
    d[i * 4 + 3] = n < 0.12 ? a * 0.35 : a * (0.72 + n * 0.3);
  }
  ctx.putImageData(img, 0, 0);
}
