// Отзывы игроков: из игры (оценка и пара слов) и из бота (три вопроса).
// Хранятся последние 500, каждый новый сразу пересылается автору игры в Telegram.
import { dayOf } from "./analytics.ts";
import { kv } from "./kv.ts";
import { botApi } from "./telegram.ts";

export const FB_LIST = "fb:list";
const FB_MAX = 500;
export const ADMIN = "tg:admin"; // поле chat — куда слать отзывы и утреннюю сводку

export interface Feedback {
  at: string;
  src: "game" | "bot";
  rating?: number;             // 1–5
  text: string;
  ctx?: Record<string, string | number>; // чем кончилась партия, страна, сложность…
  who?: string;                // имя в Telegram, если отзыв из бота
}

const esc = (s: unknown) => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
export const stars = (n?: number) => (n ? "★".repeat(n) + "☆".repeat(5 - n) : "");

export async function adminChat(): Promise<number | null> {
  const v = await kv.hget(ADMIN, "chat").catch(() => null);
  return v ? Number(v) : null;
}

export async function notifyAdmin(text: string) {
  const chat = await adminChat();
  if (chat) await botApi("sendMessage", { chat_id: chat, text, parse_mode: "HTML", link_preview_options: { is_disabled: true } }).catch(() => {});
}

export function feedbackHtml(f: Feedback): string {
  const ctx = f.ctx ? Object.entries(f.ctx).map(([k, v]) => `${k}: ${esc(v)}`).join(" · ") : "";
  return [
    `<b>Отзыв ${f.src === "bot" ? "в боте" : "из игры"}</b>${f.rating ? ` ${stars(f.rating)}` : ""}${f.who ? ` · ${esc(f.who)}` : ""}`,
    ctx ? `<i>${ctx}</i>` : "",
    f.text ? esc(f.text) : "",
  ].filter(Boolean).join("\n");
}

export async function saveFeedback(f: Feedback, now = Date.now()) {
  const day = `an:${dayOf(now)}`;
  await kv.lpush(FB_LIST, JSON.stringify(f), FB_MAX);
  await kv.hincrby(day, "feedback");
  if (f.rating) { await kv.hincrby(day, "rating_sum", f.rating); await kv.hincrby(day, "rating_n"); }
  await notifyAdmin(feedbackHtml(f));
}

export async function readFeedback(n = 50): Promise<Feedback[]> {
  const raw = await kv.lrange(FB_LIST, n).catch(() => []);
  return raw.flatMap(r => { try { return [JSON.parse(r) as Feedback]; } catch { return []; } });
}
