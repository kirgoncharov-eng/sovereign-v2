import { test } from "node:test";
import assert from "node:assert/strict";
import { kv } from "./kv.ts";
import { forgetUser } from "./forget.ts";
import { FB_LIST } from "./feedback.ts";
import { FOLLOWUP } from "./followup.ts";

test("/forget: подписка, таблица, друзья и отзывы из бота стираются, чужие данные остаются", async () => {
  const now = Date.parse("2026-10-09T10:00:00Z"), today = "2026-10-09";
  await kv.sadd("t:subs", "77"); await kv.sadd("t:subs", "88");
  await kv.hset(FOLLOWUP, "77", "{}");
  await kv.zaddNx(`daily:${today}`, 500, "tg77"); await kv.zaddNx(`daily:${today}`, 400, "tg88");
  await kv.hset(`daily:${today}:info`, "tg77", "{}");
  await kv.sadd("friends:tg77", "tg88"); await kv.sadd("friends:tg88", "tg77");
  await kv.lpush(FB_LIST, JSON.stringify({ src: "bot", who: "@anna", text: "мой" }), 10);
  await kv.lpush(FB_LIST, JSON.stringify({ src: "bot", who: "@boris", text: "чужой" }), 10);
  await forgetUser(77, "@anna", "t:subs", "t:fb", now);
  assert.deepEqual(await kv.smembers("t:subs"), ["88"]);
  assert.equal(await kv.hget(FOLLOWUP, "77"), null);
  assert.equal(await kv.zscore(`daily:${today}`, "tg77"), null);
  assert.equal(await kv.zscore(`daily:${today}`, "tg88"), 400);
  assert.deepEqual(await kv.smembers("friends:tg88"), []);
  assert.deepEqual((await kv.lrange(FB_LIST, 10)).map(r => JSON.parse(r).text), ["чужой"]);
});
