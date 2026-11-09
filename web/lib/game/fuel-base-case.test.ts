// Базовое дело «Зима по новой цене» (alt_fuel) приходит запасным, когда не подошла ни одна версия.
// Три варианта обязаны отличаться ценой так, как их описывают текст и подсказка.
import test from 'node:test';
import assert from 'node:assert/strict';
import { classicApi } from './classic.ts';
import { ALTERNATE_COUNTRY } from './alternate-world.ts';
import { ALTERNATE_EVENTS } from '../content/alternate-history.ts';
import { createInitialState, seededRandom } from './engine.ts';
import { choiceOutcomes } from '../client/choice-outcomes.ts';
import type { GameState, ResourceKey } from './types.ts';

const BASE_CHOICES = {
  transit: 'Дать транзитный приоритет в обмен на скидку',
  supplier: 'Закупить топливо у другого поставщика',
  savings: 'Сократить расход и утеплить жилые кварталы',
} as const;

async function fuelCase(seed: number, diff: 'debut' | 'coalition' | 'crisis') {
  const initial = createInitialState(ALTERNATE_COUNTRY, diff, 'pragmatist',
    await classicApi.setup(ALTERNATE_COUNTRY, diff, 'pragmatist', seed), seededRandom(seed));
  // Опоры на 60: предел шкалы не должен скрывать дельты вариантов.
  const resources = Object.fromEntries(Object.keys(initial.resources).map(key => [key, 60])) as GameState['resources'];
  const state = { ...initial, turn: 4, resources };
  const event = await classicApi.event(state);
  assert.equal((event as typeof event & { cardId?: string }).cardId, 'alt_fuel', `${seed}/${diff}: без версий приходит базовое дело`);
  return { state: { ...state, currentEvent: event }, event };
}

test('у трёх базовых вариантов своя авторская цена и причина каждой потери', () => {
  const card = ALTERNATE_EVENTS.find(entry => entry.id === 'alt_fuel')!;
  assert.deepEqual(card.choices.map(choice => choice.text), Object.values(BASE_CHOICES));
  for (const choice of card.choices) {
    assert.ok(choice.policyEffect, `${choice.text}: нет policyEffect`);
    for (const [key, value] of Object.entries(choice.policyEffect!)) {
      if (value! < 0) assert.ok(choice.costReasons?.[key as ResourceKey], `${choice.text}: нет причины для ${key}`);
    }
  }
});

test('покупка у другого поставщика бьёт по казне, транзит — по репутации, экономия — по выпуску, но греет дома', async () => {
  for (const diff of ['debut', 'coalition', 'crisis'] as const) {
    for (const seed of [1, 6, 7]) {
      const { state, event } = await fuelCase(seed, diff);
      const byText = Object.fromEntries(event.choices.map(choice => [choice.text, choiceOutcomes(state, choice)!]));
      const transit = byText[BASE_CHOICES.transit].success.resources;
      const supplier = byText[BASE_CHOICES.supplier].success.resources;
      const savings = byText[BASE_CHOICES.savings].success.resources;
      const label = `${seed}/${diff}`;
      // «Дороже сейчас»: деньги за независимость графика платит казна, и платит больше остальных.
      assert.ok(supplier.economy! < transit.economy! && supplier.economy! < savings.economy!, `${label}: казна поставщика`);
      // #403: дела первой главы вдвое дешевле; масштаб — как у соседних версий после удешевления.
      assert.ok(supplier.economy! <= -3, `${label}: масштаб соседних версий`);
      // «Очередь для своих заводов»: свои грузы ждут, транзит уходит соседу.
      assert.ok(transit.economy! < 0, `${label}: грузы ждут`);
      assert.ok(transit.externalReputation! < 0 && supplier.externalReputation! > 0, `${label}: репутация`);
      // «Заводам придётся экономить»: выпуск падает, зато квартиры тёплые.
      assert.ok(savings.economy! < 0, `${label}: короткие смены стоят денег`);
      assert.ok(savings.internalLegitimacy! > transit.internalLegitimacy! && savings.internalLegitimacy! > supplier.internalLegitimacy!,
        `${label}: тепло домов`);
      // Прежняя ошибка: два варианта давали одинаковые ресурсы.
      assert.notDeepEqual(transit, supplier, `${label}: профили транзита и поставщика совпали`);
      assert.notDeepEqual(transit, savings, `${label}: профили транзита и экономии совпали`);
      assert.notDeepEqual(supplier, savings, `${label}: профили поставщика и экономии совпали`);
    }
  }
});
