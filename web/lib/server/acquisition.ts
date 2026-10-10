import { kv } from "./kv.ts";
import { parseAcquisitionSource } from "../client/acquisition-source.ts";
import type { TrackInput } from "./analytics.ts";
import type { RunCohort } from "./run-cohorts.ts";

const DAY = 864e5;
const TTL = 120 * 86400;
interface AcquisitionMeta { date: string; version: string; channel: string }
export interface AcquisitionCohort extends AcquisitionMeta { h: Record<string, number> }

// Вызывается только для первого принятого пакета устройства за календарный день.
export async function recordAcquisitionVisit(pid: string, events: TrackInput[], now: number, isNew: boolean) {
  const date = new Date(now).toISOString().slice(0, 10);
  if (isNew) {
    const props = events.find(event => event.e === "open")?.p ?? events[0]?.p;
    const version = typeof props?.v === "string" && /^[a-zA-Z0-9._-]{1,24}$/.test(props.v) ? props.v : "unknown";
    const channel = parseAcquisitionSource(String(props?.src ?? "")) ?? "unknown";
    await kv.hsetnx("an:acq:first", pid, JSON.stringify({
      date, version, channel,
      referred: typeof props?.referred === "boolean" ? props.referred : undefined,
    }));
  }
  const raw = await kv.hget("an:acq:first", pid);
  if (!raw) return;
  const meta: AcquisitionMeta = JSON.parse(raw);
  const age = Math.round((Date.parse(date) - Date.parse(meta.date)) / DAY);
  if (![0, 1, 7].includes(age)) return;
  const group = `${meta.version}|${meta.channel}`;
  const key = `an:acq:${meta.date}:${group}`;
  await kv.sadd(`an:acq:${meta.date}:groups`, group);
  await kv.hincrby(key, `d${age}`);
  await Promise.all([kv.expire(key, TTL), kv.expire(`an:acq:${meta.date}:groups`, TTL)]);
}

export async function readAcquisitionCohorts(dates: string[]): Promise<AcquisitionCohort[]> {
  const rows = await Promise.all(dates.map(async date => {
    const groups = await kv.smembers(`an:acq:${date}:groups`);
    return Promise.all(groups.sort().map(async group => {
      const [version, channel] = group.split("|");
      const values = await kv.hgetall(`an:acq:${date}:${group}`);
      const h = Object.fromEntries(Object.entries(values).map(([name, value]) => [name, Number(value) || 0]));
      return { date, version, channel, h };
    }));
  }));
  return rows.flat();
}

const escape = (value: string) => value.replace(/[&<>"']/g, character =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
const ratio = (count: number, total: number) => total ? `${count} / ${total} · ${Math.round(count / total * 100)}%` : "—";
const label = (channel?: string) => channel && channel !== "unknown" ? channel : "Неизвестный источник";

export function renderAcquisition(cohorts: AcquisitionCohort[], runs: RunCohort[], now: number): string {
  const today = Date.parse(new Date(now).toISOString().slice(0, 10));
  const deviceRows = [...cohorts].reverse().map(cohort => {
    const age = (today - Date.parse(cohort.date)) / DAY;
    const returned = (days: number) => age > days ? ratio(cohort.h[`d${days}`] ?? 0, cohort.h.d0 ?? 0) : "—";
    return `<tr><td>${cohort.date}</td><td>${escape(cohort.version)}</td><td>${escape(label(cohort.channel))}</td>
      <td>${cohort.h.d0 ?? 0}</td><td>${returned(1)}</td><td>${returned(7)}</td></tr>`;
  }).join("");
  const runRows = [...runs].reverse().map(run => {
    const mature = now >= Date.parse(run.date) + 4 * DAY;
    const measured = run.h.windowMeasured === run.h.started;
    const resolved = !measured ? "Нет замера окна" : mature ? ratio(run.h.resolved3d ?? 0, run.h.turn1 ?? 0) : "Окно ещё открыто";
    return `<tr><td>${run.date}</td><td>${escape(run.version)}</td><td>${escape(label(run.channel))}</td>
      <td>${run.mode === "daily" ? "Дело дня" : "Обычная"}</td><td>${run.h.turn1 ?? 0}</td><td>${resolved}</td></tr>`;
  }).join("");
  return `<div class="paper"><h2>Каналы привлечения</h2>
    <p class="muted">Новые устройства по первому визиту, версии и первому источнику.
    D1/D7 — активность ровно в соответствующий день UTC; незавершённый день показан прочерком.
    Другой браузер создаёт новое устройство. Старые устройства не добавляются задним числом.</p>
    <div class="scroll"><table><tr><th>Пришли</th><th>Версия</th><th>Канал</th><th>Устройств</th><th>D1</th><th>D7</th></tr>
    ${deviceRows || '<tr><td colspan="6">Пока нет новых устройств</td></tr>'}</table></div>
    <h2>Развязка по каналам партий</h2><p class="muted">Канал фиксируется на старте партии.
    Знаменатель — партии с первым решением; развязка — ход 20 или ранний финал в течение 3 дней от старта.
    Пока окно всех партий дня не закрыто, процент не показывается. Рост за счёт ранних поражений не доказывает улучшения.
    Платформа отдельно видна в таблице когорт партий.</p>
    <div class="scroll"><table><tr><th>Старт</th><th>Версия</th><th>Канал</th><th>Режим</th><th>Первое решение</th>
    <th>Развязка за 3 дня</th></tr>${runRows || '<tr><td colspan="6">Пока нет партий</td></tr>'}</table></div></div>`;
}
