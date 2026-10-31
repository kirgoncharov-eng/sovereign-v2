import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chronicleBelongsTo, encodeChronicle, parseChronicle, type ChronicleSnapshot } from './chronicle-save.ts';
import { firstStep, newTerm, nextCase, openingLines, startFromSeed } from './chronicle.ts';
import { EMPTY_PERSONAL } from './chronicle-personal.ts';

async function example(): Promise<ChronicleSnapshot> {
  const start = startFromSeed(5);
  const game = await nextCase(await newTerm(start));
  return { start, game, shown: openingLines(game), queue: [], step: firstStep(game), picks: [], form: null, stop: null, stops: {},
    memory: EMPTY_PERSONAL, visibleResources: game.resources, page: null, rivals: null, over: false };
}

test('chronicle saves a complete decision and restores it independently from the main save', async () => {
  const snapshot = await example();
  const restored = parseChronicle(encodeChronicle(snapshot));
  assert.deepEqual(restored, JSON.parse(JSON.stringify(snapshot)));
  assert.equal(restored?.game.currentEvent?.title, snapshot.game.currentEvent?.title);
});

test('chronicle rejects broken or incompatible snapshots without throwing', async () => {
  const raw = JSON.parse(encodeChronicle(await example()));
  assert.equal(parseChronicle('{broken'), null);
  assert.equal(parseChronicle(JSON.stringify({ ...raw, version: 999 })), null);
  raw.snapshot.game.resources = {};
  assert.equal(parseChronicle(JSON.stringify(raw)), null);
});

test('сохранение прототипа v1 открывается: анкета, остановка и память остановок пустые', async () => {
  const snapshot = await example();
  const { form, stop, stops, ...v1 } = snapshot;
  assert.deepEqual([form, stop, stops], [null, null, {}]);
  const restored = parseChronicle(JSON.stringify({ version: 1, snapshot: v1 }));
  assert.deepEqual(restored, JSON.parse(JSON.stringify(snapshot)));
});

test('анкета ЦИК и остановка на обращении переживают перезагрузку', async () => {
  const snapshot = { ...await example(),
    form: { field: 'program' as const, nameStep: 2, promises: ['jobs'] },
    stop: { key: 'minister-mandate', token: 'x', kind: 'letter' as const, title: 'Мандат', person: 'minister', deadline: 9 },
    stops: { 'minister-mandate': { token: 'x', kind: 'letter' as const, turn: 6, reminded: false, danger: false, urgent: false } } };
  assert.deepEqual(parseChronicle(encodeChronicle(snapshot)), JSON.parse(JSON.stringify(snapshot)));
  const broken = JSON.parse(encodeChronicle(snapshot));
  broken.snapshot.form.field = 'age';
  assert.equal(parseChronicle(JSON.stringify(broken)), null);
});

test('«Продолжить»: снимок ленты принадлежит партии из общего сохранения только с тем же идентификатором партии', async () => {
  const run = (id: string) => ({ id, startedAt: 1, version: 'test', source: 'web' as const, mode: 'ordinary' as const });
  const snapshot = await example();
  const mine = { ...snapshot, game: { ...snapshot.game, analyticsRun: run('a'.repeat(24)) } };
  const restored = parseChronicle(encodeChronicle(mine))!;
  // Та же партия: ход и зерно могли измениться — принадлежность по идентификатору партии.
  assert.ok(chronicleBelongsTo(restored, { ...mine.game, turn: mine.game.turn + 3, seed: mine.game.seed + 1 }));
  // Две корректные, но разные партии: чужая лента не подхватывается.
  assert.ok(!chronicleBelongsTo(restored, { ...mine.game, analyticsRun: run('b'.repeat(24)) }));
  // Без идентификатора принадлежность не доказана — ни со стороны сохранения, ни со стороны ленты.
  assert.ok(!chronicleBelongsTo(restored, { ...mine.game, analyticsRun: undefined }));
  assert.ok(!chronicleBelongsTo(parseChronicle(encodeChronicle(snapshot))!, mine.game));
});
