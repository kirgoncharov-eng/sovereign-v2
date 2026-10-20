// Положение дел в стране (#214): доверие людей, на кого опирается президент и кто против.
// Из него первый срок выбирает, какое дело придёт. Считается из текущего состояния, в сохранение не пишется.
import { computePolls } from './engine.ts';
import type { Bloc, Faction, GameState, Pact } from './types.ts';

// Доверие людей — рейтинг президента в опросе: ниже LOW люди не верят, выше HIGH — верят.
export const TRUST = { low: 35, high: 55 } as const;
export type TrustLevel = 'low' | 'middle' | 'high';

type ProfileState = Pick<GameState, 'country' | 'factions' | 'resources'> & { pacts?: Pact[] };

export function trustLevel(state: ProfileState): TrustLevel {
  const rating = computePolls(state.country, state.factions, state.resources).leader;
  return rating < TRUST.low ? 'low' : rating > TRUST.high ? 'high' : 'middle';
}

// Действует ли союз с лагерем этого блока.
export function hasPact(state: ProfileState, bloc: Bloc): boolean {
  return (state.pacts ?? []).some(pact => state.factions.find(group => group.id === pact.faction)?.bloc === bloc);
}

// Абсолютные пороги в первом сроке почти не срабатывают: к 10–15-му ходу доверие у всех стилей 34–42%, союзов нет.
// Поэтому дела чаще выбираются относительно: кто сейчас против президента сильнее всех, а кто — вернее всех.
// При равенстве побеждает первый по порядку лагерь: выбор детерминирован.
export function mostHostile(factions: Faction[]): Faction | null {
  return factions.reduce<Faction | null>((worst, group) => (!worst || group.relation < worst.relation ? group : worst), null);
}

export function mostLoyal(factions: Faction[]): Faction | null {
  return factions.reduce<Faction | null>((best, group) => (!best || group.relation > best.relation ? group : best), null);
}
