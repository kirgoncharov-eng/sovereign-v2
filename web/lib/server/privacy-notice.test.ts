import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Guard the public notice's factual boundaries; browser QA separately checks rendered text/layout.
const page = readFileSync(new URL('../../app/privacy/page.tsx', import.meta.url), 'utf8').replace(/\s+/g, ' ');

test('public notice separates browser save from Telegram meta and states the identity boundary', () => {
  assert.match(page, /Текущая партия/);
  assert.match(page, /а не полное сохранение текущей партии/);
  assert.match(page, /он передаётся вместе с подписанными данными Telegram/);
  assert.match(page, /нельзя считать гарантированно анонимными/);
  assert.doesNotMatch(page, /Анонимная статистика|Имени, Telegram и содержания решений в ней нет/);
});

test('public notice does not equate clearing local data or forget with erasing every copy', () => {
  assert.match(page, /но не удаляет серверную статистику, гостевые таблицы и облачный прогресс Telegram/);
  assert.match(page, /\/forget тоже не удаляет данные по браузерному PID/);
  assert.match(page, /Знание публичного номера браузера само по себе не подтверждает владение данными/);
  assert.match(page, /Полная политика ещё не завершена/);
  assert.match(page, /Единого срока удаления всей статистики пока нет/);
  assert.match(page, /Регионы хранения, сроки журналов и резервных копий провайдеров пока не подтверждены/);
});
