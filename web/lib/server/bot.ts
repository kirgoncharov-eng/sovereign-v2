// Бот «Суверена»: тексты, профиль и ответы на сообщения.
// Логика отделена от вебхука, чтобы её можно было проверить тестом без Telegram.
import { dailyCase } from "../game/daily.ts";
import { COUNTRIES, DIFFICULTIES, IDEOLOGIES } from "../game/data.ts";
import { appUrl, botApi, playButton } from "./telegram.ts";
import { env } from "./env.ts";
import { kv } from "./kv.ts";
import { ADMIN, saveFeedback } from "./feedback.ts";
import { digestText, readStats } from "./analytics.ts";

export const SUBS = "tg:subs";

// ── Профиль бота (ставится один раз через /api/telegram/setup) ─────────────
// Короткое описание: в профиле и в карточке при пересылке ссылки на бота (до 120 знаков).
export const SHORT_DESCRIPTION = "Политический триллер: двадцать решений, одна страна, ни одного права на ошибку.";
// Описание: его видят в пустом чате до нажатия «Старт» (до 512 знаков).
export const DESCRIPTION = `«Суверен» — политический триллер в кабинете президента.

Вы только что выиграли выборы. Впереди двадцать решений: заговоры силовиков, кризисы, пресса, союзы и предательства. У каждого решения есть цена, и приходит она позже.

• Шесть постсоветских стран, вымышленные люди
• Партия сохраняется сама — можно прерваться в любой момент
• Каждое утро — новое «Дело дня», одно на всех

Нажмите «Старт», чтобы войти в кабинет.`;
export const COMMANDS = [
  { command: "start", description: "Войти в кабинет" },
  { command: "daily", description: "Дело дня" },
  { command: "help", description: "Как играть" },
  { command: "feedback", description: "Рассказать, что понравилось и что нет" },
  { command: "stop", description: "Не присылать дело дня по утрам" },
];

// ── Тексты сообщений (HTML-разметка Telegram) ───────────────────────────────
export function dailyText(now = new Date()) {
  const d = dailyCase(now);
  const [, mm, dd] = d.date.split("-");
  const ideo = IDEOLOGIES.find(i => i.id === d.ideo)?.label.toLowerCase();
  return `<b>Дело дня · ${dd}.${mm}</b>\n${COUNTRIES[d.country].flag} ${d.country} · ${DIFFICULTIES[d.diff].label.toLowerCase()} · ${ideo}\n\nОдна партия на всех: те же страна, условия и события. Продержитесь дольше друзей?`;
}

export const WELCOME = `<b>Кабинет президента ждёт.</b>

Вы только что выиграли выборы. Двадцать решений отделяют вас от второго срока — или от вертолёта на крыше резиденции.

Каждое утро в 8:00 по Москве я присылаю «Дело дня»: одни условия для всех и таблица результатов с друзьями. Не присылать — /stop.`;

export const HELP = `<b>Как играть</b>

1. Выберите страну, сложность и политический курс — или нажмите «Быстрая партия». Перед первым ходом отметьте три предвыборных обещания: исполненные укрепят власть, нарушенные ударят больнее.
2. Каждый ход на стол ложится дело. Под каждым вариантом видно, куда решение потянет страну: что вырастет, что упадёт, кто обрадуется, а кто затаит обиду. Точную цену и отложенные последствия знают только советники — совет можно собрать несколько раз за правление.
3. Подпишите резолюцию. Исполняют её люди — иногда не так, как вы хотели.
4. Берегите шесть опор власти. Ниже 20 — кризис, 4 и ниже — падение власти.
5. На 10-м и 20-м ходу — выборы.

Партия сохраняется сама: закройте игру и вернитесь, когда удобно.

Нашли скуку, нечестное решение или ошибку — /feedback, три коротких вопроса. Я читаю каждый ответ.`;

export const FALLBACK = "Я не веду переписку — только дела. Кабинет открывается кнопкой ниже, «Дело дня» — по команде /daily, а рассказать, что понравилось и что нет, — /feedback.";

// ── Отзыв: три вопроса подряд. Состояние — в хранилище, по чату. ───────────────
export const FB_STATE = "tg:fb";
export const FB_QUESTIONS = [
  "<b>1 из 3.</b> Чем закончилась ваша партия — и на каком ходу стало скучно или непонятно? Пишите как есть, можно коротко.",
  "<b>2 из 3.</b> Какое решение или событие показалось нечестным, бессмысленным или странным?",
  "<b>3 из 3.</b> Насколько хочется сыграть ещё? 1 — не хочется совсем, 5 — уже открываю.",
];
export const FB_THANKS = "Спасибо. Отзыв ушёл автору игры — он читает каждое слово, и следующие версии строятся на таких ответах.";
const rateKeyboard = () => ({ inline_keyboard: [[1, 2, 3, 4, 5].map(n => ({ text: String(n), callback_data: `fbr:${n}` }))] });
const skipKeyboard = () => ({ inline_keyboard: [[{ text: "Пропустить вопрос", callback_data: "fbskip" }]] });

