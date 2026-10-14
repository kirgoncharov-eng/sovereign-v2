import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALTERNATE_EVENTS } from './alternate-history.ts';
import { historicalEcho, HISTORICAL_ECHOES } from './historical-echoes.ts';
import { ALTERNATE_COUNTRY, LEGACY_COUNTRIES } from '../game/alternate-world.ts';
import { DELAYED, SAVE_VERSION } from '../game/data.ts';
import { classicApi } from '../game/classic.ts';
import { createInitialState, planTurn, resolveTurn, seededRandom, startEvent } from '../game/engine.ts';
import { parseSave } from '../client/save.ts';
import type { Pending } from '../game/types.ts';

const pendingFor = (event: string, source: string, label: string): Pending => ({
  id: 'authored-echo', due: 1, from: 0, event, source, label, res: { economy: 5 },
});

test('every delayed tag of the 24 historical choices reaches the narrator with its exact causal story', async () => {
  const base = createInitialState(ALTERNATE_COUNTRY, 'debut', 'pragmatist',
    await classicApi.setup(ALTERNATE_COUNTRY, 'debut', 'pragmatist', 21), seededRandom(21));
  const currentEvent = await classicApi.event(base);
  assert.equal(ALTERNATE_EVENTS.length, 8);
  for (const card of ALTERNATE_EVENTS) {
    assert.equal(Object.keys(HISTORICAL_ECHOES[card.id]).length, card.choices.length);
    for (const choice of card.choices) {
      const stories = HISTORICAL_ECHOES[card.id][choice.text];
      const labels = choice.tags.map(tag => DELAYED[tag]?.label).filter(Boolean);
      assert.deepEqual(Object.keys(stories).sort(), labels.sort(), `${card.id}: ${choice.text}`);
      for (const label of labels) {
        const pending = pendingFor(card.title, choice.text, label!);
        const before = JSON.stringify(pending);
        assert.equal(historicalEcho(ALTERNATE_COUNTRY, pending), stories[label!]);
        assert.ok(stories[label!].length > 40);
        assert.equal(JSON.stringify(pending), before);
        for (const country of LEGACY_COUNTRIES) assert.equal(historicalEcho(country, pending), null);
        assert.equal(historicalEcho(ALTERNATE_COUNTRY, { ...pending, source: 'Unknown choice' }), null);
        assert.equal(historicalEcho(ALTERNATE_COUNTRY, { ...pending, event: 'Another event' }), null);
        assert.equal(historicalEcho(ALTERNATE_COUNTRY, { ...pending, story: 'Saved authored story' }), null);
        const delayed = choice.tags.map(tag => DELAYED[tag]).find(entry => entry?.label === label)!;
        const state = startEvent({ ...base, pending: [{ ...pending, res: delayed.res }] }, currentEvent);
        const narration = await classicApi.consequence(state, 'a');
        assert.ok(narration.narrative.includes(stories[label!]));
        assert.deepEqual(resolveTurn(state, 'a', narration).resources, planTurn(state, 'a').resources);
      }
    }
  }
});

test('narrator uses the fuel decision after save/reload without changing the matured effect or signature', async () => {
  const base = createInitialState(ALTERNATE_COUNTRY, 'debut', 'pragmatist',
    await classicApi.setup(ALTERNATE_COUNTRY, 'debut', 'pragmatist', 21), seededRandom(21));
  const delayed = DELAYED.investment!;
  const fuel = ALTERNATE_EVENTS.find(card => card.id === 'alt_fuel')!;
  const pending = { ...pendingFor(fuel.title, fuel.choices[0].text, delayed.label), res: delayed.res };
  const state = startEvent({ ...base, pending: [pending] }, await classicApi.event(base));
  const loaded = parseSave(JSON.stringify({ version: SAVE_VERSION, screen: 'game', state }))!.state;
  const before = JSON.stringify(loaded);
  const narration = await classicApi.consequence(loaded, 'a');
  const story = historicalEcho(ALTERNATE_COUNTRY, pending)!;
  assert.ok(narration.narrative.includes(story));
  assert.doesNotMatch(narration.narrative, /Деньги инвестора наконец|открылись первые рабочие места/);
  const plan = planTurn(loaded, 'a');
  const result = resolveTurn(loaded, 'a', narration);
  assert.deepEqual(result.resources, plan.resources);
  assert.deepEqual(result.lastTurn!.matured, [pending]);
  assert.deepEqual(result.pending, plan.pending);
  assert.equal(JSON.stringify(loaded), before);
  const ownState = { ...loaded, pending: [{ ...pending, story: 'Авторский доклад, сохранённый при подписи.' }] };
  const ownNarration = await classicApi.consequence(ownState, 'a');
  assert.ok(ownNarration.narrative.includes(ownState.pending[0].story));
  assert.ok(!ownNarration.narrative.includes(story));
});
