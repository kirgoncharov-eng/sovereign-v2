import { ALTERNATE_COUNTRY } from '../game/alternate-world.ts';
import { RESOURCE_KEYS } from '../game/data.ts';
import { applyDeltas, choiceEffects, successChance } from '../game/engine.ts';
import type { Choice, GameState, ResourceDelta } from '../game/types.ts';

/** Только потери от самой подписи. Прежние платежи, кризисы и фон квартала сюда не входят. */
export function choicePrice(state: GameState, choice: Choice) {
  if (state.country !== ALTERNATE_COUNTRY) return null;

  const losses = (failed: boolean): ResourceDelta => {
    const after = applyDeltas(state.resources, choiceEffects(state, choice, failed).resources);
    return Object.fromEntries(RESOURCE_KEYS.flatMap(key => {
      const delta = after[key] - state.resources[key];
      return delta < 0 ? [[key, delta]] : [];
    }));
  };
  const failurePercent = Math.round((1 - successChance(state, choice)) * 100);
  return {
    success: losses(false),
    failure: failurePercent > 0 ? losses(true) : null,
    failurePercent,
  };
}
