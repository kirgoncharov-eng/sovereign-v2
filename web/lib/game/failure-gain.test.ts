// #403, находка 5: сорванное решение 1978 года не приносит пользы — сцена срыва описывает провал.
// Частичный результат (половина вагонов, оплата частями, состав с опозданием) — только у авторских профилей срыва.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ALTERNATE_EVENTS } from '../content/alternate-history.ts';
import { ALTERNATE_COUNTRY, LEGACY_COUNTRIES } from './alternate-world.ts';
import { classicApi } from './classic.ts';
import { choiceEffects, choiceFollowUps, createInitialState, seededRandom } from './engine.ts';
import { executionRisk } from './execution-risk.ts';
import type { Choice, GameState } from './types.ts';

const PARTIAL = new Set(['alt_rail_chamber/b', 'alt_standards_chamber/a', 'alt_fuel_advance/a', 'alt_rail_blockade/b', 'alt_rail_blockade/c',
  'alt_standards_patriots/a']);

async function base(): Promise<GameState> {
  return createInitialState(ALTERNATE_COUNTRY, 'debut', 'pragmatist',
    await classicApi.setup(ALTERNATE_COUNTRY, 'debut', 'pragmatist', 1), seededRandom(1));
}

// Вариант дела в том виде, в каком его кладёт на стол classic.ts: позиция лагерей из camps или stance.
function onDesk(state: GameState, id: string) {
  const card = ALTERNATE_EVENTS.find(event => event.id === id)!;
  const choices = card.choices.map((choice, index): Choice => ({
    id: ['a', 'b', 'c', 'd'][index], text: choice.text, hint: choice.hint, tags: choice.tags, resolvesCrisis: null,
    ...(choice.policyEffect ? { policyEffect: choice.policyEffect } : {}),
    ...(choice.camps ?? choice.stance ? { stance: choice.camps ?? choice.stance } : {}),
  }));
  return { ...state, currentEvent: { title: card.title, description: '', choices, card: id } } as GameState;
}

const gains = (resources: Record<string, number>) => Object.entries(resources).filter(([, value]) => value > 0);

test('1978: срыв приносит пользу только там, где сцена описывает частичный результат, и меньше исполнения', async () => {
  const state = await base();
  for (const card of ALTERNATE_EVENTS) {
    const desk = onDesk(state, card.id);
    for (const choice of desk.currentEvent!.choices) {
      const key = `${card.id}/${choice.id}`;
      const failed = { ...choiceEffects(desk, choice, true).resources } as Record<string, number>;
      for (const effect of choiceFollowUps(desk, choice).filter(effect => effect.when === 'failure')) {
        for (const [resource, value] of Object.entries(effect.res)) failed[resource] = (failed[resource] ?? 0) + value;
      }
      const succeeded = choiceEffects(desk, choice).resources as Record<string, number>;
      if (!PARTIAL.has(key)) { assert.deepEqual(gains(failed), [], `${key}: ${choice.text}`); continue; }
      assert.ok(executionRisk(desk, choice), `${key}: авторский профиль срыва`);
      assert.ok(gains(failed).length > 0, `${key}: частичный результат сохраняется`);
      // Каждая польза не больше исполнения, а вместе — меньше: мазут в долг завода засчитан и при срыве, но в домах холодно.
      for (const [resource, value] of gains(failed)) assert.ok(value <= (succeeded[resource] ?? 0), `${key}: ${resource} не больше исполнения`);
      const total = (resources: Record<string, number>) => gains(resources).reduce((sum, [, value]) => sum + value, 0);
      assert.ok(total(failed) < total(succeeded), `${key}: срыв в сумме полезнее исполнения быть не может`);
    }
  }
});

test('«Дело дня» и архив сохраняют общую формулу срыва: половина пользы', async () => {
  const state = await base();
  const desk = onDesk(state, 'alt_region_customs');
  const choice = desk.currentEvent!.choices[0];
  const success = choiceEffects(desk, choice).resources.economy!;
  assert.ok(success > 0);
  assert.equal(choiceEffects(desk, choice, true).resources.economy, undefined, 'обычная партия 1978 года');
  const daily = choiceEffects({ ...desk, daily: '2026-11-09' }, choice, true).resources.economy!;
  assert.ok(daily > 0 && daily < success, '«Дело дня»');
  for (const country of LEGACY_COUNTRIES) {
    const archived = choiceEffects({ ...desk, country }, choice, true).resources.economy!;
    assert.ok(archived > 0 && archived < success, country);
  }
});
