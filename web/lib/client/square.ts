// «Окно на площадь» — пиксельная сцена перед резиденцией, как будка пограничника в Papers, Please.
// Площадь показывает состояние страны: сколько людей вышло протестовать, кто их сдерживает,
// машут ли флагами сторонники, не подтянулась ли к зданию техника. Рисуется в низком разрешении
// и растягивается без сглаживания.
import { hashSeed, seededRandom } from "../game/engine.ts";

export interface SquareState {
  country: string;
  seed: number;
  turn: number;
  legitimacy: number;   // 0..100
  rating: number;       // %
  military: number;     // 0..100
  security: number;     // отношение силовиков, −100..100
  crises: number;
  election: boolean;    // в этот ход выборы
  phase?: number;       // время суток: 0 утро, 1 день, 2 вечер, 3 ночь (по шапке дела)
  economy?: number;
  blackout?: boolean;
  response?: "celebration" | "lockdown" | "mourning" | "works" | null;
}

export function squareLife(s: SquareState) {
  const lockdown = s.response === "lockdown";
  const celebration = s.response === "celebration";
  const mourning = s.response === "mourning";
  const protest = mourning || celebration ? 0 : Math.max(0, Math.min(46, Math.round((62 - s.legitimacy) * 0.7 + s.crises * 6)));
  return {
    protest: lockdown ? Math.min(protest, 6) : protest,
    fans: lockdown || mourning ? 0 : Math.max(0, Math.min(36, Math.round((s.rating - 32) / 2.2) + (celebration ? 12 : 0))),
    police: lockdown ? 14 : protest >= 8 && s.military >= 30 ? 4 + Math.floor(protest / 5) : 0,
    tanks: s.security <= -50 && s.military >= 40 ? (s.security <= -65 ? 2 : 1) : 0,
    queues: (s.economy ?? 50) < 30 && !lockdown && !mourning,
    works: s.response === "works" && !s.blackout,
    blackout: !!s.blackout, mourning, celebration, lockdown,
  };
}

export function squareCaption(s: SquareState): string {
  const life = squareLife(s);
  if (life.tanks) return "У резиденции появилась бронетехника. Военные не расходятся.";
  if (life.mourning) return "У ограды оставляют цветы. Флаг приспущен.";
  if (life.lockdown) return "Подходы к резиденции перекрыты. На площади остаётся оцепление.";
  if (life.blackout) return "Часть города без света. Резиденция работает от резервного питания.";
  if (life.celebration) return "После победы на выборах сторонники собираются у резиденции.";
  if (life.protest >= 12) return life.police ? "На площади растёт толпа. Перед ступенями выстроилась полиция." : "Площадь заполняется протестующими. Подходы к резиденции открыты.";
  if (life.queues) return "У торгового павильона очередь. Машин на площади стало меньше.";
  if (life.works) return "За оградой работают дорожники. Столица снова строится.";
  return "Мимо резиденции идут прохожие. Столица живёт обычным днём.";
}

// Флаги упрощены до полос: по ним площадь узнаётся с первого взгляда.
type Flag = { dir: "h" | "v"; bands: string[]; mark?: string; cross?: string };
const FLAGS: Record<string, Flag> = {
  "Беларусь": { dir: "h", bands: ["#c8313e", "#c8313e", "#4aa657"] },
  "Украина": { dir: "h", bands: ["#2f6fc0", "#f2cd2e"] },
  "Грузия": { dir: "h", bands: ["#f2f2ee"], cross: "#d8262c" },
  "Молдова": { dir: "v", bands: ["#2a55a8", "#f0c419", "#cc2a2e"] },
  "Армения": { dir: "h", bands: ["#d32a2a", "#2a4ea8", "#f0a020"] },
  "Казахстан": { dir: "h", bands: ["#3fb0d8"], mark: "#f2d22a" },
};

// Небо по времени суток: ход за ходом сменяются утро, день, вечер и ночь.
const SKIES = [
  ["#7d8c99", "#97a3aa", "#b4b5a8"],           // пасмурное утро
  ["#6f8fae", "#87a4bd", "#a7bccb"],           // день
  ["#5a4e6a", "#a2626a", "#d49a6a"],           // вечер
  ["#151a26", "#1d2433", "#283244"],           // ночь
];

