import { test } from "node:test";
import assert from "node:assert/strict";
import { readStats, record, type TrackInput } from "./analytics.ts";
import { recordErrors } from "./errors.ts";
import { histogramMedian, renderLaunchMetrics } from "./launch-metrics.ts";
import type { RunCohort } from "./run-cohorts.ts";

const DAY = 864e5;
const origin = Date.parse("2031-01-01T12:00:00Z");
function runProps(id: string, at = origin, mode = "ordinary") {
  return { rid: id, at, rv: "metrics-test", rs: "tg", rc: "history", rm: mode, lm: 1 };
}
const send = (pid: string, events: TrackInput[], time = origin) => record(pid, events, time);

test("развязка, приглашение и раннее поражение: повторные параллельные пакеты и оба порядка", async () => {
  const first = runProps("metricsrun000001");
  await send("metricsplayer01", [{ e: "invite", p: first }]);
  await Promise.all(Array.from({ length: 6 }, () => send("metricsplayer01", [
    { e: "turn", p: { ...first, n: 1 } }, { e: "end", p: { ...first, turns: 4 } },
    { e: "first", p: { ...first, seconds: 31 } }, { e: "share", p: first },
  ])));
  const second = runProps("metricsrun000002");
  await send("metricsplayer02", [{ e: "turn", p: { ...second, n: 20 } }]);
  await send("metricsplayer02", [{ e: "invite", p: second }, { e: "end", p: { ...second, turns: 30 } }]);
  const third = runProps("metricsrun000003");
  await send("metricsplayer03", [{ e: "turn", p: { ...third, n: 1 } }]);
  await send("metricsplayer03", [{ e: "end", p: { ...third, turns: 25 } }, { e: "invite", p: third }], origin + 5 * DAY);
  const rows = (await readStats(6, origin + 5 * DAY)).runCohorts!;
  const counts = rows[0].h;
  assert.equal(counts.started, 3);
  assert.equal(counts.resolved3d, 2, "поздние 25 ходов не развязка первой сессии");
  assert.equal(counts.resolvedShared, 2);
  assert.equal(counts.earlyDefeat, 1);
  assert.equal(counts["firstSeconds:31"], 1);
  assert.equal(counts["resolvedTurns:4"], 1);
  assert.equal(counts["resolvedTurns:20"], 1, "бессрочное правление не продлевает первую развязку");
  assert.equal(histogramMedian(counts, "resolvedTurns:"), 12);
});

test("окно share/invite ограничено тремя днями, даже если развязка была вовремя", async () => {
  const at = origin + 20 * DAY;
  const props = runProps("metricsrun000004", at);
  await send("metricsplayer04", [{ e: "end", p: { ...props, turns: 7 } }], at);
  await send("metricsplayer04", [{ e: "share", p: props }], at + 3 * DAY + 1);
  const counts = (await readStats(5, at + 4 * DAY)).runCohorts![0].h;
  assert.equal(counts.resolved3d, 1);
  assert.equal(counts.resolvedShared, undefined);
  assert.equal(counts.shareAttempt, 1);
});

test("нулевой финал, старые данные и tester не создают ложную развязку или измерение", async () => {
  const at = origin + 30 * DAY;
  const props = runProps("metricsrun000005", at);
  await send("metricsplayer05", [{ e: "end", p: { ...props, turns: 0 } }], at);
  await send("metricsplayer05", [{ e: "turn", p: { ...props, tester: true, n: 20 } }], at);
  await send("metricsplayer06", [{ e: "turn", p: { ...props, rid: "metricsrun000006", lm: undefined, n: 1 } }], at);
  await send("metricsplayer07", [{ e: "first", p: { seconds: 50 } }, { e: "end", p: { turns: 1 } }], at);
  const rows = (await readStats(5, at + 4 * DAY)).runCohorts!;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].h.started, 2);
  assert.equal(rows[0].h.resolved3d, undefined);
  assert.equal(rows[0].h.metricsMeasured, 1);
  assert.match(renderLaunchMetrics(rows, [], at + 4 * DAY), /Неполный замер/);
});

