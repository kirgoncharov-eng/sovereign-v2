import test from 'node:test';
import assert from 'node:assert/strict';
import { ALTERNATE_RANDOM_EVENTS } from '../content/alternate-history.ts';
import { classicApi, fill } from './classic.ts';
import { INSIDER_LINES, MOLE_LINES } from '../content/people.ts';
import { ALTERNATE_COUNTRY } from './alternate-world.ts';
import { createInitialState, resolveTurn, seededRandom, startEvent } from './engine.ts';
import { QUARTER_MARK, sourceLabel, splitQuarter } from './turn-report.ts';
import type { GameState, Pending } from './types.ts';

const matured = (label: string): Pending => ({ id: 'p', due: 3, label, res: { economy: -2 }, source: 'вариант' });

test('газета без разделителя целиком о резолюции; с разделителем — две части', () => {
  assert.deepEqual(splitQuarter('Сцена.\n\nРеакция.'), { own: 'Сцена.\n\nРеакция.', other: [] });
  assert.deepEqual(splitQuarter(`Сцена.\n\n${QUARTER_MARK}\n\nАукается дело.\n\nПредвестие.`),
    { own: 'Сцена.', other: ['Аукается дело.', 'Предвестие.'] });
});

test('ведомость 1978 года говорит языком мира и отличает прежние подписи и фон; архив — как был', () => {
  const historical = { country: ALTERNATE_COUNTRY };
  const report = { matured: [matured('Счета перевозчиков за простой')] };
  assert.equal(sourceLabel(historical, report, 'решение'), 'ваша резолюция');
  assert.equal(sourceLabel(historical, report, 'давление обстоятельств'), 'трудности квартала');
  assert.equal(sourceLabel(historical, report, 'счета перевозчиков за простой'), 'по прежней подписи: счета перевозчиков за простой');
  const background = ALTERNATE_RANDOM_EVENTS[0].title.toLowerCase();
  assert.equal(sourceLabel(historical, report, background), `вне резолюции: ${background}`);
  assert.equal(sourceLabel(historical, report, 'кризис «Банковская паника»'), 'кризис «Банковская паника»');
  for (const label of ['решение', 'давление обстоятельств', 'счета перевозчиков за простой'])
    assert.equal(sourceLabel({ country: 'Беларусь' }, report, label), label);
});

async function term(country: string, seed: number, turns: number): Promise<GameState[]> {
  const intro = await classicApi.setup(country, 'coalition', 'pragmatist', seed);
  let state = createInitialState(country, 'coalition', 'pragmatist', intro, seededRandom(seed));
  const states: GameState[] = [];
  while (!state.ended && state.turn < turns) {
    state = startEvent(state, await classicApi.event(state));
    const choice = state.currentEvent!.choices.find(entry => entry.path === 'run') ?? state.currentEvent!.choices[state.turn % 3] ?? state.currentEvent!.choices[0];
    state = resolveTurn(state, choice.id, await classicApi.consequence(state, choice.id));
    states.push(state);
  }
  return states;
}

test('1978: эхо прежних решений и выборы — только в части «В том же квартале»; первый ход без разделителя', async () => {
  let echoes = 0;
  for (const seed of [1, 7, 12]) {
    const states = await term(ALTERNATE_COUNTRY, seed, 20);
    assert.ok(!states[0].lastTurn!.narrative.split('\n\n').includes(QUARTER_MARK), `${seed}: разделитель на первом ходу`);
    for (const state of states) {
      const { own, other } = splitQuarter(state.lastTurn!.narrative);
      assert.ok(!/^Аукается /m.test(own), `${seed}/${state.turn}: эхо в части о резолюции`);
      assert.ok(!/^(Парламентские|Президентские) выборы\./m.test(own) || !!state.lastTurn!.term || state.ended,
        `${seed}/${state.turn}: выборы в части о резолюции`);
      echoes += other.filter(paragraph => paragraph.startsWith('Аукается ')).length;
      assert.ok(own.trim().length > 0, `${seed}/${state.turn}: пустая часть о резолюции`);
    }
  }
  assert.ok(echoes > 0, 'за три срока ни одного эха под разделителем');
});

test('архивные кампании не получают разделителя', async () => {
  for (const state of await term('Беларусь', 4, 10)) {
    assert.ok(!state.lastTurn!.narrative.split('\n\n').includes(QUARTER_MARK), `${state.turn}`);
  }
});

test('1978: строка тайного союзника или «червоточины» — не следствие резолюции, а жизнь квартала', async () => {
  for (const [bond, personal, faction, pool] of [['insider', 60, -25, INSIDER_LINES], ['mole', -60, 25, MOLE_LINES]] as const) {
    const intro = await classicApi.setup(ALTERNATE_COUNTRY, 'debut', 'pragmatist', 7);
    let state = createInitialState(ALTERNATE_COUNTRY, 'debut', 'pragmatist', intro, seededRandom(7));
    while (state.turn < 2) {
      state = startEvent(state, await classicApi.event(state));
      state = resolveTurn(state, state.currentEvent!.choices[0].id, await classicApi.consequence(state, state.currentEvent!.choices[0].id));
    }
    // Связь задана состоянием: личное отношение и отношение лагеря, как у bondOf; ход 3 (turn % 3 === 2) — её черёд.
    const recent = new Set(state.history.slice(-2).flatMap(entry => entry.cast ?? []));
    const figure = state.keyFigures.find(f => f.name !== state.arc?.target && !recent.has(f.name))!;
    state = { ...state,
      keyFigures: state.keyFigures.map(f => (f.id === figure.id ? { ...f, relation: personal } : f)),
      factions: state.factions.map(f => (f.id === figure.faction ? { ...f, relation: faction } : f)) };
    state = startEvent(state, await classicApi.event(state));
    const choice = state.currentEvent!.choices[0].id;
    const { own, other } = splitQuarter((await classicApi.consequence(state, choice)).narrative);
    const camp = state.factions.find(f => f.id === figure.faction)!.name;
    const lines = pool.map(line => fill(line, state, { name: figure.name, camp }));
    assert.ok(lines.some(line => other.includes(line)), `${bond}: строка связи должна быть в «В том же квартале»`);
    assert.ok(!lines.some(line => own.includes(line)), `${bond}: строка связи попала в часть о резолюции`);
  }
});