export function drawSquare(ctx: CanvasRenderingContext2D, W: number, H: number, s: SquareState, frame: number) {
  const r = seededRandom(hashSeed(s.seed, "square", s.country));
  const phase = s.phase ?? s.turn % 4;
  const night = phase === 3;
  const life = squareLife(s);
  const px = (x: number, y: number, w: number, h: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); };

  // Небо полосами
  const sky = SKIES[phase];
  const bandH = Math.ceil(H * 0.66 / sky.length);
  sky.forEach((c, i) => px(0, i * bandH, W, bandH + 1, c));
  if (night) for (let i = 0; i < W / 6; i++) px(r() * W, r() * H * 0.4, 1, 1, "#c9c3a8");
  // Тучи над страной в кризисе
  for (let i = 0; i < s.crises * 2; i++) {
    const cx = ((r() * W + frame * 0.25 * (i % 2 ? 1 : -1)) % (W + 30)) - 15, cy = 2 + r() * 8;
    px(cx, cy, 16, 3, night ? "#2b3140" : "#5d6168"); px(cx + 3, cy - 2, 9, 2, night ? "#2b3140" : "#5d6168");
  }

  const ground = Math.round(H * 0.66);
  // Город на горизонте
  const far = night ? "#0e121b" : "#5b6470", near = night ? "#161b26" : "#4a515b";
  for (let x = 0; x < W;) {
    const w = 6 + Math.floor(r() * 12), h = 6 + Math.floor(r() * 14);
    px(x, ground - h, w, h, r() < 0.5 ? far : near);
    if (night) for (let k = 0; k < w * h / 18; k++) if (r() < (life.blackout ? 0.04 : 0.35)) px(x + 1 + Math.floor(r() * (w - 2)), ground - h + 2 + Math.floor(r() * (h - 3)), 1, 1, "#e0c060");
    x += w + Math.floor(r() * 3);
  }

  // Резиденция: фронтон, колонны, флаг на крыше
  const bw = Math.min(64, Math.round(W * 0.34)), bh = Math.round(H * 0.3), bx = Math.round(W / 2 - bw / 2), by = ground - bh;
  const stone = night ? "#59544b" : "#b7ae98", shade = night ? "#3d3a34" : "#8f8774", dark = night ? "#262420" : "#5d574b";
  px(bx, by, bw, bh, stone);
  px(bx - 3, by - 2, bw + 6, 3, shade);
  const ped = Math.max(3, Math.round(bh / 3));
  for (let i = 0; i < ped; i++) px(bx + bw / 2 - (i * (bw / 2 - 2)) / ped, by - 3 - (ped - 1 - i), (2 * i * (bw / 2 - 2)) / ped + 1, 1, shade);
  const cols = Math.max(4, Math.floor(bw / 8));
  for (let i = 0; i < cols; i++) {
    const cx = bx + 3 + Math.round(i * (bw - 7) / (cols - 1));
    px(cx, by + 3, 2, bh - 6, shade);
  }
  px(bx + bw / 2 - 3, ground - 8, 6, 8, dark); // двери
  for (let i = 0; i < cols - 1; i++) {         // окна
    const wx = bx + 6 + Math.round(i * (bw - 7) / (cols - 1));
    px(wx, by + 6, 2, 3, night ? (r() < 0.6 ? "#e8c766" : dark) : dark);
  }
  px(bx - 4, ground - 2, bw + 8, 2, shade);   // ступени
  // флагшток и флаг
  const fx = Math.round(W / 2), fy = Math.max(0, by - 3 - ped - 8);
  px(fx, fy, 1, by - 3 - ped - fy + 1, dark);
  drawFlag(px, FLAGS[s.country], fx + 1, fy + (life.mourning ? 3 : 0), 9, 6, frame);

  // Площадь
  px(0, ground, W, H - ground, night ? "#2c2a27" : "#77705f");
  for (let y = ground + 2; y < H; y += 3) for (let x = (y % 2) * 2; x < W; x += 5) px(x, y, 2, 1, night ? "#33302c" : "#6b6556");

  // Люди: протест растёт с падением легитимности и кризисами, сторонники — с рейтингом.
  const { protest, fans, tanks } = life;
  const police = Math.min(Math.floor(bw / 4), life.police);
  const bob = (i: number) => ((frame + i) % 4 === 0 ? 1 : 0);
  const coat = ["#2e2b28", "#3e3a33", "#4b3d33", "#33393f", "#463a3a"];
  const skin = night ? "#8a7a68" : "#d6b48e";

  const person = (x: number, y: number, body: string, i: number, prop?: "sign" | "flag") => {
    const b = bob(i);
    px(x, y - 5 - b, 2, 2, skin);
    px(x, y - 3 - b, 2, 3 + b, body);
    if (prop === "sign") { px(x + 1, y - 9 - b, 1, 4, "#5d4a33"); px(x - 1, y - 11 - b, 5, 3, frame % 8 < 4 || i % 3 ? "#e9e2cf" : "#e0a49a"); }
    if (prop === "flag") { px(x + 2, y - 9, 1, 6, "#5d4a33"); drawFlag(px, FLAGS[s.country], x + 3, y - 9 + b, 4, 3, frame + i); }
  };

  // Город живёт и в спокойные дни: прохожие, служебная машина, торговый павильон.
  if (!life.lockdown && !life.mourning) for (let i = 0; i < 4; i++) {
    const x = ((i * 53 + frame * (i % 2 ? -0.45 : 0.45)) % (W + 12) + W + 12) % (W + 12) - 6;
    person(x, H - 2 - i % 2 * 2, coat[i], i);
  }
  const kioskX = Math.max(5, bx - 48);
  px(kioskX, ground + 1, 12, 7, "#5a4b3c"); px(kioskX - 1, ground, 14, 2, "#88563f");
  px(kioskX + 2, ground + 3, 7, 3, life.blackout ? "#282522" : "#baab88");
  if (life.queues) for (let i = 0; i < 7; i++) person(kioskX + 14 + i * 3, ground + 10 + i % 2, coat[i % coat.length], i);
  if (life.blackout) { px(bx + bw + 5, ground + 2, 7, 5, "#56564c"); px(bx + bw + 6, ground + 3, 2, 1, frame % 6 < 3 ? "#d0a35b" : "#867044"); }
  if ((s.economy ?? 50) >= 35 && !life.lockdown && !life.mourning) {
    const x = (frame * 0.8 + W * 0.72) % (W + 16) - 14, y = ground + 2;
    px(x, y, 10, 3, "#586369"); px(x + 2, y - 2, 6, 2, "#586369"); px(x + 3, y - 1, 4, 1, "#9cacac");
    px(x + 1, y + 3, 2, 1, "#242527"); px(x + 7, y + 3, 2, 1, "#242527");
  }
  if (life.works) for (let i = 0; i < 4; i++) {
    const x = Math.max(3, W - 38) + i * 7;
    px(x, H - 4, 2, 3, "#e5a340"); px(x - 1, H - 2, 4, 1, "#ddd1a2");
    if (i < 2) { person(x + 3, H - 5, "#b77a2c", i); px(x + 4, H - 7, 1, 3 + frame % 2, "#5a4632"); }
  }
  if (life.mourning) {
    for (let i = 0; i < 9; i++) { px(bx + 4 + i * 3, ground + 2, 2, 1, i % 2 ? "#c44b51" : "#ddd6c4"); px(bx + 5 + i * 3, ground + 3, 1, 2, "#42513a"); }
    for (let i = 0; i < 5; i++) person(bx + 4 + i * 6, ground + 11, coat[i], i);
  }
  if (life.lockdown) {
    for (let i = 0; i < 3; i++) { const x = bx - 12 + i * (bw / 2 + 10); px(x, ground + 9, 12, 1, "#a6a99f"); px(x + 1, ground + 8, 1, 4, "#a6a99f"); px(x + 9, ground + 8, 1, 4, "#a6a99f"); }
    const vx = Math.min(W - 14, bx + bw + 12), vy = ground + 5;
    px(vx, vy, 12, 5, "#28374b"); px(vx + 7, vy - 2, 5, 3, "#28374b"); px(vx + 8, vy - 1, 3, 2, "#8292a0");
    px(vx + 3, vy - 1, 2, 1, frame % 8 < 4 ? "#a4423e" : "#4a6f9f");
  }

  // Сторонники — ближе к ступеням, полукругом
  for (let i = 0; i < fans; i++) {
    const side = i % 2 ? 1 : -1;
    const x = W / 2 + side * (bw / 2 + 4 + (i >> 1) * 4 + Math.floor(r() * 2)), y = ground + 6 + Math.floor(r() * 4);
    if (x > 1 && x < W - 3) person(x, y, coat[i % coat.length], i, i % 3 === 0 ? "flag" : undefined);
  }
  if (life.celebration) {
    px(bx + 4, ground + 1, bw - 8, 2, "#a34742");
    if (night) for (let i = 0; i < 3; i++) {
      const t = (frame + i * 11) % 36;
      if (t >= 8 && t < 24) {
        const cx = W * (0.18 + i * 0.31), cy = 7 + i % 2 * 5, spread = (t - 8) / 4;
        for (let k = 0; k < 8; k++) px(cx + Math.cos(k * Math.PI / 4) * spread, cy + Math.sin(k * Math.PI / 4) * spread, 1, 1, t < 16 ? "#e2c275" : "#967c60");
      }
    }
  }
  // Оцепление перед зданием
  for (let i = 0; i < police; i++) {
    const x = bx + 2 + Math.round(i * (bw - 4) / Math.max(1, police - 1)), y = ground + 7;
    px(x, y - 5, 2, 2, "#1f2a3d"); px(x, y - 3, 2, 3, "#2a3a58"); px(x - 1, y - 4, 1, 4, "#9aa6b8");
  }
  // Протестующие — на переднем плане, плотнее при большом протесте
  for (let i = 0; i < protest; i++) {
    const x = 2 + Math.floor(r() * (W - 4)), y = H - 1 - Math.floor(r() * Math.max(2, H - ground - 12));
    person(x, y, coat[(i + 2) % coat.length], i, i % 4 === 0 ? "sign" : undefined);
  }
  // Техника у здания — признак того, что силовики готовы решать сами
  for (let i = 0; i < tanks; i++) {
    const tx = i === 0 ? bx - 22 : bx + bw + 4, ty = ground + 4;
    px(tx, ty, 18, 4, "#3f4a35"); px(tx + 4, ty - 3, 9, 3, "#4d5a40"); px(tx + (i ? -6 : 13), ty - 2, 7, 1, "#3f4a35");
    for (let k = 0; k < 5; k++) px(tx + 1 + k * 4, ty + 4, 2, 1, "#20251c");
  }
}

