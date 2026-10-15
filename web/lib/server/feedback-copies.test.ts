import test from 'node:test';
import assert from 'node:assert/strict';
import { kv } from './kv.ts';
import { deleteFeedbackCopies, feedbackCopiesKey, forwardFeedback, FB_CLEANUP } from './feedback-copies.ts';

process.env.TELEGRAM_BOT_TOKEN = 'test:feedback-copies';
const requests: { method: string; body: Record<string, unknown> }[] = [];
let reply: unknown = { ok: true, result: { message_id: 71 } };
let rejectRequest = false;
let cleanupAtDelete: string | null = null;
globalThis.fetch = (async (url: string, init?: { body?: string }) => {
  const request = { method: String(url).split('/').pop()!, body: JSON.parse(init?.body ?? '{}') };
  requests.push(request);
  if (request.method === 'deleteMessage' && request.body.chat_id === 902) {
    cleanupAtDelete = await kv.hget(FB_CLEANUP, '1102');
  }
  if (rejectRequest) throw new Error('network timeout');
  return Response.json(reply);
}) as typeof fetch;

test('admin copy keeps its original chat and message after the admin destination changes', async () => {
  await forwardFeedback(1101, 'feedback-a', 901, 'text');
  const copies = await kv.hgetall(feedbackCopiesKey(1101));
  assert.deepEqual(JSON.parse(copies['feedback-a']), { chat: 901, message: 71 });
  reply = { ok: true };
  assert.equal(await deleteFeedbackCopies(1101), 0);
  assert.deepEqual(requests.at(-1), { method: 'deleteMessage', body: { chat_id: 901, message_id: 71 } });
  assert.deepEqual(await kv.hgetall(feedbackCopiesKey(1101)), {});
});

test('failed deletion retains the exact copy reference, queues cleanup, and retries idempotently', async () => {
  reply = { ok: true, result: { message_id: 72 } };
  await forwardFeedback(1102, 'feedback-b', 902, 'text');
  reply = { ok: false, description: 'message cannot be deleted' };
  assert.equal(await deleteFeedbackCopies(1102, 1234), 1);
  assert.equal(cleanupAtDelete, '1234', 'cleanup is durable before the first Telegram call');
  assert.equal(await kv.hget(FB_CLEANUP, '1102'), '1234');
  assert.ok(await kv.hget(feedbackCopiesKey(1102), 'feedback-b'));
  reply = { ok: true };
  assert.equal(await deleteFeedbackCopies(1102), 0);
  assert.equal(await kv.hget(FB_CLEANUP, '1102'), null);
  const count = requests.length;
  assert.equal(await deleteFeedbackCopies(1102), 0);
  assert.equal(requests.length, count, 'already deleted copy is not sent again');
});

test('unknown send result remains searchable by feedback ID; explicit rejection creates no copy', async () => {
  rejectRequest = true;
  await forwardFeedback(1103, 'unknown-copy', 903, 'text');
  rejectRequest = false;
  assert.deepEqual(JSON.parse((await kv.hget(feedbackCopiesKey(1103), 'unknown-copy'))!), { chat: 903 });
  assert.match(String(requests.at(-1)?.body.text), /unknown-copy/);
  const count = requests.length;
  assert.equal(await deleteFeedbackCopies(1103), 1);
  assert.equal(requests.length, count, 'no invented message ID');
  reply = { ok: false };
  await forwardFeedback(1104, 'rejected-copy', 904, 'text');
  assert.equal(await kv.hget(feedbackCopiesKey(1104), 'rejected-copy'), null);
});
