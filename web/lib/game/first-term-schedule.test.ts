import test from 'node:test';
import assert from 'node:assert/strict';
import { classicApi } from './classic.ts';
import { ALTERNATE_COUNTRY } from './alternate-world.ts';
import { ALTERNATE_EVENTS } from '../content/alternate-history.ts';
import { createInitialState, resolveTurn, seededRandom, startEvent } from './engine.ts';
import { openDeskWhenDue } from './desk-timing.ts';
import { firstTermLaw, scheduledFirstTerm, versionsOf } from './first-term-schedule.ts';
import { openLivingWorld, validLivingWorld } from './living-world.ts';
import { parseSave } from '../client/save.ts';
import { SAVE_VERSION } from './data.ts';
import type { GameState } from './types.ts';

async function fresh(seed: number) {
  return createInitialState(ALTERNATE_COUNTRY, 'debut', 'pragmatist',
    await classicApi.setup(ALTERNATE_COUNTRY, 'debut', 'pragmatist', seed), seededRandom(seed));
}

test('30 сроков: авторские дела без общих карточек, законов и документов', async () => {
  for (let seed = 1; seed <= 30; seed++) {
    let state = await fresh(seed);
    const cases = new Set<string>();
    for (let turn = 1; turn <= 20; turn++) {
      // Проверяем доступность всех слотов, независимо от раннего поражения стратегии.
      state = { ...state, resources: Object.fromEntries(Object.keys(state.resources).map(key => [key, 80])) as GameState['resources'] };
      const event = await classicApi.event(state);
      const cardId = (event as typeof event & { cardId?: string }).cardId;
      if (cardId && ALTERNATE_EVENTS.some(card => card.id === cardId)) cases.add(cardId);
      assert.ok(!cardId?.startsWith('ins:'), `${seed}/${turn}: документ`);
      assert.ok(!cardId?.startsWith('law:') || /alt_export_guarantee|alt_open_orders/.test(cardId), `${seed}/${turn}: общий закон`);
      assert.ok(event.beat || event.special || event.budget || cardId?.startsWith('law:')
        || ALTERNATE_EVENTS.some(card => card.id === cardId), `${seed}/${turn}: чужое дело ${cardId}`);
      if (turn === 5) assert.equal(cardId, 'alt_fuel');
      // Ход 13 — указ о больницах или его версия по положению дел (#214); проект больниц открывается в любом случае.
      if (turn === 13) assert.ok(['alt_district', ...versionsOf('alt_district')].includes(cardId!), `${seed}: ${cardId}`);
      if (turn === 20) assert.equal(cardId, 'alt_archive');
      state = startEvent(state, event);
      const choices = state.currentEvent!.choices;
      const choice = choices.find(entry => entry.path === 'run') ?? choices[seed % choices.length];
      state = openDeskWhenDue(resolveTurn(state, choice.id, await classicApi.consequence(state, choice.id)));
      assert.equal(!!state.world, turn >= 5, `${seed}/${turn}: энергосеть после топлива`);
      assert.equal(!!state.world?.health, turn >= 13, `${seed}/${turn}: больницы после указа`);
      if (state.world) assert.equal(validLivingWorld(state.world), true);
      const loaded = parseSave(JSON.stringify({version: SAVE_VERSION, screen: state.ended ? 'ending' : 'game', state}));
      assert.equal(JSON.stringify(loaded?.state), JSON.stringify(state), `${seed}/${turn}: reload`);
    }
    assert.ok(cases.size >= 7, `${seed}: авторских дел ${cases.size}`);
    assert.equal(scheduledFirstTerm(state), false, 'второй срок использует обычный календарь');
  }
});

test('программа требует подписи; закон помнит исполненный аванс', async () => {
  const initial = await fresh(1);
  const fuel = ALTERNATE_EVENTS.find(card => card.id === 'alt_fuel')!;
  const opened = { ...initial, turn: 5, usedEvents: ['alt_fuel'] };
  assert.equal(openLivingWorld(opened).world, undefined);
  const signed = {
    ...opened,
    history: [{year: 1979, title: fuel.title, choice: fuel.choices[0].text, headline: '', historianNote: '', success: false}],
  };
  const world = openLivingWorld(signed);
  assert.equal(world.world?.openedTurn, 5, 'программа доступна и после неисполненного приказа');
  assert.equal(world.world?.health, undefined);
  assert.equal(openLivingWorld(world), world, 'чтение не создаёт повторного письма');
  const wages = ALTERNATE_EVENTS.find(card => card.id === 'alt_wages')!;
  const advance = { ...initial, history: [{year: 1978, title: wages.title, choice: wages.choices[1].text,
    headline: '', historianNote: '', success: true}] };
  assert.equal(firstTermLaw(advance), 'alt_export_guarantee');
  assert.equal(firstTermLaw({...advance, history: [{...advance.history[0], success: false}]}), 'alt_open_orders');
  assert.equal(scheduledFirstTerm({...initial, daily:'2026-10-15'}), false);
});
