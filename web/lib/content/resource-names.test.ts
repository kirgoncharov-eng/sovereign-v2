import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { RESOURCE_NAME, RESOURCE_NAME_GENITIVE, RESOURCE_TITLE } from './resource-names.ts';

const ROOTS = ['lib', 'app'];
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
  const found = ROOTS.flatMap(files).filter(path => /политкапитал|политический капитал/i.test(readFileSync(path, "utf8")));
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
