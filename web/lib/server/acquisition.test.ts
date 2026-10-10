import { test } from "node:test";
import assert from "node:assert/strict";
import { readStats, record } from "./analytics.ts";
import { renderAcquisition } from "./acquisition.ts";

const DAY = 864e5;
test("метка максимальной длины не обрезается в open|src", async () => {
  const now = Date.parse("2028-06-01T12:00:00Z");
  const channel = "a".repeat(24);
  await record("acquisition005", [{ e: "open", p: { src: `src_${channel}`, v: "7.7" } }], now);
  const stats = await readStats(1, now);
  assert.equal(stats.days[0].h[`open|src=src_${channel}`], 1);
});
test("D1/D7 принадлежат первому каналу и версии; повторы и новые ссылки не меняют когорту", async () => {
  const start = Date.parse("2028-01-01T12:00:00Z");
  await record("acquisition001", [{ e: "open", p: { src: "src_games", v: "7.7" } }], start);
  await Promise.all(Array.from({ length: 4 }, () => record("acquisition001", [
    { e: "open", p: { src: "src_other", v: "9.0" } },
  ], start + DAY)));
  await record("acquisition001", [{ e: "resume" }], start + 7 * DAY);
  const stats = await readStats(9, start + 8 * DAY);
  assert.equal(stats.acquisition?.length, 1);
  assert.deepEqual(stats.acquisition![0], {
    date: "2028-01-01", version: "7.7", channel: "games", h: { d0: 1, d1: 1, d7: 1 },
  });
  const html = renderAcquisition(stats.acquisition!, [], start + DAY);
  assert.ok(!html.includes("100%"), "день D1 ещё не закончен");
  assert.ok(renderAcquisition(stats.acquisition!, [], start + 8 * DAY).includes("1 / 1 · 100%"));
});

test("канал партии сохраняется; 20-й ход и ранний финал в 3 дня считаются один раз, поздний финал — нет", async () => {
  const start = Date.parse("2028-02-01T12:00:00Z");
  const props = { rid: "acquisitionrun01", at: start, rv: "7.7", rs: "tg", rc: "games", rm: "ordinary" };
  await record("acquisition002", [{ e: "turn", p: { ...props, n: 1 } }], start);
  await record("acquisition002", [{ e: "turn", p: { ...props, n: 20 } }], start + 2 * DAY);
  await record("acquisition002", [{ e: "end", p: { ...props, rc: "other", turns: 24 } }], start + 2 * DAY);
  await record("acquisition003", [{ e: "end", p: { ...props, rid: "acquisitionrun02", turns: 4 } }], start + DAY);
  await record("acquisition004", [{ e: "end", p: { ...props, rid: "acquisitionrun03", turns: 5 } }], start + 4 * DAY);
  const runs = (await readStats(6, start + 5 * DAY)).runCohorts!;
  assert.equal(runs.length, 1);
  assert.equal(runs[0].channel, "games");
  assert.equal(runs[0].h.turn1, 3);
  assert.equal(runs[0].h.resolved3d, 2);
  assert.ok(renderAcquisition([], runs, start + 5 * DAY).includes("2 / 3 · 67%"));
});
