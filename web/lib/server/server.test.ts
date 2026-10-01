import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyInitData } from "./telegram.ts";
import { kv } from "./kv.ts";

function signed(fields: Record<string, string>, token: string) {
  const check = Object.entries(fields).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const hash = createHmac("sha256", secret).update(check).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
}

test("подпись Telegram: верная принимается, подделанная и просроченная — нет", () => {
  const now = Date.now();
  const fields = { auth_date: String(Math.floor(now / 1000)), user: JSON.stringify({ id: 42, first_name: "Анна" }), query_id: "q1" };
  const good = signed(fields, "123:ABC");
  assert.equal(verifyInitData(good, "123:ABC", 86400, now)?.id, 42);
  assert.equal(verifyInitData(good, "999:XYZ", 86400, now), null);
  assert.equal(verifyInitData(good.replace("42", "43"), "123:ABC", 86400, now), null);
  assert.equal(verifyInitData(good, "123:ABC", 60, now + 3600_000), null);
});

test("таблица дня: засчитывается только первая попытка", async () => {
  assert.equal(await kv.zaddNx("t:day", 500, "wabc12345"), true);
  assert.equal(await kv.zaddNx("t:day", 900, "wabc12345"), false);
  await kv.zaddNx("t:day", 700, "tg1");
  assert.deepEqual(await kv.ztop("t:day", 5), [["tg1", 700], ["wabc12345", 500]]);
  assert.equal(await kv.zrank("t:day", "wabc12345"), 1);
});

test("очки партии: выживание и переизбрание ценятся выше раннего падения", async () => {
  const { runScore } = await import("../game/daily.ts");
  const { createInitialState } = await import("../game/engine.ts");
  const s = createInitialState("Беларусь", "coalition", "liberal", { leader: { name: "А Б", party: "П", bio: "" }, speech: "", situation: "", players: [], advisors: [] }, () => 0.5);
  const fell = runScore({ ...s, turn: 4, endType: "collapse" });
  const won = runScore({ ...s, turn: 20, endType: "reelected" });
  assert.ok(won > fell + 800);
});
