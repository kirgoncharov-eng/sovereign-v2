import test from 'node:test';
import assert from 'node:assert/strict';
import { ALTERNATE_COUNTRY, LEGACY_COUNTRIES, eraText } from './alternate-world.ts';
import { ACTIONS, actionLabel } from './data.ts';
import { ADVISOR_REASONS } from '../content/forecasts.ts';
import { CALL_DEMANDS } from '../content/calls.ts';

// #310, C13: в 1978 году западный полюс — Торговый союз. Направления («мазут с запада») — география, их не трогаем.
const WEST_ENTITY = /(?<![\p{L}])Запад(?![\p{L}])|западные столицы|Брюссель/u;

test('1978: «Запад» и Брюссель как сущность заменены Торговым союзом', () => {
  assert.equal(actionLabel('pro_west', ALTERNATE_COUNTRY), 'Курс на Торговый союз');
  for (const lines of [Object.values(ADVISOR_REASONS.externalReputation ?? {}).flat(), Object.values(CALL_DEMANDS).flat()]) {
    for (const line of lines) {
      const text = typeof line === 'string' ? line : `${line.text} ${line.otherwise}`;
      assert.doesNotMatch(eraText(text), WEST_ENTITY, text);
    }
  }
  assert.equal(eraText('Так куда вы ведёте страну — на Запад или к Москве?'), 'Так куда вы ведёте страну — к Торговому союзу или к России?');
  assert.equal(eraText('Мазут пришёл с запада'), 'Мазут пришёл с запада');
});

test('архивные страны сохраняют прежние метки', () => {
  for (const country of LEGACY_COUNTRIES) {
    for (const tag of Object.keys(ACTIONS) as (keyof typeof ACTIONS)[]) assert.equal(actionLabel(tag, country), ACTIONS[tag].label);
  }
});
