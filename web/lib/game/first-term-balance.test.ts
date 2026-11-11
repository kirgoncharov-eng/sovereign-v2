// #403: баланс первого срока 1978 года — замер в scripts/first-term-balance.ts (#407, #409, #410).
// Мягче давление «Коалиции» и вдвое дешевле дела первой главы; архивные страны и прежние сохранения не меняются.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ALTERNATE_EVENTS } from '../content/alternate-history.ts';
import { ALTERNATE_COUNTRY, LEGACY_COUNTRIES } from './alternate-world.ts';
import { DIFF_PRESSURE, pressureAt } from './data.ts';
import { executionRisk } from './execution-risk.ts';
import { classicApi } from './classic.ts';
import { createInitialState, rollSuccess, seededRandom, startEvent } from './engine.ts';
import { SAVE_VERSION } from './data.ts';
import { newTerm, nextCase, signChoice, startFromSeed } from '../client/chronicle.ts';
import { parseSave } from '../client/save.ts';
import type { Choice, GameState, ResourceDelta } from './types.ts';

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

// Сохранение, начатое до #403: открытое дело хранит прежнюю цену в policyEffect. Оно и исполняется, и срывается по ней.
// Проверяется настоящая подпись после загрузки — строка «решение» в разбивке хода, а не только текст причины.
const decision = (state: GameState) => (state.lastTurn!.sources?.economy ?? []).filter(([label]) => label === 'решение')
  .reduce((sum, [, value]) => sum + value, 0);
const reload = (state: GameState) => parseSave(JSON.stringify({ version: SAVE_VERSION, screen: 'chronicle', state }))!.state;
function withOutcome(state: GameState, choice: Choice, succeeded: boolean) {
  for (let seed = 1; seed <= 1000; seed++) if (rollSuccess({ ...state, seed }, choice) === succeeded) return { ...state, seed };
  throw new Error('Не найден нужный исход');
}
async function legacySigning(state: GameState, index: number, policy: ResourceDelta, expected: number) {
  const choices = state.currentEvent!.choices.map((choice, at) => (at === index ? { ...choice, policyEffect: policy } : choice));
  const saved = { ...state, currentEvent: { ...state.currentEvent!, choices } };
  const choice = choices[index];
  assert.ok(executionRisk(saved, choice)?.resources, `${choice.text}: прежняя цена узнаёт авторский профиль`);
  for (const succeeded of [true, false]) {
    const after = await signChoice(reload(withOutcome(saved, choice, succeeded)), choice.id);
    assert.equal(after.lastTurn!.success, succeeded);
    assert.equal(decision(after), expected, `${choice.text}: ${succeeded ? 'исполнение' : 'срыв'} по прежней цене`);
  }
}

test('дело, начатое до #403: после загрузки и исполнение, и срыв идут по прежней цене казны', async () => {
  const wages = await nextCase(await newTerm(startFromSeed(7)));
  assert.equal(wages.currentEvent!.card, 'alt_wages');
  await legacySigning(wages, 0, { economy: -7, internalLegitimacy: 6, politicalCapital: 2, personalResource: -1 }, -9);
  await legacySigning(wages, 2, { economy: -6, internalLegitimacy: 3, externalReputation: 3, personalResource: -2 }, -8);
  const initial = createInitialState(ALTERNATE_COUNTRY, 'debut', 'pragmatist',
    await classicApi.setup(ALTERNATE_COUNTRY, 'debut', 'pragmatist', 3), seededRandom(3));
  const resources = Object.fromEntries(Object.keys(initial.resources).map(key => [key, 60])) as GameState['resources'];
  const standards = startEvent({ ...initial, turn: 14, resources }, await classicApi.event({ ...initial, turn: 14, resources }));
  assert.equal(standards.currentEvent!.card, 'alt_standards');
  await legacySigning(standards, 0, { economy: -5, externalReputation: 3, politicalCapital: -1 }, -6);
});

test('нынешняя цена: срыв выплаты и опытной линии стоит казне столько же, сколько исполнение', async () => {
  const wages = await nextCase(await newTerm(startFromSeed(7)));
  for (const index of [0, 2]) {
    const choice = wages.currentEvent!.choices[index];
    const spent = await Promise.all([true, false].map(async succeeded => decision(await signChoice(withOutcome(wages, choice, succeeded), choice.id))));
    assert.equal(spent[0], spent[1], choice.text);
  }
  assert.equal(executionRisk(wages, { ...wages.currentEvent!.choices[0], policyEffect: { economy: -20 } }), null, 'чужая цена профиля не получает');
});
