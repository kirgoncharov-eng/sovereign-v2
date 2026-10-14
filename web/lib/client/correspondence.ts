import type { GameState } from '../game/types.ts';
import { messageUnread, presidentialMessages, type PresidentialMessage } from './presidential-inbox.ts';

// Это последние письма по живым делам, а не архив с выдуманными датами доставки.
export function correspondence(gs: GameState): PresidentialMessage[] {
  return presidentialMessages(gs).sort((first, second) =>
    Number(second.needsReply) - Number(first.needsReply)
    || (first.needsReply && second.needsReply ? (first.deadline ?? Infinity) - (second.deadline ?? Infinity) : 0)
    || Number(messageUnread(gs, second)) - Number(messageUnread(gs, first)));
}

export function correspondenceStatus(gs: GameState, message: PresidentialMessage): string {
  if (message.needsReply) {
    return message.deadline === undefined ? 'Ждёт решения'
      : `Ответ до конца квартала ${message.deadline}`;
  }
  return messageUnread(gs, message) ? 'Не прочитано' : 'Прочитано';
}

export function correspondenceSubject(message: PresidentialMessage): string {
  if (message.action === 'energy') return 'Энергосеть';
  if (message.action === 'health') return 'Больницы';
  if (message.action === 'evidence') return 'Особая папка';
  if (message.action === 'minister') return 'Полномочия';
  if (message.action === 'sponsor') return 'Поставки';
  return 'Правительство';
}
