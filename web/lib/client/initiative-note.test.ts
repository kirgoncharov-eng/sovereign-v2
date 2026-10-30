import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classicApi } from '../game/classic.ts';
import { ALTERNATE_COUNTRY, LEGACY_COUNTRIES } from '../game/alternate-world.ts';
import { RESOURCE_KEYS } from '../game/data.ts';
import { createInitialState, resolveTurn, seededRandom, startEvent } from '../game/engine.ts';
import { confirmInitiative, initiativeOptions } from '../game/initiatives.ts';
import {
  existingResourceResponses,
  initiativeNote,
  quarterDeadline,
  resourceInitiatives,
} from './initiative-note.ts';
import { openLivingWorld, livingActions } from '../game/living-world.ts';
import { ALTERNATE_EVENTS } from '../content/alternate-history.ts';
import type { DifficultyId, GameState } from '../game/types.ts';

async function initial(seed = 7, difficulty: DifficultyId = 'debut', country = ALTERNATE_COUNTRY) {
  return createInitialState(
    country,
    difficulty,
    'pragmatist',
    await classicApi.setup(country, difficulty, 'pragmatist', seed),
    seededRandom(seed)
  );
}
async function afterFirst() {
  let state = await initial();
  state = startEvent(state, await classicApi.event(state));
  const id = state.currentEvent!.choices[0].id;
  state = resolveTurn(state, id, await classicApi.consequence(state, id));
  return {
    ...state,
    resources: Object.fromEntries(RESOURCE_KEYS.map((key) => [key, 60])) as GameState['resources'],
    factions: state.factions.map((faction) => ({ ...faction, relation: 30 })),
    keyFigures: state.keyFigures.map((figure) => ({ ...figure, relation: 30 })),
  };
}

test('справка первого дела и архив не получают новых распоряжений; ранний доступ не требует стола', async () => {
  assert.deepEqual(resourceInitiatives(await initial(), 'economy'), []);
  for (const country of LEGACY_COUNTRIES) {
    assert.deepEqual(
      resourceInitiatives({ ...(await initial(7, 'debut', country)), turn: 1 }, 'economy'),
      []
    );
  }
  const state = await afterFirst();
  assert.equal(state.world, undefined);
  assert.equal(resourceInitiatives(state, 'economy').length, 3);
  assert.deepEqual(resourceInitiatives({ ...state, daily: '2026-10-26' }, 'economy'), []);
});

test('записка показывает реальную прибавку у границы100, полный расход и календарную дату долга', async () => {
  const state = await afterFirst();
  state.resources.economy = 98;
  const option = initiativeOptions(state, 'economy')[0];
  const before = JSON.stringify(state);
  const note = initiativeNote(state, option);
  assert.ok(note.immediate.some((line) => /\+2$/.test(line)));
  assert.ok(note.immediate.some((line) => /−3$/.test(line)));
  assert.ok(note.commitments.some((line) => /конец I квартала 1979 года.*−10/.test(line)));
  const signed = confirmInitiative(state, option.id);
  assert.equal(signed.pending.find((item) => item.id === option.repayment!.id)!.due, 5);
  assert.equal(JSON.stringify(state), before);
  assert.equal(quarterDeadline(state, 4), 'конец IV квартала 1978 года');
  assert.equal(quarterDeadline(state, 8), 'конец IV квартала 1979 года');
});

test('запрет на подпись объясняет текущий порог, использованный квартал и конечный резерв', async () => {
  const state = await afterFirst();
  state.resources.politicalCapital = 21;
  const blocked = initiativeNote(state, initiativeOptions(state, 'economy')[0]);
  assert.match(blocked.blocked!, /кризиса.*21 → 18/);
  state.resources.politicalCapital = 60;
  const signed = confirmInitiative(state, 'advance:domestic');
  assert.match(initiativeNote(signed, initiativeOptions(signed, 'economy')[0]).blocked!, /уже подписано/);
  const next = { ...signed, turn: signed.turn + 1 };
  assert.match(
    initiativeNote(next, initiativeOptions(next, 'economy')[0]).blocked!,
    /резерв уже использован/
  );
});

test('договор раскрывает три будущие выплаты, запреты, личное отношение и последствия разрыва', async () => {
  const state = await afterFirst();
  const option = initiativeOptions(state, 'politicalCapital')[0];
  const note = initiativeNote(state, option);
  assert.ok(note.relations.some((line) => /личное отношение \+8/.test(line)));
  assert.match(note.commitments.join('\n'), /влияние \+2.*конца III квартала 1978 года; всего 3 выплаты/);
  assert.match(note.commitments.join('\n'), /Не проводить:/);
  assert.match(note.commitments.join('\n'), /отношение лагеря -25/);
});

test('имена и роли в записках берутся из настоящих партий, политическая цена не исчезает у внешнего аванса', async () => {
  for (const [seed, difficulty] of [
    [1, 'crisis'],
    [7, 'debut'],
    [21, 'coalition'],
    [31, 'debut'],
  ] as const) {
    const state = { ...(await initial(seed, difficulty)), turn: 1 };
    for (const option of initiativeOptions(state)) {
      const note = initiativeNote(state, option);
      assert.ok(note.title);
      assert.ok(note.actor.includes(option.actor!.name));
      assert.ok(!/undefined|NaN|\{\{/.test(JSON.stringify(note)));
      if (option.id === 'advance:west') assert.ok(note.relations.length >= 2);
    }
  }
});

test('снятие личного приоритета использует настоящие цену и запрет действующего поручения', async () => {
  const state = await afterFirst();
  const worldState = openLivingWorld({
    ...state,
    turn: 13,
    lastTurn: null,
    history: [
      ...state.history,
      ...['alt_fuel', 'alt_district'].map((id) => ({
        ...state.history[0],
        title: ALTERNATE_EVENTS.find((entry) => entry.id === id)!.title,
      })),
    ],
  });
  worldState.world!.government!.priority = 'energy';
  const before = JSON.stringify(worldState);
  const response = existingResourceResponses(worldState, 'personalResource').find(
    (entry) => entry.id === 'government:release'
  );
  assert.deepEqual(
    response,
    livingActions(worldState).find((entry) => entry.id === 'government:release')
  );
  assert.ok(response);
  assert.match(response.detail, /легитимности −2/);
  assert.equal(JSON.stringify(worldState), before);
  const signed = confirmInitiative(worldState, 'advance:domestic');
  assert.match(existingResourceResponses(signed, 'personalResource')[0].blocked!, /уже использовано/);
});