test("ошибки привязаны к партии и версии: нормализация и повтор не раздувают стоп-сигнал", async () => {
  const at = origin + 40 * DAY;
  const props = runProps("metricsrun000008", at);
  await send("metricsplayer08", [{ e: "start", p: props }], at);
  await Promise.all(Array.from({ length: 4 }, () => recordErrors([
    { kind: "js", msg: "Broken row 12", v: "metrics-test" },
    { kind: "js", msg: "Broken row 99", v: "metrics-test" },
  ], at, "metricsplayer08", props)));
  await recordErrors([{ kind: "js", msg: "daily failure", v: "metrics-test" }], at,
    "metricsplayer09", runProps("metricsrun000009", at, "daily"));
  const stats = await readStats(1, at);
  const ordinary = stats.runCohorts!.find(row => row.mode === "ordinary")!;
  assert.equal(ordinary.h.errors, 1);
  assert.match(renderLaunchMetrics(stats.runCohorts!, [], at), /СТОП: проверить/);
  assert.match(renderLaunchMetrics(stats.runCohorts!, [], at), /100\.0 \(1\/1\)/);
});

test("приглашения: только новые устройства с обычной партией, активные объединяются за период", async () => {
  const at = origin + 50 * DAY;
  const opening = { v: "ref-version", src: "src_books", referred: true };
  const props = { ...runProps("metricsrun000010", at), rv: "ref-version", rc: "books" };
  await send("metricsplayer10", [{ e: "open", p: opening }, { e: "start", p: props }], at);
  await Promise.all(Array.from({ length: 4 }, () => send("metricsplayer10", [
    { e: "resume", p: props }, { e: "open", p: opening },
  ], at + DAY)));
  await send("metricsplayer11", [{ e: "open", p: { ...opening, referred: false } }], at);
  await send("metricsplayer11", [{ e: "open", p: opening },
    { e: "start", p: { ...props, rid: "metricsrun000011" } }], at + DAY);
  await send("metricsplayer12", [{ e: "open", p: opening },
    { e: "start", p: { ...props, rid: "metricsrun000012", rm: "daily" } }], at);
  const traffic = (await readStats(2, at + DAY)).launchTraffic!;
  assert.deepEqual(traffic, [{ version: "ref-version", channel: "books", active: 2, referred: 1, newMeasured: 2 }]);
});

test("медиана и границы стоп-сигнала, незрелое окно, версии и HTML", () => {
  assert.equal(histogramMedian({ "s:10": 2, "s:30": 1, "s:50": 1 }, "s:"), 20);
  assert.equal(histogramMedian({}, "s:"), null);
  const row: RunCohort = { date: "2031-05-01", mode: "ordinary", version: "v1", source: "tg", channel: "books",
    h: { started: 100, metricsMeasured: 100, turn1: 10, resolved3d: 5, earlyDefeat: 2,
      resolvedShared: 1, errors: 2, "firstSeconds:60": 10, "resolvedTurns:4": 2, "resolvedTurns:20": 3 } };
  const now = Date.parse(row.date) + 4 * DAY;
  const html = renderLaunchMetrics([row, { ...row, version: "<script>", channel: "<bad>", h: {} }], [], now);
  assert.match(html, /5 \/ 10 · 50%/);
  assert.match(html, /2 \/ 10 · 20%/);
  assert.match(html, /1 \/ 5 · 20%/);
  assert.ok(!html.includes('<td>СТОП'), "ровно 2 ошибки/100 и 60 с не превышение");
  assert.ok(!html.includes('<script>'));
  assert.match(html, /&lt;script&gt;/);
  assert.match(renderLaunchMetrics([row], [], now - 1), /Окно открыто/);
  assert.match(renderLaunchMetrics([{ ...row, h: { ...row.h, errors: 3 } }], [], now), /<td>СТОП/);
  assert.match(renderLaunchMetrics([{ ...row, h: { ...row.h, "firstSeconds:60": 0, "firstSeconds:61": 10 } }], [], now), /<td>СТОП/);
});
