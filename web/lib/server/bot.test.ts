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
  process.env.TELEGRAM_WEBHOOK_SECRET = " s3cret_-X\n";
  await setupProfile();
  assert.deepEqual(calls.map(c => c.method), ["setWebhook", "setMyShortDescription", "setMyDescription", "setMyCommands", "setChatMenuButton"]);
  assert.equal(calls[0].body.url, "https://example.test/api/telegram");
  assert.equal(calls[0].body.secret_token, "s3cret_-X", "секрет вебхука тот же, что проверяет сервер");
});

test("бот: если Telegram не принял обложку или разметку, приветствие уходит простым текстом", async () => {
  const reject = new Set(["sendPhoto"]);
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: { body?: string }) => {
    const method = String(url).split("/").pop()!, body = JSON.parse(init?.body ?? "{}");
    calls.push({ method, body });
    const bad = reject.has(method) || (reject.has("html") && body.parse_mode);
    return new Response(JSON.stringify(bad ? { ok: false, description: "Bad Request" } : { ok: true }));
  }) as typeof fetch;
  try {
    calls.length = 0;
    await handleUpdate({ message: { chat: { id: 7 }, text: "/start" } });
    assert.deepEqual(calls.map(c => c.method), ["sendPhoto", "sendMessage"]);
    assert.equal(last().body.text, WELCOME);

    reject.add("html");
    calls.length = 0;
    await handleUpdate({ message: { chat: { id: 7 }, text: "/start" } });
    assert.deepEqual(calls.map(c => c.method), ["sendPhoto", "sendMessage", "sendMessage"]);
    assert.equal(last().body.parse_mode, undefined);
    assert.ok(!String(last().body.text).includes("<b>"), "без разметки");
    assert.ok(last().body.reply_markup, "кнопки остаются");
  } finally {
    globalThis.fetch = real;
  }
});
