import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classicApi } from '../game/classic.ts';
import { createDailyState } from '../game/daily-run.ts';
import { createInitialState, resolveTurn, seededRandom, startEvent } from '../game/engine.ts';
import { debate } from '../game/forecasts.ts';
import { ALTERNATE_COUNTRY } from '../game/alternate-world.ts';
import type { Choice, GameState } from '../game/types.ts';
import { advisorDialogue } from './advisor-dialogue.ts';
import { resolutionOptions, unifiedResolution } from './advisor-outlook.ts';
import { debateVisible, visibleCaseLines } from './visible-case.ts';

const ordinary = (state: GameState) => !!state.currentEvent && !state.currentEvent.call && !state.currentEvent.press && !state.currentEvent.budget;
const pick = (state: GameState): Choice => {
  const event = state.currentEvent!;
  return event.press || event.call || event.budget ? event.choices[1] : event.choices.find(choice => !choice.path) ?? event.choices[0];
};

async function* turns(state: GameState, limit: number) {
  while (!state.ended && state.turn < limit) {
    state = startEvent(state, await classicApi.event(state));
    yield state;
    const choice = pick(state);
    state = resolveTurn(state, choice.id, await classicApi.consequence(state, choice.id));
  }
}

async function campaign(country: string, seed: number) {
  const setup = await classicApi.setup(country, 'coalition', 'pragmatist', seed);
  return createInitialState(country, 'coalition', 'pragmatist', setup, seededRandom(seed));
}

test('1978: под обычным делом — экран резолюции: каждый вариант со справкой и риском, без спора и подсказки', async () => {
  let checked = 0;
  for (const seed of [3, 11]) for await (const state of turns(await campaign(ALTERNATE_COUNTRY, seed), 20)) {
    if (!ordinary(state)) continue;
    assert.ok(unifiedResolution(state), `ход ${state.turn + 1}: обычное дело 1978 года идёт через экран резолюции`);
    const lines = visibleCaseLines(state);
    const options = resolutionOptions(state);
    assert.equal(lines.filter(line => line.startsWith('  · Вариант ')).length, options.length);
    assert.equal(lines.filter(line => line.startsWith('      риск: ')).length, options.length);
    assert.equal(lines.filter(line => line.startsWith('      исполнят: ')).length, options.length);
    assert.ok(!lines.some(line => line.includes('⚖')), 'спор советников на этом экране не показывается');
    for (const choice of options) assert.ok(!lines.some(line => choice.hint && line.includes(` — ${choice.hint}`)), 'подсказки экран не показывает');
    const speeches = options.reduce((sum, choice) => sum + advisorDialogue(state, choice).length, 0);
    assert.equal(lines.filter(line => line.includes('🗣')).length, speeches, 'речи — ровно те, что даёт advisorDialogue');
    checked++;
  }
  assert.ok(checked >= 10, `проверено дел ${checked}`);
});

test('«Дело дня» и архив: прежний блок — варианты с подсказкой и спор там, где его показывает стол', async () => {
  let debates = 0;
  for await (const state of turns(await createDailyState('2026-11-09'), 40)) {
    if (!ordinary(state)) continue;
    assert.ok(!unifiedResolution(state));
    const lines = visibleCaseLines(state);
    const event = state.currentEvent!;
    assert.deepEqual(lines.slice(0, event.choices.length), event.choices.map(choice => `  · ${choice.text} — ${choice.hint}`));
    const takes = debateVisible(state) ? debate(state) ?? [] : [];
    assert.equal(lines.filter(line => line.startsWith('  ⚖ ')).length, takes.length);
    debates += takes.length;
  }
  assert.ok(debates > 0, 'в «Деле дня» спор советников виден');
  for await (const state of turns(await campaign('Казахстан', 21), 6)) {
    if (!ordinary(state)) continue;
    assert.ok(!unifiedResolution(state));
    assert.ok(visibleCaseLines(state)[0].startsWith('  · '));
  }
});
