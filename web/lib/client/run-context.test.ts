import { test } from "node:test";
import assert from "node:assert/strict";
import { newAnalyticsRun, runProps, setRunContext, validAnalyticsRun } from "./run-context.ts";

test("канал партии переживает JSON и загрузку; старые сохранения допустимы, повреждённый канал — нет", () => {
  const original = { ...newAnalyticsRun("7.7", "tg", false), channel: "games" };
  const restored = JSON.parse(JSON.stringify(original));
  assert.ok(validAnalyticsRun(restored));
  setRunContext(restored);
  assert.equal(runProps().rc, "games");
  assert.equal(runProps().rs, "tg");
  assert.ok(!validAnalyticsRun({ ...original, channel: "bad|channel" }));
  const { channel, ...legacy } = original;
  assert.equal(channel, "games");
  assert.ok(validAnalyticsRun(legacy));
  setRunContext(undefined);
});

test("контекст переживает сериализацию, меняется для новой партии, прежние события сохраняют свой контекст", () => {
  const run = newAnalyticsRun("6.2", "tg", false);
  setRunContext(run);
  const queued = runProps();
  setRunContext(JSON.parse(JSON.stringify(run)));
  assert.deepEqual(runProps(), queued);
  const next = newAnalyticsRun("6.2", "web", true);
  setRunContext(next);
  assert.notEqual(runProps().rid, queued.rid);
  assert.equal(runProps().rm, "daily"); assert.equal(queued.rm, "ordinary");
  setRunContext(undefined); assert.deepEqual(runProps(), {});
  setRunContext({ ...run, startedAt: "bad" }); assert.deepEqual(runProps(), {});
});
