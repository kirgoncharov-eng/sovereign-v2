// Представление прогноза: движок знает точный расчёт, президент получает оценку своей команды.
import { ALTERNATE_COUNTRY } from '../game/alternate-world.ts';
import { RESOURCE_KEYS } from '../game/data.ts';
import { pairFor } from '../game/forecasts.ts';
import type { Choice, GameState, ResourceKey } from '../game/types.ts';
import { choiceOutcomes } from './choice-outcomes.ts';

type Skill = 0 | 1 | 2 | 3;
export interface OutlookSource { name: string; role: string; skill: Skill }
export interface Estimate { min: number; max: number; text: string }

const PROFILE: Record<ResourceKey, string> = {
  economy: 'economist', military: 'security', externalReputation: 'diplomat',
  internalLegitimacy: 'strategist', politicalCapital: 'strategist', personalResource: 'strategist',
};
const STEP: Record<Skill, number> = { 0: 16, 1: 8, 2: 4, 3: 2 };
const RISK_STEP: Record<Skill, number> = { 0: 80, 1: 40, 2: 20, 3: 10 };
export const OUTLOOK_QUALITY: Record<Skill, string> = {
  0: 'без профильного советника', 1: 'грубая оценка', 2: 'рабочая оценка', 3: 'подробная оценка',
};
export const signedEstimate = (value: number) => value === 0 ? '0' : `${value < 0 ? '−' : '+'}${Math.abs(value)}`;
const estimate = (min: number, max: number): Estimate => ({ min, max,
  text: min === max ? signedEstimate(min) : `${signedEstimate(min)}…${signedEstimate(max)}` });
const bounded = (range: Estimate, min: number, max: number) => estimate(Math.max(min, range.min), Math.min(max, range.max));

export const usesAdvisorOutlook = (state: Pick<GameState, 'country' | 'daily'>) =>
  state.country === ALTERNATE_COUNTRY && !state.daily;

function sourceFor(state: GameState, id: string): OutlookSource {
  const advisor = state.advisors.find(member => member.id === id);
  return advisor ? { name: advisor.name, role: advisor.role, skill: advisor.skill }
    : { name: 'Канцелярия', role: 'профильный советник не назначен', skill: 0 };
}

/** Вложенные интервалы округления, без случайной ошибки и без знания выпавшего исхода. */
export function estimateDelta(value: number, skill: Skill, known = false): Estimate {
  if (!value || known) return estimate(value, value);
  const low = Math.floor((Math.abs(value) - 1) / STEP[skill]) * STEP[skill] + 1;
  const high = low + STEP[skill] - 1;
  const min = value < 0 ? -high : low, max = value < 0 ? -low : high;
  return estimate(min, max);
}

export function advisorOutlook(state: GameState, choice: Choice, raw = choiceOutcomes(state, choice)) {
  if (!usesAdvisorOutlook(state) || !raw) return null;
  const sources = Object.fromEntries(RESOURCE_KEYS.map(key => [key, sourceFor(state, PROFILE[key])])) as Record<ResourceKey, OutlookSource>;
  const resourceEstimate = (key: ResourceKey, value: number) => bounded(estimateDelta(value, sources[key].skill,
    // Личные затраты — работа над самой подписью. Явный денежный платёж чистой сделки также известен.
    (key === 'personalResource' && value <= 0)
      || (key === 'economy' && !!choice.deal?.pure && (choice.deal.res?.economy ?? 0) < 0)),
    -state.resources[key], 100 - state.resources[key]);
  const outcome = (branch: typeof raw.success) => ({
    resources: Object.fromEntries(RESOURCE_KEYS.map(key => [key, resourceEstimate(key, branch.resources[key] ?? 0)])) as Record<ResourceKey, Estimate>,
    camps: branch.camps.map(camp => {
      const faction = state.factions.find(faction => faction.name === camp.name);
      const bloc = faction?.bloc;
      const id = bloc === 'security' ? 'security' : bloc === 'business' ? 'economist'
        : bloc === 'west' || bloc === 'russia' ? 'diplomat' : 'strategist';
      const source = sourceFor(state, id);
      const relation = faction?.relation ?? 0;
      return { name: camp.name, source, estimate: bounded(estimateDelta(camp.delta, source.skill), -100 - relation, 100 - relation) };
    }),
  });
  const riskId = choice.advisor?.id ?? (state.currentEvent ? pairFor(state, state.currentEvent)[0] : 'economist');
  const riskSource = sourceFor(state, riskId);
  const riskMin = raw.failurePercent ? Math.floor((raw.failurePercent - 1) / RISK_STEP[riskSource.skill]) * RISK_STEP[riskSource.skill] + 1 : 0;
  const riskMax = raw.failurePercent ? Math.min(100, riskMin + RISK_STEP[riskSource.skill] - 1) : 0;
  return {
    sources, success: outcome(raw.success), failure: raw.failure ? outcome(raw.failure) : null,
    risk: { min: riskMin, max: riskMax, source: riskSource,
      text: raw.failurePercent ? `Риск срыва исполнения: ${riskMin}–${riskMax}%.` : 'Исполнение гарантировано условиями решения.' },
    // Это номинальное условие договора, а не попытка угадать полный экономический результат.
    payment: (choice.deal?.res?.economy ?? 0) < 0 ? choice.deal!.res!.economy! : null,
    later: raw.later.map((effect, index) => ({ ...effect,
      resources: Object.fromEntries(RESOURCE_KEYS.filter(key => effect.res[key]).map(key => [key,
        estimateDelta(effect.res[key]!, sources[key].skill,
          index === raw.later.length - 1 && !!choice.deal?.later && key === 'economy' && effect.res[key]! < 0),
      ])) as Partial<Record<ResourceKey, Estimate>>,
    })),
  };
}
