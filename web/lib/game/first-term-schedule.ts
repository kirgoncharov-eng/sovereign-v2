import { ALTERNATE_EVENTS } from '../content/alternate-history.ts';
import { ALTERNATE_COUNTRY } from './alternate-world.ts';
import type { GameState } from './types.ts';

export const FIRST_TERM_CASES: Readonly<Record<number, string>> = {
  1: 'alt_wages',
  4: 'alt_harvest',
  5: 'alt_fuel',
  6: 'alt_radio',
  10: 'alt_rail',
  13: 'alt_district',
  15: 'alt_standards',
  20: 'alt_archive',
};

// Версии дел по положению дел в стране (#214): дело → его версии в порядке проверки (поле `versionOf` в условиях).
// Версия приходит вместо дела там, где пришло бы оно само, — и в свой ход, и когда сезон переставил дело.
export function versionsOf(cardId: string): string[] {
  return ALTERNATE_EVENTS.filter(card => card.when?.versionOf === cardId).map(card => card.id);
}

// Дела, вместо которых уже пришла версия: они заменены и в другие ходы срока не переходят.
export function replacedCases(state: Pick<GameState, 'usedEvents'>): string[] {
  return ALTERNATE_EVENTS.filter(card => card.when?.versionOf && state.usedEvents.includes(card.id)).map(card => card.when!.versionOf!);
}

export function scheduledFirstTerm(state: GameState): boolean {
  return state.country === ALTERNATE_COUNTRY && !state.daily && state.turn < 20;
}

// Дело подписано — оно само или его версия по положению дел (#214).
export function signedCaseOrVersion(state: GameState, cardId: string): boolean {
  return [cardId, ...versionsOf(cardId)].some(id => signedHistoricalCase(state, id));
}

export function signedHistoricalCase(state: GameState, cardId: string): boolean {
  const card = ALTERNATE_EVENTS.find(entry => entry.id === cardId);
  return !!card && state.history.some(entry => entry.title === card.title);
}

export function firstTermLaw(state: GameState): string {
  const wages = ALTERNATE_EVENTS.find(card => card.id === 'alt_wages')!;
  const advance = state.history.find(entry => entry.title === wages.title);
  return advance?.choice === wages.choices[1].text && advance.success === true
    ? 'alt_export_guarantee' : 'alt_open_orders';
}
