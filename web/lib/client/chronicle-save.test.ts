import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeChronicle, parseChronicle, type ChronicleSnapshot } from './chronicle-save.ts';
import { firstStep, newTerm, nextCase, openingLines, startFromSeed } from './chronicle.ts';
import { EMPTY_PERSONAL } from './chronicle-personal.ts';

async function example(): Promise<ChronicleSnapshot> {
  const start = startFromSeed(5);
  const game = await nextCase(await newTerm(start));
  return { start, game, shown: openingLines(game), queue: [], step: firstStep(game), picks: [],
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
