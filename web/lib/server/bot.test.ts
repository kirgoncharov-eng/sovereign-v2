import { test } from "node:test";
import assert from "node:assert/strict";
import { COMMANDS, DESCRIPTION, HELP, SHORT_DESCRIPTION, WELCOME, dailyText, handleUpdate, setupProfile } from "./bot.ts";

// Вместо Telegram — запись вызовов.
const calls: { method: string; body: Record<string, unknown> }[] = [];
globalThis.fetch = (async (url: string, init?: { body?: string }) => {
  calls.push({ method: String(url).split("/").pop()!, body: JSON.parse(init?.body ?? "{}") });
  return new Response(JSON.stringify({ ok: true }));
}) as typeof fetch;
process.env.TELEGRAM_BOT_TOKEN = "123:test";
process.env.APP_URL = "https://example.test";

const last = () => calls.at(-1)!;

test("бот: приветствие с обложкой и кнопками, команды, кнопки меню, ответ на любой текст", async () => {
  await handleUpdate({ message: { chat: { id: 7 }, text: "/start" } });
  assert.equal(last().method, "sendPhoto");
  assert.equal(last().body.photo, "https://example.test/telegram-cover.png");
  const kb = (last().body.reply_markup as { inline_keyboard: { text: string; web_app?: unknown; callback_data?: string }[][] }).inline_keyboard;
  assert.ok(kb.flat().some(b => b.web_app), "кнопка игры");
  assert.deepEqual(kb.flat().filter(b => b.callback_data).map(b => b.callback_data), ["daily", "help"]);

  await handleUpdate({ callback_query: { id: "q1", data: "help", message: { chat: { id: 7 } } } });
  assert.equal(calls.at(-2)!.method, "answerCallbackQuery");
  assert.equal(last().body.text, HELP);

  await handleUpdate({ message: { chat: { id: 7 }, text: "/daily@sovereign_bot" } });
  assert.match(String(last().body.text), /Дело дня/);
  await handleUpdate({ message: { chat: { id: 7 }, text: "привет" } });
  assert.equal(last().method, "sendMessage", "на любой текст бот отвечает");
  await handleUpdate({ message: { chat: { id: 7 }, text: "/stop" } });
  assert.equal(last().body.reply_markup, undefined);

  // Лимиты Telegram: описание 512, короткое 120, подпись к фото 1024, сообщение 4096.
  assert.ok(DESCRIPTION.length <= 512 && SHORT_DESCRIPTION.length <= 120 && WELCOME.length <= 1024 && HELP.length <= 4096);
  assert.ok(COMMANDS.every(c => /^[a-z0-9_]{1,32}$/.test(c.command) && c.description.length <= 256));
  assert.ok(!/[<>&](?!\/?b>)/.test(dailyText().replace(/<\/?b>/g, "")), "в HTML нет неэкранированных символов");

  calls.length = 0;
  await setupProfile();
  assert.deepEqual(calls.map(c => c.method), ["setMyShortDescription", "setMyDescription", "setMyCommands", "setChatMenuButton"]);
});
