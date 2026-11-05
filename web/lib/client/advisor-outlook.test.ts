import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advisorOutlook, estimateDelta } from './advisor-outlook.ts';
import { choiceOutcomes } from './choice-outcomes.ts';
import { newTerm, nextCase, signChoice, startFromSeed } from './chronicle.ts';
import { LEGACY_COUNTRIES } from '../game/alternate-world.ts';
import { planTurn } from '../game/engine.ts';
import { RESOURCE_KEYS, SAVE_VERSION } from '../game/data.ts';
import { parseSave } from './save.ts';
import type { Choice, GameState } from '../game/types.ts';

const contains = (range: { min: number; max: number }, actual: number) => {
  assert.ok(range.min <= actual && actual <= range.max, `${actual} вне ${range.min}…${range.max}`);
};
const team = (state: GameState, skill: 1 | 2 | 3): GameState => ({
  ...state, advisors: state.advisors.map(advisor => ({ ...advisor, skill })),
});

test('округления вложены, охватывают результат и не превращают сильного советника во всезнайку', () => {
  for (let value = -100; value <= 100; value++) {
    let wider = estimateDelta(value, 0);
    for (const skill of [1, 2, 3] as const) {
      const estimate = estimateDelta(value, skill);
      contains(estimate, value);
      assert.ok(estimate.min >= wider.min && estimate.max <= wider.max);
      if (value) assert.ok(estimate.max > estimate.min);
      wider = estimate;
    }
  }
});

test('назначение профильного советника меняет точность; чужое назначение не улучшает экономический доклад', async () => {
  const base = await nextCase(await newTerm(startFromSeed(7)));
  const choice = base.currentEvent!.choices[0];
  const weak = team(base, 1), strong = team(base, 3);
  const low = advisorOutlook(weak, choice)!, high = advisorOutlook(strong, choice)!;
  assert.ok(high.success.resources.economy.min >= low.success.resources.economy.min);
  assert.ok(high.success.resources.economy.max <= low.success.resources.economy.max);
  assert.notEqual(high.success.resources.economy.text, low.success.resources.economy.text);
  assert.ok(high.risk.max - high.risk.min < low.risk.max - low.risk.min);
  const unrelated = { ...weak, advisors: weak.advisors.map(advisor => advisor.id === 'security' ? { ...advisor, skill: 3 as const } : advisor) };
  assert.deepEqual(advisorOutlook(unrelated, choice)!.success.resources.economy, low.success.resources.economy);
  const noEconomist = { ...strong, advisors: strong.advisors.filter(advisor => advisor.id !== 'economist') };
  const absent = advisorOutlook(noEconomist, choice)!;
  assert.equal(absent.sources.economy.skill, 0);
  assert.ok(absent.success.resources.economy.max - absent.success.resources.economy.min > low.success.resources.economy.max - low.success.resources.economy.min);
});

test('точные условия сделки и личные затраты сохраняются; будущая политическая реакция остаётся оценкой', async () => {
  const base = team(await nextCase(await newTerm(startFromSeed(7))), 1);
  const choice: Choice = { ...base.currentEvent!.choices[0], tags: [], policyEffect: undefined,
    deal: { pure: true, res: { economy: -5, personalResource: -2, internalLegitimacy: 3 },
      later: { label: 'Платёж по договору', turns: 2, res: { economy: -4, internalLegitimacy: -3 } } } };
  const before = { ...base, resources: { ...base.resources, economy: 2 } };
  const outlook = advisorOutlook(before, choice)!;
  assert.equal(outlook.payment, -5);
  assert.equal(outlook.success.resources.economy.text, '−2', 'известный прямой платёж учитывает границу опоры');
  assert.equal(outlook.success.resources.personalResource.text, '−2');
  assert.notEqual(outlook.success.resources.internalLegitimacy.min, outlook.success.resources.internalLegitimacy.max);
  assert.equal(outlook.risk.min, 0);
  assert.equal(outlook.risk.max, 0);
  assert.equal(outlook.failure, null);
  assert.equal(outlook.later[0].resources.economy!.text, '−4');
  assert.notEqual(outlook.later[0].resources.internalLegitimacy!.min, outlook.later[0].resources.internalLegitimacy!.max);
});

test('риск трёх заводских резолюций оценивают их авторы: экономист, дипломат, экономист', async () => {
  const state = await nextCase(await newTerm(startFromSeed(7)));
  assert.equal(state.currentEvent!.card, 'alt_wages');
  for (const [index, id] of ['economist', 'diplomat', 'economist'].entries()) {
    const choice = state.currentEvent!.choices[index];
    const source = advisorOutlook(state, choice)!.risk.source;
    assert.equal(source.name, state.advisors.find(advisor => advisor.id === id)!.name);
    assert.equal(source.skill, state.advisors.find(advisor => advisor.id === id)!.skill);
    const withoutExpert = { ...state, advisors: state.advisors.filter(advisor => advisor.id !== id) };
    assert.equal(advisorOutlook(withoutExpert, choice)!.risk.source.skill, 0);
  }
});

