import test from 'node:test';
import assert from 'node:assert/strict';
import * as secretary from './secretary.ts';

const SLOTS = ['secretary', 'advisor', 'advisorRole', 'director', 'figure', 'figureRole'];

function allTexts(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(allTexts);
  if (value && typeof value === 'object') return Object.values(value).flatMap(allTexts);
  return [];
}

const texts = allTexts(Object.fromEntries(Object.entries(secretary).filter(([, value]) => typeof value !== 'function')));

test('у каждого повода описи есть строки на каждом уровне доверия; доверие — словами', () => {
  for (const [occasion, byTrust] of Object.entries(secretary.INVENTORY_LINES))
    for (const trust of [0, 1, 2] as const) assert.ok(byTrust[trust].length >= 2, `${occasion}/${trust}`);
  assert.deepEqual(Object.values(secretary.TRUST_WORDS), ['держит дистанцию', 'доверяет', 'на вашей стороне']);
});

test('в текстах только известные слоты и без пустых строк', () => {
  assert.ok(texts.length > 80);
  for (const text of texts) {
    assert.ok(text.trim().length > 0);
    for (const [, slot] of text.matchAll(/\{(\w+)\}/g)) assert.ok(SLOTS.includes(slot), `${slot}: ${text}`);
  }
});

test('у советников и послов пол неизвестен: в их строках нет местоимений по роду и глаголов прошедшего времени', () => {
  for (const text of texts.filter(line => /\{(advisor|advisorRole|figure|figureRole)\}/.test(line))) {
    assert.doesNotMatch(text, /(^|\s)(он|она|ему|ей|его|её)(\s|[.,])/i, text);
    // «{advisorRole} присмотрел»: прошедшее время в единственном числе выдаёт род. Проверяем сказуемое самого слота —
    // от слота до конца предложения; «Повар купил рыбу», «слышали» и короткие «стол», «зал» не трогаем.
    for (const [, clause] of text.matchAll(/\{(?:advisor|advisorRole|figure|figureRole)\}([^.;!?—]*)/g)) {
      const past = clause.match(/[а-яё]{2,}[аеиоуыя]ла?(?![а-яё])/gi) ?? [];
      assert.deepEqual(past.filter(word => word.length >= 5), [], text);
    }
  }
});

test('сплетня о следующем деле есть для каждого дела первого срока', () => {
  for (const card of ['alt_harvest', 'alt_fuel', 'alt_radio', 'alt_rail', 'alt_district', 'alt_standards', 'alt_archive'])
    assert.ok(secretary.NEXT_CASE_GOSSIP[card], card);
});

test('слоты подставляются, неизвестные остаются как есть', () => {
  assert.equal(secretary.fillSecretary('{secretary} и {director}, {unknown}', { secretary: 'Нина Острина', director: 'Роман Лесин' }),
    'Нина Острина и Роман Лесин, {unknown}');
});

test('реакции на ответ идут после исхода, где имя уже названо, — без повторного имени', () => {
  for (const text of Object.values(secretary.TRUST_CHANGE)) assert.doesNotMatch(text, /\{secretary\}/, text);
});
