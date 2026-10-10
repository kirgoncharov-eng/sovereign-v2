import { test } from "node:test";
import assert from "node:assert/strict";
import { record, readStats } from "./analytics.ts";
import { renderDeskAnalytics } from "./desk-analytics.ts";

test("открытия и назначения — один рубеж партии после повторов/reload; знаменатель только увидевшие стол", async () => {
  const start = Date.parse("2028-04-01T12:00:00Z");
  const props = { rid: "deskmeasurement1", at: start, rv: "7.7", rs: "tg", rc: "games", rm: "ordinary" };
  await record("deskplayer001", [{ e: "start", p: props }], start);
  await record("deskplayer001", [{ e: "start", p: { ...props, rid: "deskmeasurement2" } }], start);
  const events = ["available", "messages", "government", "appointed"].map(kind => ({ e: "desk", p: { ...props, kind } }));
  await Promise.all(Array.from({ length: 4 }, () => record("deskplayer001", events, start + 1000)));
  await record("deskplayer001", [{ e: "desk", p: { ...props, kind: "messages", rc: "changed" } }], start + 864e5);
  const stats = await readStats(2, start + 864e5);
  const cohort = stats.runCohorts![0];
  assert.equal(cohort.h.started, 2);
  assert.equal(cohort.channel, "games");
  for (const name of ["deskAvailable", "deskOpened", "deskMessages", "deskGovernment", "deskAppointed"])
    assert.equal(cohort.h[name], 1, name);
  assert.ok(renderDeskAnalytics(stats.runCohorts!).includes("1 / 1 · 100%"));
  assert.ok(!renderDeskAnalytics(stats.runCohorts!).includes("50%"));
});

test("старые сохранения, неизвестное событие и дело дня не создают замер стола", async () => {
  const start = Date.parse("2028-05-01T12:00:00Z");
  const props = { rid: "deskmeasurement3", at: start, rv: "7.7", rs: "web", rm: "daily" };
  await record("deskplayer002", [
    { e: "desk", p: { kind: "messages" } },
    { e: "desk", p: { ...props, kind: "messages" } },
    { e: "desk", p: { ...props, rm: "ordinary", kind: "toString" } },
  ], start);
  assert.deepEqual((await readStats(1, start)).runCohorts, []);
  assert.ok(renderDeskAnalytics([]).includes("Пока нет партий"));
});
