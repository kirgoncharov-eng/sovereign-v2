import { test } from "node:test";
import assert from "node:assert/strict";
import { dayOf, readStats, record, renderStats } from "./analytics.ts";

const DAY = 864e5, t0 = Date.parse("2026-10-01T10:00:00Z");

test("аналитика: счётчики по дням, воронка, когорта возвращаемости, безопасная страница", async () => {
  // Без ключей Upstash хранилище живёт в памяти процесса.
  await record("player0001", [{ e: "open", p: { src: "tg" } }, { e: "start", p: { country: "Беларусь", diff: "coalition" } }, { e: "turn", p: { n: 1 } }], t0);
  await record("player0002", [{ e: "open", p: { src: "web" } }, { e: "start", p: { country: "<script>", diff: "crisis" } }], t0);
  await record("player0001", [{ e: "turn", p: { n: 2 } }, { e: "bogus" }], t0 + 60_000); // тот же день — не новый визит
  await record("player0001", [{ e: "open", p: { src: "tg" } }], t0 + DAY);              // вернулся на 1-й день
  const s = await readStats(2, t0 + DAY);
  const [d0, d1] = s.days;
  assert.equal(d0.date, dayOf(t0));
  assert.equal(d0.h.players, 2);
  assert.equal(d0.h.new, 2);
  assert.equal(d0.h.start, 2);
  assert.equal(d0.h["start|country=Беларусь"], 1);
  assert.equal(d0.h["turn|n=1"], 1);
  assert.equal(d0.h.bogus, undefined, "неизвестные события не пишутся");
  assert.equal(d1.h.players, 1);
  assert.equal(d1.h.new ?? 0, 0);
  assert.equal(s.cohorts.at(0)!.h.d0, 2);
  assert.equal(s.cohorts.at(0)!.h.d1, 1);
  const html = renderStats(s);
  assert.ok(html.includes("50%"), "возврат на 1-й день — половина когорты");
  assert.ok(!html.includes("<script>"), "значения от клиента экранируются или вычищаются");
});
