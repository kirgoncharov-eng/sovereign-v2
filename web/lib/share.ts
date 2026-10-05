// Итог партии в ссылке: из этих параметров сервер рисует карточку (/api/card) и страницу со
// ссылкой-превью (/r). Общий код для клиента и сервера: что попало в ссылку — то и на картинке.
import { COUNTRIES, END_TYPES } from "./game/data.ts";
import type { GameState } from "./game/types.ts";

export const BOT_USERNAME = process.env.NEXT_PUBLIC_BOT_USERNAME || "sovereign_game_bot";
export const botLink = () => `https://t.me/${BOT_USERNAME}`;

export interface ShareResult {
  name: string; country: string; end: string; title: string;
  turns: number; from: number; to: number; rating: number; score: number;
  kept: number; promised: number; daily?: string; arc?: string; solved?: boolean;
}

const str = (v: unknown, max: number) => String(v ?? "").replace(/[<>]/g, "").trim().slice(0, max);
const num = (v: unknown, lo: number, hi: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo; };

export function shareResultOf(gs: GameState, rating: number, score: number, arcTitle?: string): ShareResult {
  return {
    name: gs.leader.name, country: gs.country, end: gs.endType ?? "collapse", title: gs.verdict?.title ?? "",
    turns: gs.history.length, from: COUNTRIES[gs.country]?.startYear ?? gs.year, to: gs.year, rating, score,
    kept: (gs.promises ?? []).filter(p => p.status === "kept").length, promised: gs.promises?.length ?? 0,
    ...(gs.daily ? { daily: gs.daily } : {}),
    ...(arcTitle ? { arc: arcTitle, solved: !!gs.arc?.epilogue } : {}),
  };
}

export function shareQuery(r: ShareResult): string {
  const q = new URLSearchParams({
    n: r.name, c: r.country, e: r.end, v: r.title, t: String(r.turns), y: `${r.from}-${r.to}`,
    r: String(r.rating), s: String(r.score), k: `${r.kept}-${r.promised}`,
  });
  if (r.daily) q.set("d", r.daily);
  if (r.arc) { q.set("a", r.arc); q.set("o", r.solved ? "1" : "0"); }
  return q.toString();
}

type Params = URLSearchParams | Record<string, string | string[] | undefined>;
export function parseShare(p: Params): ShareResult | null {
  const get = (k: string) => { const v = p instanceof URLSearchParams ? p.get(k) : p[k]; return Array.isArray(v) ? v[0] : v ?? ""; };
  const name = str(get("n"), 60), country = str(get("c"), 30);
  if (!name || !country) return null;
  const [from, to] = get("y").split("-");
  const [kept, promised] = get("k").split("-");
  const end = str(get("e"), 20);
  const daily = /^\d{4}-\d{2}-\d{2}$/.test(get("d")) ? get("d") : undefined;
  const arc = str(get("a"), 40);
  return {
    name, country, end: END_TYPES[end as keyof typeof END_TYPES] ? end : "collapse", title: str(get("v"), 40),
    turns: num(get("t"), 0, 20), from: num(from, 1990, 2100), to: num(to, 1990, 2100), rating: num(get("r"), 0, 100),
    score: num(get("s"), 0, 99999), kept: num(kept, 0, 3), promised: num(promised, 0, 3),
    ...(daily ? { daily } : {}), ...(arc ? { arc, solved: get("o") === "1" } : {}),
  };
}

export const survived = (r: ShareResult) => r.end === "mandate" || r.end === "reelected";
const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100;
  return `${n} ${m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? few : many}`;
};

// Подпись под ссылкой и в превью: коротко, с вызовом.
export function shareCaption(r: ShareResult) {
  const where = `${r.country}, ${r.from}–${r.to}`;
  const how = END_TYPES[r.end as keyof typeof END_TYPES] ?? "";
  const title = `${r.name} — «${r.title || how}»`;
  const promises = r.promised ? ` Обещаний сдержано: ${r.kept} из ${r.promised}.` : "";
  const description = `${where}: ${how.toLowerCase()}, ${plural(r.turns, "решение", "решения", "решений")}, рейтинг ${r.rating}%.${promises}`;
  const challenge = r.daily ? "Дело дня — одна партия на всех. Продержишься дольше?" : survived(r) ? "Сможешь лучше?" : `Мой президент продержался ${plural(r.turns, "ход", "хода", "ходов")}. А твой?`;
  return { title, description, challenge };
}
