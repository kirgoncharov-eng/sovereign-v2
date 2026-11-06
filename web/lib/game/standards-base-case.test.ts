// Базовое дело «Чужой рынок, другие станки» (alt_standards) приходит на ходу 15, когда не подошла ни одна версия.
// Опытная линия и российские заказы обязаны отличаться ценой так, как их описывают текст и подсказка (#363).
import test from 'node:test';
import assert from 'node:assert/strict';
import { classicApi } from './classic.ts';
import { ALTERNATE_COUNTRY, LEGACY_COUNTRIES } from './alternate-world.ts';
import { ALTERNATE_EVENTS } from '../content/alternate-history.ts';
import { choiceEffects, createInitialState, rollSuccess, seededRandom, startEvent, successChance } from './engine.ts';
import { executionProfile, executionRisk } from './execution-risk.ts';
import { SAVE_VERSION } from './data.ts';
import { choiceOutcomes } from '../client/choice-outcomes.ts';
import { signChoice } from '../client/chronicle.ts';
import { parseSave } from '../client/save.ts';
import type { Choice, GameState, IdeologyId, ResourceKey } from './types.ts';

const BASE_CHOICES = {
  pilot: 'Начать переход на европейский стандарт с опытной линии',
  russian: 'Оставить заводы на российских заказах',
  contest: 'Отдать контракт конкурсу заводов без гарантии казны',
} as const;

async function standardsCase(seed: number, diff: 'debut' | 'coalition', ideo: IdeologyId) {
  const initial = createInitialState(ALTERNATE_COUNTRY, diff, ideo,
    await classicApi.setup(ALTERNATE_COUNTRY, diff, ideo, seed), seededRandom(seed));
  // Опоры на 60: предел шкалы не должен скрывать дельты вариантов.
  const resources = Object.fromEntries(Object.keys(initial.resources).map(key => [key, 60])) as GameState['resources'];
  const state = { ...initial, turn: 14, resources };
  const event = await classicApi.event(state);
  assert.equal((event as typeof event & { cardId?: string }).cardId, 'alt_standards', `${seed}/${diff}/${ideo}: без версий приходит базовое дело`);
  return { state: { ...state, currentEvent: event }, event };
}

test('у опытной линии и российских заказов своя авторская цена и причина каждой потери', () => {
  const card = ALTERNATE_EVENTS.find(entry => entry.id === 'alt_standards')!;
  assert.deepEqual(card.choices.map(choice => choice.text), Object.values(BASE_CHOICES));
  for (const choice of card.choices.slice(0, 2)) {
    assert.ok(choice.policyEffect, `${choice.text}: нет policyEffect`);
    for (const [key, value] of Object.entries(choice.policyEffect!)) {
      if (value! < 0) assert.ok(choice.costReasons?.[key as ResourceKey], `${choice.text}: нет причины для ${key}`);
    }
  }
  // Конкурс заводов в этой задаче не менялся: он по-прежнему получает профиль тегов reform + investment.
  assert.equal(card.choices[2].policyEffect, undefined);
});

test('опытная линия платит казной сейчас, российские заказы дешевле, но оставляют зависимость', async () => {
  // У националиста в коалиции на этом ходу приходит областное дело, поэтому его проверяем в дебюте.
  const runs = [['pragmatist', 'debut'], ['pragmatist', 'coalition'], ['nationalist', 'debut']] as const;
  for (const [ideo, diff] of runs) {
    for (const seed of [3, 7, 11, 19]) {
      const { state, event } = await standardsCase(seed, diff, ideo);
      const byText = Object.fromEntries(event.choices.map(choice => [choice.text, choiceOutcomes(state, choice)!]));
      const pilot = byText[BASE_CHOICES.pilot];
      const russian = byText[BASE_CHOICES.russian];
      const contest = byText[BASE_CHOICES.contest];
      const label = `${seed}/${diff}/${ideo}`;
      // «Казна платит за образцы»: опытная линия стоит казне больше остальных вариантов дела.
      assert.ok(pilot.success.resources.economy! <= -5, `${label}: масштаб соседних версий`);
      assert.ok(pilot.success.resources.economy! < russian.success.resources.economy!
        && pilot.success.resources.economy! < contest.success.resources.economy!, `${label}: казна опытной линии`);
      // «Большой договор — потом»: выручка остаётся отложенным эффектом, а не приходит сразу.
      assert.ok(pilot.later.some(effect => effect.label === 'Оплата поставок с испытательной линии' && effect.res.economy! > 0),
        `${label}: отложенная оплата поставок`);
      // «Знакомый покупатель, зависимость остаётся»: выпуск сохранён, но западный рынок закрывается.
      assert.ok(russian.success.resources.economy! >= 0, `${label}: российские заказы не стоят казне`);
      assert.ok(russian.success.resources.externalReputation! < 0 && pilot.success.resources.externalReputation! > 0,
        `${label}: репутация`);
      // Прежняя ошибка: два варианта давали одинаковые ресурсы и при исполнении, и при срыве.
      assert.notDeepEqual(pilot.success.resources, russian.success.resources, `${label}: профили совпали`);
      assert.notDeepEqual(pilot.failure?.resources, russian.failure?.resources, `${label}: срывы совпали`);
    }
  }
});