export type Px = (x: number, y: number, w: number, h: number, c: string) => void;

// Флаг страны (или партнёра) для сцен событий.
export function flagPx(px: Px, country: string, x: number, y: number, w: number, h: number, frame: number) {
  drawFlag(px, FLAGS[country] ?? PARTNER_FLAGS[country], x, y, w, h, frame);
}
const PARTNER_FLAGS: Record<string, Flag> = {
  eu: { dir: "h", bands: ["#2a4aa0"], mark: "#f2cd2e" },
  ru: { dir: "h", bands: ["#f2f2ee", "#2f5fb0", "#cc2a2e"] },
};
export { SKIES };

// Флажок страны для списков и шапок: те же полосы, что над резиденцией.
export function drawFlagAt(ctx: CanvasRenderingContext2D, country: string, w: number, h: number) {
  const px: Px = (x, y, ww, hh, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, ww, hh); };
  drawFlag(px, FLAGS[country], 0, 0, w, h, 1);
}
function drawFlag(px: Px, f: Flag | undefined, x: number, y: number, w: number, h: number, frame: number) {
  if (!f) return;
  // колышется только свободный край полотнища
  const wave = (c: number) => (c >= w / 2 && (frame + c) % 3 === 0 ? 1 : 0);
  for (let c = 0; c < w; c++) {
    const dy = wave(c);
    for (let rr = 0; rr < h; rr++) {
      const band = f.dir === "h" ? f.bands[Math.min(f.bands.length - 1, Math.floor(rr * f.bands.length / h))] : f.bands[Math.min(f.bands.length - 1, Math.floor(c * f.bands.length / w))];
      px(x + c, y + rr + dy, 1, 1, band);
    }
  }
  if (f.cross) {
    const cx = Math.floor(w / 2), cy = Math.floor(h / 2);
    for (let c = 0; c < w; c++) px(x + c, y + cy + wave(c), 1, 1, f.cross);
    for (let rr = 0; rr < h; rr++) px(x + cx, y + rr + wave(cx), 1, 1, f.cross);
  }
  if (f.mark) px(x + Math.floor(w / 2) - 1, y + Math.floor(h / 2) - 1 + wave(Math.floor(w / 2)), 2, 2, f.mark);
}
