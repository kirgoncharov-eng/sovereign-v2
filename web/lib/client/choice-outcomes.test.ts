import { test } from 'node:test';
import assert from 'node:assert/strict';
import { choiceOutcomes } from './choice-outcomes.ts';
import { newTerm, nextCase, signChoice, startFromSeed } from './chronicle.ts';
import { quarterDeadline } from './initiative-note.ts';
import { planTurn, rollSuccess } from '../game/engine.ts';
import { RESOURCE_KEYS } from '../game/data.ts';
import { LEGACY_COUNTRIES } from '../game/alternate-world.ts';
import type { Choice, DifficultyId, GameState } from '../game/types.ts';

function outcomeState(state: GameState, choice: Choice, succeeded: boolean) {
  for (let seed = 1; seed <= 1000; seed++) if (rollSuccess({ ...state, seed }, choice) === succeeded) return { ...state, seed };
  throw new Error('Нет исхода');
}

test('полный прогноз шести опор равен фактической строке решения для каждого исхода, включая границы', async () => {
  const base = await nextCase(await newTerm(startFromSeed(7)));
  for (const amount of [2, 60, 99]) {
    const state = { ...base, resources: Object.fromEntries(RESOURCE_KEYS.map(key => [key, amount])) as GameState['resources'] };
    const before = structuredClone(state);
    for (const choice of state.currentEvent!.choices) {
      const forecast = choiceOutcomes(state, choice)!;
      for (const succeeded of [true, false]) {
        const plan = planTurn(outcomeState(state, choice, succeeded), choice.id);
        const expected = Object.fromEntries(RESOURCE_KEYS.map(key =>
          [key, plan.sources[key]?.find(([label]) => label === 'решение')?.[1] ?? 0]));
        assert.deepEqual(succeeded ? forecast.success.resources : forecast.failure!.resources, expected);
        assert.deepEqual(succeeded ? forecast.success.camps : forecast.failure!.camps,
          state.factions.filter(faction => plan.effects.factionRel[faction.id]).map(faction =>
            ({ name: faction.name, delta: plan.effects.factionRel[faction.id] })));
      }
    }
    assert.deepEqual(state, before);
  }
});

test('польза видна рядом с ценой; одинаковая цена не скрывает разные исходы', async () => {
  const state = await nextCase(await newTerm(startFromSeed(7)));
  const choice = state.currentEvent!.choices[1];
  const forecast = choiceOutcomes(state, choice)!;
  assert.equal(forecast.success.resources.economy, 2);
  assert.equal(forecast.failure!.resources.economy, -3);
  assert.equal(forecast.success.resources.personalResource, -3);
  assert.equal(forecast.failure!.resources.personalResource, -3);
  assert.match(forecast.reason!, /гаранти/);
  assert.deepEqual(forecast.later, [{ label: choice.deal!.later!.label, res: choice.deal!.later!.res,
    due: state.turn + 1 + choice.deal!.later!.turns, onFailure: false }]);
});

test('отношения у границы не обещают невозможной прибавки или потери', async () => {
  const original = await nextCase(await newTerm(startFromSeed(7)));
  for (const relation of [-100, 100]) {
    const state = { ...original, factions: original.factions.map(faction => ({ ...faction, relation })) };
    const choice = state.currentEvent!.choices[0];
    const forecast = choiceOutcomes(state, choice)!;
    for (const outcome of [forecast.success, forecast.failure!]) {
      assert.ok(outcome.camps.every(camp => relation === 100 ? camp.delta < 0 : camp.delta > 0));
    }
  }
});

test('в прогноз не входят старый долг и кризис; архив и гарантированное исполнение сохраняются', async () => {
  const base = await nextCase(await newTerm(startFromSeed(7)));
  const state = { ...base, pending: [{ id: 'debt', due: 1, label: 'Долг', res: { economy: -10 }, source: 'Раньше' }] };
  const choice = state.currentEvent!.choices[0];
  assert.deepEqual(choiceOutcomes(state, choice), choiceOutcomes(base, choice));
  const guaranteed: Choice = { ...choice, deal: { pure: true, res: { economy: 2 } }, policyEffect: undefined, tags: [] };
  assert.equal(choiceOutcomes(state, guaranteed)!.failure, null);
  assert.equal(choiceOutcomes(state, guaranteed)!.failurePercent, 0);
  assert.deepEqual(choiceOutcomes(state, guaranteed)!.later, []);
  for (const country of LEGACY_COUNTRIES) assert.equal(choiceOutcomes({ ...state, country }, choice), null);
});

test('будущие последствия реальных решений совпадают с очередью движка при исполнении и срыве', async () => {
  let positive = 0, negative = 0, multiple = 0, deals = 0;
  const routes: [number, DifficultyId][] = [[2, 'debut'], [1, 'ruins'], [7, 'coalition'], [21, 'crisis']];
  for (const [seed, difficulty] of routes) {
    let state = await newTerm(startFromSeed(seed, difficulty));
    for (let turn = 0; turn < 6 && !state.ended; turn++) {
      state = await nextCase(state);
      const before = structuredClone(state);
      for (const choice of state.currentEvent!.choices) {
        const forecast = choiceOutcomes(state, choice)!;
        positive += forecast.later.filter(effect => !effect.onFailure).length;
        negative += forecast.later.filter(effect => effect.onFailure).length;
        multiple += forecast.later.length > 1 ? 1 : 0;
        deals += choice.deal?.later ? 1 : 0;
        for (const succeeded of forecast.failure ? [true, false] : [true]) {
          const plan = planTurn(outcomeState(state, choice, succeeded), choice.id);
          assert.deepEqual(forecast.later.filter(effect => succeeded || effect.onFailure)
            .map(({ label, res, due }) => ({ label, res, due })),
          plan.scheduled.map(({ label, res, due }) => ({ label, res, due })), `${choice.text}: ${succeeded}`);
        }
      }
      if (seed === 2 && turn === 3) {
        const censorship = state.currentEvent!.choices[2];
        assert.equal(censorship.text, 'Потребовать согласовывать подобные передачи');
        const effect = choiceOutcomes(state, censorship)!.later[0];
        assert.equal(effect.onFailure, true);
        assert.deepEqual(effect.res, { internalLegitimacy: -3 });
        assert.equal(quarterDeadline(state, effect.due), 'конец II квартала 1979 года');
      }
      assert.deepEqual(state, before, 'прогноз не меняет состояние или очередь платежей');
      state = await signChoice(state, state.currentEvent!.choices[0].id);
    }
  }
  assert.ok(positive > 0 && negative > 0 && multiple > 0 && deals > 0, 'проверены польза, вред, два эха и сделка');
});
