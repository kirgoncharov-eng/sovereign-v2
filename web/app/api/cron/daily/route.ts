// Утренняя рассылка «Дела дня» подписчикам бота. Вызывает Vercel Cron (vercel.json)
// с заголовком Authorization: Bearer CRON_SECRET.
import { dailyText, SUBS } from "@/lib/server/bot.ts";
import { kv } from "@/lib/server/kv.ts";
import { botApi, playButton } from "@/lib/server/telegram.ts";
import { env } from "@/lib/server/env.ts";

export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = env("CRON_SECRET");
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("forbidden", { status: 403 });
  const subs = await kv.smembers(SUBS);
  const text = dailyText();
  let sent = 0, dropped = 0;
  for (const chat of subs) {
    try {
      const res = await botApi("sendMessage", { chat_id: Number(chat), text, reply_markup: playButton("Взяться за дело") }) as { ok?: boolean; error_code?: number };
      if (res.ok) sent++;
      else if (res.error_code === 403) { await kv.srem(SUBS, chat); dropped++; } // бот заблокирован
    } catch (e) {
      console.error("cron", e);
    }
    await new Promise(r => setTimeout(r, 40)); // не больше ~25 сообщений в секунду
  }
  return Response.json({ sent, dropped, total: subs.length });
}
