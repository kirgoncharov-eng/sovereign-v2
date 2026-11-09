import { ALTERNATE_COUNTRY } from '../game/alternate-world.ts';
import { RESOURCE_KEYS } from '../game/data.ts';
import { applyDeltas, choiceEffects, clampRel, delayedEffects, successChance } from '../game/engine.ts';
import { executionRisk } from '../game/execution-risk.ts';
import type { Choice, GameState, ResourceDelta } from '../game/types.ts';

/** Известные расходы квартала отдельно от прогноза по новой подписи. */
export function quarterEconomyCosts(state: GameState) {
  if (state.country !== ALTERNATE_COUNTRY || state.daily || state.turn === 0) return null;
  const due = (state.pending ?? []).flatMap(entry => {
    const delta = entry.res.economy ?? 0;
    return entry.due <= state.turn + 1 && delta < 0 ? [{ id: entry.id, label: entry.label, delta }] : [];
  });
  const crises = state.activeCrises.flatMap(crisis => {
    const delta = crisis.resourceDrain.economy ?? 0;
    return delta < 0 ? [{ id: crisis.id, label: crisis.title, delta }] : [];
  });
  return due.length || crises.length ? { due, crises } : null;
}

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
  // Движок ставит эхо в очередь от конца подписываемого квартала. Срыв отменяет пользу по тегам,
  // но сохраняет отложенный вред; особое условие сделки вступает в силу только при исполнении.
  const tagged = delayedEffects(choice, state).map(effect => ({
    label: effect.label, res: effect.res, due: state.turn + 1 + effect.turns,
    onFailure: Object.values(effect.res).reduce((sum, value) => sum + (value ?? 0), 0) < 0,
  }));
  const deal = choice.deal?.later;
  const later = [...tagged, ...(deal ? [{ label: deal.label, res: deal.res, due: state.turn + 1 + deal.turns, onFailure: false }] : [])];
  return { success: outcome(false), failure: failurePercent ? outcome(true) : null, failurePercent,
    reason: executionRisk(state, choice)?.reason ?? null, later };
}
