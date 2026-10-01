// Ограничение частоты запросов по IP.
// Хранится в памяти процесса: на Vercel у каждого инстанса функции свой счётчик,
// поэтому это защита «по мере сил». Для строгого лимита нужен общий стор (Upstash/Vercel KV).

const PER_MINUTE = Number(process.env.RATE_LIMIT_PER_MIN) || 20;
const PER_DAY = Number(process.env.RATE_LIMIT_PER_DAY) || 400;
const MAX_KEYS = 10_000;

interface Bucket { minuteStart: number; minute: number; dayStart: number; day: number }
const buckets = new Map<string, Bucket>();

export interface RateResult { ok: boolean; retryAfter: number }

export function checkRate(key: string, now = Date.now()): RateResult {
  let b = buckets.get(key);
  if (!b) {
    if (buckets.size >= MAX_KEYS) buckets.clear();
    b = { minuteStart: now, minute: 0, dayStart: now, day: 0 };
    buckets.set(key, b);
  }
  if (now - b.minuteStart >= 60_000) { b.minuteStart = now; b.minute = 0; }
  if (now - b.dayStart >= 86_400_000) { b.dayStart = now; b.day = 0; }

  if (b.day >= PER_DAY) return { ok: false, retryAfter: Math.ceil((b.dayStart + 86_400_000 - now) / 1000) };
  if (b.minute >= PER_MINUTE) return { ok: false, retryAfter: Math.ceil((b.minuteStart + 60_000 - now) / 1000) };
  b.minute++;
  b.day++;
  return { ok: true, retryAfter: 0 };
}

export function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}
