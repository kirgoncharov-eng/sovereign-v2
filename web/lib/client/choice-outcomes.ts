import { ALTERNATE_COUNTRY } from '../game/alternate-world.ts';
import { RESOURCE_KEYS } from '../game/data.ts';
import { applyDeltas, choiceEffects, choiceFollowUps, clampRel, successChance, type FollowUpWhen } from '../game/engine.ts';
import { executionRisk } from '../game/execution-risk.ts';
import type { Choice, GameState, ResourceDelta } from '../game/types.ts';

export const FOLLOW_UP_CONDITION: Record<FollowUpWhen, string> = {
  success: 'При исполнении.',
  failure: 'Только при срыве.',
  both: 'Сохраняется при срыве.',
};

/** Прогноз самой резолюции, включая пользу. Долг и фон квартала сюда не подмешиваются. */
export function choiceOutcomes(state: GameState, choice: Choice) {
  if (state.country !== ALTERNATE_COUNTRY) return null;
  const outcome = (failed: boolean) => {
    const effects = choiceEffects(state, choice, failed);
    const after = applyDeltas(state.resources, effects.resources);
    return {
      resources: Object.fromEntries(RESOURCE_KEYS.map(key => [key, after[key] - state.resources[key]])) as ResourceDelta,
      camps: state.factions.flatMap(faction => {
        const delta = clampRel(faction.relation + (effects.factionRel[faction.id] ?? 0)) - faction.relation;
        return delta ? [{ name: faction.name, delta }] : [];
      }),
    };
  };
  const failurePercent = Math.round((1 - successChance(state, choice)) * 100);
  // Движок считает сроки от конца подписываемого квартала.
  const later = choiceFollowUps(state, choice).map(({ label, res, turns, when, payment }) => ({
    label, res, due: state.turn + 1 + turns, when, payment,
  }));
  return { success: outcome(false), failure: failurePercent ? outcome(true) : null, failurePercent,
    reason: executionRisk(state, choice)?.reason ?? null, later };
}
