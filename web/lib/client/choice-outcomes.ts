import { ALTERNATE_COUNTRY } from '../game/alternate-world.ts';
import { CRISIS_THRESHOLD, LIMITS, RESOURCE_KEYS } from '../game/data.ts';
import { applyDeltas, choiceEffects, choiceFollowUps, clampRel, successChance, type FollowUpWhen } from '../game/engine.ts';
import { executionRisk } from '../game/execution-risk.ts';
import type { Choice, GameState, ResourceDelta, ResourceKey } from '../game/types.ts';
import type { Estimate } from './advisor-outlook.ts';

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

type QuarterForecast = {
  success: { resources: Partial<Record<ResourceKey, Estimate>> };
  failure: { resources: Partial<Record<ResourceKey, Estimate>> } | null;
  failureOmitted: boolean;
};

/** Отдельная ведомость риска, не итог квартала и не новый прогноз точнее доклада советников.
 * Порядок известных статей — как в planTurn: подпись, созревшие платежи, незакрытые кризисы.
 * Не читаем бросок исполнения, не включаем новые отложенные обещания и не меняем состояние.
 */
export function quarterRisk(state: GameState, choice: Choice, forecast: QuarterForecast) {
  if (state.country !== ALTERNATE_COUNTRY || state.daily) return [];
  const branches = [
    { id: 'success' as const, outcome: forecast.success },
    ...(!forecast.failureOmitted && forecast.failure ? [{ id: 'failure' as const, outcome: forecast.failure }] : []),
  ];
  return branches.flatMap(({ id, outcome }) => RESOURCE_KEYS.flatMap(key => {
    const estimate = outcome.resources[key];
    const known = !!estimate && (estimate.known || estimate.source.skill > 0);
    const decision = known ? estimate.value : 0;
    const charges = [
      ...(state.pending ?? []).filter(item => item.due <= state.turn + 1 && item.res[key])
        .map(item => ({ label: item.label, delta: item.res[key]!, kind: 'payment' as const })),
      ...(state.activeCrises ?? []).filter(crisis => crisis.resourceDrain[key]
        && !(id === 'success' && choice.resolvesCrisis === crisis.id))
        .map(crisis => ({ label: crisis.title, delta: crisis.resourceDrain[key]!, kind: 'crisis' as const })),
    ];
    let remaining = applyDeltas(state.resources, { [key]: decision })[key];
    for (const charge of charges) remaining = applyDeltas({ ...state.resources, [key]: remaining }, { [key]: charge.delta })[key];
    if (remaining >= CRISIS_THRESHOLD) return [];
    return [{ key, branch: id, current: state.resources[key], decision: known ? estimate!.text : null, charges, remaining,
      // Численный остаток нельзя восстанавливать из стрелок, «?» или умолчания советника.
      exact: known && /^[+−]?\d+$/.test(estimate!.text),
      level: remaining <= LIMITS.endResource ? 'collapse' as const : 'crisis' as const }];
  }));
}
