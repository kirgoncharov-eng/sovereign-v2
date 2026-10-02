// Страница с цифрами и отзывами: /api/stats?key=<STATS_SECRET>&days=30. Без ключа — 403; &format=json — сырые счётчики и отзывы.
import { readStats, renderStats } from "@/lib/server/analytics.ts";
import { env } from "@/lib/server/env.ts";
import { readFeedback } from "@/lib/server/feedback.ts";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = env("STATS_SECRET");
  if (!secret) return new Response("Задайте переменную STATS_SECRET в настройках хостинга.", { status: 503 });
  if (url.searchParams.get("key") !== secret) return new Response("forbidden", { status: 403 });
  const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days")) || 30));
  const [stats, feedback] = await Promise.all([readStats(days), readFeedback(100)]);
  if (url.searchParams.get("format") === "json") return Response.json({ ...stats, feedback });
  return new Response(renderStats(stats, feedback), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
