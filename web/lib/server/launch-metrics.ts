import { kv } from "./kv.ts";
import type { AnalyticsRun } from "../client/run-context.ts";
import type { RunCohort } from "./run-cohorts.ts";

const DAY = 864e5;
const TTL = 120 * 86400;
const dateOf = (time: number) => new Date(time).toISOString().slice(0, 10);
export interface LaunchTraffic { version: string; channel: string; active: number; referred: number; newMeasured: number }

// Устройства объединяются за выбранный период, а не складываются по дням.
export async function recordLaunchDevice(pid: string, run: AnalyticsRun, now: number) {
  const date = dateOf(now);
  const group = `${run.version}|${run.channel ?? "unknown"}`;
  const activeKey = `an:launch:${date}:${group}:active`;
  await kv.sadd(activeKey, pid);
  await kv.sadd(`an:launch:${date}:groups`, group);
  await Promise.all([kv.expire(activeKey, TTL), kv.expire(`an:launch:${date}:groups`, TTL)]);
  const raw = await kv.hget("an:acq:first", pid);
  if (!raw) return;
  const first = JSON.parse(raw) as { date: string; version: string; channel: string; referred?: boolean };
  if (typeof first.referred !== "boolean" || now - Date.parse(first.date) >= TTL * 1000) return;
  const firstGroup = `${first.version}|${first.channel}`;
  const referralKey = `an:launch:${first.date}:${firstGroup}:referred`;
  const measuredKey = `an:launch:${first.date}:${firstGroup}:newMeasured`;
  await kv.sadd(measuredKey, pid);
  if (first.referred) await kv.sadd(referralKey, pid);
  await kv.sadd(`an:launch:${first.date}:groups`, firstGroup);
  await Promise.all([kv.expire(referralKey, TTL), kv.expire(measuredKey, TTL),
    kv.expire(`an:launch:${first.date}:groups`, TTL)]);
}

export async function readLaunchTraffic(dates: string[]): Promise<LaunchTraffic[]> {
  const totals = new Map<string, { active: Set<string>; referred: Set<string>; newMeasured: Set<string> }>();
  for (const date of dates) {
    for (const group of await kv.smembers(`an:launch:${date}:groups`)) {
      const devices = totals.get(group) ?? { active: new Set<string>(), referred: new Set<string>(), newMeasured: new Set<string>() };
      const [active, referred, newMeasured] = await Promise.all([
        kv.smembers(`an:launch:${date}:${group}:active`), kv.smembers(`an:launch:${date}:${group}:referred`),
        kv.smembers(`an:launch:${date}:${group}:newMeasured`),
      ]);
      active.forEach(pid => devices.active.add(pid));
      referred.forEach(pid => devices.referred.add(pid));
      newMeasured.forEach(pid => devices.newMeasured.add(pid));
      totals.set(group, devices);
    }
  }
  return [...totals].sort(([left], [right]) => left.localeCompare(right)).map(([group, devices]) => {
    const [version, channel] = group.split("|");
    return { version, channel, active: devices.active.size, referred: devices.referred.size, newMeasured: devices.newMeasured.size };
  });
}

// Точная медиана из гистограммы целых значений; повторные пакеты не добавляют выборку.
export function histogramMedian(counts: Record<string, number>, prefix: string): number | null {
  const values = Object.entries(counts).filter(([key, count]) => key.startsWith(prefix) && count > 0)
    .map(([key, count]) => [Number(key.slice(prefix.length)), count] as const)
    .filter(([value]) => Number.isFinite(value)).sort(([left], [right]) => left - right);
  const total = values.reduce((sum, [, count]) => sum + count, 0);
  if (!total) return null;
  const middle = [(total - 1) / 2, total / 2].map(Math.floor);
  let passed = 0;
  const found: number[] = [];
  for (const [value, count] of values) {
    for (const index of middle) if (index >= passed && index < passed + count) found.push(value);
    passed += count;
  }
  return (found[0] + found[1]) / 2;
}
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
const ratio = (count: number, total: number) => total ? `${count} / ${total} · ${Math.round(count / total * 100)}%` : "—";
const channelLabel = (channel?: string) => escapeHtml(channel && channel !== "unknown" ? channel : "Неизвестный");

