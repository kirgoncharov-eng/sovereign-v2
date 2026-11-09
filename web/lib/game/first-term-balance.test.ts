// #403: баланс первого срока 1978 года — замер в scripts/first-term-balance.ts (#407, #409, #410).
// Мягче давление «Коалиции» и вдвое дешевле дела первой главы; архивные страны и прежние сохранения не меняются.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ALTERNATE_EVENTS } from '../content/alternate-history.ts';
import { ALTERNATE_COUNTRY, LEGACY_COUNTRIES } from './alternate-world.ts';
import { DIFF_PRESSURE, pressureAt } from './data.ts';
import { executionRisk } from './execution-risk.ts';
import { newTerm, nextCase, startFromSeed } from '../client/chronicle.ts';

// Дела ходов 1–6: зарплата, радио, урожай, топливо и стандарты со всеми версиями.
const FIRST_CHAPTER = ['alt_wages', 'alt_radio', 'alt_harvest', 'alt_fuel', 'alt_fuel_audit', 'alt_fuel_advance', 'alt_fuel_west',
  'alt_standards', 'alt_standards_patriots', 'alt_standards_chamber'];

test('давление: «Коалиция» 1978 года давит слабее, архив и другие сложности — как прежде', () => {
  for (const turn of [1, 7, 14, 20]) {
    const growth = pressureAt('debut', turn) - DIFF_PRESSURE.debut;
    assert.equal(pressureAt('coalition', turn, ALTERNATE_COUNTRY), 1 + growth, `ход ${turn}`);
    for (const diff of ['debut', 'crisis', 'ruins'] as const) {
      assert.equal(pressureAt(diff, turn, ALTERNATE_COUNTRY), pressureAt(diff, turn), `${diff}, ход ${turn}`);
    }
    for (const country of LEGACY_COUNTRIES) assert.equal(pressureAt('coalition', turn, country), DIFF_PRESSURE.coalition + growth);
  }
});

test('первая глава: ни один вариант не стоит казне больше трёх при исполнении', () => {
  for (const id of FIRST_CHAPTER) {
    const card = ALTERNATE_EVENTS.find(event => event.id === id);
    assert.ok(card, id);
    for (const choice of card!.choices) assert.ok((choice.policyEffect?.economy ?? 0) >= -3, `${id}: ${choice.text}`);
  }
});

test('дело о зарплате, начатое до #403, сохраняет авторский срыв по прежней цене', async () => {
  const state = await nextCase(await newTerm(startFromSeed(7)));
  assert.equal(state.currentEvent!.card, 'alt_wages');
  const legacy = [{ economy: -7, internalLegitimacy: 6, politicalCapital: 2, personalResource: -1 }, null,
    { economy: -6, internalLegitimacy: 3, externalReputation: 3, personalResource: -2 }];
  for (const [index, choice] of state.currentEvent!.choices.entries()) {
    const old = legacy[index];
    if (!old) continue;
    const current = executionRisk(state, choice);
    const restored = executionRisk(state, { ...choice, policyEffect: old });
    assert.ok(current?.reason && restored?.reason === current.reason, `${choice.id}: тот же профиль срыва`);
    assert.equal(executionRisk(state, { ...choice, policyEffect: { ...old, economy: -20 } }), null, 'чужая цена профиля не получает');
  }
});
