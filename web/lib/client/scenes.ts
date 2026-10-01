// Сцены событий: маленькие пиксельные «фото» того, что происходит в деле, — завод, граница,
// пресс-конференция, взрыв. Тот же низкий растр и та же палитра, что у площади перед резиденцией.
// Анимация — по кадрам: дым поднимается, мигалки мигают, вспышки камер вспыхивают.
import { hashSeed, seededRandom } from "../game/engine.ts";
import type { SceneKey } from "../content/scene-map.ts";
import { SKIES, drawSquare, flagPx, type Px, type SquareState } from "./square.ts";

type Rand = () => number;
interface Ctx { px: Px; W: number; H: number; f: number; r: Rand; night: boolean; s: SquareState; partner: string }

const COAT = ["#2e2b28", "#3e3a33", "#4b3d33", "#33393f", "#463a3a"];
const skinOf = (night: boolean) => (night ? "#8a7a68" : "#d6b48e");

export function drawScene(ctx2d: CanvasRenderingContext2D, W: number, H: number, key: SceneKey, s: SquareState, frame: number, partner: string = "eu") {
  // Площадь, протест и армия — это та же площадь, только в нужном состоянии.
  if (key === "square") return drawSquare(ctx2d, W, H, s, frame);
  if (key === "protest") return drawSquare(ctx2d, W, H, { ...s, legitimacy: Math.min(s.legitimacy, 18), crises: Math.max(s.crises, 2), military: Math.max(s.military, 35) }, frame);
  if (key === "army") return drawSquare(ctx2d, W, H, { ...s, security: -80, military: Math.max(s.military, 60), legitimacy: Math.max(s.legitimacy, 55), rating: 20 }, frame);
  // Договор внутри страны: за столом те же переговоры, только с обеих сторон свой флаг.
  if (key === "signing") { key = "summit"; partner = s.country; }
  const px: Px = (x, y, w, h, c) => { ctx2d.fillStyle = c; ctx2d.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); };
  const phase = s.phase ?? 1;
  const c: Ctx = { px, W, H, f: frame, r: seededRandom(hashSeed(s.seed, "scene", key)), night: phase === 3, s, partner };
  SCENES[key](c, phase);
}

