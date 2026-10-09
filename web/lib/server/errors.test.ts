import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeError, parseErrors, readErrors, recordErrors } from "./errors.ts";

test("ошибки игроков: одинаковые сбои с разными числами сворачиваются в одну строку", () => {
  assert.equal(normalizeError("TypeError: Cannot read properties of undefined (reading 'x') at 123:45"),
    "TypeError: Cannot read properties of undefined (reading 'x') at N:N");
  assert.equal(normalizeError("Failed https://x.io/a?b=1 id deadbeef12"), "Failed <url> id <id>");
});

test("ошибки игроков: мусор отбрасывается, счётчик по версии и виду", async () => {
  const items = parseErrors([{ kind: "js", msg: "Boom 1", v: "7.7" }, { kind: "hack", msg: "x" }, { kind: "js", msg: "" }, null, { kind: "js", msg: "Boom 2", v: "7.7" }]);
  assert.equal(items.length, 2);
  const now = Date.parse("2026-10-09T10:00:00Z");
  await recordErrors(items, now);
  const rows = await readErrors(["2026-10-09"]);
  assert.deepEqual(rows.map(r => [r.v, r.kind, r.msg, r.count]), [["7.7", "js", "Boom N", 2]]);
});
