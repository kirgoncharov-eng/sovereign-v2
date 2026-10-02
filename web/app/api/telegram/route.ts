// Вебхук Telegram-бота: проверяет секрет и передаёт обновление в lib/server/bot.ts.
// Настройка: setWebhook с secret_token = TELEGRAM_WEBHOOK_SECRET (см. README).
import { handleUpdate, type Update } from "@/lib/server/bot.ts";
import { env } from "@/lib/server/env.ts";
import { kvConfigured } from "@/lib/server/kv.ts";
import { appUrl } from "@/lib/server/telegram.ts";

// Проверка настройки: откройте адрес вебхука в браузере. Показывает только, заданы ли переменные, — без значений.
export async function GET() {
  return Response.json({
    webhookSecret: env("TELEGRAM_WEBHOOK_SECRET") ? "задан" : "НЕТ",
    botToken: env("TELEGRAM_BOT_TOKEN") ? "задан" : "НЕТ",
    appUrl: appUrl() || "НЕТ",
    storage: kvConfigured() ? "Redis" : "память (до подключения Upstash)",
  });
}

export async function POST(req: Request) {
  const secret = env("TELEGRAM_WEBHOOK_SECRET");
  const got = (req.headers.get("x-telegram-bot-api-secret-token") ?? "").trim();
  if (!secret || got !== secret) {
    console.warn("telegram webhook: secret", secret ? "mismatch" : "not set");
    return new Response("forbidden", { status: 403 });
  }
  let update: Update;
  try { update = await req.json(); } catch { return new Response("ok"); }
  try { await handleUpdate(update); } catch (e) { console.error("telegram", e); }
  return new Response("ok");
}
