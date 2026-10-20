import test from 'node:test';
import assert from 'node:assert/strict';
import { classicApi, cardAvailable } from './classic.ts';
import { createInitialState, resolveTurn, seededRandom, startEvent } from './engine.ts';
import { ALTERNATE_COUNTRY } from './alternate-world.ts';
import { RIVAL, TRUST, hasPact, mostHostile, mostLoyal, rivalOf, trustLevel } from './country-profile.ts';
import type { EventCard } from '../content/events.ts';
import type { GameState } from './types.ts';

async function fresh(daily: string | null = null): Promise<GameState> {
  const intro = await classicApi.setup(ALTERNATE_COUNTRY, 'coalition', 'pragmatist', 7);
  return { ...createInitialState(ALTERNATE_COUNTRY, 'coalition', 'pragmatist', intro, seededRandom(7)), daily };
}

const withRelation = (state: GameState, bloc: string, relation: number): GameState =>
  ({ ...state, factions: state.factions.map(group => (group.bloc === bloc ? { ...group, relation } : group)) });

// Решение, которое задело лагеря этого блока: повод для противника.
const hurting = (state: GameState, bloc: string): GameState => ({
  ...state,
  history: [...state.history, {
    year: 1978, title: 'Проверка', choice: 'Проверка', headline: '', historianNote: '',
    hurt: state.factions.filter(group => group.bloc === bloc).map(group => group.id),
  }],
});

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

test('версия дела приходит только в первом сроке обычной партии и по положению дел', async () => {
  const card: EventCard = {
    id: 'alt_probe', countries: [ALTERNATE_COUNTRY], source: 'Проверка', title: 'Проверка', description: '',
    when: { versionOf: 'alt_rail', rival: 'business' }, choices: [],
  };
  const base = hurting(withRelation({ ...(await fresh()), turn: 9 }, 'business', -95), 'business');
  assert.equal(cardAvailable(card, base), true);
  assert.equal(cardAvailable(card, { ...base, turn: 29 }), false, 'второй срок');
  assert.equal(cardAvailable(card, { ...base, daily: '2026-10-26' }), false, '«Дело дня»');
  assert.equal(cardAvailable(card, withRelation(base, 'business', 95)), false, 'палата не против');
});

test('версия может прийти после решения: прежний выбор приводит следующее дело', async () => {
  const card: EventCard = {
    id: 'alt_probe', countries: [ALTERNATE_COUNTRY], source: 'Проверка', title: 'Проверка', description: '',
    when: { versionOf: 'alt_standards', after: ['Отдать заводам заказ на ремонт путей'] }, choices: [],
  };
  const base = { ...(await fresh()), turn: 14 };
  assert.equal(cardAvailable(card, base), false);
  const signed = { ...base, history: [{ year: 1978, title: 'Палата держит вагоны', choice: 'Отдать заводам заказ на ремонт путей', headline: '', historianNote: '' }] };
  assert.equal(cardAvailable(card, signed), true);
});

test('противник — не просто худший лагерь: нужны открытый конфликт и недавний повод', async () => {
  const state = await fresh();
  const hostile = withRelation(state, 'business', -60);
  assert.equal(mostHostile(hostile.factions)?.bloc, 'business');
  assert.equal(rivalOf(hostile), null, 'без повода палата не противник');
  assert.equal(rivalOf(hurting(hostile, 'business'))?.bloc, 'business');
  assert.equal(rivalOf(hurting(withRelation(state, 'business', RIVAL.relation + 5), 'business')), null, 'задели, но конфликта нет');
  let stale = hurting(hostile, 'business');
  for (let turn = 0; turn < RIVAL.memory; turn++) stale = hurting(stale, 'church');
  assert.equal(rivalOf(stale), null, 'повод забыт через несколько ходов');
});

test('партия 1978 года запоминает, кого задело решение; архивные страны — нет', async () => {
  for (const country of [ALTERNATE_COUNTRY, 'Украина']) {
    const intro = await classicApi.setup(country, 'coalition', 'pragmatist', 7);
    let state = createInitialState(country, 'coalition', 'pragmatist', intro, seededRandom(7));
    state = startEvent(state, await classicApi.event(state));
    const choice = state.currentEvent!.choices[0];
    state = resolveTurn(state, choice.id, await classicApi.consequence(state, choice.id));
    const hit = Object.entries(state.lastTurn!.factionRelChanges).filter(([, change]) => change <= -3).map(([id]) => id);
    const entry = state.history.at(-1)!;
    if (country === ALTERNATE_COUNTRY) assert.deepEqual(entry.hurt ?? [], hit);
    else assert.equal('hurt' in entry, false);
  }
});