// #365: срыв описывает сцену `fail`, а не уменьшенную пользу исполнения. Состояние с `card`, как его собирает startEvent.
async function signedCase(seed: number, diff: 'debut' | 'coalition', ideo: IdeologyId) {
  const { state, event } = await standardsCase(seed, diff, ideo);
  return startEvent({ ...state, currentEvent: null }, event);
}

function withOutcome(state: GameState, choice: Choice, succeeded: boolean) {
  for (let seed = 1; seed <= 1000; seed++) {
    const candidate = { ...state, seed };
    if (rollSuccess(candidate, choice) === succeeded) return candidate;
  }
  throw new Error('Не найден нужный исход');
}

const sumOf = (delta: Record<string, number | undefined>) => Object.values(delta).reduce<number>((sum, value) => sum + (value ?? 0), 0);

test('срыв опытной линии и российских заказов не сохраняет пользу исполнения', async () => {
  const runs = [['pragmatist', 'debut'], ['pragmatist', 'coalition'], ['nationalist', 'debut']] as const;
  for (const [ideo, diff] of runs) {
    for (const seed of [3, 7, 11, 19]) {
      const state = await signedCase(seed, diff, ideo);
      const label = `${seed}/${diff}/${ideo}`;
      const [pilotChoice, russianChoice, contestChoice] = state.currentEvent!.choices;
      const pilot = choiceOutcomes(state, pilotChoice)!, russian = choiceOutcomes(state, russianChoice)!;
      // «Образцы не прошли испытания. Деньги потрачены»: казна платит, репутация у покупателя не растёт.
      assert.ok(pilot.failure!.resources.externalReputation! <= 0, `${label}: репутация после проваленных испытаний`);
      assert.ok(pilot.failure!.resources.economy! < 0, `${label}: деньги на образцы потрачены`);
      // «Покупатель сократил заказ… станки работают на склад»: выручки нет, зависимость остаётся.
      assert.ok(russian.failure!.resources.economy! < 0, `${label}: продукция на склад не приносит денег`);
      assert.ok(russian.failure!.resources.externalReputation! < 0, `${label}: Запад по-прежнему закрыт`);
      for (const [choice, outcome] of [[pilotChoice, pilot], [russianChoice, russian]] as const) {
        assert.ok(executionRisk(state, choice), `${label}/${choice.id}: авторский срыв`);
        assert.equal(executionProfile(state, choice), null, `${label}/${choice.id}: шанс и исполнители остаются общими`);
        assert.equal(outcome.reason, null, `${label}/${choice.id}: прогноз без новой строки причины`);
        for (const key of Object.keys(outcome.success.resources) as ResourceKey[]) {
          assert.ok(outcome.failure!.resources[key]! <= outcome.success.resources[key]!, `${label}/${choice.id}: срыв не лучше исполнения по ${key}`);
        }
        // Лагеря не благодарят за несостоявшийся результат так же, как за исполненный.
        const gains = (camps: { delta: number }[]) => camps.filter(camp => camp.delta > 0).reduce((sum, camp) => sum + camp.delta, 0);
        assert.ok(gains(outcome.failure!.camps) < gains(outcome.success.camps), `${label}/${choice.id}: благодарность лагерей`);
      }
      // Конкурс заводов и версии дела идут прежним общим путём.
      assert.equal(executionRisk(state, contestChoice), null, `${label}: конкурс заводов`);
      assert.equal(successChance(state, pilotChoice), successChance({ ...state, currentEvent: { ...state.currentEvent!, card: undefined } }, pilotChoice),
        `${label}: шанс исполнения не меняется`);
    }
  }
});

