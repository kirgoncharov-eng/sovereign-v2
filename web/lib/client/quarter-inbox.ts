import { ALTERNATE_COUNTRY } from '../game/alternate-world.ts';
import { validDailyMoves } from '../game/daily-run.ts';
import { isObj } from '../game/sanitize.ts';
import type { Choice, DailyMove, GameState } from '../game/types.ts';

export const quarterInboxEnabled = (state: GameState): boolean => state.country === ALTERNATE_COUNTRY && !state.daily;

// A prepared resolution is an instruction for the existing resolver, never a second turn calculation.
export function quarterResolution(state: GameState): Choice | null {
  const draft = state.quarterDraft;
  if (!quarterInboxEnabled(state) || state.ended || !state.currentEvent || !draft
    || draft.turn !== state.turn || draft.event !== state.currentEvent.title) return null;
  return [...state.currentEvent.choices, ...(state.currentEvent.council ?? [])].find(choice => choice.id === draft.move.id) ?? null;
}

export function prepareQuarterResolution(state: GameState, choiceId: string, details: Omit<DailyMove, 'id'> = {}): GameState {
  const move = { ...details, id: choiceId };
  const next = { ...state, quarterDraft: { turn: state.turn, event: state.currentEvent?.title ?? '', move } };
  if (!validDailyMoves([move]) || !quarterResolution(next)) throw new Error('Резолюция не относится к текущему делу');
  return next;
}

export function withoutQuarterDraft(state: GameState): GameState {
  const next = { ...state };
  delete next.quarterDraft;
  return next;
}

// Optional UI data must not make an otherwise valid old campaign unloadable.
export function validQuarterDraft(state: GameState): boolean {
  const draft = state.quarterDraft;
  return isObj(draft) && Number.isInteger(draft.turn) && typeof draft.event === 'string'
    && isObj(draft.move) && validDailyMoves([draft.move]) && !!quarterResolution(state);
}