// ── Общие детали ─────────────────────────────────────────────────────────────
function outdoors(c: Ctx, phase: number, groundAt = 0.7, groundColor?: string) {
  const { px, W, H, r, night } = c;
  const sky = SKIES[phase];
  const band = Math.ceil(H * groundAt / sky.length);
  sky.forEach((col, i) => px(0, i * band, W, band + 1, col));
  if (phase === 3) for (let i = 0; i < W / 7; i++) px(r() * W, r() * H * 0.35, 1, 1, "#c9c3a8");
  const g = Math.round(H * groundAt);
  const far = night ? "#0e121b" : "#5b6470";
  for (let x = 0; x < W;) { const w = 5 + Math.floor(r() * 10), h = 4 + Math.floor(r() * 9); px(x, g - h, w, h, far); x += w + Math.floor(r() * 4); }
  px(0, g, W, H - g, groundColor ?? (night ? "#2c2a27" : "#77705f"));
  return g;
}
function indoors(c: Ctx, wall: string, floor: string, floorAt = 0.72) {
  const { px, W, H } = c;
  px(0, 0, W, H, wall);
  for (let x = 6; x < W; x += 14) px(x, 0, 1, Math.round(H * floorAt), "rgba(0,0,0,.08)");
  const g = Math.round(H * floorAt);
  px(0, g, W, H - g, floor);
  return g;
}
function person(c: Ctx, x: number, y: number, i: number, body = COAT[i % COAT.length], arm = false) {
  const b = (c.f + i) % 4 === 0 ? 1 : 0;
  c.px(x, y - 5 - b, 2, 2, skinOf(c.night));
  c.px(x, y - 3 - b, 2, 3 + b, body);
  if (arm) c.px(x + 2, y - 6 - ((c.f + i) % 2), 1, 3, skinOf(c.night));
}
function crowd(c: Ctx, x0: number, x1: number, y: number, n: number, signs = false) {
  for (let i = 0; i < n; i++) {
    const x = x0 + Math.floor(c.r() * Math.max(1, x1 - x0)), yy = y + Math.floor(c.r() * 3);
    person(c, x, yy, i);
    if (signs && i % 3 === 0) { c.px(x + 1, yy - 9, 1, 4, "#5d4a33"); c.px(x - 1, yy - 11, 5, 3, (c.f + i) % 6 < 3 ? "#e9e2cf" : "#e0a49a"); }
  }
}
// Мигалка: красный и синий по очереди.
function siren(c: Ctx, x: number, y: number, i = 0) { const on = (c.f + i) % 2 === 0; c.px(x, y, 1, 1, on ? "#e0403a" : "#3a5ad0"); c.px(x + 1, y, 1, 1, on ? "#3a5ad0" : "#e0403a"); }
function car(c: Ctx, x: number, y: number, body: string, lights = false, i = 0) {
  c.px(x, y - 3, 10, 3, body); c.px(x + 2, y - 5, 6, 2, body); c.px(x + 3, y - 5, 4, 1, "#9fb0bf");
  c.px(x + 1, y, 2, 1, "#1b1b1b"); c.px(x + 7, y, 2, 1, "#1b1b1b");
  if (lights) siren(c, x + 4, y - 6, i);
}
// Дым: столб клубов, которые медленно поднимаются и тают.
function smoke(c: Ctx, x: number, y: number, h: number, dark = "#4a4a4a", light = "#7a7a78") {
  for (let k = 0; k < 6; k++) {
    const t = (c.f + k * 3) % 18, yy = y - t * h / 18, w = 2 + Math.floor(t / 3);
    if (yy < 0) continue;
    c.px(x - w / 2 + Math.sin((t + k) / 2) * 1.5, yy, w, Math.max(1, w - 1), t < 9 ? dark : light);
  }
}
function flash(c: Ctx, x: number, y: number, i: number) {
  if ((c.f * 7 + i * 13) % 11 === 0) { c.px(x - 1, y, 3, 1, "#ffffff"); c.px(x, y - 1, 1, 3, "#ffffff"); }
}