test('курс президента против инвестиций стоит и при срыве: срыв не дешевле исполнения', async () => {
  // В этот ход у левого президента обычно приходит областное дело, поэтому берём то же дело с другим курсом.
  const state = { ...await signedCase(3, 'debut', 'pragmatist'), ideo: 'leftist' as const };
  for (const choice of state.currentEvent!.choices.slice(0, 2)) {
    const success = choiceEffects(state, choice).resources, failure = choiceEffects(state, choice, true).resources;
    assert.ok(sumOf(failure) < sumOf(success), `${choice.id}: срыв дешевле исполнения`);
    assert.ok(failure.personalResource! < 0, `${choice.id}: штраф за решение против курса сохраняется`);
  }
});

test('настоящая подпись: сцена срыва, ресурсы прогноза, нет оплаты поставок и тот же результат при повторе', async () => {
  for (const [seed, diff, ideo] of [[3, 'debut', 'pragmatist'], [11, 'coalition', 'pragmatist'], [19, 'debut', 'nationalist']] as const) {
    const original = await signedCase(seed, diff, ideo);
    for (const choice of original.currentEvent!.choices.slice(0, 2)) {
      const label = `${seed}/${diff}/${ideo}/${choice.id}`;
      const state = withOutcome(original, choice, false);
      const before = structuredClone(state);
      const after = await signChoice(state, choice.id);
      assert.equal(after.lastTurn!.success, false, label);
      assert.ok(after.lastTurn!.narrative.includes(choice.sceneFail!), `${label}: именно сцена срыва`);
      assert.deepEqual(after.lastTurn!.resourceChanges, choiceEffects(state, choice, true).resources, `${label}: подпись совпадает с движком`);
      // Опоры на 60, поэтому прогноз срыва без предела шкалы совпадает с тем, что принесла подпись.
      const forecast = Object.entries(choiceOutcomes(state, choice)!.failure!.resources).filter(([, value]) => value);
      assert.deepEqual(Object.fromEntries(forecast), after.lastTurn!.resourceChanges, `${label}: прогноз срыва совпадает с подписью`);
      assert.ok(!after.lastTurn!.scheduled.some(entry => (entry.res.economy ?? 0) > 0), `${label}: нет выручки за несостоявшийся заказ`);
      assert.deepEqual(state, before, `${label}: разрешение не меняет исходный снимок`);
      assert.deepEqual(after, await signChoice(state, choice.id), `${label}: повтор детерминирован`);
    }
  }
});

test('старое сохранение получает тот же срыв; архив, Daily и переделанный вариант идут прежним путём', async () => {
  const state = await signedCase(7, 'debut', 'pragmatist');
  const restored = parseSave(JSON.stringify({ version: SAVE_VERSION, screen: 'chronicle', state }))!.state;
  const [pilot, russian] = state.currentEvent!.choices;
  for (const choice of [pilot, russian]) {
    assert.deepEqual(choiceEffects(restored, choice, true), choiceEffects(state, choice, true));
    for (const country of LEGACY_COUNTRIES) assert.equal(executionRisk({ ...state, country }, choice), null);
    assert.equal(executionRisk({ ...state, daily: '2026-11-06' }, choice), null);
    assert.equal(executionRisk(state, { ...choice, policyEffect: { economy: 6, externalReputation: 3 } }), null);
    assert.equal(executionRisk(state, { ...choice, advisor: { id: 'economist', name: 'Советник', role: 'Экономист', skill: 3 } }), null);
    for (const card of ['alt_standards_chamber', 'alt_standards_patriots']) {
      assert.equal(executionRisk({ ...state, currentEvent: { ...state.currentEvent!, card } }, choice), null, `${card}: версии дела не трогаем`);
    }
  }
});
