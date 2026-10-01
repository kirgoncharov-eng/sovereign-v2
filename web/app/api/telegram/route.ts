// Вебхук Telegram-бота: /start подписывает на «Дело дня» и даёт кнопку игры, /stop — отписка.
// Настройка: setWebhook с secret_token = TELEGRAM_WEBHOOK_SECRET (см. README).
import { dailyText, SUBS } from "@/lib/server/bot.ts";
import { kv } from "@/lib/server/kv.ts";
import { botApi, playButton } from "@/lib/server/telegram.ts";

export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || req.headers.get("x-telegram-bot-api-secret-token") !== secret) return new Response("forbidden", { status: 403 });
  let update: { message?: { chat?: { id?: number }; text?: string } };
  try { update = await req.json(); } catch { return new Response("ok"); }
  const chat = update.message?.chat?.id;
  const cmd = update.message?.text?.trim().split(/\s+/)[0] ?? "";
  if (!chat) return new Response("ok");
  try {
    if (cmd === "/start") {
      await kv.sadd(SUBS, String(chat));
      await botApi("sendMessage", {
        chat_id: chat,
        text: `«Суверен» — политический триллер: двадцать решений, одна страна.\n\nКаждое утро я пришлю новое дело дня. Отписаться — /stop.\n\n${dailyText()}`,
        reply_markup: playButton(),
      });
    } else if (cmd === "/stop") {
      await kv.srem(SUBS, String(chat));
      await botApi("sendMessage", { chat_id: chat, text: "Больше не присылаю дело дня. Вернуться — /start." });
    } else if (cmd === "/daily") {
      await botApi("sendMessage", { chat_id: chat, text: dailyText(), reply_markup: playButton("Взяться за дело") });
    }
  } catch (e) {
    console.error("telegram", e);
  }
  return new Response("ok");
}
