import { test } from 'node:test';
import assert from 'node:assert/strict';
import { choiceOutcomes } from './choice-outcomes.ts';
import { advisorOutlook } from './advisor-outlook.ts';
import { newTerm, nextCase, signChoice, startFromSeed } from './chronicle.ts';
import { quarterDeadline } from './initiative-note.ts';
import { parseSave } from './save.ts';
import { planTurn, rollSuccess } from '../game/engine.ts';
import { RESOURCE_KEYS, SAVE_VERSION } from '../game/data.ts';
import { LEGACY_COUNTRIES } from '../game/alternate-world.ts';
import type { Choice, DifficultyId, GameState } from '../game/types.ts';

function outcomeState(state: GameState, choice: Choice, succeeded: boolean) {
  for (let seed = 1; seed <= 1000; seed++) if (rollSuccess({ ...state, seed }, choice) === succeeded) return { ...state, seed };
  throw new Error('Нет исхода');
}

function reload(state: GameState) {
  const saved = parseSave(JSON.stringify({ version: SAVE_VERSION, screen: 'chronicle', state }));
  assert.ok(saved);
  return saved.state;
}

async function assertPaymentMaturesOnce(state: GameState, label: string, amount: number, due: number) {
  const payment = state.pending!.find(item => item.label === label)!;
  assert.ok(payment);
  assert.deepEqual(payment.res, { economy: amount });
  assert.equal(payment.due, due);
  state = reload(state);
  while (state.turn < due) {
    const opened = await nextCase(state);
    state = await signChoice(opened, opened.currentEvent!.choices[0].id);
    assert.equal(state.lastTurn!.matured.filter(item => item.id === payment.id).length, Number(state.turn === due));
  }
  assert.deepEqual(state.lastTurn!.sources!.economy!.filter(([source]) => source === label.toLowerCase()), [[label.toLowerCase(), amount]]);
  assert.ok(!state.pending!.some(item => item.id === payment.id));
  const opened = await nextCase(reload(state));
  const next = await signChoice(opened, opened.currentEvent!.choices[0].id);
  assert.ok(!next.lastTurn!.matured.some(item => item.id === payment.id));
}

test('частичный срыв на станции переносит выручку на следующий квартал', async () => {
  const base = await signChoice(await nextCase(await newTerm(startFromSeed(3, 'coalition'))), 'a');
  const state = reload(await nextCase({
    ...base, turn: 9,
    factions: base.factions.map(faction => faction.id === 'nationalists' ? { ...faction, relation: -80 } : faction),
    history: [{ ...base.history[0], hurt: ['nationalists'] }],
  }));
  assert.equal(state.currentEvent!.card, 'alt_rail_blockade');
  const choice = state.currentEvent!.choices[1];
  const label = 'Выручка за задержанный состав';
  const forecast = choiceOutcomes(state, choice)!;
  assert.equal(forecast.failure!.resources.economy, 0);
  const expected = { label, res: { economy: 3 }, due: 11 };
  const payment = forecast.later.find(effect => effect.label === label);
  assert.ok(payment);
  assert.equal(payment.when, 'failure');
  assert.deepEqual({ label: payment.label, res: payment.res, due: payment.due }, expected);
  assert.equal(advisorOutlook(state, choice)!.later.find(effect => effect.label === label)!.resources.economy!.text, '+3');
  const failed = await signChoice(outcomeState(state, choice, false), choice.id);
  const succeeded = await signChoice(outcomeState(state, choice, true), choice.id);
  assert.equal(failed.lastTurn!.success, false);
  assert.equal(succeeded.lastTurn!.success, true);
  assert.ok(!failed.lastTurn!.sources!.economy?.some(([source]) => source === 'решение'));
  assert.ok(succeeded.lastTurn!.sources!.economy?.some(([source, amount]) => source === 'решение' && amount > 0));
  assert.ok(!succeeded.pending!.some(item => item.label === label));
  await assertPaymentMaturesOnce(failed, label, 3, 11);
});

test('принятый долг за мазут остаётся в очереди при частичном срыве', async () => {
  let base = await newTerm(startFromSeed(7, 'coalition'));
  for (const id of ['b', 'a', 'b', 'a']) base = await signChoice(await nextCase(base), id);
  const state = reload(await nextCase(base));
  assert.equal(state.currentEvent!.card, 'alt_fuel_advance');
  const choice = state.currentEvent!.choices[0];
  const label = 'Детали за мазут';
  const forecast = choiceOutcomes(state, choice)!;
  const failed = await signChoice(state, choice.id);
  const succeeded = await signChoice(outcomeState(state, choice, true), choice.id);
  assert.equal(failed.lastTurn!.success, false);
  assert.equal(succeeded.lastTurn!.success, true);
  const payments = failed.lastTurn!.scheduled.filter(item => item.label === label);
  assert.equal(payments.length, 1);
  assert.deepEqual(payments, succeeded.lastTurn!.scheduled.filter(item => item.label === label));
  const payment = forecast.later.find(effect => effect.label === label);
  assert.ok(payment);
  assert.equal(payment.when, 'both');
  assert.deepEqual({ label: payment.label, res: payment.res, due: payment.due }, { label, res: { economy: -5 }, due: 9 });
  assert.equal(advisorOutlook(state, choice)!.later.find(effect => effect.label === label)!.resources.economy!.text, '−5');
  await assertPaymentMaturesOnce(failed, label, -5, 9);
});

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
    due: state.turn + 1 + choice.deal!.later!.turns, when: 'success', payment: true }]);
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
        positive += forecast.later.filter(effect => effect.when === 'success').length;
        negative += forecast.later.filter(effect => effect.when === 'both').length;
        multiple += forecast.later.length > 1 ? 1 : 0;
        deals += choice.deal?.later ? 1 : 0;
        for (const succeeded of forecast.failure ? [true, false] : [true]) {
          const plan = planTurn(outcomeState(state, choice, succeeded), choice.id);
          assert.deepEqual(forecast.later.filter(effect => effect.when === 'both' || effect.when === (succeeded ? 'success' : 'failure'))
            .map(({ label, res, due }) => ({ label, res, due })),
          plan.scheduled.map(({ label, res, due }) => ({ label, res, due })), `${choice.text}: ${succeeded}`);
        }
      }
      if (seed === 2 && turn === 3) {
        const censorship = state.currentEvent!.choices[2];
        assert.equal(censorship.text, 'Потребовать согласовывать подобные передачи');
        const effect = choiceOutcomes(state, censorship)!.later[0];
        assert.equal(effect.when, 'both');
        assert.deepEqual(effect.res, { internalLegitimacy: -3 });
        assert.equal(quarterDeadline(state, effect.due), 'конец II квартала 1979 года');
      }
      assert.deepEqual(state, before, 'прогноз не меняет состояние или очередь платежей');
      state = await signChoice(state, state.currentEvent!.choices[0].id);
    }
  }
  assert.ok(positive > 0 && negative > 0 && multiple > 0 && deals > 0, 'проверены польза, вред, два эха и сделка');
});