test('чужой вариант дела не меняет автора риска, а переделанное предложение не наследует исходного автора', async () => {
  const state = await nextCase(await newTerm(startFromSeed(7)));
  const choice: Choice = { ...state.currentEvent!.choices[0], id: 'local', tags: ['social'] };
  const event = { ...state.currentEvent!, card: 'generic', choices: [choice] };
  const local = { ...state, currentEvent: event };
  const withForeign = { ...local, currentEvent: { ...event, choices: [choice,
    { ...choice, id: 'foreign', tags: ['pro_west'] as Choice['tags'] }] } };
  const source = advisorOutlook(local, choice)!.risk.source;
  assert.equal(source.name, state.advisors.find(advisor => advisor.id === 'economist')!.name);
  assert.deepEqual(advisorOutlook(withForeign, choice)!.risk.source, source);
  const revised: Choice = { ...state.currentEvent!.choices[1], text: 'Проверить расходы казны', tags: ['austerity'] };
  assert.equal(advisorOutlook(state, revised)!.risk.source.name, source.name,
    'изменённый второй вариант идёт по экономическому профилю, а не к прежнему дипломату');
});

test('прогноз не меняет подпись, очередь и состояние; reload воспроизводит оценку', async () => {
  const state = await nextCase(await newTerm(startFromSeed(7)));
  const before = structuredClone(state), choice = state.currentEvent!.choices[1];
  const plan = planTurn(state, choice.id);
  const outlook = advisorOutlook(state, choice)!;
  assert.deepEqual(advisorOutlook(state, choice), outlook);
  assert.deepEqual(planTurn(state, choice.id), plan);
  assert.deepEqual(state, before);
  const restored = parseSave(JSON.stringify({ version: SAVE_VERSION, screen: 'game', state }))!;
  assert.ok(restored);
  assert.deepEqual(advisorOutlook(restored.state, restored.state.currentEvent!.choices[1]), outlook);
});

test('диапазоны обоих исходов, лагерей и эха содержат точный расчёт в реальных партиях', async () => {
  let forecasts = 0, camps = 0, echoes = 0;
  for (const seed of [2, 7, 21]) {
    let state = await newTerm(startFromSeed(seed));
    for (let turn = 0; turn < 6 && !state.ended; turn++) {
      state = await nextCase(state);
      for (const choice of state.currentEvent!.choices) for (const skill of [1, 2, 3] as const) {
        const current = team(state, skill), raw = choiceOutcomes(current, choice)!, outlook = advisorOutlook(current, choice)!;
        contains(outlook.risk, raw.failurePercent);
        for (const branch of ['success', 'failure'] as const) {
          const exact = raw[branch], estimate = outlook[branch];
          if (!exact || !estimate) continue;
          for (const key of RESOURCE_KEYS) contains(estimate.resources[key], exact.resources[key] ?? 0);
          for (const camp of estimate.camps) {
            contains(camp.estimate, exact.camps.find(item => item.name === camp.name)!.delta);
            camps++;
          }
        }
        outlook.later.forEach((effect, index) => {
          for (const key of RESOURCE_KEYS) if (effect.resources[key]) contains(effect.resources[key]!, raw.later[index].res[key]!);
          assert.equal(effect.due, raw.later[index].due);
          assert.equal(effect.onFailure, raw.later[index].onFailure);
          echoes++;
        });
        forecasts++;
      }
      state = await signChoice(state, state.currentEvent!.choices[0].id);
    }
  }
  assert.ok(forecasts > 100 && camps > 0 && echoes > 0);
});

test('архив и Daily не переключаются на новую справку; старый автор предложения не даёт точность в обход команды', async () => {
  const base = team(await nextCase(await newTerm(startFromSeed(7))), 1);
  const choice: Choice = { ...base.currentEvent!.choices[0], advisor: { ...base.advisors[0], skill: 3 } };
  const forecast = advisorOutlook(base, choice)!;
  assert.equal(forecast.sources.economy.skill, 1);
  assert.equal(forecast.risk.source.skill, 1);
  for (const country of LEGACY_COUNTRIES) assert.equal(advisorOutlook({ ...base, country }, choice), null);
  assert.equal(advisorOutlook({ ...base, daily: '2026-11-06' }, choice), null);
});

test('округление не обещает невозможного за границами ресурсов и отношений', async () => {
  const base = team(await nextCase(await newTerm(startFromSeed(7))), 1);
  for (const amount of [1, 99]) {
    const state = { ...base, resources: Object.fromEntries(RESOURCE_KEYS.map(key => [key, amount])) as GameState['resources'],
      factions: base.factions.map(faction => ({ ...faction, relation: amount === 1 ? -99 : 99 })) };
    for (const choice of state.currentEvent!.choices) {
      const outlook = advisorOutlook(state, choice)!;
      for (const branch of [outlook.success, outlook.failure]) if (branch) {
        for (const key of RESOURCE_KEYS) {
          assert.ok(branch.resources[key].min >= -amount);
          assert.ok(branch.resources[key].max <= 100 - amount);
        }
        for (const camp of branch.camps) {
          const relation = state.factions.find(faction => faction.name === camp.name)!.relation;
          assert.ok(relation + camp.estimate.min >= -100 && relation + camp.estimate.max <= 100);
        }
      }
    }
  }
});
