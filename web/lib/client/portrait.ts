// Портреты персонажей: быстрый карандашный набросок на canvas.
// Никаких картинок — лицо собирается из параметров, выведенных из имени,
// поэтому один и тот же человек всегда выглядит одинаково.
import { hashSeed, seededRandom } from "../game/engine.ts";

export const PORTRAIT_W = 240;
export const PORTRAIT_H = 300;

type Pt = [number, number];
type Rand = () => number;

const cache = new Map<string, HTMLCanvasElement>();

export function portraitCanvas(name: string, female: boolean): HTMLCanvasElement {
  const key = `${name}|${female}`;
  let c = cache.get(key);
  if (!c) {
    c = document.createElement("canvas");
    c.width = PORTRAIT_W; c.height = PORTRAIT_H;
    draw(c.getContext("2d")!, seededRandom(hashSeed("portrait", name)), female);
    cache.set(key, c);
  }
  return c;
}

// ── Карандаш ─────────────────────────────────────────────────────────────────
function pencil(ctx: CanvasRenderingContext2D, r: Rand, pts: Pt[], o: { w?: number; a?: number; jit?: number; passes?: number; closed?: boolean } = {}) {
  const { w = 2, a = 0.88, jit = 2.2, passes = 2, closed = false } = o;
  for (let p = 0; p < passes; p++) {
    const q = pts.map(([x, y]) => [x + (r() - 0.5) * jit * 2, y + (r() - 0.5) * jit * 2] as Pt);
    if (closed) q.push(q[0], q[1]);
    // небрежность: штрих иногда не доводится до конца
    const from = q.length > 4 && r() < 0.4 ? 1 : 0;
    const to = q.length > 4 && r() < 0.4 ? q.length - 1 : q.length;
    const s = q.slice(from, to);
    if (s.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(s[0][0], s[0][1]);
    for (let i = 1; i < s.length - 1; i++) {
      const mx = (s[i][0] + s[i + 1][0]) / 2, my = (s[i][1] + s[i + 1][1]) / 2;
      ctx.quadraticCurveTo(s[i][0], s[i][1], mx, my);
    }
    ctx.lineTo(s[s.length - 1][0], s[s.length - 1][1]);
    ctx.lineWidth = w * (0.75 + r() * 0.5);
    ctx.strokeStyle = `rgba(36,34,31,${a * (0.7 + r() * 0.3)})`;
    ctx.stroke();
  }
}

// Параллельная штриховка внутри текущей области отсечения.
function hatch(ctx: CanvasRenderingContext2D, r: Rand, box: [number, number, number, number], o: { step?: number; angle?: number; a?: number; w?: number } = {}) {
  const { step = 5, angle = 1.1, a = 0.25, w = 1 } = o;
  const [x0, y0, x1, y1] = box;
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const len = Math.hypot(x1 - x0, y1 - y0);
  ctx.save();
  ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
  for (let t = -len; t < len; t += step * (0.7 + r() * 0.6)) {
    const cx = (x0 + x1) / 2 + t * -dy, cy = (y0 + y1) / 2 + t * dx;
    ctx.beginPath();
    ctx.moveTo(cx - dx * len + (r() - 0.5) * 6, cy - dy * len);
    ctx.lineTo(cx + dx * len, cy + dy * len + (r() - 0.5) * 6);
    ctx.lineWidth = w * (0.6 + r() * 0.8);
    ctx.strokeStyle = `rgba(36,34,31,${a * (0.5 + r() * 0.5)})`;
    ctx.stroke();
  }
  ctx.restore();
}

function polyPath(ctx: CanvasRenderingContext2D, pts: Pt[]) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y);
  ctx.closePath();
}