export function renderLaunchMetrics(runs: RunCohort[], traffic: LaunchTraffic[], now: number): string {
  const rows = [...runs].reverse().filter(run => run.mode === "ordinary").map(run => {
    const counts = run.h;
    const complete = counts.metricsMeasured === counts.started && (counts.started ?? 0) > 0;
    const mature = now >= Date.parse(run.date) + 4 * DAY;
    const resolved = counts.resolved3d ?? 0;
    const first = counts.turn1 ?? 0;
    const seconds = histogramMedian(counts, "firstSeconds:");
    const sample = Object.entries(counts).filter(([key]) => key.startsWith("firstSeconds:"))
      .reduce((sum, [, count]) => sum + count, 0);
    const turns = histogramMedian(counts, "resolvedTurns:");
    const errors = complete ? (counts.errors ?? 0) / counts.started * 100 : null;
    const stop = (errors !== null && errors > 2) || (seconds !== null && seconds > 60);
    const signal = stop ? "СТОП: проверить"
      : complete && first > 0 && sample === first ? "Порог не превышен" : "Недостаточно данных";
    const windowValue = (value: string) => !complete ? "Неполный замер" : mature ? value : "Окно открыто";
    const timing = seconds === null ? "Нет замера" : `${seconds} с (n=${sample})`;
    const errorValue = errors === null ? "Неполный замер" : `${errors.toFixed(1)} (${counts.errors ?? 0}/${counts.started})`;
    return `<tr><td>${escapeHtml(run.date)}</td><td>${escapeHtml(run.version)}</td><td>${channelLabel(run.channel)}</td>
      <td>${escapeHtml(run.source)}</td><td>${signal}</td>
      <td>${errorValue}</td><td>${timing}</td><td>${windowValue(ratio(resolved, first))}</td>
      <td>${windowValue(ratio(counts.earlyDefeat ?? 0, first))}</td><td>${windowValue(turns === null ? "—" : String(turns))}</td>
      <td>${windowValue(ratio(counts.resolvedShared ?? 0, resolved))}</td></tr>`;
  }).join("");
  const trafficRows = traffic.map(row => `<tr><td>${escapeHtml(row.version)}</td><td>${channelLabel(row.channel)}</td>
    <td>${row.active}</td><td>${row.newMeasured ? row.referred : "Нет замера"}</td>
    <td>${row.newMeasured && row.active ? (row.referred / row.active).toFixed(3) : "—"}</td><td>${row.newMeasured}</td></tr>`).join("");
  return `<div class="paper"><h2>Мягкий запуск: метрики и стоп-сигналы</h2>
    <p class="muted">Обычные партии, день старта × версия × канал × платформа. СТОП при более 2 ошибок на 100 стартов
    или медиане первого решения более 60 с. Ошибка — уникальный нормализованный вид/текст на партию.
    Время — от начала партии до первого решения, включая паузу; n — число измеренных партий.
    Старые клиенты не дают полного замера. Порог не превышен — не доказательство готовности.</p>
    <div class="scroll"><table><tr><th>Старт UTC</th><th>Версия</th><th>Канал</th><th>Платформа</th><th>Сигнал</th>
    <th>Ошибок / 100 стартов</th><th>Первое решение, медиана</th><th>Развязка / первое решение</th>
    <th>Поражение до 10 / первое решение</th><th>Ходов до развязки, медиана</th><th>Поделились / развязки</th></tr>
    ${rows || '<tr><td colspan="11">Нет обычных партий</td></tr>'}</table></div>
    <p class="muted">Развязка — ход 20 или раннее поражение в течение 3 дней; ходы после 20 не продлевают первую сессию.
    Поделились — попытка share или invite той же партии в течение 3 дней, не подтверждение отправки.
    Проценты окна показываются после его закрытия для всех партий дня.
    Поражения до 10 учитываются при любом сроке получения финала; это сопутствующая цифра.</p>
    <h2>Приглашения за выбранный период</h2><p class="muted">Активные — уникальные устройства с действиями обычной партии.
    Новые по ref — устройства первого визита, начавшие обычную партию; один браузер один раз.
    Версия и канал новых фиксируются при первом визите, активных — в партии. Другой браузер считается новым.
    Тестовые устройства и «Дело дня» исключены. Старые визиты без признака ref не восстанавливаются.</p>
    <div class="scroll"><table><tr><th>Версия</th><th>Канал</th><th>Активных устройств</th><th>Новых по ref</th>
    <th>Новых по ref / активное устройство</th><th>Новых с замером ref</th></tr>
    ${trafficRows || '<tr><td colspan="6">Нет замера приглашений</td></tr>'}</table></div></div>`;
}
