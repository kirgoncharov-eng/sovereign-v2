// Аналитика без сторонних сервисов: счётчики по дням в том же хранилище, что и «Дело дня».
// Ключи: an:<день> — события и их разрезы, an:u:<день> — кто заходил сегодня,
// an:first — день первого визита игрока, an:cohort:<день> — сколько из пришедших в тот день вернулись.
import { END_TYPES } from "../game/data.ts";
import { kv } from "./kv.ts";

export const TRACK_EVENTS = ["open", "start", "resume", "turn", "end", "share", "invite", "daily"] as const;
export type TrackEventName = (typeof TRACK_EVENTS)[number];

// По каким свойствам события считаем разрезы.
const DIMS: Record<TrackEventName, string[]> = {
  open: ["src"], start: ["country", "diff", "ideo", "bio", "daily"], resume: [], turn: ["n"],
  end: ["type", "kept"], share: [], invite: [], daily: [],
};
export const COHORT_DAYS = [1, 3, 7, 14, 30];
const TTL = 60 * 60 * 24 * 120;
export const PID = /^[a-z0-9]{8,24}$/;

export const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
const clean = (v: unknown) => String(v).replace(/[^\p{L}\p{N} _.-]/gu, "").trim().slice(0, 24);

export interface TrackInput { e: string; p?: Record<string, unknown> }

export async function record(pid: string, events: TrackInput[], now = Date.now()) {
  const d = dayOf(now), key = `an:${d}`;
  const ops: Promise<unknown>[] = [];
  // Первый визит за сегодня: считаем игрока и, если он вернулся, его когорту.
  if (await kv.sadd(`an:u:${d}`, pid)) {
    ops.push(kv.expire(`an:u:${d}`, TTL), kv.hincrby(key, "players"));
    if (await kv.hsetnx("an:first", pid, d)) {
      ops.push(kv.hincrby(key, "new"), kv.hincrby(`an:cohort:${d}`, "d0"), kv.expire(`an:cohort:${d}`, TTL));
    } else {
      const first = await kv.hget("an:first", pid);
      const k = first ? daysBetween(first, d) : -1;
      if (first && COHORT_DAYS.includes(k)) ops.push(kv.hincrby(`an:cohort:${first}`, `d${k}`));
    }
  }
  for (const { e, p } of events) {
    if (!(TRACK_EVENTS as readonly string[]).includes(e)) continue;
    ops.push(kv.hincrby(key, e));
    for (const dim of DIMS[e as TrackEventName]) {
      const v = p?.[dim];
      if (v === undefined || v === null || v === "") continue;
      const val = clean(v);
      if (val) ops.push(kv.hincrby(key, `${e}|${dim}=${val}`));
    }
  }
  ops.push(kv.expire(key, TTL));
  await Promise.all(ops);
}

export interface Stats {
  days: { date: string; h: Record<string, number> }[];      // старые → новые
  cohorts: { date: string; h: Record<string, number> }[];
}
const nums = (h: Record<string, string>) => Object.fromEntries(Object.entries(h).map(([k, v]) => [k, Number(v) || 0]));

export async function readStats(n: number, now = Date.now()): Promise<Stats> {
  const dates = Array.from({ length: n }, (_, i) => dayOf(now - (n - 1 - i) * 864e5));
  const [days, cohorts] = await Promise.all([
    Promise.all(dates.map(async date => ({ date, h: nums(await kv.hgetall(`an:${date}`)) }))),
    Promise.all(dates.map(async date => ({ date, h: nums(await kv.hgetall(`an:cohort:${date}`)) }))),
  ]);
  return { days, cohorts };
}

// ── Страница с цифрами ───────────────────────────────────────────────────────
const esc = (s: unknown) => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
const sum = (s: Stats, f: string) => s.days.reduce((t, d) => t + (d.h[f] ?? 0), 0);

// Сумма разреза за период: start|country=… → [["Беларусь", 12], …], по убыванию.
function breakdown(s: Stats, prefix: string): [string, number][] {
  const acc = new Map<string, number>();
  for (const d of s.days) for (const [k, v] of Object.entries(d.h)) if (k.startsWith(prefix)) acc.set(k.slice(prefix.length), (acc.get(k.slice(prefix.length)) ?? 0) + v);
  return [...acc.entries()].sort((a, b) => b[1] - a[1]);
}

const LABELS: Record<string, string> = {
  debut: "Дебют", coalition: "Коалиция", crisis: "Кризис", ruins: "Обломки",
  liberal: "Либерал", nationalist: "Националист", pragmatist: "Прагматик", leftist: "Левый",
  officer: "Офицер", economist: "Экономист", lawyer: "Правозащитник", diplomat: "Дипломат", mayor: "Мэр",
  ...END_TYPES,
  tg: "Telegram", web: "Браузер", true: "Да", false: "Нет",
};

function bars(rows: [string, number][], total: number) {
  if (!rows.length) return `<p class="muted">Пока нет данных</p>`;
  return rows.map(([k, v]) => `<div class="bar"><span class="name">${esc(LABELS[k] ?? k)}</span><span class="track"><i style="width:${total ? Math.round((v / total) * 100) : 0}%"></i></span><span class="val">${v} · ${pct(v, total)}</span></div>`).join("");
}