// rating — оценка уже дана (утренний вопрос «Как вам игра?»): тогда остаются только два вопроса словами.
interface FbState { step: number; a: string[]; rating?: number }
async function fbState(chat: number): Promise<FbState | null> {
  const raw = await kv.hget(FB_STATE, String(chat)).catch(() => null);
  try { return raw ? JSON.parse(raw) as FbState : null; } catch { return null; }
}
async function askFeedback(chat: number, st: FbState) {
  await kv.hset(FB_STATE, String(chat), JSON.stringify(st));
  await send(chat, FB_QUESTIONS[st.step], st.step === 2 ? rateKeyboard() : skipKeyboard());
}
async function answerFeedback(chat: number, st: FbState, answer: string, who: string) {
  const last = st.rating ? 1 : 2;
  if (st.step < last) return askFeedback(chat, { ...st, step: st.step + 1, a: [...st.a, answer] });
  const a = st.rating ? [...st.a, answer] : st.a;
  const rating = st.rating ?? (Number(answer.match(/[1-5]/)?.[0]) || undefined);
  await kv.hdel(FB_STATE, String(chat));
  const [ending, unfair] = a;
  const text = [ending && `Как закончилась, где скучно: ${ending}`, unfair && `Нечестно или странно: ${unfair}`].filter(Boolean).join("\n");
  await saveFeedback({ at: new Date().toISOString(), src: "bot", rating, text, who });
  await send(chat, FB_THANKS, playButton("Сыграть ещё"));
}

// Сводка для автора: вчерашний день, неделя и ссылка на страницу с цифрами.
export async function adminDigest(): Promise<string> {
  const key = env("STATS_SECRET"), url = appUrl().replace(/\/$/, "");
  return digestText(await readStats(9), key && url ? `${url}/api/stats?key=${key}` : "");
}
export const STOPPED = "Больше не присылаю «Дело дня» по утрам. Вернуть рассылку — /start.";

const menu = () => ({
  inline_keyboard: [
    ...playButton("Войти в кабинет").inline_keyboard,
    [{ text: "Дело дня", callback_data: "daily" }, { text: "Как играть", callback_data: "help" }],
  ],
});

// ── Ответ на обновление от Telegram ─────────────────────────────────────────
export interface Update {
  message?: { chat?: { id?: number }; text?: string; from?: { username?: string; first_name?: string } };
  callback_query?: { id?: string; data?: string; message?: { chat?: { id?: number } }; from?: { username?: string; first_name?: string } };
}
const whoOf = (from?: { username?: string; first_name?: string }) => (from?.username ? `@${from.username}` : from?.first_name ?? "");

// Диагностика: когда последний раз писал Telegram и что он последним отклонил. Видно на GET /api/telegram.
export const DIAG = "tg:diag";
interface ApiResult { ok?: boolean; description?: string }
async function call(method: string, body: Record<string, unknown>): Promise<boolean> {
  const res = await botApi(method, body) as ApiResult;
  if (res?.ok) return true;
  console.error("telegram api", method, res?.description);
  await kv.hset(DIAG, "lastError", JSON.stringify({ at: new Date().toISOString(), method, error: res?.description ?? "нет ответа" })).catch(() => {});
  return false;
}

// null — сообщение без кнопок. Если Telegram не принял разметку, отправляем тот же текст без неё.
async function send(chat: number, text: string, reply_markup: unknown = playButton()) {
  const markup = reply_markup ? { reply_markup } : {};
  if (await call("sendMessage", { chat_id: chat, text, parse_mode: "HTML", link_preview_options: { is_disabled: true }, ...markup })) return;
  await call("sendMessage", { chat_id: chat, text: text.replace(/<\/?b>/g, ""), ...markup });
}

