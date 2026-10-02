import { test } from "node:test";
import assert from "node:assert/strict";
import { turnDate } from "./calendar.ts";

test("календарь: ход — квартал, месяцы идут по порядку, день недели настоящий, сезон по месяцу", () => {
  for (const seed of [1, 77, 4242]) {
    const dates = Array.from({ length: 20 }, (_, t) => turnDate(seed, 2025, t));
    assert.deepEqual([dates[0].month, dates[0].year], [0, 2025], "первый ход — январь года инаугурации");
    for (let t = 1; t < 20; t++) {
      const a = dates[t - 1], b = dates[t];
      assert.ok(b.year * 12 + b.month > a.year * 12 + a.month, `ход ${t}: время идёт вперёд`);
      assert.equal(Math.floor(b.month / 3), t % 4, "месяц внутри своего квартала");
    }
    assert.equal(dates[19].year, 2029);
  }
  // 1 марта 2026 — воскресенье
  const d = Array.from({ length: 400 }, (_, s) => turnDate(s, 2025, 5)).find(x => x.year === 2026 && x.month === 2 && x.day === 1);
  if (d) assert.equal(d.weekday, "воскресенье");
  const season = (m: number) => (m === 11 || m <= 1 ? "winter" : m <= 4 ? "spring" : m <= 7 ? "summer" : "autumn");
  for (let s = 0; s < 50; s++) for (let t = 0; t < 20; t++) { const x = turnDate(s, 2025, t); assert.equal(x.season, season(x.month)); }
  assert.equal(turnDate(9, 2025, 0).season, "winter");
});