// ── Лицо ─────────────────────────────────────────────────────────────────────
function draw(ctx: CanvasRenderingContext2D, r: Rand, female: boolean) {
  const W = PORTRAIT_W, H = PORTRAIT_H;
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  const cx = W * (0.5 + (r() - 0.5) * 0.05);
  const hw = W * (female ? 0.25 + r() * 0.03 : 0.265 + r() * 0.05);
  const hh = H * (0.27 + r() * 0.035);
  const cy = H * 0.42;
  const jaw = female ? r() * 0.35 : 0.3 + r() * 0.7;
  const side = r() < 0.5 ? -1 : 1;            // с какой стороны свет
  const age = r();                             // морщины, седина
  const stern = r();                           // хмурость бровей и рта

  const head: Pt[] = [];
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const s = Math.sin(a), lower = s > 0;
    const kx = lower ? 1 - 0.42 * s ** 3 * (1 - jaw * 0.55) : 1;
    head.push([cx + hw * Math.cos(a) * kx, cy + hh * s * (lower ? 1 : 0.97)]);
  }
  const chinY = cy + hh;
  const neckTop = chinY - hh * 0.25, neckL = cx - hw * 0.46, neckR = cx + hw * 0.46;
  const shoulderY = H * 0.88;
  const jacket: Pt[] = [
    [neckL - 4, H * 0.85], [cx - W * 0.3, H * 0.88], [W * 0.02, H * 0.97], [W * 0.01, H], [W * 0.99, H],
    [W * 0.98, H * 0.97], [cx + W * 0.3, H * 0.88], [neckR + 4, H * 0.85], [cx, H * 0.98],
  ];

  // фон: несколько небрежных штрихов за головой
  ctx.save();
  ctx.beginPath(); ctx.rect(0, H * 0.08, W, H * 0.8); ctx.clip();
  hatch(ctx, r, [W * (side < 0 ? 0.6 : 0), 0, W * (side < 0 ? 1 : 0.4), H], { step: 6, angle: 1.05 + r() * 0.25, a: 0.2 });
  ctx.restore();
  // голова, шея и плечи закрывают фон
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  polyPath(ctx, head); ctx.fill();
  polyPath(ctx, [[neckL, neckTop], [neckR, neckTop], [neckR + 2, shoulderY], [neckL - 2, shoulderY]]); ctx.fill();
  polyPath(ctx, jacket); ctx.fill();
  if (female) { ctx.beginPath(); ctx.ellipse(cx, cy + hh * 0.1, hw * 1.45, hh * 1.3, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();

  // пиджак: плотная штриховка — тёмный костюм
  ctx.save(); polyPath(ctx, jacket); ctx.clip();
  hatch(ctx, r, [0, H * 0.82, W, H], { step: 2.8, angle: 1.2, a: 0.5, w: 1.3 });
  hatch(ctx, r, [0, H * 0.82, W, H], { step: 4.5, angle: 2.2, a: 0.28 });
  ctx.restore();
  pencil(ctx, r, [[W * 0.02, H * 0.98], [cx - W * 0.3, H * 0.885], [neckL - 3, H * 0.85]], { w: 2.2 });
  pencil(ctx, r, [[W * 0.98, H * 0.98], [cx + W * 0.3, H * 0.885], [neckR + 3, H * 0.85]], { w: 2.2 });

  // шея
  pencil(ctx, r, [[neckL, neckTop], [neckL - 1, (neckTop + H * 0.85) / 2], [neckL - 3, H * 0.85]], { w: 1.7, passes: 1 });
  pencil(ctx, r, [[neckR, neckTop], [neckR + 1, (neckTop + H * 0.85) / 2], [neckR + 3, H * 0.85]], { w: 1.7, passes: 1 });
  ctx.save();
  polyPath(ctx, [[neckL, chinY - 6], [neckR, chinY - 6], [neckR + 2, H * 0.86], [neckL - 2, H * 0.86]]); ctx.clip();
  hatch(ctx, r, [neckL - 5, chinY - 6, neckR + 5, chinY + hh * 0.35], { step: 3.5, angle: 0.6, a: 0.3 });
  ctx.restore();

  if (female) {
    // вырез и нитка бус
    pencil(ctx, r, [[neckL - 3, H * 0.86], [cx, H * 0.9], [neckR + 3, H * 0.86]], { w: 1.4 });
    if (r() < 0.5) for (let i = 0; i < 9; i++) {
      const t = i / 8, x = neckL + (neckR - neckL) * t, y = H * 0.8 + Math.sin(t * Math.PI) * H * 0.045;
      ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.strokeStyle = "rgba(36,34,31,.6)"; ctx.lineWidth = 1; ctx.stroke();
    }
  } else {
    // воротник рубашки и галстук
    pencil(ctx, r, [[neckL - 2, H * 0.78], [cx - 3, H * 0.86]], { w: 1.6 });
    pencil(ctx, r, [[neckR + 2, H * 0.78], [cx + 3, H * 0.86]], { w: 1.6 });
    const tie: Pt[] = [[cx - 5, H * 0.855], [cx + 5, H * 0.855], [cx + 9, H * 0.98], [cx, H * 1.01], [cx - 9, H * 0.98]];
    ctx.save(); polyPath(ctx, tie); ctx.clip(); hatch(ctx, r, [cx - 12, H * 0.84, cx + 12, H], { step: 2.4, angle: 0.8, a: 0.5 }); ctx.restore();
    pencil(ctx, r, tie, { w: 1.2, closed: true, passes: 1 });
  }

  // тень на лице — со стороны, противоположной свету
  ctx.save(); polyPath(ctx, head); ctx.clip();
  const sx = side > 0 ? cx - hw * 1.1 : cx + hw * 0.3;
  hatch(ctx, r, [sx, cy - hh, sx + hw * 0.8, chinY], { step: 4, angle: 1.25, a: 0.3 });
  hatch(ctx, r, [cx - hw, chinY - hh * 0.22, cx + hw, chinY], { step: 4, angle: 0.3, a: 0.12 });
  ctx.restore();

  // контур лица: два-три небрежных прохода
  pencil(ctx, r, head.slice(2, 27), { w: 1.9, passes: 3, jit: 2.6 });

  // уши
  const earY = cy + hh * 0.05;
  if (!female || r() < 0.3) for (const d of [-1, 1]) {
    const ex = cx + d * hw * 0.99;
    pencil(ctx, r, [[ex, earY - hh * 0.2], [ex + d * hw * 0.16, earY - hh * 0.12], [ex + d * hw * 0.14, earY + hh * 0.12], [ex, earY + hh * 0.2]], { w: 1.4 });
  }

  // волосы
  const hairA = 0.45 + (1 - age) * 0.4;
  const strand = (x0: number, y0: number, x1: number, y1: number, bend: number) => {
    ctx.beginPath(); ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo((x0 + x1) / 2 + bend, (y0 + y1) / 2, x1, y1);
    ctx.lineWidth = 0.8 + r() * 1.4; ctx.strokeStyle = `rgba(36,34,31,${hairA * (0.5 + r() * 0.5)})`; ctx.stroke();
  };
  const hairTop = cy - hh * 0.97;
  // Волосы: заштрихованная масса по форме причёски и несколько прядей по краю.
  const capPoly = (line: number, vol: number): Pt[] => {
    const pts: Pt[] = [];
    for (let k = 0; k <= 16; k++) {
      const a = Math.PI + (k / 16) * Math.PI;
      pts.push([cx + hw * vol * Math.cos(a), cy + hh * vol * Math.sin(a) * 0.98 + (1 - Math.abs(Math.sin(a))) * hh * 0.1]);
    }
    for (let k = 16; k >= 0; k--) {
      const x = cx + hw * (1 - (k / 16) * 2) * -1;
      pts.push([x, cy - hh * line + ((x - cx) / hw) ** 2 * hh * 0.42]);
    }
    return pts;
  };
  const mass = (poly: Pt[], angle: number, dark: number) => {
    ctx.save(); polyPath(ctx, poly); ctx.clip();
    hatch(ctx, r, [0, 0, W, H], { step: 2.6, angle, a: dark, w: 1.2 });
    hatch(ctx, r, [0, 0, W, H], { step: 4.5, angle: angle + 0.45, a: dark * 0.55 });
    ctx.restore();
  };
  const dark = 0.28 + (1 - age) * 0.35;
  if (female) {
    const style = Math.floor(r() * 3); // 0 длинные, 1 каре, 2 собранные
    const cap = capPoly(0.52, 1.1);
    mass(cap, 0.35 + r() * 0.3, dark);
    pencil(ctx, r, cap.slice(0, 17), { w: 1.8, passes: 2 });
    if (style !== 2) {
      const bottom = style === 0 ? H * 0.84 : chinY - hh * 0.05;
      for (const d of [-1, 1]) {
        const fall: Pt[] = [[cx + d * hw * 1.1, cy - hh * 0.45], [cx + d * hw * 0.92, cy - hh * 0.05], [cx + d * hw * 0.86, cy + hh * 0.5],
          [cx + d * hw * 0.95, bottom], [cx + d * hw * (1.28 + r() * 0.12), bottom + 6], [cx + d * hw * 1.2, cy + hh * 0.2]];
        mass(fall, 1.4 + d * 0.12, dark * 0.9);
        pencil(ctx, r, fall.slice(3).concat([fall[0]]), { w: 1.6, passes: 2 });
        for (let k = 0; k < 8; k++) {
          const x0 = cx + d * hw * (0.95 + r() * 0.25);
          strand(x0, cy - hh * 0.3, x0 + d * r() * 10, bottom + (r() - 0.5) * 16, d * 6);
        }
      }
    } else {
      ctx.beginPath(); ctx.ellipse(cx, hairTop - 6, hw * 0.36, hh * 0.2, 0, 0, Math.PI * 2);
      ctx.save(); ctx.clip(); hatch(ctx, r, [0, 0, W, H], { step: 2.8, angle: 0.5, a: dark }); ctx.restore();
      ctx.lineWidth = 2; ctx.strokeStyle = "rgba(36,34,31,.7)"; ctx.stroke();
    }
  } else {
    const style = Math.floor(r() * 4); // 0 коротко, 1 залысины, 2 зачёс набок, 3 почти лысый
    if (style === 3) {
      for (const d of [-1, 1]) mass([[cx + d * hw * 1.02, cy - hh * 0.55], [cx + d * hw * 0.8, cy - hh * 0.6], [cx + d * hw * 0.88, cy - hh * 0.05], [cx + d * hw * 1.02, cy]], 1.3, dark * 0.8);
    } else {
      const cap = capPoly(style === 1 ? 0.68 : 0.46 + r() * 0.1, 1.02 + r() * 0.08);
      const ang = style === 2 ? (r() < 0.5 ? 0.25 : 2.9) : 1.9 + (r() - 0.5) * 0.6;
      mass(cap, ang, dark);
      pencil(ctx, r, cap.slice(0, 17), { w: 1.9, passes: 2 });
      pencil(ctx, r, cap.slice(18), { w: 1.2, passes: 1, a: 0.6 });
      for (let k = 0; k < 18; k++) {
        const a = Math.PI * (1.1 + r() * 0.8);
        const x0 = cx + hw * 1.04 * Math.cos(a), y0 = cy + hh * 1.02 * Math.sin(a);
        strand(x0, y0, x0 + Math.cos(ang) * 12, y0 + Math.sin(ang) * 6, 3);
      }
    }
    for (const d of [-1, 1]) for (let i = 0; i < 12; i++) strand(cx + d * hw * 0.97, cy - hh * 0.4, cx + d * hw * (0.93 + r() * 0.05), cy - hh * (0.05 - r() * 0.1), 0);
  }

  // брови
  const browY = cy - hh * 0.13;
  for (const d of [-1, 1]) {
    const inner = browY + stern * 5, outer = browY - 2 - (1 - stern) * 3;
    for (let k = 0; k < 3; k++) pencil(ctx, r, [[cx + d * hw * 0.16, inner + k], [cx + d * hw * 0.4, browY - 3 + k], [cx + d * hw * 0.66, outer + k]], { w: 2.4, passes: 1, a: 0.7, jit: 1.2 });
  }

  // глаза
  const eyeY = cy + hh * 0.03, ew = hw * 0.17;
  for (const d of [-1, 1]) {
    const ex = cx + d * hw * 0.4;
    pencil(ctx, r, [[ex - ew, eyeY + 1], [ex, eyeY - ew * 0.55], [ex + ew, eyeY + 1]], { w: 2, passes: 2, jit: 1 });
    pencil(ctx, r, [[ex - ew * 0.8, eyeY + 3], [ex, eyeY + ew * 0.4], [ex + ew * 0.8, eyeY + 3]], { w: 1, passes: 1, a: 0.45, jit: 1 });
    ctx.beginPath(); ctx.arc(ex + (r() - 0.5) * 2, eyeY, 2.8, 0, Math.PI * 2); ctx.fillStyle = "rgba(30,28,25,.85)"; ctx.fill();
    if (female) for (let k = 0; k < 3; k++) pencil(ctx, r, [[ex + d * (ew * 0.4 + k * 3), eyeY - ew * 0.45], [ex + d * (ew * 0.55 + k * 3.5), eyeY - ew * 0.8]], { w: 1, passes: 1, jit: 0.5 });
    if (age > 0.55) pencil(ctx, r, [[ex - ew * 0.7, eyeY + ew * 0.8], [ex, eyeY + ew * 1.05], [ex + ew * 0.7, eyeY + ew * 0.8]], { w: 0.9, passes: 1, a: 0.35, jit: 1 });
  }
  if (r() < 0.28) {
    // очки
    for (const d of [-1, 1]) {
      const ex = cx + d * hw * 0.4;
      ctx.beginPath(); ctx.ellipse(ex, eyeY + 1, ew * 1.55, ew * 1.1, 0, 0, Math.PI * 2);
      ctx.lineWidth = 1.7; ctx.strokeStyle = "rgba(36,34,31,.7)"; ctx.stroke();
    }
    pencil(ctx, r, [[cx - hw * 0.17, eyeY - 1], [cx, eyeY - 4], [cx + hw * 0.17, eyeY - 1]], { w: 1.5, passes: 1 });
  }

  // нос
  const noseY = cy + hh * 0.38;
  pencil(ctx, r, [[cx + side * hw * 0.06, eyeY + 4], [cx + side * hw * 0.1, noseY - hh * 0.12], [cx + side * hw * 0.14, noseY]], { w: 1.5, passes: 2 });
  pencil(ctx, r, [[cx + side * hw * 0.14, noseY], [cx, noseY + 4], [cx - side * hw * 0.12, noseY + 1]], { w: 1.6, passes: 1 });

  // рот
  const mouthY = cy + hh * 0.6, mw = hw * (female ? 0.3 : 0.28 + r() * 0.1);
  const corner = (stern - 0.4) * 5;
  pencil(ctx, r, [[cx - mw, mouthY + corner], [cx, mouthY - 1], [cx + mw, mouthY + corner]], { w: 1.8, passes: 2, jit: 1.2 });
  pencil(ctx, r, [[cx - mw * 0.5, mouthY + (female ? 7 : 6)], [cx + mw * 0.5, mouthY + (female ? 7 : 6)]], { w: female ? 1.6 : 1.1, passes: 1, a: 0.45 });
  if (age > 0.45) for (const d of [-1, 1]) pencil(ctx, r, [[cx + d * hw * 0.24, noseY - 2], [cx + d * hw * 0.36, mouthY + 4]], { w: 1, passes: 1, a: 0.35 });
  if (age > 0.7) for (let k = 0; k < 2; k++) pencil(ctx, r, [[cx - hw * 0.4, cy - hh * (0.42 + k * 0.1)], [cx + hw * 0.4, cy - hh * (0.43 + k * 0.1)]], { w: 0.9, passes: 1, a: 0.28 });

  if (!female) {
    const f = r();
    if (f < 0.28) for (let k = 0; k < 14; k++) pencil(ctx, r, [[cx + (r() - 0.5) * mw * 2, mouthY - 10], [cx + (r() - 0.5) * mw * 2.2, mouthY - 2]], { w: 2, passes: 1, jit: 1 }); // усы
    else if (f < 0.45) for (let k = 0; k < 90; k++) {
      // щетина
      const a = Math.PI * (0.1 + r() * 0.8), rr = 0.75 + r() * 0.25;
      const x = cx + hw * rr * Math.cos(a) * 0.9, y = cy + hh * 0.35 + hh * 0.62 * rr * Math.sin(a);
      ctx.fillStyle = "rgba(36,34,31,.35)"; ctx.fillRect(x, y, 1.4, 1.4);
    }
  }

  grain(ctx, r);
}

// Зерно бумаги: графит ложится неровно — это и даёт «растровую» фактуру.
function grain(ctx: CanvasRenderingContext2D, r: Rand) {
  const img = ctx.getImageData(0, 0, PORTRAIT_W, PORTRAIT_H);
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) {
    if (!d[i]) continue;
    const n = r();
    d[i] = n < 0.06 ? 0 : d[i] * (0.68 + n * 0.32);
  }
  ctx.putImageData(img, 0, 0);
}
