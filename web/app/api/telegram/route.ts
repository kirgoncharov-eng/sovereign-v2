// Вебхук Telegram-бота: проверяет секрет и передаёт обновление в lib/server/bot.ts.
// Настройка: setWebhook с secret_token = TELEGRAM_WEBHOOK_SECRET (см. README).
import { DIAG, handleUpdate, type Update } from "@/lib/server/bot.ts";
import { env } from "@/lib/server/env.ts";
import { kv, kvConfigured } from "@/lib/server/kv.ts";
import { appUrl, botApi } from "@/lib/server/telegram.ts";

// Проверка настройки: откройте адрес вебхука в браузере. Показывает только, заданы ли переменные, — без значений.
// Плюс что Telegram знает о вебхуке и когда бот последний раз получал сообщение.
export async function GET() {
  type Hook = { result?: { url?: string; pending_update_count?: number; last_error_message?: string; last_error_date?: number } };
  const hook = env("TELEGRAM_BOT_TOKEN") ? (await botApi("getWebhookInfo", {}).catch(() => null) as Hook | null)?.result : null;
  const diag = await kv.hmget(DIAG, ["lastUpdate", "lastError"]).catch(() => [null, null]);
  return Response.json({
    webhookSecret: env("TELEGRAM_WEBHOOK_SECRET") ? "задан" : "НЕТ",
    botToken: env("TELEGRAM_BOT_TOKEN") ? "задан" : "НЕТ",
    appUrl: appUrl() || "НЕТ",
    storage: kvConfigured() ? "Redis" : "память (до подключения Upstash)",
    webhook: hook ? {
      url: hook.url || "НЕ ЗАДАН",
      waiting: hook.pending_update_count ?? 0,
      lastError: hook.last_error_message ? `${hook.last_error_message} (${new Date((hook.last_error_date ?? 0) * 1000).toISOString()})` : "нет",
    } : "нет токена",
    lastUpdateFromTelegram: diag.at(0) ?? "ещё не было",
    lastRejectedByTelegram: diag.at(1) ? JSON.parse(diag.at(1)!) : "нет",
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
