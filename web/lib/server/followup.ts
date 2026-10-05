// Возвращаемость: подписка на «Дело дня» прямо из игры и вопрос об отзыве на следующий день.
// Бот пишет только тем, кто разрешил ему писать (кнопка в игре или «Старт» в чате).
import { SUBS } from "./bot.ts";
import { kv } from "./kv.ts";
import { botApi, verifyInitData } from "./telegram.ts";

export const FOLLOWUP = "tg:followup"; // поле — id игрока, значение — {at, ctx} последней доигранной партии
export const FOLLOWUP_AFTER_H = 12;     // спрашиваем не раньше чем через 12 часов после финала

export interface RunCtx { финал?: string; ход?: number; страна?: string }

export async function rememberRun(userId: number, ctx: RunCtx, now = Date.now()) {
  await kv.hset(FOLLOWUP, String(userId), JSON.stringify({ at: now, ctx }));
}

export function followupText(ctx: RunCtx): string {
  const what = [ctx.страна, ctx.финал && `«${ctx.финал}»`, ctx.ход && `${ctx.ход}-й ход`].filter(Boolean).join(", ");
  return `${what ? `Вчерашняя партия: ${what}.\n\n` : ""}<b>Как вам игра?</b> Одно нажатие — и, если захотите, пара слов о том, что было скучно или нечестно. Я читаю каждый ответ.`;
}
export const followupKeyboard = () => ({
  inline_keyboard: [
    [1, 2, 3, 4, 5].map(n => ({ text: String(n), callback_data: `fbq:${n}` })),
    [{ text: "Не сейчас", callback_data: "fbno" }],
  ],
});

// Утром, после рассылки дела дня: тем, кто доиграл больше 12 часов назад, — один вопрос, один раз.
export async function sendFollowups(now = Date.now()): Promise<number> {
  const all = await kv.hgetall(FOLLOWUP);
  let sent = 0;
  for (const [user, raw] of Object.entries(all)) {
    let rec: { at: number; ctx: RunCtx };
    try { rec = JSON.parse(raw); } catch { await kv.hdel(FOLLOWUP, user); continue; }
    if (now - rec.at < FOLLOWUP_AFTER_H * 3600_000) continue;
    await kv.hdel(FOLLOWUP, user);
    const res = await botApi("sendMessage", { chat_id: Number(user), text: followupText(rec.ctx ?? {}), parse_mode: "HTML", reply_markup: followupKeyboard() }).catch(() => null) as { ok?: boolean } | null;
    if (res?.ok) sent++;
    await new Promise(r => setTimeout(r, 40));
  }
  return sent;
}

export const isSubscribed = (userId: number) => kv.sismember(SUBS, String(userId));
export const subscribe = (userId: number) => kv.sadd(SUBS, String(userId));

// Запрос мини-приложения: {initData, subscribe?, run?}. Возвращает HTTP-статус и ответ.
export async function subscribeFromApp(body: unknown, botToken: string): Promise<{ status: number; json?: { subscribed: boolean } }> {
  const b = (body && typeof body === "object" ? body : {}) as { initData?: unknown; subscribe?: unknown; run?: unknown };
  const user = typeof b.initData === "string" ? verifyInitData(b.initData, botToken) : null;
  if (!user) return { status: 401 };
  if (b.subscribe === true) await subscribe(user.id);
  const subscribed = await isSubscribed(user.id);
  // Спросить об игре можно только того, кому боту разрешено писать.
  if (b.run && typeof b.run === "object" && (subscribed || user.allows_write_to_pm)) {
    const r = b.run as Record<string, unknown>;
    await rememberRun(user.id, {
      ...(typeof r.финал === "string" ? { финал: r.финал.slice(0, 40) } : {}),
      ...(typeof r.ход === "number" ? { ход: Math.round(r.ход) } : {}),
      ...(typeof r.страна === "string" ? { страна: r.страна.slice(0, 40) } : {}),
    });
  }
  return { status: 200, json: { subscribed } };
}