export function renderStats(s: Stats): string {
  const starts = sum(s, "start"), ends = sum(s, "end");
  const newPlayers = sum(s, "new"), dauToday = s.days.at(-1)?.h.players ?? 0;
  const funnel: [string, number][] = [
    ["Начали партию", starts], ["Ход 1", sum(s, "turn|n=1")], ["Ход 3", sum(s, "turn|n=3")], ["Ход 5", sum(s, "turn|n=5")],
    ["Ход 10", sum(s, "turn|n=10")], ["Ход 15", sum(s, "turn|n=15")], ["Ход 20", sum(s, "turn|n=20")], ["Финал любого рода", ends],
  ];
  const today = s.days.at(-1)?.date ?? "";
  const cohortRows = [...s.cohorts].reverse().filter(c => c.h.d0).map(c => {
    const age = Math.round((Date.parse(today) - Date.parse(c.date)) / 864e5);
    return `<tr><td>${esc(c.date)}</td><td>${c.h.d0}</td>${COHORT_DAYS.map(k => `<td>${age >= k ? pct(c.h[`d${k}`] ?? 0, c.h.d0) : "—"}</td>`).join("")}</tr>`;
  }).join("");
  const dayRows = [...s.days].reverse().map(d => `<tr><td>${esc(d.date)}</td><td>${d.h.players ?? 0}</td><td>${d.h.new ?? 0}</td><td>${d.h.start ?? 0}</td><td>${d.h.end ?? 0}</td><td>${pct(d.h.end ?? 0, d.h.start ?? 0)}</td><td>${(d.h.share ?? 0) + (d.h.invite ?? 0)}</td><td>${d.h.daily ?? 0}</td></tr>`).join("");
  const section = (title: string, prefix: string, total: number) => `<section><h2>${title}</h2>${bars(breakdown(s, prefix), total)}</section>`;

  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Суверен · цифры</title>
<style>
:root{--bg:#2a2622;--paper:#e8dfc8;--ink:#2b2620;--muted:#7a6f5f;--line:#cbbf9f;--accent:#8b2f2a}
*{box-sizing:border-box}body{margin:0;background:var(--bg);font:15px/1.45 Georgia,serif;color:var(--ink)}
main{max-width:860px;margin:0 auto;padding:16px}.paper{background:var(--paper);padding:18px 20px;margin-bottom:14px;box-shadow:4px 4px 0 #0006}
h1{margin:0 0 4px;font-size:24px}h2{margin:0 0 10px;font-size:17px}.muted{color:var(--muted)}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px}.kpi b{display:block;font-size:26px}.kpi span{color:var(--muted);font-size:13px}
.bar{display:grid;grid-template-columns:minmax(0,150px) 1fr auto;gap:8px;align-items:center;margin:4px 0;font-size:14px}
.bar .track{height:10px;background:#d6cbb0}.bar i{display:block;height:100%;background:var(--accent)}.bar .val{color:var(--muted);white-space:nowrap}
.scroll{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:14px}td,th{padding:5px 8px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap}td:first-child,th:first-child{text-align:left}th{font-weight:600}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr));gap:14px}
</style></head><body><main>
<div class="paper"><h1>Суверен · цифры</h1><div class="muted">За ${s.days.length} дн., по ${esc(today)} включительно (UTC). Анонимные счётчики, без личных данных.</div></div>
<div class="paper kpis">
<div class="kpi"><b>${newPlayers}</b><span>новых игроков</span></div>
<div class="kpi"><b>${dauToday}</b><span>игроков сегодня</span></div>
<div class="kpi"><b>${starts}</b><span>партий начато</span></div>
<div class="kpi"><b>${pct(ends, starts)}</b><span>партий доведено до финала</span></div>
<div class="kpi"><b>${pct(sum(s, "share") + sum(s, "invite"), ends)}</b><span>финалов, после которых поделились</span></div>
</div>
<div class="paper"><h2>Воронка партии</h2><p class="muted">Доля от начатых партий: где игроки бросают.</p>${bars(funnel, starts)}</div>
<div class="paper"><h2>Возвращаемость по дню первого визита</h2><p class="muted">Какая доля новых игроков вернулась на 1-й, 3-й, 7-й, 14-й и 30-й день.</p><div class="scroll"><table><tr><th>Пришли</th><th>Игроков</th>${COHORT_DAYS.map(k => `<th>День ${k}</th>`).join("")}</tr>${cohortRows || `<tr><td colspan="7" class="muted">Пока нет данных</td></tr>`}</table></div></div>
<div class="grid">
<div class="paper">${section("Страны", "start|country=", starts)}</div>
<div class="paper">${section("Сложность", "start|diff=", starts)}</div>
<div class="paper">${section("Курс", "start|ideo=", starts)}</div>
<div class="paper">${section("Биография", "start|bio=", starts)}</div>
<div class="paper">${section("Чем заканчиваются партии", "end|type=", ends)}</div>
<div class="paper">${section("Сколько обещаний исполнено", "end|kept=", ends)}</div>
<div class="paper">${section("Откуда запускают", "open|src=", sum(s, "open"))}</div>
</div>
<div class="paper"><h2>По дням</h2><div class="scroll"><table><tr><th>День</th><th>Игроков</th><th>Новых</th><th>Партий</th><th>Финалов</th><th>Доиграли</th><th>Поделились</th><th>Дело дня</th></tr>${dayRows}</table></div></div>
</main></body></html>`;
}
