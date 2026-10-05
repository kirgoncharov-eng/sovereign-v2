// Таблица «Дела дня»: результат засчитывается один раз, видно место среди всех и среди друзей.
// Друзья появляются, когда игрок приходит по ссылке-приглашению другого игрока.
import { isObj } from "@/lib/game/sanitize.ts";
import { kv } from "@/lib/server/kv.ts";
import { checkRate, clientKey } from "@/lib/server/rateLimit.ts";
import { verifyInitData } from "@/lib/server/telegram.ts";
import { env } from "@/lib/server/env.ts";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UID = /^(tg\d{1,15}|w[a-z0-9]{8,24})$/;
const TTL = 60 * 60 * 24 * 3;

const fail = (status: number, error: string) => Response.json({ error }, { status });
const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[<>\n\r]/g, "").trim().slice(0, max) : "");

// Дата партии должна быть сегодняшней ± сутки (часовые пояса игроков разные).
function freshDate(date: string, now = Date.now()) {
  const t = Date.parse(`${date}T12:00:00Z`);
  return Number.isFinite(t) && Math.abs(t - now) < 36 * 3600 * 1000;
}

function identify(body: Record<string, unknown>): { uid: string; name: string } | null {
  const token = env("TELEGRAM_BOT_TOKEN");
  if (typeof body.initData === "string" && body.initData && token) {
    const user = verifyInitData(body.initData, token);
    if (!user) return null;
    return { uid: `tg${user.id}`, name: text(user.first_name, 24) || text(user.username, 24) || "Игрок" };
  }
  const uid = typeof body.uid === "string" ? `w${body.uid.toLowerCase()}` : "";
  if (!UID.test(uid)) return null;
  return { uid, name: `Гость ${uid.slice(-4).toUpperCase()}` };
}

interface Info { name: string; title: string; end: string; turns: number }

// Место в таблице — по годам у власти, при равенстве — по очкам: ключ = ходы × 10000 + очки.
const RANK = 10000;
const unpack = (s: number) => ({ turns: Math.floor(s / RANK), score: s % RANK });

async function board(date: string, uid: string) {
  const key = `daily:${date}`;
  const [top, total, rank, score, friendIds] = await Promise.all([
    kv.ztop(key, 10), kv.zcard(key), kv.zrank(key, uid), kv.zscore(key, uid), kv.smembers(`friends:${uid}`),
  ]);
  const friendScores = await Promise.all(friendIds.slice(0, 50).map(async f => [f, await kv.zscore(key, f)] as const));
  const friends = [...friendScores.filter(([, s]) => s !== null) as [string, number][], ...(score !== null ? [[uid, score] as [string, number]] : [])]
    .sort((a, b) => b[1] - a[1]);
  const ids = [...new Set([...top.map(([m]) => m), ...friends.map(([m]) => m)])];
  const infos = await kv.hmget(`${key}:info`, ids);
  const info = new Map(ids.map((id, i) => [id, infos[i] ? JSON.parse(infos[i]!) as Info : null]));
  const row = ([id, s]: [string, number]) => ({ name: info.get(id)?.name ?? "Игрок", title: info.get(id)?.title ?? "", ...unpack(s), me: id === uid });
  return {
    total,
    me: rank === null || score === null ? null : { rank: rank + 1, ...unpack(score) },
    top: top.map(row),
    friends: friends.length > 1 ? friends.slice(0, 10).map(row) : [],
  };
}

export async function POST(req: Request) {
  const rate = checkRate(clientKey(req));
  if (!rate.ok) return fail(429, "Слишком много запросов");
  let body: unknown;
  try { body = JSON.parse((await req.text()).slice(0, 8000)); } catch { return fail(400, "Некорректный JSON"); }
  if (!isObj(body)) return fail(400, "Некорректный запрос");
  const date = typeof body.date === "string" && DATE.test(body.date) ? body.date : "";
  if (!date || !freshDate(date)) return fail(400, "Неверная дата");
  const who = identify(body);
  if (!who) return fail(401, "Не удалось подтвердить игрока");

  try {
    if (body.action === "submit") {
      const score = Math.max(0, Math.min(RANK - 1, Math.round(Number(body.score) || 0)));
      const turns = Math.max(0, Math.min(400, Math.round(Number(body.turns) || 0)));
      const key = `daily:${date}`;
      if (await kv.zaddNx(key, turns * RANK + score, who.uid)) {
        const info: Info = { name: who.name, title: text(body.title, 40), end: text(body.endType, 16), turns };
        await kv.hset(`${key}:info`, who.uid, JSON.stringify(info));
        await Promise.all([kv.expire(key, TTL), kv.expire(`${key}:info`, TTL)]);
      }
    }
    // Приглашение: дружба взаимная
    const ref = typeof body.ref === "string" ? body.ref : "";
    if (UID.test(ref) && ref !== who.uid) {
      await Promise.all([kv.sadd(`friends:${who.uid}`, ref), kv.sadd(`friends:${ref}`, who.uid)]);
    }
    return Response.json({ uid: who.uid, ...(await board(date, who.uid)) });
  } catch (e) {
    console.error("daily", e);
    return fail(503, "Таблица временно недоступна");
  }
}
