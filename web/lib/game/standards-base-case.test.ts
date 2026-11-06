// Базовое дело «Чужой рынок, другие станки» (alt_standards) приходит на ходу 15, когда не подошла ни одна версия.
// Опытная линия и российские заказы обязаны отличаться ценой так, как их описывают текст и подсказка (#363).
import test from 'node:test';
import assert from 'node:assert/strict';
import { classicApi } from './classic.ts';
import { ALTERNATE_COUNTRY } from './alternate-world.ts';
import { ALTERNATE_EVENTS } from '../content/alternate-history.ts';
import { createInitialState, seededRandom } from './engine.ts';
import { choiceOutcomes } from '../client/choice-outcomes.ts';
import type { GameState, IdeologyId, ResourceKey } from './types.ts';

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
