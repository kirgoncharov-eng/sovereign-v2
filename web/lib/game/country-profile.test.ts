import test from 'node:test';
import assert from 'node:assert/strict';
import { classicApi, cardAvailable } from './classic.ts';
import { createInitialState, seededRandom } from './engine.ts';
import { ALTERNATE_COUNTRY } from './alternate-world.ts';
import { TRUST, hasPact, mostHostile, mostLoyal, trustLevel } from './country-profile.ts';
import type { EventCard } from '../content/events.ts';
import type { GameState } from './types.ts';

async function fresh(daily: string | null = null): Promise<GameState> {
  const intro = await classicApi.setup(ALTERNATE_COUNTRY, 'coalition', 'pragmatist', 7);
  return { ...createInitialState(ALTERNATE_COUNTRY, 'coalition', 'pragmatist', intro, seededRandom(7)), daily };
}

const withRelation = (state: GameState, bloc: string, relation: number): GameState =>
  ({ ...state, factions: state.factions.map(group => (group.bloc === bloc ? { ...group, relation } : group)) });

test('положение дел: самый враждебный и самый верный лагерь, доверие и союз', async () => {
  const state = await fresh();
  const hostile = withRelation(withRelation(state, 'business', -90), 'liberal', 95);
  assert.equal(mostHostile(hostile.factions)?.bloc, 'business');
  assert.equal(mostLoyal(hostile.factions)?.bloc, 'liberal');
  assert.ok(['low', 'middle', 'high'].includes(trustLevel(state)));
  assert.ok(TRUST.low < TRUST.high);
  const business = state.factions.find(group => group.bloc === 'business')!;
  assert.equal(hasPact(state, 'business'), false);
  const pact = { faction: business.id, figure: null, since: 1, until: 9, ban: [], against: null };
  assert.equal(hasPact({ ...state, pacts: [pact] }, 'business'), true);
});

test('версия дела приходит только в свой ход обычной партии и по положению дел', async () => {
  const card: EventCard = {
    id: 'alt_probe', countries: [ALTERNATE_COUNTRY], source: 'Проверка', title: 'Проверка', description: '',
    when: { slot: 10, rival: 'business' }, choices: [],
  };
  const base = withRelation({ ...(await fresh()), turn: 9 }, 'business', -95);
  assert.equal(cardAvailable(card, base), true);
  assert.equal(cardAvailable(card, { ...base, turn: 8 }), false, 'чужой ход');
  assert.equal(cardAvailable(card, { ...base, turn: 29 }), false, 'второй срок');
  assert.equal(cardAvailable(card, { ...base, daily: '2026-10-26' }), false, '«Дело дня»');
  assert.equal(cardAvailable(card, withRelation(base, 'business', 95)), false, 'палата не против');
});
