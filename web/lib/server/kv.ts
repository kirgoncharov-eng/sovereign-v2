// Мини-хранилище для таблицы «Дела дня» и подписчиков бота.
// В продакшене — Redis по REST (Upstash или Vercel KV), без ключей — память процесса (для разработки).
type Cmd = (string | number)[];

const url = () => process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
const token = () => process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";

export const kvConfigured = () => Boolean(url() && token());

async function redis<T>(cmd: Cmd): Promise<T> {
  const r = await fetch(url(), {
    method: "POST",
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
    cache: "no-store",
  });
  const data = await r.json() as { result?: T; error?: string };
  if (!r.ok || data.error) throw new Error(data.error || `KV ${r.status}`);
  return data.result as T;
}

// ── Память процесса ──────────────────────────────────────────────────────────
const zsets = new Map<string, Map<string, number>>();
const hashes = new Map<string, Map<string, string>>();
const sets = new Map<string, Set<string>>();
const bucket = <K, V>(m: Map<string, Map<K, V>>, k: string) => { let b = m.get(k); if (!b) m.set(k, b = new Map()); return b; };
const setOf = (k: string) => { let b = sets.get(k); if (!b) sets.set(k, b = new Set()); return b; };

export const kv = {
  // Первый результат остаётся: одна попытка в день.
  async zaddNx(key: string, score: number, member: string): Promise<boolean> {
    if (kvConfigured()) return (await redis<number>(["ZADD", key, "NX", score, member])) === 1;
    const z = bucket(zsets, key);
    if (z.has(member)) return false;
    z.set(member, score);
    return true;
  },
  async ztop(key: string, n: number): Promise<[string, number][]> {
    if (kvConfigured()) {
      const flat = await redis<string[]>(["ZRANGE", key, 0, n - 1, "REV", "WITHSCORES"]);
      const out: [string, number][] = [];
      for (let i = 0; i < flat.length; i += 2) out.push([flat[i], Number(flat[i + 1])]);
      return out;
    }
    return [...bucket(zsets, key).entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  },
  async zrank(key: string, member: string): Promise<number | null> {
    if (kvConfigured()) return redis<number | null>(["ZREVRANK", key, member]);
    const sorted = [...bucket(zsets, key).entries()].sort((a, b) => b[1] - a[1]);
    const i = sorted.findIndex(([m]) => m === member);
    return i < 0 ? null : i;
  },
  async zscore(key: string, member: string): Promise<number | null> {
    if (kvConfigured()) { const v = await redis<string | null>(["ZSCORE", key, member]); return v === null ? null : Number(v); }
    return bucket(zsets, key).get(member) ?? null;
  },
  async zcard(key: string): Promise<number> {
    if (kvConfigured()) return redis<number>(["ZCARD", key]);
    return bucket(zsets, key).size;
  },
  async hset(key: string, field: string, value: string) {
    if (kvConfigured()) return void await redis(["HSET", key, field, value]);
    bucket(hashes, key).set(field, value);
  },
  async hmget(key: string, fields: string[]): Promise<(string | null)[]> {
    if (!fields.length) return [];
    if (kvConfigured()) return redis<(string | null)[]>(["HMGET", key, ...fields]);
    const h = bucket(hashes, key);
    return fields.map(f => h.get(f) ?? null);
  },
  async sadd(key: string, member: string) {
    if (kvConfigured()) return void await redis(["SADD", key, member]);
    setOf(key).add(member);
  },
  async srem(key: string, member: string) {
    if (kvConfigured()) return void await redis(["SREM", key, member]);
    setOf(key).delete(member);
  },
  async smembers(key: string): Promise<string[]> {
    if (kvConfigured()) return redis<string[]>(["SMEMBERS", key]);
    return [...setOf(key)];
  },
  async expire(key: string, seconds: number) {
    if (kvConfigured()) await redis(["EXPIRE", key, seconds]);
  },
};
