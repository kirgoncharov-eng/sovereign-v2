import { test } from "node:test";
import assert from "node:assert/strict";
import { newAnalyticsRun, runProps, setRunContext } from "./run-context.ts";

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
