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

// Версии дел по положению дел в стране (#214): ход → дела, проверяемые по порядку раньше прежнего.
// Условия каждой версии — в её `when` (доверие людей, союз, отношение лагеря) вместе с `slot`.
export const FIRST_TERM_VERSIONS: Readonly<Record<number, readonly string[]>> = {};

export function scheduledFirstTerm(state: GameState): boolean {
  return state.country === ALTERNATE_COUNTRY && !state.daily && state.turn < 20;
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
