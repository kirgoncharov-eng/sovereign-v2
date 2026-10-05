// Карточка итога правления — картинка для сторис и мессенджеров (1080×1350).
import { ARCS } from "../content/arcs.ts";
import { runScore } from "../game/daily.ts";
import { COUNTRIES, END_TYPES } from "../game/data.ts";
import { computePolls, isFemaleName, isSurvival, plural } from "../game/engine.ts";
import type { GameState } from "../game/types.ts";
import { portraitCanvas } from "./portrait.ts";
import { BOT_USERNAME } from "../share.ts";

const W = 1080, H = 1350;
const INK = "#2a241d", INK2 = "#4a4236", STAMP_OK = "#3d6a27", RED = "#a02f24", PAPER = "#d9cfb2";
const SERIF = "'PT Serif', Georgia, serif", NARROW = "'Handjet SV', 'PT Sans Narrow', 'Arial Narrow', sans-serif", MONO = "'PT Mono', monospace";

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number, maxLines = 4) {
  const words = text.split(/\s+/);
  let line = "", n = 0;
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxW && line) {
      ctx.fillText(n === maxLines - 1 ? `${line}…` : line, x, y + n * lh);
      if (++n >= maxLines) return n;
      line = w;
    } else line = t;
  }
  if (line) { ctx.fillText(line, x, y + n * lh); n++; }
  return n;
}

function stamp(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, size: number) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(-0.12);
  ctx.font = `700 ${size}px ${NARROW}`;
  const w = ctx.measureText(text.toUpperCase()).width + size * 1.1, h = size * 1.55;
  ctx.globalAlpha = 0.85; ctx.strokeStyle = color; ctx.fillStyle = color;
  ctx.lineWidth = 4; ctx.strokeRect(-w / 2, -h / 2, w, h);
  ctx.lineWidth = 1.5; ctx.strokeRect(-w / 2 + 7, -h / 2 + 7, w - 14, h - 14);
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(text.toUpperCase(), 0, 2);
  ctx.restore();
}

export async function resultCard(gs: GameState): Promise<Blob | null> {
  try { await document.fonts?.load(`700 36px 'Handjet SV'`, "Суверен"); await document.fonts?.ready; } catch { /* шрифты по умолчанию */ }
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  if (!ctx || !gs.verdict) return null;
  const v = gs.verdict, country = COUNTRIES[gs.country];
  const loss = !isSurvival(gs.endType);

  // бумага с зерном
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 26000; i++) { ctx.fillStyle = `rgba(60,55,45,${Math.random() * 0.06})`; ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2); }

  // шапка
  ctx.fillStyle = INK; ctx.textBaseline = "alphabetic";
  ctx.font = `700 64px ${SERIF}`; ctx.fillText("Суверен", 80, 130);
  ctx.font = `34px ${NARROW}`; ctx.fillStyle = INK2; ctx.textAlign = "right";
  ctx.fillText(gs.daily ? `Дело дня · ${gs.daily.split("-").reverse().slice(0, 2).join(".")}` : "Итоги правления", W - 80, 128);
  ctx.textAlign = "left";
  ctx.fillStyle = INK; ctx.fillRect(80, 158, W - 160, 5); ctx.fillRect(80, 170, W - 160, 2);

  // портрет
  const p = portraitCanvas(gs.leader.name, isFemaleName(gs.leader.name));
  ctx.save();
  ctx.translate(80 + 190, 250 + 240); ctx.rotate(-0.03);
  ctx.fillStyle = "#efede6"; ctx.shadowColor = "rgba(0,0,0,.25)"; ctx.shadowBlur = 18; ctx.fillRect(-190, -240, 380, 480);
  ctx.shadowBlur = 0;
  if (loss) ctx.filter = "grayscale(1) contrast(0.9)";
  ctx.drawImage(p, -180, -228, 360, 450);
  ctx.restore();

  // имя, страна, срок
  const tx = 520, tw = W - tx - 80;
  ctx.fillStyle = INK2; ctx.font = `36px ${NARROW}`;
  ctx.fillText(`${country.flag} ${gs.country} · ${country.startYear}–${gs.year}`, tx, 290);
  ctx.fillStyle = INK; ctx.font = `700 68px ${SERIF}`;
  const nameLines = wrap(ctx, gs.leader.name, tx, 370, tw, 76, 2);
  stamp(ctx, v.title, tx + tw / 2, 370 + nameLines * 76 + 60, loss ? RED : STAMP_OK, 38);
  ctx.fillStyle = INK2; ctx.font = `36px ${NARROW}`;
  ctx.fillText(END_TYPES[gs.endType ?? "collapse"] ?? "", tx, 370 + nameLines * 76 + 190);

  // цифры
  const rating = computePolls(gs.country, gs.factions, gs.resources).leader;
  const stats: [string, string][] = [[String(gs.history.length), "решений из 20"], [`${rating}%`, "рейтинг"], [String(runScore(gs)), "очков"]];
  stats.forEach(([n, l], i) => {
    const x = 80 + i * ((W - 160) / 3);
    ctx.fillStyle = INK; ctx.font = `700 92px ${SERIF}`; ctx.fillText(n, x, 900);
    ctx.fillStyle = INK2; ctx.font = `34px ${NARROW}`; ctx.fillText(l, x, 948);
  });
  ctx.fillStyle = INK; ctx.fillRect(80, 990, W - 160, 2);

  // интрига и эпитафия
  const arc = gs.arc && ARCS.find(a => a.id === gs.arc!.id);
  let y = 1060;
  if (arc) {
    ctx.fillStyle = gs.arc!.epilogue ? STAMP_OK : RED; ctx.font = `700 36px ${NARROW}`;
    ctx.fillText(`Интрига «${arc.title}»: ${gs.arc!.epilogue ? "раскрыта" : "осталась тайной"}`, 80, y);
    y += 70;
  }
  if (v.epitaph) {
    ctx.fillStyle = INK; ctx.font = `italic 40px ${SERIF}`;
    wrap(ctx, `«${v.epitaph}»`, 80, y, W - 160, 52, 2);
  }

  // подвал
  ctx.fillStyle = INK2; ctx.font = `34px ${MONO}`;
  ctx.fillText(loss ? `Мой президент продержался ${plural(gs.history.length, "ход", "хода", "ходов")}. А твой?` : "Сможешь лучше?", 80, H - 110);
  ctx.font = `700 34px ${NARROW}`;
  ctx.fillText(`Играть: t.me/${BOT_USERNAME}`, 80, H - 60);
  return new Promise(res => c.toBlob(b => res(b), "image/png"));
}