// ── Сцены ────────────────────────────────────────────────────────────────────
const SCENES: Record<Exclude<SceneKey, "square" | "protest" | "army" | "signing">, (c: Ctx, phase: number) => void> = {
  factory(c, phase) {
    const { px, W, H } = c;
    const g = outdoors(c, phase);
    const fx = Math.round(W * 0.45), fw = Math.round(W * 0.5), fh = Math.round(H * 0.32);
    px(fx, g - fh, fw, fh, c.night ? "#3a3530" : "#8a7d68");
    for (let x = fx; x < fx + fw - 4; x += 8) { px(x, g - fh - 3, 8, 1, "#5d574b"); px(x + 7, g - fh - 3, 1, 3, "#5d574b"); }
    for (let x = fx + 3; x < fx + fw - 3; x += 6) px(x, g - fh + 4, 3, 2, c.night ? "#e0c060" : "#4a4339");
    const ch = [fx + fw - 10, fx + fw - 20];
    ch.forEach((x, i) => { px(x, g - fh - 14, 3, 14, "#6a5e50"); px(x, g - fh - 14, 3, 1, "#a04030"); smoke(c, x + 1, g - fh - 15, g - fh - 8 + i * 4); });
    px(fx - 2, g - 6, 1, 6, "#3d3a34"); px(fx - 14, g - 5, 12, 1, (c.f % 4 < 2) ? "#d03a30" : "#eeeeee");
    crowd(c, 4, fx - 4, g + 6, Math.round(W / 14), true);
  },
  money(c) {
    const { px, W, H } = c;
    const g = indoors(c, "#3b3a34", "#5a4632", 0.55);
    px(0, g, W, 2, "#3a2c1e");
    const lx = Math.round(W * 0.78);
    px(lx, g - 12, 1, 12, "#2a2a2a"); px(lx - 4, g - 14, 9, 2, "#2f4a35");
    for (let k = 0; k < 9; k++) px(lx - 10 + k * 2, g + 1 + k % 3, 2, 1, "rgba(255,220,140,.12)");
    for (let i = 0; i < 7; i++) {
      const x = 8 + i * Math.round(W * 0.09), h = 3 + Math.floor(c.r() * 10);
      for (let k = 0; k < h; k++) px(x, H - 3 - k * 1.4, 6, 1, k % 2 ? "#c9a640" : "#e3c25a");
      if ((c.f + i * 3) % 14 === 0) px(x + 2, H - 6 - h * 1.4 - 3, 2, 1, "#f2d97a");
    }
    for (let i = 0; i < 3; i++) { const x = Math.round(W * 0.68) + i * 7; px(x, H - 8, 6, 5, "#5e7a4e"); px(x, H - 6, 6, 1, "#c8c0a0"); }
  },
  construction(c, phase) {
    const { px, W, H } = c;
    const g = outdoors(c, phase);
    const bx = Math.round(W * 0.15), bw = Math.round(W * 0.35), bh = Math.round(H * 0.42);
    for (let y = g - bh; y < g; y += 5) px(bx, y, bw, 1, "#6d6a62");
    for (let x = bx; x <= bx + bw; x += 7) px(x, g - bh, 1, bh, "#6d6a62");
    const cx = Math.round(W * 0.62);
    px(cx, 3, 2, g - 3, "#d4a02a");
    for (let y = 5; y < g; y += 4) px(cx - 1, y, 4, 1, "#a87c18");
    px(cx - Math.round(W * 0.35), 4, Math.round(W * 0.48), 2, "#d4a02a");
    const tr = cx - Math.round(W * 0.3) + Math.round((Math.sin(c.f / 4) + 1) * W * 0.12);
    px(tr, 6, 1, 10 + (c.f % 6 < 3 ? 0 : 1), "#2a2a2a"); px(tr - 3, 16 + (c.f % 6 < 3 ? 0 : 1), 7, 3, "#8a6a4a");
    crowd(c, Math.round(W * 0.7), W - 4, g + 6, 4);
    for (let i = 0; i < 4; i++) c.px(Math.round(W * 0.7) + i * 5, g + 1, 2, 1, "#f0a020");
  },
  energy(c, phase) {
    const { px, W, H } = c;
    const g = outdoors(c, phase === 1 ? 2 : phase);
    const pyl = [0.18, 0.5, 0.82].map(k => Math.round(W * k));
    pyl.forEach(x => {
      for (let y = 4; y < g; y++) { const w = Math.round((y - 4) / 4); px(x - w, y, 1, 1, "#4a4a48"); px(x + w, y, 1, 1, "#4a4a48"); }
      px(x - 6, 8, 13, 1, "#4a4a48");
    });
    for (let i = 0; i < pyl.length - 1; i++) for (let x = pyl[i]; x < pyl[i + 1]; x++) {
      const t = (x - pyl[i]) / (pyl[i + 1] - pyl[i]); px(x, 8 + Math.round(Math.sin(t * Math.PI) * 4), 1, 1, "#262624");
    }
    // Дома, где свет то гаснет, то загорается: перебои в сети.
    for (let i = 0; i < 6; i++) {
      const x = 4 + i * Math.round(W / 6), h = 7 + (i % 3) * 2;
      px(x, H - h, 10, h, "#3a3832");
      const on = (c.f + i * 5) % 9 > 2;
      px(x + 2, H - h + 2, 2, 2, on ? "#e8c766" : "#1d1c19"); px(x + 6, H - h + 2, 2, 2, on && i % 2 ? "#e8c766" : "#1d1c19");
    }
    if (c.f % 7 === 0) { const x = pyl[1] + 4; px(x, 10, 1, 1, "#ffffff"); px(x + 1, 11, 1, 1, "#fff3a0"); }
  },
  field(c) {
    const { px, W, H } = c;
    const g = outdoors(c, 1, 0.5, "#a08050");
    px(Math.round(W * 0.8), 4, 7, 7, "#f2d070"); px(Math.round(W * 0.8) + 2, 3, 3, 9, "#f2d070");
    for (let i = 0; i < W / 3; i++) {
      const x = Math.floor(c.r() * W), y = g + 2 + Math.floor(c.r() * (H - g - 3));
      px(x, y, 3, 1, "#7a5e38");
      if (i % 2) px(x + 1, y - 3, 1, 3, (c.f + i) % 5 === 0 ? "#b0904a" : "#8c7040");
    }
    for (let k = 0; k < 4; k++) { const x = (c.f * 2 + k * 37) % W; px(x, g - 3 - k % 2, 2, 1, "rgba(255,255,255,.18)"); }
    const tx = Math.round(W * 0.2);
    px(tx, g + 2, 10, 4, "#b03a2a"); px(tx + 6, g - 1, 4, 3, "#b03a2a"); px(tx + 7, g, 2, 1, "#9fb0bf");
    px(tx + 1, g + 5, 3, 3, "#1b1b1b"); px(tx + 7, g + 6, 2, 2, "#1b1b1b");
  },
  border(c, phase) {
    const { px, W } = c;
    const g = outdoors(c, phase);
    px(0, g + 4, W, 5, c.night ? "#24221f" : "#5b564b");
    for (let x = 2; x < W; x += 8) px(x, g + 6, 4, 1, "#c8c0a0");
    const bx = Math.round(W * 0.55);
    px(bx, g - 10, 8, 10, "#c8c0a8"); px(bx + 1, g - 8, 6, 3, "#6a8aa0"); px(bx - 1, g - 11, 10, 1, "#7a3a2a");
    flagPx(px, c.s.country, bx + 9, g - 18, 6, 4, c.f); px(bx + 8, g - 18, 1, 18, "#3d3a34");
    const up = c.f % 12 < 4;
    for (let k = 0; k < 14; k++) {
      const x = up ? bx - 2 : bx - 2 - k, y = up ? g + 3 - k : g + 3;
      px(x, y, 1, 1, Math.floor(k / 2) % 2 ? "#eeeeee" : "#d03a30");
    }
    const tw = Math.round(W * 0.85);
    px(tw, g - 20, 1, 20, "#4a4a48"); px(tw + 6, g - 20, 1, 20, "#4a4a48"); px(tw - 1, g - 24, 9, 4, "#5a5448");
    for (let i = 0; i < 3; i++) { const x = Math.round(W * 0.05) + i * 14; px(x, g + 1, 12, 6, ["#6a5040", "#4e5a6a", "#7a6a3a"][i]); px(x + 9, g + 2, 3, 3, "#9fb0bf"); }
    person(c, bx + 3, g + 3, 1, "#3f4a35"); person(c, bx - 4, g + 3, 2, "#3f4a35");
  },
  explosion(c, phase) {
    const { px, W, H } = c;
    const g = outdoors(c, phase);
    const hx = Math.round(W * 0.3), hw = Math.round(W * 0.34), hh = Math.round(H * 0.45);
    px(hx, g - hh, hw, hh, c.night ? "#3a3632" : "#8c8576");
    for (let y = g - hh + 3; y < g - 2; y += 5) for (let x = hx + 2; x < hx + hw - 2; x += 5) px(x, y, 2, 2, "#2a2724");
    px(hx + hw - 10, g - hh, 10, 7, c.night ? "#151a26" : "#6f8fae");
    const glow = c.f % 3 ? "#e07a30" : "#f0b040";
    px(hx + hw - 9, g - hh + 7, 3, 2, glow); px(hx + hw - 14, g - hh + 12, 2, 2, glow);
    smoke(c, hx + hw - 6, g - hh, g - hh, "#2e2e2e", "#5a5a58");
    smoke(c, hx + hw - 2, g - hh + 2, g - hh - 2, "#3a3a3a", "#686866");
    car(c, Math.round(W * 0.7), g + 6, "#e8e4d8", true, 0); px(Math.round(W * 0.7) + 4, g + 3, 2, 1, "#d03a30");
    car(c, Math.round(W * 0.84), g + 7, "#2a3a58", true, 1);
    for (let i = 0; i < 6; i++) person(c, 6 + i * 4, g + 7 + (i % 2), i);
  },
  hospital(c, phase) {
    const { px, W, H } = c;
    const g = outdoors(c, phase);
    const hx = Math.round(W * 0.2), hw = Math.round(W * 0.5), hh = Math.round(H * 0.4);
    px(hx, g - hh, hw, hh, c.night ? "#8a8880" : "#e0dcd0");
    for (let y = g - hh + 3; y < g - 4; y += 5) for (let x = hx + 3; x < hx + hw - 3; x += 6) px(x, y, 3, 2, c.night ? ((x + y) % 3 ? "#e8c766" : "#3a3a3a") : "#7a8a9a");
    const sx = hx + hw / 2 - 3;
    px(sx, g - hh - 8, 7, 7, "#f2f2ee"); px(sx + 3, g - hh - 7, 1, 5, "#d03a30"); px(sx + 1, g - hh - 5, 5, 1, "#d03a30");
    px(hx + hw / 2 - 3, g - 6, 6, 6, "#4a4a48");
    car(c, Math.round(W * 0.75), g + 6, "#e8e4d8", true, 0); px(Math.round(W * 0.75) + 4, g + 3, 2, 1, "#d03a30");
    for (let i = 0; i < 4; i++) person(c, hx + 4 + i * 6, g + 6, i, i % 2 ? "#e8e4d8" : COAT[i]);
  },
  tv(c) {
    const { px, W, H } = c;
    indoors(c, "#2f2b27", "#3a2f25", 0.82);
    const tw = Math.min(Math.round(W * 0.5), Math.round(H * 1.4)), th = Math.round(H * 0.7), tx = Math.round(W / 2 - tw / 2), ty = 3;
    px(tx - 3, ty - 2, tw + 6, th + 4, "#1b1a18");
    const noise = c.f % 13 === 12;
    px(tx, ty, tw, th, noise ? "#9a9a98" : "#3a5068");
    if (noise) for (let k = 0; k < tw * th / 6; k++) px(tx + Math.floor(Math.random() * tw), ty + Math.floor(Math.random() * th), 1, 1, Math.random() < 0.5 ? "#e8e8e6" : "#2a2a2a");
    else {
      px(tx, ty + th - 5, tw, 5, "#203040");
      const hx = tx + Math.round(tw * 0.4);
      px(hx, ty + 6, 6, 6, "#d6b48e"); px(hx - 2, ty + 12, 10, th - 12, "#2a2a30"); px(hx + 3, ty + 15, 2, 4, "#a03030");
      px(hx + 2, ty + 10, 2, c.f % 2 ? 1 : 2, "#6a3a30");
      px(tx + 2, ty + th - 4, Math.round(tw * 0.6), 2, "#e8e4d8");
      if (c.f % 4 < 2) px(tx + tw - 6, ty + 2, 3, 3, "#e0403a");
      for (let y = ty; y < ty + th; y += 2) px(tx, y, tw, 1, "rgba(0,0,0,.12)");
    }
    px(tx + tw / 2 - 6, ty + th + 2, 12, 2, "#1b1a18");
  },
  summit(c) {
    const { px, W, H } = c;
    const g = indoors(c, "#4a4038", "#5a4632", 0.6);
    px(Math.round(W * 0.12), g - 2, Math.round(W * 0.76), 5, "#6a4a30"); px(Math.round(W * 0.12), g - 2, Math.round(W * 0.76), 1, "#e8e4d8");
    const fl = [Math.round(W * 0.42), Math.round(W * 0.56)];
    px(fl[0], g - 22, 1, 20, "#c8a040"); px(fl[1], g - 22, 1, 20, "#c8a040");
    flagPx(px, c.s.country, fl[0] - 8, g - 22, 8, 5, c.f); flagPx(px, c.partner, fl[1] + 1, g - 22, 8, 5, c.f + 1);
    for (let i = 0; i < 4; i++) { person(c, Math.round(W * 0.16) + i * 7, g, i, "#2a2a30"); person(c, Math.round(W * 0.62) + i * 7, g, i + 2, "#30302a"); }
    for (let i = 0; i < 5; i++) flash(c, 6 + i * Math.round(W / 5), H - 4, i);
  },
  press(c) {
    const { px, W, H } = c;
    const g = indoors(c, "#2c3a4c", "#2a2622", 0.7);
    px(Math.round(W * 0.2), 4, Math.round(W * 0.6), Math.round(H * 0.4), "#34465a");
    flagPx(px, c.s.country, Math.round(W * 0.27), 6, 9, 6, c.f); flagPx(px, c.s.country, Math.round(W * 0.66), 6, 9, 6, c.f + 2);
    const pxl = Math.round(W / 2 - 6);
    px(pxl, g - 12, 12, 12, "#5a4632"); px(pxl + 4, g - 9, 4, 4, "#c8a040");
    person(c, pxl + 5, g - 12, 0, "#1f2430");
    for (let i = 0; i < 4; i++) px(pxl + 1 + i * 3, g - 16 - (i % 2), 1, 4, "#1b1b1b");
    for (let i = 0; i < Math.round(W / 6); i++) {
      const x = 2 + i * 6 + Math.floor(c.r() * 3), y = H - 1;
      c.px(x, y - 4, 4, 4, "#1b1a18"); c.px(x + 1, y - 6, 2, 2, "#2a2724");
      if (i % 4 === 1 && (c.f + i) % 6 < 3) c.px(x + 4, y - 9, 1, 4, "#1b1a18");
      flash(c, x + 2, y - 8, i);
    }
  },
  phone(c) {
    const { px, W, H } = c;
    const g = indoors(c, "#1e1c1a", "#3a2c1e", 0.62);
    const wx = Math.round(W * 0.08), ww = Math.round(W * 0.3);
    px(wx, 4, ww, Math.round(H * 0.45), "#151a26");
    for (let k = 0; k < ww / 2; k++) px(wx + Math.floor(c.r() * ww), 6 + Math.floor(c.r() * H * 0.4), 1, 1, "#e0c060");
    px(wx + ww / 2, 4, 1, Math.round(H * 0.45), "#2a2724");
    const lx = Math.round(W * 0.75);
    px(lx, g - 12, 1, 12, "#2a2a2a"); px(lx - 4, g - 14, 9, 3, "#2f4a35");
    for (let y = g - 11; y < H; y++) { const w = (y - g + 11) * 0.8; px(lx - w, y, w * 2, 1, "rgba(255,210,120,.07)"); }
    const ph = Math.round(W * 0.48), ring = c.f % 4 < 2;
    const sh = ring ? (c.f % 2 ? 1 : -1) : 0;
    px(ph + sh, g - 4, 12, 5, "#8a1f1f"); px(ph - 1 + sh, g - 6, 14, 2, "#6a1515"); px(ph + 4 + sh, g - 2, 4, 2, "#e8e4d8");
    if (ring) { px(ph - 4, g - 9, 1, 3, "#e8e4d8"); px(ph - 6, g - 10, 1, 5, "#e8e4d8"); px(ph + 15, g - 9, 1, 3, "#e8e4d8"); px(ph + 17, g - 10, 1, 5, "#e8e4d8"); }
  },
  stamp(c) {
    const { px, W, H } = c;
    px(0, 0, W, H, "#5a4632");
    for (let y = 0; y < H; y += 4) px(0, y, W, 1, "#523f2c");
    const dx = Math.round(W * 0.3), dw = Math.round(W * 0.4);
    px(dx + 2, 4, dw, H - 6, "#2a2018"); px(dx, 2, dw, H - 6, "#ebe4d0");
    for (let y = 6; y < H - 8; y += 3) px(dx + 4, y, Math.round(dw * (0.5 + ((y * 7) % 5) / 10)), 1, "#9a9080");
    const t = c.f % 10, sx = dx + dw - 16, low = t >= 3 && t <= 4;
    const sy = t < 3 ? -6 + t * 6 : low ? 12 : 12 - (t - 4) * 4;
    if (t >= 4) { px(sx - 1, H - 15, 12, 7, "rgba(190,40,40,.85)"); px(sx + 1, H - 13, 8, 3, "#ebe4d0"); }
    px(sx + 3, sy - 8, 4, 8, "#3a2a1e"); px(sx, sy, 10, 3, "#5a3a2a");
  },
  ballot(c) {
    const { px, W } = c;
    const g = indoors(c, "#5a5448", "#4a3f32", 0.66);
    for (let i = 0; i < 3; i++) { const x = Math.round(W * 0.06) + i * 12; px(x, 6, 10, g - 6, i % 2 ? "#4a6a8a" : "#3e5a78"); px(x, 6, 10, 1, "#c8c0a0"); }
    const bx = Math.round(W * 0.58), bw = 18, by = g - 10;
    px(bx, by, bw, 14, "rgba(220,230,240,.55)"); px(bx, by, bw, 1, "#e8e4d8"); px(bx + 6, by, 6, 1, "#2a2a2a");
    for (let k = 0; k < 5; k++) px(bx + 2 + k * 3, by + 8 + (k % 3), 3, 2, "#f2f2ee");
    const t = c.f % 8; if (t < 5) px(bx + 7, by - 6 + t, 4, 3, "#f2f2ee");
    person(c, bx + 6, by + 1, 0, "#4b3d33", true);
    for (let i = 0; i < 5; i++) person(c, Math.round(W * 0.82) + i * 4, g + 6, i + 1);
    flagPx(px, c.s.country, Math.round(W * 0.5), 6, 9, 6, c.f);
  },
  meeting(c) {
    const { px, W, H } = c;
    const g = outdoors(c, 3, 0.68, "#24221f");
    const lx = Math.round(W * 0.5);
    px(lx, 6, 1, g - 6, "#3a3a38"); px(lx - 2, 5, 5, 2, "#3a3a38");
    const on = c.f % 9 !== 0;
    if (on) for (let y = 7; y < H; y++) { const w = (y - 7) * 0.6; px(lx - w, y, w * 2 + 1, 1, "rgba(255,220,140,.08)"); }
    px(lx - 1, 7, 3, 1, on ? "#f2d97a" : "#6a6040");
    px(lx - 14, g + 2, 10, 1, "#5a4632"); px(lx - 13, g + 3, 1, 3, "#3a2c1e"); px(lx - 6, g + 3, 1, 3, "#3a2c1e");
    person(c, lx - 4, g + 7, 0, "#1f1f22"); person(c, lx + 4, g + 7, 1, "#26221f");
    const t = c.f % 10; if (t > 3 && t < 8) px(lx - 2 + (t - 4), g + 3, 3, 2, "#e8e4d8");
    px(Math.round(W * 0.82), g + 2, 12, 4, "#1b1b1b"); px(Math.round(W * 0.82), g + 3, 1, 1, "#f2e8a0");
    for (let k = 0; k < 6; k++) px(Math.round(W * 0.82) - 1 - k * 2, g + 3, 2, 1, `rgba(240,230,160,${0.25 - k * 0.04})`);
  },
  bridge(c, phase) {
    const { px, W, H } = c;
    const g = outdoors(c, phase, 0.5, "#3a5a6a");
    for (let k = 0; k < W / 3; k++) { const x = (k * 9 + c.f * 2) % W, y = g + 3 + (k * 5) % (H - g - 3); px(x, y, 3, 1, "#6a8a9a"); }
    const left = Math.round(W * 0.42), right = Math.round(W * 0.58);
    px(0, g - 4, left, 3, "#7a7468"); px(right, g - 4, W - right, 3, "#7a7468");
    for (let k = 0; k < 8; k++) px(left + k, g - 4 + k, 2, 2, "#6a6458");
    for (let x = 6; x < W; x += 22) if (x < left - 2 || x > right + 2) px(x, g - 1, 3, H - g, "#5a544a");
    car(c, left - 14, g - 4, "#e8e4d8", true, 0); car(c, right + 6, g - 4, "#2a3a58", true, 1);
    smoke(c, left + 6, g, g - 4, "#6a6a68", "#8a8a88");
  },
};
