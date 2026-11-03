import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executionRisk } from './execution-risk.ts';
import { newTerm, nextCase, signChoice, startFromSeed } from '../client/chronicle.ts';
import { choiceEffects, planTurn, rollSuccess, successChance } from './engine.ts';
import { ALTERNATE_COUNTRY, LEGACY_COUNTRIES } from './alternate-world.ts';
import { SAVE_VERSION } from './data.ts';
import { parseSave } from '../client/save.ts';
import type { Choice, GameState } from './types.ts';

async function first(seed = 7, diff: 'debut' | 'coalition' | 'crisis' = 'debut') {
  return nextCase(await newTerm(startFromSeed(seed, diff)));
}

function withOutcome(state: GameState, choice: Choice, succeeded: boolean) {
  for (let seed = 1; seed <= 1000; seed++) {
    const candidate = { ...state, seed };
    if (rollSuccess(candidate, choice) === succeeded) return candidate;
  }
  throw new Error('Не найден нужный исход');
}

test('три срыва соответствуют сценам: деньги ушли банку, аванса нет, новая линия не запущена', async () => {
  const state = await first();
  const expected = [
    { economy: -9, internalLegitimacy: -4, politicalCapital: -3, personalResource: -1 },
    { economy: -3, internalLegitimacy: -4, politicalCapital: -1, personalResource: -3 },
    { economy: -8, internalLegitimacy: -4, personalResource: -3 },
  ];
  for (const [index, choice] of state.currentEvent!.choices.entries()) {
    const effects = choiceEffects(state, choice, true);
    assert.deepEqual(effects.resources, expected[index]);
    assert.ok(Object.values(effects.factionRel).every(value => value <= 0), 'не благодарят за неисполненное обещание');
    assert.deepEqual(effects.factionAppr, {}, 'нет прежнего бонуса одобрения за невыплаченную зарплату');
    assert.ok(executionRisk(state, choice)?.reason);
    assert.notDeepEqual(effects, choiceEffects(state, choice));
  }
});

test('старое сохранение первого дела получает тот же профиль без новых полей и миграции', async () => {
  const state = await first();
  const restored = parseSave(JSON.stringify({ version: SAVE_VERSION, screen: 'chronicle', state }))!.state;
  assert.deepEqual(restored, JSON.parse(JSON.stringify(state)));
  for (const choice of restored.currentEvent!.choices) {
    assert.equal(executionRisk(restored, choice)?.reason, executionRisk(state, choice)?.reason);
    assert.deepEqual(choiceEffects(restored, choice, true), choiceEffects(state, choice, true));
  }
});

test('настоящий срыв, сцена, отношения и отсутствие будущей выручки сходятся на разных партиях', async () => {
  for (const [seed, diff] of [[1, 'debut'], [7, 'coalition'], [21, 'crisis']] as const) {
    const original = await first(seed, diff);
    for (const choice of original.currentEvent!.choices) {
      const state = withOutcome(original, choice, false);
      const before = structuredClone(state);
      const after = await signChoice(state, choice.id);
      assert.equal(after.lastTurn!.success, false);
      assert.ok(after.lastTurn!.narrative.includes(choice.sceneFail!), `${seed}/${choice.id}: именно сцена срыва`);
      assert.deepEqual(after.lastTurn!.resourceChanges, choiceEffects(state, choice, true).resources);
      assert.deepEqual(state, before, 'разрешение не меняет исходный снимок');
      assert.ok(!after.lastTurn!.scheduled.length, 'нет будущей выручки, экспорта или бонуса за несостоявшуюся сделку');
      assert.deepEqual(after, await signChoice(state, choice.id), 'повтор того же выбора детерминирован');
      const success = await signChoice(withOutcome(original, choice, true), choice.id);
      assert.equal(success.lastTurn!.success, true);
      if (choice.deal?.later) assert.ok(success.lastTurn!.scheduled.some(entry => entry.label === choice.deal!.later!.label));
    }
  }
});

test('профиль не применяется к архиву, daily, соседнему делу, чистой сделке и предложению советника', async () => {
  const state = await first(), choice = state.currentEvent!.choices[0];
  for (const country of LEGACY_COUNTRIES) assert.equal(executionRisk({ ...state, country }, choice), null);
  assert.equal(executionRisk({ ...state, daily: '2026-11-02' }, choice), null);
  assert.equal(executionRisk({ ...state, currentEvent: { ...state.currentEvent!, card: 'alt_district' } }, choice), null);
  assert.equal(executionRisk(state, { ...choice, id: 's_economist' }), null);
  assert.equal(executionRisk(state, { ...choice, policyEffect: { economy: -20 } }), null, 'переработанный вариант не наследует чужую неудачу');
  assert.equal(executionRisk(state, { ...choice, advisor: { id: 'economist', name: 'Советник', role: 'Экономист', skill: 3 } }), null);
  assert.equal(executionRisk(state, { ...choice, deal: { pure: true, res: { economy: 2 } } }), null);
  assert.equal(executionRisk({ country: ALTERNATE_COUNTRY }, choice), null, 'без доказанной карточки профиль не угадываем');
});

test('прогноз обоих исходов не выбирает выпавший результат и не меняет вероятность', async () => {
  const state = await first();
  for (const choice of state.currentEvent!.choices) {
    const succeeded = withOutcome(state, choice, true), failed = withOutcome(state, choice, false);
    assert.deepEqual(choiceEffects(succeeded, choice), choiceEffects(failed, choice));
    assert.deepEqual(choiceEffects(succeeded, choice, true), choiceEffects(failed, choice, true));
    assert.equal(successChance(succeeded, choice), successChance(failed, choice));
    assert.deepEqual(planTurn(failed, choice.id), planTurn(failed, choice.id));
  }
});
