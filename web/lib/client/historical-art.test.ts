import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { HISTORICAL_SCENE_ART, HISTORICAL_FIGURE_ART, historicalEventArt, historicalResultArt,
  historicalPortraitArt } from './historical-art.ts';
import { ALTERNATE_EVENTS } from '../content/alternate-history.ts';
import { sceneOf } from '../content/scene-map.ts';
import { ALTERNATE_COUNTRY, LEGACY_COUNTRIES } from '../game/alternate-world.ts';
import { classicApi } from '../game/classic.ts';
import { createInitialState, seededRandom } from '../game/engine.ts';

async function fresh() {
  return createInitialState(ALTERNATE_COUNTRY, 'debut', 'pragmatist',
    await classicApi.setup(ALTERNATE_COUNTRY, 'debut', 'pragmatist', 21), seededRandom(21));
}

test('all 24 mapped WebP files exist and the game art stays below 800KB', () => {
  const paths = [...Object.values(HISTORICAL_SCENE_ART), ...Object.values(HISTORICAL_FIGURE_ART)].map(art => art.src);
  assert.equal(paths.length, 24);
  assert.equal(new Set(paths).size, 24);
  let bytes = 0;
  for (const src of paths) {
    const file = new URL(`../../public${src}`, import.meta.url);
    assert.ok(existsSync(file), src);
    bytes += statSync(file).size;
  }
  assert.ok(bytes < 800_000);
});

test('historical cards and exact bills resolve their own scenes while the animated opening stays intact', async () => {
  const base = await fresh();
  const event = await classicApi.event(base);
  for (const card of ALTERNATE_EVENTS) {
    const current = { ...event, card: card.id, title: card.title };
    const scene = historicalEventArt(ALTERNATE_COUNTRY, current, sceneOf(current));
    assert.equal(!!scene, card.id !== 'alt_wages', card.id);
    for (const country of LEGACY_COUNTRIES) assert.equal(historicalEventArt(country, current, sceneOf(current)), null);
  }
  for (const id of ['alt_export_guarantee', 'alt_open_orders']) {
    assert.ok(historicalEventArt(ALTERNATE_COUNTRY, { ...event, card: `law:5:${id}` }, 'stamp'));
    assert.ok(historicalEventArt(ALTERNATE_COUNTRY, { ...event, card: `law_${id}` }, 'stamp'));
  }
  assert.equal(historicalEventArt(ALTERNATE_COUNTRY,
    { ...event, special: { kind: 'inspect', figure: null, faction: '' }, title: 'Патрули в жилых районах' }, 'stamp'), null);
});

test('newspaper uses completed case on reload instead of the next event or current intrigue', async () => {
  const state = await fresh();
  const currentEvent = await classicApi.event(state);
  const report = { year: 1978, title: 'Указ дошёл до области', choice: '', headline: '', historianNote: '' };
  const newspaper = { ...state, history: [report], currentEvent };
  assert.equal(historicalResultArt(newspaper, 'hospital'), HISTORICAL_SCENE_ART.district);
  assert.equal(historicalResultArt(JSON.parse(JSON.stringify(newspaper)), 'hospital'), HISTORICAL_SCENE_ART.district);
  for (const country of LEGACY_COUNTRIES) assert.equal(historicalResultArt({ ...newspaper, country }, 'hospital'), null);
});

test('faces match actual role, gender and bound person without inheriting a dismissed predecessor face', async () => {
  const base = await fresh();
  const roster: Record<string, string> = {};
  const keyFigures = base.keyFigures.map(figure => {
    const name = figure.id === 'amb_eu' ? 'Нина Ладин' : `Антон ${figure.id}`;
    roster[figure.id] = name;
    return { ...figure, name };
  });
  const state = { ...base, keyFigures };
  for (const figure of keyFigures) {
    assert.equal(historicalPortraitArt(state, figure.name, roster), HISTORICAL_FIGURE_ART[figure.id].src);
    const replacement = { ...figure, name: figure.id === 'amb_eu' ? 'Вера Ладин' : 'Павел Ладин' };
    const replaced = { ...state, keyFigures: keyFigures.map(person => person.id === figure.id ? replacement : person) };
    assert.equal(historicalPortraitArt(replaced, replacement.name, roster), null);
  }
  const wrongSex = { ...state, keyFigures: [{ ...keyFigures[0], name: 'Нина Ладин' }] };
  assert.equal(historicalPortraitArt(wrongSex, 'Нина Ладин'), null);
  assert.equal(historicalPortraitArt(state, state.leader.name), null);
  assert.equal(historicalPortraitArt(state, state.advisors[0].name), null);
  for (const country of LEGACY_COUNTRIES) assert.equal(historicalPortraitArt({ ...state, country }, keyFigures[0].name), null);
  assert.equal(historicalPortraitArt(state, 'Неизвестный собеседник'), null);
});
