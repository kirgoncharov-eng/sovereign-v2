// Ошибки у игроков: что сломалось, на какой версии и сколько раз. Без стека и без данных партии —
// только короткий текст ошибки, чтобы увидеть сбой в цифрах раньше, чем о нём напишут.
// Ключи: an:err:<день> — хэш «версия|вид|текст» → число, an:<день>.error — всего за день.
import { kv } from "./kv.ts";

const TTL = 60 * 60 * 24 * 30;
export const ERROR_KINDS = ["js", "promise", "render"] as const;
export type ErrorKind = (typeof ERROR_KINDS)[number];
export interface ErrorInput { kind: ErrorKind; msg: string; v: string }

const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);
// Числа и длинные идентификаторы в тексте делают из одной ошибки сотню разных — сворачиваем их.
export const normalizeError = (msg: string) => msg
  .replace(/https?:\/\/\S+/g, "<url>")
  .replace(/\b[0-9a-f]{8,}\b/gi, "<id>")
  .replace(/\d+/g, "N")
  .replace(/[\u0000-\u001f|]/g, " ")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, 160);

export function parseErrors(raw: unknown): ErrorInput[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 5).flatMap(x => {
    if (!x || typeof x !== "object") return [];
    const { kind, msg, v } = x as Record<string, unknown>;
    if (!(ERROR_KINDS as readonly unknown[]).includes(kind) || typeof msg !== "string" || !msg.trim()) return [];
    return [{ kind: kind as ErrorKind, msg: normalizeError(msg), v: typeof v === "string" ? v.replace(/[^\w.]/g, "").slice(0, 12) : "?" }];
  });
}

export async function recordErrors(items: ErrorInput[], now = Date.now()) {
  if (!items.length) return;
  const d = dayOf(now);
  await Promise.all([
    ...items.map(e => kv.hincrby(`an:err:${d}`, `${e.v}|${e.kind}|${e.msg}`)),
    kv.hincrby(`an:${d}`, "error", items.length),
    kv.expire(`an:err:${d}`, TTL),
  ]);
}

export interface ErrorRow { v: string; kind: string; msg: string; count: number; last: string }

// Самые частые ошибки за дни периода, по убыванию.
export async function readErrors(dates: string[], top = 15): Promise<ErrorRow[]> {
  const acc = new Map<string, ErrorRow>();
  for (const date of dates) {
    const h = await kv.hgetall(`an:err:${date}`);
    for (const [k, n] of Object.entries(h)) {
      const [v, kind, ...rest] = k.split("|");
      const row = acc.get(k) ?? { v, kind, msg: rest.join("|"), count: 0, last: date };
      row.count += Number(n) || 0;
      row.last = date;
      acc.set(k, row);
    }
  }
  return [...acc.values()].sort((a, b) => b.count - a.count).slice(0, top);
}
