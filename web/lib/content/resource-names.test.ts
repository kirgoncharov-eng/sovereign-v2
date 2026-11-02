import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { RESOURCE_NAME, RESOURCE_NAME_GENITIVE, RESOURCE_TITLE } from './resource-names.ts';

const ROOTS = ['lib', 'app'];
// Прежнее имя в любом падеже: «политкапитал», «политического капитала», «политическим капиталом»…
const OLD_NAME = /политкапитал|политическ[а-яё]*\s+капитал/i;
// После замены мужского «капитала» на среднее «влияние» не должно остаться мужских кратких форм.
const MASCULINE_AFTER = /[Вв]лияние\s+(цел|нужен|потрачен|сохранён|исчерпан|растрачен|получен|невелик|мал)[\s,.;:!?]/;
const SOURCE = /\.(ts|tsx|jsx|mjs)$/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return SOURCE.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

test('#310, C13: ресурс politicalCapital на экране называется только «влияние»', () => {
  assert.equal(RESOURCE_NAME.politicalCapital, 'влияние');
  assert.equal(RESOURCE_NAME_GENITIVE.politicalCapital, 'влияния');
  assert.equal(RESOURCE_TITLE.politicalCapital, 'Влияние');
  const found = ROOTS.flatMap(files).filter(path => OLD_NAME.test(readFileSync(path, "utf8")));
  assert.deepEqual(found, [], 'в исходниках интерфейса и контента не осталось «политкапитала»');
});

test('локальные таблицы подписей называют politicalCapital так же, как словарь', () => {
  const labels = new Set([RESOURCE_NAME.politicalCapital, RESOURCE_NAME_GENITIVE.politicalCapital, RESOURCE_TITLE.politicalCapital]);
  for (const path of ROOTS.flatMap(files)) {
    for (const match of readFileSync(path, 'utf8').matchAll(/politicalCapital\s*:\s*["']([А-Яа-яЁё]{3,20})["']/g)) {
      assert.ok(labels.has(match[1]), `${path}: «${match[1]}»`);
    }
  }
});

test('регрессия: прежнее имя ловится в любом падеже, а «влияние» не согласуется в мужском роде', () => {
  for (const text of ['Потребует денег и политического капитала', 'вместе с политическим капиталом', 'Политкапитал −2', 'политкапитала']) {
    assert.match(text, OLD_NAME, text);
  }
  assert.match('Влияние цел, но…', MASCULINE_AFTER);
  assert.doesNotMatch('Влияние не изменится, но…', MASCULINE_AFTER);
  const bad = ROOTS.flatMap(files).filter(path => MASCULINE_AFTER.test(readFileSync(path, 'utf8')));
  assert.deepEqual(bad, [], 'мужские краткие формы после «влияние»');
});
