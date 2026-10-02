// Анонимная аналитика: какие шаги проходит игрок — запуск, партия, ходы, финал, «поделиться».
// Никаких имён и Telegram-идентификаторов: только случайный id браузера, тот же, что у «Дела дня».
// События копятся и уходят пачкой; без сервера (демо, офлайн) отправка тихо ничего не делает.
import { webUid } from "./daily.ts";

export type TrackEvent = "open" | "start" | "resume" | "turn" | "end" | "share" | "invite" | "daily";
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

export function track(e: TrackEvent, p?: Props) {
  // В демо-сборке сервера нет — события не отправляются.
  if (typeof window === "undefined" || process.env.NEXT_PUBLIC_ANALYTICS === "off") return;
  queue.push(p ? { e, p } : { e });
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
