// «Хроника срока» (#298): четыре других президента, принявших ту же страну — то же зерно, сложность, биографию.
// Каждый подписывает по своему характеру; в мемуарах видно, как те же годы могли пройти иначе.
import { approachWorks, budgetChoice, callChoice, classicApi, pressChoice } from '../game/classic.ts';
import { computePolls, planTurn, resolveTurn } from '../game/engine.ts';
import { COUNTRIES, END_TYPES } from '../game/data.ts';
import { APPROACHES } from '../content/calls.ts';
import { firstTermOver, newTerm, nextCase, type ChronicleStart } from './chronicle.ts';
import type { Choice, GameState, ResourceKey, Resources } from '../game/types.ts';

interface Temper {
  id: string;
  label: string;
  value: (resources: Resources) => number;
  budget: Record<string, number>;
}

export const TEMPERS: Temper[] = [
  { id: 'careful', label: 'Осторожный: берёг самую слабую опору', value: r => Math.min(...Object.values(r)),
    budget: { army: 2, social: 2, economy: 2, apparatus: 2, culture: 2 } },
  { id: 'manager', label: 'Хозяйственник: всё ради экономики', value: r => r.economy * 2 + r.politicalCapital,
    budget: { army: 1, social: 2, economy: 5, apparatus: 1, culture: 1 } },
  { id: 'popular', label: 'Народный: всё ради доверия улицы', value: r => r.internalLegitimacy * 2 + r.personalResource,
    budget: { army: 1, social: 5, economy: 2, apparatus: 1, culture: 1 } },
  { id: 'strong', label: 'Силовик: опора на порядок', value: r => r.military * 2 + r.politicalCapital,
    budget: { army: 5, social: 1, economy: 2, apparatus: 1, culture: 1 } },
];

const RES_KEYS: ResourceKey[] = ['politicalCapital', 'economy', 'military', 'externalReputation', 'internalLegitimacy', 'personalResource'];

function bestChoice(state: GameState, temper: Temper): Choice {
  const event = state.currentEvent!;
  if (event.press) {
    const picks = event.press.questions.map(q => {
      const scored = q.answers.map((a, i) => [i, temper.value(Object.fromEntries(RES_KEYS.map(k => [k, 50 + (a.res[k] ?? 0)])) as Resources)] as const);
      return [...scored].sort((a, b) => b[1] - a[1])[0][0];
    });
    return pressChoice(state, picks);
  }
  if (event.call && !event.call.negotiation) {
    const approach = APPROACHES.find(a => approachWorks(event.call!.trait, a.id))?.id ?? 'numbers';
    return callChoice(state, approach, 'deal');
  }
  if (event.budget) return budgetChoice(state, temper.budget, false);
  const score = (choice: Choice) => temper.value(planTurn(state, choice.id, { assumeSuccess: true }).resources);
  return [...event.choices].sort((a, b) => score(b) - score(a))[0];
}

export interface Rival {
  label: string;
  years: string;
  outcome: string;
  support: number;     // поддержка партии власти в конце, %
  firstChoice: string; // с чего начал: решение по первому делу
}

export async function liveRival(start: ChronicleStart, temper: Temper): Promise<Rival> {
  let state = await newTerm(start);
  while (!firstTermOver(state)) {
    state = await nextCase(state);
    const choice = bestChoice(state, temper);
    const ready = { ...state, currentEvent: { ...state.currentEvent!, choices: [choice, ...state.currentEvent!.choices.slice(1)] } };
    state = resolveTurn(ready, choice.id, await classicApi.consequence(ready, choice.id));
  }
  const lastVote = state.elections.at(-1);
  const end = state.endType ?? (lastVote?.outcome === 'won' ? 'reelected' : 'mandate');
  return {
    label: temper.label, years: `${COUNTRIES[state.country].startYear}–${state.year}`, outcome: END_TYPES[end],
    support: computePolls(state.country, state.factions, state.resources).leader, firstChoice: state.history[0]?.choice ?? '',
  };
}

export const contemporaries = (start: ChronicleStart) => Promise.all(TEMPERS.map(temper => liveRival(start, temper)));
