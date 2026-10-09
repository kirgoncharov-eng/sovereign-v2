import { localTurn, termIndex, TERM } from './data.ts';
import type { GameState } from './types.ts';

// Ключ дела содержит исходный квартал. Он остаётся тем же после переноса и сохранения.
// Предвыборные дела живут до соответствующих выборов; разговоры — до следующего окна.
export function calendarSlot(state: GameState, prefix: string, slots: readonly number[], last: readonly number[]): number | null {
  const turn = state.turn + 1;
  const offset = termIndex(turn) * TERM;
  const used = state.usedEvents ?? [];
  for (let i = 0; i < slots.length; i++) {
    const slot = offset + slots[i];
    const due = state.daily ? turn === slot : turn >= slot && turn <= offset + last[i];
    if (due && !used.some(id => id === `${prefix}:${slot}` || id.startsWith(`${prefix}:${slot}:`))) return slot;
  }
  return null;
}

export function calendarEpisode(state: GameState, slots: readonly number[]): number {
  const planned = Number(state.currentEvent?.card?.split(':')[1]);
  return Math.max(0, slots.indexOf(localTurn(Number.isFinite(planned) ? planned : state.turn + 1)));
}
