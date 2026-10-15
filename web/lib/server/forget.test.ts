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
  await kv.lpush(FB_LIST, JSON.stringify({ src: "bot", telegramUserId: 77, who: "@anna", text: "мой" }), 10);
  await kv.lpush(FB_LIST, JSON.stringify({ src: "bot", telegramUserId: 88, who: "@boris", text: "чужой" }), 10);
  await forgetUser(77, "t:subs", "t:fb", now);
  assert.deepEqual(await kv.smembers("t:subs"), ["88"]);
  assert.equal(await kv.hget(FOLLOWUP, "77"), null);
  assert.equal(await kv.zscore(`daily:${today}`, "tg77"), null);
  assert.equal(await kv.zscore(`daily:${today}`, "tg88"), 400);
  assert.deepEqual(await kv.smembers("friends:tg88"), []);
  assert.deepEqual((await kv.lrange(FB_LIST, 10)).map(r => JSON.parse(r).text), ["чужой"]);
});


test('/forget removes historical version tables without deleting other players', async () => {
  const now = Date.UTC(2026, 9, 14);
  const date = '2026-10-14';
  for (const key of [`daily:${date}:v8.0`, `daily:${date}:v8.1`]) {
    await kv.sadd(`daily:${date}:editions`, key);
    await kv.zaddNx(key, 500, 'tg901');
    await kv.zaddNx(key, 400, 'tg902');
    await kv.hset(`${key}:info`, 'tg901', '{}');
  }
  await forgetUser(901, 'test:historical:subs', 'test:historical:feedback', now);
  for (const key of [`daily:${date}:v8.0`, `daily:${date}:v8.1`]) {
    assert.equal(await kv.zscore(key, 'tg901'), null);
    assert.equal(await kv.hget(`${key}:info`, 'tg901'), null);
    assert.equal(await kv.zscore(key, 'tg902'), 400);
  }
});

test('stable authorship survives renamed usernames, identical first names, missing names and legacy data', async () => {
  await kv.del(FB_LIST);
  const records = [
    { src: 'bot', telegramUserId: 1201, who: '@oldname', text: 'renamed' },
    { src: 'bot', telegramUserId: 1201, who: 'Alex', text: 'same first name' },
    { src: 'bot', telegramUserId: 1201, text: 'no name' },
    { src: 'bot', telegramUserId: 1202, who: 'Alex', text: 'other Alex' },
    { src: 'bot', who: '@oldname', text: 'legacy author unknown' },
    { src: 'game', text: 'anonymous game feedback' },
  ];
  for (const record of records) await kv.lpush(FB_LIST, JSON.stringify(record), 1000);
  const result = await forgetUser(1201, 'stable:subs', 'stable:state');
  assert.equal(result.removed, 3);
  const texts = (await kv.lrange(FB_LIST, 1000)).map(raw => JSON.parse(raw).text);
  assert.deepEqual(texts.sort(), ['other Alex', 'legacy author unknown', 'anonymous game feedback'].sort());
  assert.equal((await forgetUser(1201, 'stable:subs', 'stable:state')).removed, 0);
});

test('Daily cleanup covers late submissions four dates back and tomorrow, including all versions', async () => {
  const now = Date.UTC(2026, 9, 15, 23, 59);
  for (const date of ['2026-10-11', '2026-10-12', '2026-10-16']) {
    const key = `daily:${date}:vtest-delete`;
    await kv.sadd(`daily:${date}:editions`, key);
    for (const user of ['tg1301', 'tg1302']) {
      await kv.zaddNx(key, 123, user);
      await kv.hset(`${key}:info`, user, 'name');
    }
  }
  await forgetUser(1301, 'late:subs', 'late:fb', now);
  for (const date of ['2026-10-11', '2026-10-12', '2026-10-16']) {
    const key = `daily:${date}:vtest-delete`;
    assert.equal(await kv.zscore(key, 'tg1301'), null);
    assert.equal(await kv.hget(`${key}:info`, 'tg1301'), null);
    assert.equal(await kv.zscore(key, 'tg1302'), 123);
    assert.equal(await kv.hget(`${key}:info`, 'tg1302'), 'name');
  }
});

test('removing a feedback record never overwrites a concurrent submission', async () => {
  await kv.del(FB_LIST);
  await kv.lpush(FB_LIST, JSON.stringify({ src: 'bot', telegramUserId: 1401, text: 'remove' }), 1000);
  const original = kv.lrem;
  kv.lrem = async (key, value) => {
    await kv.lpush(FB_LIST, JSON.stringify({ src: 'bot', telegramUserId: 1402, text: 'arrived meanwhile' }), 1000);
    await original(key, value);
  };
  try { await forgetUser(1401, 'concurrent:subs', 'concurrent:state'); }
  finally { kv.lrem = original; }
  assert.deepEqual((await kv.lrange(FB_LIST, 1000)).map(raw => JSON.parse(raw).text), ['arrived meanwhile']);
});
