// Подписка из мини-приложения. Тело — {initData, subscribe?, run?}.
// subscribe: true — добавить в утреннюю рассылку «Дела дня» (после разрешения писать в Telegram);
// run — итог доигранной партии: наутро бот спросит, как она прошла (если ему можно писать).
import { env } from "@/lib/server/env.ts";
import { subscribeFromApp } from "@/lib/server/followup.ts";
import { clientKey, limit } from "@/lib/server/rateLimit.ts";

export async function POST(req: Request) {
  if (!(await limit(`sub:${clientKey(req)}`)).ok) return new Response(null, { status: 429 });
  let body: unknown;
  try { body = JSON.parse(await req.text()); } catch { return new Response(null, { status: 400 }); }
  try {
    const r = await subscribeFromApp(body, env("TELEGRAM_BOT_TOKEN"));
    return r.json ? Response.json(r.json, { status: r.status }) : new Response(null, { status: r.status });
  } catch (e) {
    console.error("subscribe", e);
    return new Response(null, { status: 500 });
  }
}