export async function handleUpdate(update: Update) {
  await kv.hset(DIAG, "lastUpdate", new Date().toISOString()).catch(() => {});
  const cb = update.callback_query;
  if (cb?.id) {
    await call("answerCallbackQuery", { callback_query_id: cb.id });
    const chat = cb.message?.chat?.id;
    if (!chat) return;
    if (cb.data === "daily") await send(chat, dailyText(), playButton("Взяться за дело"));
    else if (cb.data === "help") await send(chat, HELP, playButton("Войти в кабинет"));
    else if (cb.data === "feedback") await askFeedback(chat, { step: 0, a: [] });
    else if (cb.data?.startsWith("fbq:")) {
      // Ответ на утренний вопрос: оценка есть, дальше — два вопроса словами (их можно пропустить).
      const rating = Number(cb.data.slice(4));
      if (rating >= 1 && rating <= 5) await askFeedback(chat, { step: 0, a: [], rating });
    }
    else if (cb.data === "fbno") await send(chat, "Хорошо, не отвлекаю. Если захочется рассказать — /feedback.", playButton("Сыграть ещё"));
    else if (cb.data === "fbskip" || cb.data?.startsWith("fbr:")) {
      const st = await fbState(chat);
      if (st) await answerFeedback(chat, st, cb.data === "fbskip" ? "" : cb.data.slice(4), whoOf(cb.from));
    }
    return;
  }
  const chat = update.message?.chat?.id;
  const text = update.message?.text?.trim() ?? "";
  if (!chat) return;
  const cmd = text.startsWith("/") ? text.split(/[\s@]/)[0] : "";
  const arg = cmd ? text.slice(text.indexOf(cmd) + cmd.length).replace(/^@\S+/, "").trim() : "";
  // Идёт опрос: обычный текст — это ответ; любая команда опрос прерывает.
  if (!cmd) {
    const st = await fbState(chat);
    if (st) return answerFeedback(chat, st, text.slice(0, 1000), whoOf(update.message?.from));
  } else await kv.hdel(FB_STATE, String(chat)).catch(() => {});
  if (cmd === "/start" && arg === "feedback") {
    await askFeedback(chat, { step: 0, a: [] });
  } else if (cmd === "/feedback") {
    await askFeedback(chat, { step: 0, a: [] });
  } else if (cmd === "/admin") {
    // Автор игры подключает себе отзывы и сводку: /admin <STATS_SECRET>.
    const key = env("STATS_SECRET");
    if (key && arg === key) {
      await kv.hset(ADMIN, "chat", String(chat));
      await send(chat, "Готово: сюда будут приходить отзывы игроков и утренняя сводка. Сводка по запросу — /stats.", null);
    } else await send(chat, FALLBACK);
  } else if (cmd === "/stats") {
    if (String(chat) === await kv.hget(ADMIN, "chat")) await send(chat, await adminDigest(), null);
    else await send(chat, FALLBACK);
  } else if (cmd === "/start") {
    // Подписка не должна мешать ответу: без хранилища бот всё равно здоровается.
    await kv.sadd(SUBS, String(chat)).catch(e => console.error("subscribe", e));
    const cover = appUrl() ? `${appUrl().replace(/\/$/, "")}/telegram-cover.png` : "";
    // Обложку Telegram скачивает сам; не смог — приветствие уходит текстом, бот не молчит.
    const sent = cover && await call("sendPhoto", { chat_id: chat, photo: cover, caption: WELCOME, parse_mode: "HTML", reply_markup: menu() });
    if (!sent) await send(chat, WELCOME, menu());
  } else if (cmd === "/stop") {
    await kv.srem(SUBS, String(chat));
    await send(chat, STOPPED, null);
  } else if (cmd === "/daily") {
    await send(chat, dailyText(), playButton("Взяться за дело"));
  } else if (cmd === "/help") {
    await send(chat, HELP, playButton("Войти в кабинет"));
  } else {
    await send(chat, FALLBACK);
  }
}

// Профиль: вебхук, описание, команды и кнопка «Играть» рядом с полем ввода.
// Вебхук ставится с тем же секретом, что лежит на сервере, — вручную рассинхронизировать их больше нельзя.
// Старые неотвеченные сообщения сбрасываются, чтобы бот не засыпал чат приветствиями.
export async function setupProfile() {
  const url = appUrl().replace(/\/$/, ""), secret = env("TELEGRAM_WEBHOOK_SECRET");
  const calls: [string, Record<string, unknown>][] = [
    ...(url && secret ? [["setWebhook", { url: `${url}/api/telegram`, secret_token: secret, allowed_updates: ["message", "callback_query"], drop_pending_updates: true }] as [string, Record<string, unknown>]] : []),
    ["setMyShortDescription", { short_description: SHORT_DESCRIPTION }],
    ["setMyDescription", { description: DESCRIPTION }],
    ["setMyCommands", { commands: COMMANDS }],
    ...(url ? [["setChatMenuButton", { menu_button: { type: "web_app", text: "Играть", web_app: { url } } }] as [string, Record<string, unknown>]] : []),
  ];
  const results: Record<string, unknown> = {};
  for (const [method, body] of calls) results[method] = await botApi(method, body);
  return results;
}
