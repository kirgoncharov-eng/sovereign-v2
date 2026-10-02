// Отзыв из игры: оценка 1–5 и необязательный текст. Тело — {pid, rating, text, ctx}.
import { PID } from "@/lib/server/analytics.ts";
import { saveFeedback } from "@/lib/server/feedback.ts";
import { checkRate, clientKey } from "@/lib/server/rateLimit.ts";

const CTX_KEYS = ["финал", "ход", "страна", "сложность", "обещаний"];

export async function POST(req: Request) {
  if (!checkRate(`fb:${clientKey(req)}`).ok) return new Response(null, { status: 429 });
  let body: { pid?: unknown; rating?: unknown; text?: unknown; ctx?: unknown };
  try { body = JSON.parse(await req.text()); } catch { return new Response(null, { status: 400 }); }
  const rating = Number(body.rating);
  const text = typeof body.text === "string" ? body.text.trim().slice(0, 1000) : "";
  if (typeof body.pid !== "string" || !PID.test(body.pid) || !(rating >= 1 && rating <= 5)) return new Response(null, { status: 400 });
  const raw = body.ctx && typeof body.ctx === "object" ? body.ctx as Record<string, unknown> : {};
  const ctx: Record<string, string | number> = {};
  for (const k of CTX_KEYS) {
    const v = raw[k];
    if (typeof v === "number" || typeof v === "string") ctx[k] = typeof v === "string" ? v.slice(0, 40) : v;
  }
  try { await saveFeedback({ at: new Date().toISOString(), src: "game", rating: Math.round(rating), text, ctx }); }
  catch (e) { console.error("feedback", e); return new Response(null, { status: 500 }); }
  return new Response(null, { status: 204 });
}
