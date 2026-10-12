// Анонимная аналитика: какие шаги проходит игрок — запуск, партия, ходы, финал, «поделиться».
// Никаких имён и Telegram-идентификаторов: только случайный id браузера, тот же, что у «Дела дня».
// События копятся и уходят пачкой; без сервера (демо, офлайн) отправка тихо ничего не делает.
import { runProps } from "./run-context.ts";
import { referralId, webUid } from "./daily.ts";
import { APP_VERSION } from "../game/data.ts";
import { inTelegram } from "./telegram.ts";
import { acquisitionChannel } from "./acquisition-source.ts";

export type TrackEvent =
  | "open" | "start" | "resume" | "turn" | "end" | "share" | "invite"
  | "daily" | "intro" | "first" | "help" | "subscribe" | "desk";
type Props = Record<string, string | number | boolean>;

const queue: { e: TrackEvent; p?: Props }[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let hooked = false;

function flush() {
  if (timer) { clearTimeout(timer); timer = null; }
  if (!queue.length) return;
  const pid = webUid();
  if (!pid) { queue.length = 0; return; }
  const body = JSON.stringify({ pid, events: queue.splice(0, 20) });
  try {
    // sendBeacon переживает закрытие мини-приложения; fetch — запасной путь.
    if (!navigator.sendBeacon?.("/api/track", new Blob([body], { type: "text/plain" })))
      fetch("/api/track", { method: "POST", body, keepalive: true }).catch(() => {});
  } catch { /* аналитика никогда не мешает игре */ }
  if (queue.length) flush();
}

// Тестовое устройство (автор игры проверяет функции) в статистику не попадает.
const TESTER_KEY = "sovereign.tester";
export const isTester = () => { try { return localStorage.getItem(TESTER_KEY) === "1"; } catch { return false; } };
export function subscribeTester(callback: () => void): () => void {
  window.addEventListener('storage', callback);
  window.addEventListener('sovereign:tester', callback);
  return () => { window.removeEventListener('storage', callback); window.removeEventListener('sovereign:tester', callback); };
}
export function toggleTester(): boolean {
  const on = !isTester();
  try { if (on) localStorage.setItem(TESTER_KEY, "1"); else localStorage.removeItem(TESTER_KEY); } catch { /* недоступно */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('sovereign:tester'));
  return on;
}

export function track(e: TrackEvent, p?: Props) {
  // В демо-сборке сервера нет — события не отправляются; тестовое устройство не считается.
  if (typeof window === "undefined" || process.env.NEXT_PUBLIC_ANALYTICS === "off" || isTester()) return;
  const platform = inTelegram() ? "tg" : "web";
  const channel = acquisitionChannel();
  const context = ["start", "resume", "turn", "end", "share", "intro", "first", "desk", "invite"].includes(e) ? runProps() : {};
  const seconds = e === "first" && typeof context.at === "number"
    ? Math.max(0, Math.round((Date.now() - context.at) / 1000)) : undefined;
  const inviter = e === "open" ? referralId() : "";
  const referred = /^[a-z0-9]{8,24}$/.test(inviter) && inviter !== webUid();
  queue.push({ e, p: { ...p, ...context, lm: 1,
    ...(seconds === undefined ? {} : { seconds }), ...(e === "open" ? { referred } : {}),
    v: APP_VERSION, platform, src: channel ? `src_${channel}` : platform,
  } });
  if (!hooked) {
    hooked = true;
    addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
  }
  if (!timer) timer = setTimeout(flush, 3000);
}

// Отзыв с экрана итогов: оценка 1–5 и пара слов. В демо-сборке сервера нет — форма скрыта.
export const feedbackEnabled = () => typeof window !== "undefined" && process.env.NEXT_PUBLIC_ANALYTICS !== "off";
export async function sendFeedback(rating: number, text: string, ctx: Record<string, string | number>): Promise<boolean> {
  const pid = webUid();
  if (!pid) return false;
  try {
    const r = await fetch("/api/feedback", { method: "POST", body: JSON.stringify({ pid, rating, text, ctx }) });
    return r.ok;
  } catch { return false; }
}

// Подписка на утреннее «Дело дня» и вопрос об отзыве наутро — только внутри Telegram (нужна подпись initData).
export async function syncSubscription(initData: string, subscribe: boolean, run: Record<string, string | number>): Promise<{ subscribed: boolean } | null> {
  if (!initData || process.env.NEXT_PUBLIC_ANALYTICS === "off") return null;
  try {
    const r = await fetch("/api/subscribe", { method: "POST", body: JSON.stringify({ initData, subscribe, run }) });
    return r.ok ? await r.json() as { subscribed: boolean } : null;
  } catch { return null; }
}
