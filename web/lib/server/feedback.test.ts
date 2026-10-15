import test from 'node:test';
import assert from 'node:assert/strict';
import { kv } from './kv.ts';
import { ADMIN, FB_LIST, readFeedback, saveFeedback } from './feedback.ts';
import { feedbackCopiesKey } from './feedback-copies.ts';
import { forgetUser } from './forget.ts';

process.env.TELEGRAM_BOT_TOKEN = 'test:feedback';
const deleted: unknown[] = [];
globalThis.fetch = (async (url: string, init?: { body?: string }) => {
  if (String(url).endsWith('/deleteMessage')) deleted.push(JSON.parse(init?.body ?? '{}'));
  return Response.json({ ok: true, result: { message_id: 201 } });
}) as typeof fetch;

test('bot feedback requires stable identity and supports an author without a display name', async () => {
  await kv.del(FB_LIST);
  await kv.del(ADMIN);
  await assert.rejects(saveFeedback({ src: 'bot', who: 'Alex', text: 'invalid', at: 'now' }), /verified Telegram/);
  assert.equal((await readFeedback()).length, 0);
  await saveFeedback({ src: 'bot', telegramUserId: 1701, text: 'valid without name', at: 'now' });
  const [feedback] = await readFeedback();
  assert.equal(feedback.telegramUserId, 1701);
  assert.ok(feedback.id);
  assert.equal(feedback.who, undefined);
});

test('copy can still be removed after its feedback is evicted from the 500-record list', async () => {
  await kv.hset(ADMIN, 'chat', '1901');
  await saveFeedback({ src: 'bot', telegramUserId: 1702, text: 'evicted feedback', at: 'now' });
  const [feedback] = await readFeedback(1);
  assert.ok(await kv.hget(feedbackCopiesKey(1702), feedback.id!));
  await kv.lpush(FB_LIST, JSON.stringify({ src: 'game', at: 'now', text: 'next record' }), 1);
  assert.equal((await readFeedback(1))[0].text, 'next record');
  const result = await forgetUser(1702, 'evicted:subs', 'evicted:state');
  assert.equal(result.removed, 0);
  assert.equal(result.copiesPending, 0);
  assert.deepEqual(deleted, [{ chat_id: 1901, message_id: 201 }]);
  assert.equal((await readFeedback(1))[0].text, 'next record');
});
