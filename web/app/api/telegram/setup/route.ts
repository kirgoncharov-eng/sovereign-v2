// Оформление профиля бота одним запросом: /api/telegram/setup?key=<STATS_SECRET>.
// Ставит описание, короткое описание, команды и кнопку «Играть»; повторять можно сколько угодно.
import { setupProfile } from "@/lib/server/bot.ts";
import { env } from "@/lib/server/env.ts";

export async function GET(req: Request) {
  const key = env("STATS_SECRET");
  if (!key || new URL(req.url).searchParams.get("key") !== key) return new Response("forbidden", { status: 403 });
  if (!env("TELEGRAM_BOT_TOKEN")) return new Response("Не задан TELEGRAM_BOT_TOKEN", { status: 503 });
  return Response.json(await setupProfile());
}
