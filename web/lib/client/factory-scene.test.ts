import test from 'node:test';
import assert from 'node:assert/strict';
import { ALTERNATE_COUNTRY } from '../game/alternate-world.ts';
import { classicApi } from '../game/classic.ts';
import { createInitialState, resolveTurn, seededRandom, startEvent } from '../game/engine.ts';
import { factoryOutcome, isFactoryOpening } from './factory-scene.ts';
import { quarterTransition } from './quarter-transition.ts';

async function firstCase(seed: number) {
  const intro = await classicApi.setup(ALTERNATE_COUNTRY, 'debut', 'pragmatist', seed);
  const state = createInitialState(ALTERNATE_COUNTRY, 'debut', 'pragmatist', intro, seededRandom(seed));
  return startEvent(state, await classicApi.event(state));
}

test('factory staging follows all three actual policies and both execution outcomes without mutation', async () => {
  const seen = new Set<string>();
  for (let seed = 1; seed <= 180 && seen.size < 6; seed++) {
    const before = await firstCase(seed);
    for (const choice of before.currentEvent!.choices) {
      const after = resolveTurn(before, choice.id, await classicApi.consequence(before, choice.id));
      const original = JSON.stringify([before, after]);
      const scene = factoryOutcome(before, after)!;
      assert.equal(scene.path, choice.id);
      assert.equal(scene.success, after.lastTurn!.success);
      assert.equal(scene.detail, scene.success ? choice.scene : choice.sceneFail);
      assert.equal(scene.headline, (scene.success ? choice.headline : choice.headlineFail) ?? after.lastTurn!.headline);
      assert.equal(quarterTransition(before, after)!.kind, 'factory');
      assert.equal(JSON.stringify([before, after]), original);
      seen.add(`${scene.path}:${scene.success}`);
    }
  }
  assert.equal(seen.size, 6, 'actually exercise successful and failed a/b/c resolutions');
});

test('factory staging excludes Daily, other worlds, later turns and stale results', async () => {
  const before = await firstCase(21);
  const after = resolveTurn(before, 'b', await classicApi.consequence(before, 'b'));
  assert.equal(isFactoryOpening(before), true);
  assert.equal(isFactoryOpening({ ...before, daily: '2026-10-14' }), false);
  assert.equal(isFactoryOpening({ ...before, country: 'Беларусь' }), false);
  assert.equal(isFactoryOpening({ ...before, turn: 1 }), false);
  assert.equal(factoryOutcome(before, before), null);
  assert.equal(factoryOutcome(before, { ...after, daily: '2026-10-14' }), null);
  assert.equal(factoryOutcome(before, { ...after, lastTurn: { ...after.lastTurn!, choiceText: 'old council policy' } }), null);
  assert.match(before.currentEvent!.description, /08:15.*Кабинет президента/);
});
