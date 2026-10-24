import test from 'node:test';
import assert from 'node:assert/strict';
import { ALTERNATE_RANDOM_EVENTS } from './alternate-history.ts';
import { RANDOM_EVENTS } from './events.ts';
import { classicApi } from '../game/classic.ts';
import { ALTERNATE_COUNTRY } from '../game/alternate-world.ts';
import { createInitialState, resolveTurn, seededRandom, startEvent } from '../game/engine.ts';

test('фон 1978 года: те же эффекты в том же порядке, что и общий пул, — баланс не меняется', () => {
  assert.deepEqual(ALTERNATE_RANDOM_EVENTS.map(event => event.effect), RANDOM_EVENTS.map(event => event.effect));
  for (const event of ALTERNATE_RANDOM_EVENTS) {
    // Название попадает в разбор хода строчными буквами: имя собственное там исказится.
    assert.doesNotMatch(event.title.slice(1), /[А-ЯЁ]/, event.title);
    assert.doesNotMatch(`${event.title} ${event.description}`, /хакер|сайт|ролик|просмотр|агентств|лидер/i, event.title);
  }
});

test('в партиях 1978 года выпадает только фон своей эпохи', async () => {
  const own = new Set(ALTERNATE_RANDOM_EVENTS.map(event => event.title));
  let seen = 0;
  for (const seed of [2, 5, 9, 14]) {
    const intro = await classicApi.setup(ALTERNATE_COUNTRY, 'coalition', 'pragmatist', seed);
    let state = createInitialState(ALTERNATE_COUNTRY, 'coalition', 'pragmatist', intro, seededRandom(seed));
    while (!state.ended && state.turn < 20) {
      const event = await classicApi.event(state);
      if (event.randomEvent) {
        seen++;
        assert.ok(own.has(event.randomEvent.title), `${seed}/${state.turn + 1}: ${event.randomEvent.title}`);
      }
      state = startEvent(state, event);
      const choice = state.currentEvent!.choices.find(entry => entry.path === 'run') ?? state.currentEvent!.choices[0];
      state = resolveTurn(state, choice.id, await classicApi.consequence(state, choice.id));
    }
  }
  assert.ok(seen > 0, 'за четыре срока фон не выпал ни разу');
});
