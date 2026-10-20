import test from 'node:test';
import assert from 'node:assert/strict';
import { ALTERNATE_EVENTS } from './alternate-history.ts';
import { classicApi } from '../game/classic.ts';
import { choiceEffects, createInitialState, resolveTurn, seededRandom, startEvent } from '../game/engine.ts';
import { ALTERNATE_COUNTRY } from '../game/alternate-world.ts';
import { parseSave } from '../client/save.ts';
import { SAVE_VERSION } from '../game/data.ts';
import type { Choice, GameState } from '../game/types.ts';

// #196: две проверки первого срока проводит Служба порядка — честный путь, который не копит угрозу переворота.
const POLICE_CHECKS: Record<string, string> = {
  alt_district: 'Сверить акты на месте и остановить лишние платежи',
  alt_radio: 'Проверить магазин до следующего выпуска',
};

async function fixture(seed = 7): Promise<GameState> {
  const intro = await classicApi.setup(ALTERNATE_COUNTRY, 'debut', 'pragmatist', seed);
  return createInitialState(ALTERNATE_COUNTRY, 'debut', 'pragmatist', intro, seededRandom(seed));
}

const relationOf = (state: GameState, choice: Choice, bloc: string) => {
  const faction = state.factions.find(group => group.bloc === bloc)!;
  return choiceEffects(state, choice).factionRel[faction.id] ?? 0;
};

test('проверки со Службой порядка повышают отношение силовиков и не усиливают армию', async () => {
  const state = await fixture();
  for (const [cardId, text] of Object.entries(POLICE_CHECKS)) {
    const card = ALTERNATE_EVENTS.find(event => event.id === cardId)!;
    const option = card.choices.find(choice => choice.text === text)!;
    assert.ok(option, `${cardId}: текст варианта не меняется — по нему привязаны эхо и сохранения`);
    assert.deepEqual(option.tags, ['anticorruption', 'security']);
    // Армия у недовольных силовиков — ресурс для переворота (COUP_MILITARY), поэтому вариант её не поднимает.
    assert.equal(option.policyEffect?.military, undefined);
    const choice = { ...option, id: 'a' } as Choice;
    assert.ok(relationOf(state, choice, 'security') > 0, `${cardId}: силовики`);
    assert.ok(relationOf(state, choice, 'liberal') > 0, `${cardId}: либералы по-прежнему за проверку`);
    assert.match(option.scene ?? '', /Служб[аы] порядка/);
  }
});

test('сохранённое дело с прежними тегами разрешается по своим правилам', async () => {
  let state = await fixture();
  while (state.turn < 12) {
    state = startEvent(state, await classicApi.event(state));
    const choice = state.currentEvent!.choices.find(entry => entry.path === 'run') ?? state.currentEvent!.choices[0];
    state = resolveTurn(state, choice.id, await classicApi.consequence(state, choice.id));
  }
  // Прежнее дело хода 13 приходит, когда против президента сильнее всех не Служба порядка и не палата (#214).
  state = { ...state, factions: state.factions.map(group => (['security', 'business'].includes(group.bloc) ? { ...group, relation: 90 } : group)) };
  const event = await classicApi.event(state);
  assert.equal(event.cardId, 'alt_district');
  const current = event.choices.find(choice => choice.text === POLICE_CHECKS.alt_district)!;
  assert.deepEqual(current.tags, ['anticorruption', 'security']);
  // Партия, сохранённая до #196 посреди дела, хранит вариант со старыми тегами и без авторской цены.
  const { policyEffect, costReasons, ...legacyChoice } = current;
  void policyEffect; void costReasons;
  const legacy = { ...legacyChoice, tags: ['anticorruption'] } as Choice;
  const saved = startEvent(state, { ...event, choices: event.choices.map(choice => (choice.id === current.id ? legacy : choice)) });
  const loaded = parseSave(JSON.stringify({ version: SAVE_VERSION, screen: 'game', state: saved }))!.state;
  assert.ok(relationOf(loaded, legacy, 'security') < 0);
  const result = resolveTurn(loaded, legacy.id, await classicApi.consequence(loaded, legacy.id));
  assert.equal(result.turn, 13);
  assert.equal(result.history.at(-1)?.choice, POLICE_CHECKS.alt_district);
});
