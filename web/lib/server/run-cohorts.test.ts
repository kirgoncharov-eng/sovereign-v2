import { test } from "node:test";
import assert from "node:assert/strict";
import { record, readStats, renderStats } from "./analytics.ts";

const day = 864e5, start = Date.parse("2027-01-01T23:58:00Z");
const props = (id: string, mode = "ordinary") => ({ rid: id, at: start, rv: "6.2", rs: "tg", rm: mode });

test("партия остаётся в дне старта: повторный старт, загрузки, финалы и параллельные пакеты не раздувают рубежи", async () => {
  const p = props("0123456789abcdef");
  await record("runplayer01", [{ e: "start", p }], start);
  await Promise.all(Array.from({ length: 4 }, () => record("runplayer01", [
    { e: "start", p }, { e: "resume", p }, { e: "end", p: { ...p, turns: 12 } }, { e: "share", p },
  ], start + day)));
  const stats = await readStats(2, start + day);
  assert.equal(stats.runCohorts?.length, 1);
  const c = stats.runCohorts![0];
  assert.equal(c.date, "2027-01-01");
  for (const k of ["started", "resumed", "ended", "shareAttempt", "turn1", "turn3", "turn5", "turn10"]) assert.equal(c.h[k], 1, k);
  assert.equal(c.h.turn20, undefined);
  assert.ok(renderStats(stats).includes("Новая когорта"));
  assert.ok(renderStats(stats).includes("не подтверждённая отправка"));
});

test("поздний первый пакет восстанавливает старт; разные партии и режимы считаются отдельно; метаданные фиксируются", async () => {
  const start = Date.parse("2027-01-10T23:58:00Z");
  const p = { ...props("fedcba9876543210"), at: start };
  await record("runplayer02", [{ e: "turn", p: { ...p, n: 5 } }], start + day);
  await record("runplayer02", [{ e: "start", p: { ...p, rv: "9.0", rm: "daily", at: start + day } }], start + day);
  await record("runplayer02", [{ e: "start", p: { ...props("aaaaaaaaaaaaaaaa", "daily"), at: start } }, { e: "start", p: { ...props("bbbbbbbbbbbbbbbb", "daily"), at: start } }], start + day);
  const cohorts = (await readStats(2, start + day)).runCohorts!;
  assert.equal(cohorts.length, 2);
  const ordinary = cohorts.find(c => c.mode === "ordinary")!, daily = cohorts.find(c => c.mode === "daily")!;
  assert.equal(ordinary.version, "6.2"); assert.equal(ordinary.h.started, 1); assert.equal(ordinary.h.turn5, 1);
  assert.equal(daily.h.started, 2);
});

test("старые сохранения и повреждённые метаданные не создают ложных когорт", async () => {
  const now = Date.parse("2027-03-01T10:00:00Z");
  const p = { ...props("cccccccccccccccc"), at: now };
  await record("runplayer03", [
    { e: "resume" }, { e: "end", p: { turns: 40 } },
    { e: "start", p: { ...p, rv: "<script>" } }, { e: "start", p: { ...p, at: now + day } },
    { e: "start", p: { ...p, at: now - 121 * day } }, { e: "start", p: { ...p, rid: "bad" } },
  ], now);
  const stats = await readStats(1, now);
  assert.equal(stats.runCohorts?.length, 0);
  assert.equal(stats.days[0].h.end, 1, "исторические счётчики сохранены отдельно");
});
