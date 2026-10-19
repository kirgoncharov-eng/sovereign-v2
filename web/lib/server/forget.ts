// /forget удаляет данные по Telegram ID; не обещает удалить неидентифицируемые старые отзывы/копии.
// Подписка на утреннее дело, отложенный вопрос об отзыве, незаконченный опрос, друзья в таблице,
// место в таблицах «Дела дня» за последние дни и отзывы, оставленные через бота.
// PID-аналитика здесь не удаляется: проверенная привязка браузера к владельцу пока не реализована (#114).
import { kv } from "./kv.ts";
import { FB_LIST } from "./feedback.ts";
import { FOLLOWUP, OPT_OUT } from "./followup.ts";
import { deleteFeedbackCopies } from './feedback-copies.ts';

// Поздний результат даты D принимается до конца D+1; скользящий TTL продлевает таблицу до D+4.
const OLDEST_DAILY_OFFSET = 4;

export async function forgetUser(chat: number, subsKey: string, fbStateKey: string, now = Date.now()) {
  if (!Number.isSafeInteger(chat) || chat <= 0) throw new Error('A verified private Telegram user ID is required');
  const id = String(chat), uid = `tg${chat}`;
  // Минимальный запрет рассылки нужен, чтобы старое подписанное initData не восстановило followup.
  await Promise.all([kv.srem(subsKey, id), kv.sadd(OPT_OUT, id), kv.hdel(FOLLOWUP, id), kv.hdel(fbStateKey, id)]);
  const friends = await kv.smembers(`friends:${uid}`);
  await Promise.all([...friends.map(f => kv.srem(`friends:${f}`, uid)), kv.del(`friends:${uid}`)]);
  for (let offset = -1; offset <= OLDEST_DAILY_OFFSET; offset++) {
    const date = new Date(now - offset * 864e5).toISOString().slice(0, 10);
    const keys = new Set([`daily:${date}`, ...await kv.smembers(`daily:${date}:editions`)]);
    await Promise.all([...keys].flatMap(key => [kv.zrem(key, uid), kv.hdel(`${key}:info`, uid)]));
  }
  const all = await kv.lrange(FB_LIST, 1000);
  let removed = 0;
  for (const raw of all) {
    let feedback;
    try { feedback = JSON.parse(raw); } catch { continue; }
    if (feedback?.src === 'bot' && feedback.telegramUserId === chat) {
      await kv.lrem(FB_LIST, raw);
      removed++;
    }
  }
  return { removed, copiesPending: await deleteFeedbackCopies(chat, now) };
}
