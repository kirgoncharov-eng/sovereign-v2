// «Забудьте меня»: по команде /forget бот стирает всё, что хранит о человеке из Telegram.
// Подписка на утреннее дело, отложенный вопрос об отзыве, незаконченный опрос, друзья в таблице,
// место в таблицах «Дела дня» за последние дни и отзывы, оставленные через бота.
// Анонимная статистика привязана к случайному номеру браузера, а не к Telegram, — её связать с человеком нельзя.
import { kv } from "./kv.ts";
import { FB_LIST } from "./feedback.ts";
import { FOLLOWUP, OPT_OUT } from "./followup.ts";

const DAYS_KEPT = 4; // таблица «Дела дня» живёт трое суток; с запасом на часовые пояса

export async function forgetUser(chat: number, who: string, subsKey: string, fbStateKey: string, now = Date.now()) {
  const id = String(chat), uid = `tg${chat}`;
  await Promise.all([kv.srem(subsKey, id), kv.srem(OPT_OUT, id), kv.hdel(FOLLOWUP, id), kv.hdel(fbStateKey, id)]);
  const friends = await kv.smembers(`friends:${uid}`);
  await Promise.all([...friends.map(f => kv.srem(`friends:${f}`, uid)), kv.del(`friends:${uid}`)]);
  for (let i = 0; i < DAYS_KEPT; i++) {
    const date = new Date(now - (i - 1) * 864e5).toISOString().slice(0, 10);
    await Promise.all([kv.zrem(`daily:${date}`, uid), kv.hdel(`daily:${date}:info`, uid)]);
  }
  if (who) {
    const all = await kv.lrange(FB_LIST, 1000);
    const keep = all.filter(raw => { try { const f = JSON.parse(raw); return !(f.src === "bot" && f.who === who); } catch { return true; } });
    if (keep.length !== all.length) await kv.lreplace(FB_LIST, keep);
  }
}
