// Страница с цифрами: /api/stats?key=<STATS_SECRET>&days=30. Без ключа — 403; &format=json — сырые счётчики.
import { readStats, renderStats } from "@/lib/server/analytics.ts";
import { env } from "@/lib/server/env.ts";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = env("STATS_SECRET");
  if (!secret) return new Response("Задайте переменную STATS_SECRET в настройках хостинга.", { status: 503 });
  if (url.searchParams.get("key") !== secret) return new Response("forbidden", { status: 403 });
  const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days")) || 30));
  const stats = await readStats(days);
  if (url.searchParams.get("format") === "json") return Response.json(stats);
  return new Response(renderStats(stats), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
