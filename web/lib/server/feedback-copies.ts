// Копии отзывов живут отдельно от последних 500 записей: вытеснение из списка не теряет адрес копии.
import { kv } from './kv.ts';
import { botApi } from './telegram.ts';

export const FB_CLEANUP = 'fb:cleanup'; // userId → время запроса ручной очистки; без текста отзыва
export const feedbackCopiesKey = (userId: number) => `fb:copies:${userId}`;

interface FeedbackCopy {
  chat: number;
  message?: number;
}
interface TelegramResult { ok?: boolean; result?: { message_id?: number } }

export async function forwardFeedback(userId: number, feedbackId: string, chat: number, text: string) {
  const key = feedbackCopiesKey(userId);
  // Намерение сохраняется до отправки. Таймаут не доказывает, что Telegram не создал сообщение.
  await kv.hset(key, feedbackId, JSON.stringify({ chat }));
  let result: TelegramResult | null;
  try {
    result = await botApi('sendMessage', {
      chat_id: chat, text: `${text}\n<code>Отзыв ${feedbackId}</code>`, parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    }) as TelegramResult | null;
  } catch {
    return; // Неизвестный результат сохраняет маркер для ручного поиска по feedbackId.
  }
  if (result?.ok === false) {
    await kv.hdel(key, feedbackId); // Telegram явно отказал: копия не создана.
  } else if (result?.ok && Number.isSafeInteger(result.result?.message_id)) {
    await kv.hset(key, feedbackId, JSON.stringify({ chat, message: result.result!.message_id }));
  }
}

export async function deleteFeedbackCopies(userId: number, now = Date.now()): Promise<number> {
  const key = feedbackCopiesKey(userId);
  const copies = await kv.hgetall(key);
  // Если процесс остановится посреди вызовов Telegram, запрос уже останется в очереди.
  if (Object.keys(copies).length) await kv.hset(FB_CLEANUP, String(userId), String(now));
  let pending = 0;
  for (const [feedbackId, raw] of Object.entries(copies)) {
    let copy: FeedbackCopy;
    try { copy = JSON.parse(raw); } catch { pending++; continue; }
    let deleted = false;
    if (copy && Number.isSafeInteger(copy.chat) && Number.isSafeInteger(copy.message)) {
      const result = await botApi('deleteMessage', { chat_id: copy.chat, message_id: copy.message })
        .catch(() => null) as { ok?: boolean } | null;
      deleted = result?.ok === true;
    }
    if (deleted) await kv.hdel(key, feedbackId);
    else pending++;
  }
  // Не объявляем отказ/таймаут удалением. Повторный /forget повторяет попытку, очередь доступна автору.
  if (pending) await kv.hset(FB_CLEANUP, String(userId), String(now));
  else await kv.hdel(FB_CLEANUP, String(userId));
  return pending;
}
