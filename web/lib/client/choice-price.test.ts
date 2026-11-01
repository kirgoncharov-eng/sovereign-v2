import { test } from 'node:test';
import assert from 'node:assert/strict';
import { choicePrice } from './choice-price.ts';
import { newTerm, nextCase, startFromSeed } from './chronicle.ts';
import { COUNTRIES } from '../game/data.ts';
import { ALTERNATE_COUNTRY } from '../game/alternate-world.ts';
import { planTurn, rollSuccess } from '../game/engine.ts';
import type { Choice, GameState, ResourceDelta } from '../game/types.ts';

async function fresh() {
  return nextCase(await newTerm(startFromSeed(7, 'debut')));
}

function withChoice(state: GameState, choice: Choice): GameState {
  return { ...state, currentEvent: { ...state.currentEvent!, choices: [choice] } };
}

// Независимый источник — фактическая строка «решение» в ведомости движка: после округления и границы опоры.
function actualLosses(state: GameState, choice: Choice, assumeSuccess = false): ResourceDelta {
  const plan = planTurn(withChoice(state, choice), choice.id, { assumeSuccess });
  return Object.fromEntries(Object.entries(plan.sources).flatMap(([key, sources]) => {
    const delta = sources.find(([label]) => label === 'решение')?.[1] ?? 0;
    return delta < 0 ? [[key, delta]] : [];
  }));
}

function failingSeed(state: GameState, choice: Choice): GameState {
  for (let seed = 1; seed <= 1000; seed++) {
    if (!rollSuccess({ ...state, seed }, choice)) return { ...state, seed };
  }
  throw new Error('Не найден исход со срывом');
}

test('потери обычного решения и предложения советника совпадают с ведомостью при исполнении и срыве', async () => {
  const state = await fresh();
  const ordinary = state.currentEvent!.choices[0];
  const advisor: Choice = { ...ordinary, id: 'advisor-price', advisor: { ...state.advisors[0], skill: 3 } };
  const authored: Choice = { ...ordinary, id: 'authored-price', policyEffect: { economy: -8, politicalCapital: -3, military: 6 } };
  for (const choice of [ordinary, advisor, authored]) {
    const before = structuredClone(state), choiceBefore = structuredClone(choice);
    const price = choicePrice(state, choice)!;
    assert.deepEqual(price.success, actualLosses(state, choice, true));
    assert.deepEqual(price.failure, actualLosses(failingSeed(state, choice), choice));
    assert.ok(Object.keys(price.success).length > 0);
    assert.deepEqual(state, before, 'просмотр цены не меняет партию');
    assert.deepEqual(choice, choiceBefore);
  }
});

test('потери ограничены остатком опоры и не включают долг и кризис того же квартала', async () => {
  const base = await fresh();
  const state: GameState = { ...base, ideo: 'pragmatist', resources: { ...base.resources, economy: 2 },
    pending: [{ id: 'old-debt', due: base.turn + 1, from: 0, label: 'Возврат прежнего аванса', res: { politicalCapital: -9 }, source: 'Аванс' }],
    activeCrises: [{ id: 'old-crisis', title: 'Прежний кризис', description: '', severity: 'high', turnsActive: 0,
      resourceDrain: { personalResource: -4 } }],
  };
  const choice: Choice = { ...base.currentEvent!.choices[0], tags: ['security'], policyEffect: { economy: -20 } };
  const price = choicePrice(state, choice)!;
  assert.deepEqual(price.success, { economy: -2 });
  assert.deepEqual(price.failure, { economy: -2 });
  assert.deepEqual(price.success, actualLosses(state, choice, true));
  const plan = planTurn(withChoice(state, choice), choice.id, { assumeSuccess: true });
  assert.ok(plan.sources.politicalCapital!.some(([label]) => /аванс/.test(label)));
  assert.ok(plan.sources.personalResource!.some(([label]) => /Прежний кризис/.test(label)));
});

test('нулевая немедленная потеря и гарантированная сделка не получают вымышленный срыв', async () => {
  const state = await fresh();
  const choice: Choice = { ...state.currentEvent!.choices[0], tags: [], policyEffect: undefined,
    deal: { pure: true, res: { economy: 4 }, later: { turns: 2, label: 'Возврат', res: { economy: -8 } } },
  };
  assert.deepEqual(choicePrice(state, choice), { success: {}, failure: null, failurePercent: 0 });
  const paid: Choice = { ...choice, deal: { pure: true, res: { economy: -5 } } };
  assert.deepEqual(choicePrice(state, paid), { success: { economy: -5 }, failure: null, failurePercent: 0 });
  assert.deepEqual(choicePrice(state, paid)!.success, actualLosses(state, paid, true));
});

test('цена не раскрывает выпавший исход, не зависит от открытия совета и не включается в архиве', async () => {
  const state = await fresh(), choice = state.currentEvent!.choices[0];
  const before = choicePrice(state, choice);
  const failed = failingSeed(state, choice);
  assert.deepEqual(choicePrice(failed, choice), before, 'фактический срыв не выбирает ветку прогноза');
  assert.deepEqual(choicePrice({ ...state, currentEvent: { ...state.currentEvent!, council: [choice] } }, choice), before);
  for (const country of Object.keys(COUNTRIES).filter(country => country !== ALTERNATE_COUNTRY)) {
    assert.equal(choicePrice({ ...state, country }, choice), null);
  }
});
