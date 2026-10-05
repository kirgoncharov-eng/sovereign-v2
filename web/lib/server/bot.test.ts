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

test("бот: опрос из трёх вопросов сохраняет отзыв и пересылает его автору, /admin и /stats — только по ключу", async () => {
  const { FB_QUESTIONS, FB_THANKS } = await import("./bot.ts");
  const { readFeedback, ADMIN } = await import("./feedback.ts");
  const { kv } = await import("./kv.ts");
  process.env.STATS_SECRET = "s3";
  calls.length = 0;
  await handleUpdate({ message: { chat: { id: 99 }, text: "/admin wrong" } });
  assert.equal(await kv.hget(ADMIN, "chat"), null, "чужой ключ не подключает");
  await handleUpdate({ message: { chat: { id: 99 }, text: "/admin s3" } });
  assert.equal(await kv.hget(ADMIN, "chat"), "99");
  await handleUpdate({ message: { chat: { id: 5 }, text: "/stats" } });
  assert.doesNotMatch(String(last().body.text), /сводка/, "сводка — только автору");
  await handleUpdate({ message: { chat: { id: 99 }, text: "/stats" } });
  assert.match(String(last().body.text), /Суверен · сводка/);

  await handleUpdate({ message: { chat: { id: 7 }, text: "/start feedback" } });
  assert.equal(last().body.text, FB_QUESTIONS[0]);
  await handleUpdate({ message: { chat: { id: 7 }, text: "Переворот на 12-м ходу, скучно с 8-го", from: { username: "tester" } } });
  assert.equal(last().body.text, FB_QUESTIONS[1]);
  await handleUpdate({ callback_query: { id: "q2", data: "fbskip", message: { chat: { id: 7 } } } });
  assert.equal(last().body.text, FB_QUESTIONS[2]);
  await handleUpdate({ callback_query: { id: "q3", data: "fbr:4", message: { chat: { id: 7 } }, from: { username: "tester" } } });
  assert.equal(last().body.text, FB_THANKS);
  const toAdmin = calls.find(c => c.body.chat_id === 99 && /Отзыв в боте/.test(String(c.body.text)));
  assert.ok(toAdmin, "отзыв переслан автору");
  assert.match(String(toAdmin.body.text), /★★★★☆/);
  const [fb] = await readFeedback(1);
  assert.equal(fb.rating, 4);
  assert.equal(fb.who, "@tester");
  assert.match(fb.text, /Переворот на 12-м ходу/);

  // любая команда прерывает опрос, после него обычный текст — снова просто ответ бота
  await handleUpdate({ message: { chat: { id: 7 }, text: "/feedback" } });
  await handleUpdate({ message: { chat: { id: 7 }, text: "/help" } });
  await handleUpdate({ message: { chat: { id: 7 }, text: "привет" } });
  assert.match(String(last().body.text), /не веду переписку/);
});

test("возвращаемость: подписка из игры по подписи Telegram, наутро — вопрос об игре и короткий опрос", async () => {
  const { createHmac } = await import("node:crypto");
  const { FOLLOWUP, rememberRun, sendFollowups, subscribeFromApp } = await import("./followup.ts");
  const { FB_QUESTIONS, FB_THANKS, SUBS } = await import("./bot.ts");
  const { readFeedback } = await import("./feedback.ts");
  const { kv } = await import("./kv.ts");
  const sign = (fields: Record<string, string>) => {
    const check = Object.entries(fields).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("\n");
    const secret = createHmac("sha256", "WebAppData").update("123:test").digest();
    return new URLSearchParams({ ...fields, hash: createHmac("sha256", secret).update(check).digest("hex") }).toString();
  };
  const initData = (id: number, allows = false) => sign({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, allows_write_to_pm: allows }) });
  const post = async (body: unknown) => { const r = await subscribeFromApp(body, "123:test"); return { status: r.status, json: async () => r.json }; };
  const run = { финал: "Переизбран на второй срок", ход: 20, страна: "Грузия" };

  assert.equal((await post({ initData: "user=%7B%22id%22%3A1%7D&hash=bad", subscribe: true })).status, 401, "без подписи — нельзя");
  // не подписан и писать не разрешал: партию не запоминаем
  assert.deepEqual(await (await post({ initData: initData(501), run })).json(), { subscribed: false });
  assert.equal(await kv.hget(FOLLOWUP, "501"), null);
  // подписался из игры
  assert.deepEqual(await (await post({ initData: initData(501), subscribe: true, run })).json(), { subscribed: true });
  assert.ok(await kv.sismember(SUBS, "501"));
  assert.ok(await kv.hget(FOLLOWUP, "501"));
  // уже разрешал писать (нажимал «Старт»): партию запоминаем и без подписки
  await post({ initData: initData(502, true), run });
  assert.ok(await kv.hget(FOLLOWUP, "502"));

  // наутро: спрашиваем только тех, кто доиграл больше 12 часов назад, и только один раз
  const now = Date.now();
  await rememberRun(501, run, now - 13 * 3600_000);
  await rememberRun(502, run, now - 3600_000);
  calls.length = 0;
  assert.equal(await sendFollowups(now), 1);
  assert.equal(calls[0].body.chat_id, 501);
  assert.match(String(calls[0].body.text), /Вчерашняя партия: Грузия, «Переизбран на второй срок», 20-й ход/);
  assert.equal(await kv.hget(FOLLOWUP, "501"), null);
  assert.ok(await kv.hget(FOLLOWUP, "502"), "рано — подождёт следующего утра");

  // ответ: оценка кнопкой, потом два вопроса словами (второй можно пропустить)
  await handleUpdate({ callback_query: { id: "m1", data: "fbq:5", message: { chat: { id: 501 } }, from: { first_name: "Нино" } } });
  assert.equal(last().body.text, FB_QUESTIONS[0]);
  await handleUpdate({ message: { chat: { id: 501 }, text: "Затянуло, но выборы слишком быстрые", from: { first_name: "Нино" } } });
  assert.equal(last().body.text, FB_QUESTIONS[1]);
  await handleUpdate({ callback_query: { id: "m2", data: "fbskip", message: { chat: { id: 501 } }, from: { first_name: "Нино" } } });
  assert.equal(last().body.text, FB_THANKS);
  const [fb] = await readFeedback(1);
  assert.equal(fb.rating, 5);
  assert.match(fb.text, /выборы слишком быстрые/);
});
