import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { HISTORICAL_SCENE_ART, HISTORICAL_FIGURE_ART, historicalEventArt, historicalResultArt,
  historicalPortraitArt, HISTORICAL_OUTCOME_ART, HISTORICAL_ADDITIONAL_FIGURE_ART, HISTORICAL_ADVISOR_ART } from './historical-art.ts';
import { MANAGEMENT_DOSSIERS } from '../content/management.ts';
import { ALTERNATE_EVENTS } from '../content/alternate-history.ts';
import { sceneOf } from '../content/scene-map.ts';
import { ALTERNATE_COUNTRY, LEGACY_COUNTRIES } from '../game/alternate-world.ts';
import { classicApi } from '../game/classic.ts';
import { createInitialState, resolveTurn, seededRandom, startEvent } from '../game/engine.ts';
import type { GameState } from '../game/types.ts';

async function fresh() {
  return createInitialState(ALTERNATE_COUNTRY, 'debut', 'pragmatist',
    await classicApi.setup(ALTERNATE_COUNTRY, 'debut', 'pragmatist', 21), seededRandom(21));
}

test('all 42 mapped WebP files exist within the image budgets', () => {
  const paths = [HISTORICAL_SCENE_ART, HISTORICAL_FIGURE_ART, HISTORICAL_OUTCOME_ART,
    HISTORICAL_ADDITIONAL_FIGURE_ART, HISTORICAL_ADVISOR_ART].flatMap(group => Object.values(group).map(art => art.src));
  assert.equal(paths.length, 44);
  assert.equal(new Set(paths).size, 43); // wages and wagesGate share wages-gate.webp
  let bytes = 0;
  for (const src of paths) {
    const file = new URL(`../../public${src}`, import.meta.url);
    assert.ok(existsSync(file), src);
    bytes += statSync(file).size;
    if (src.includes('/gemini-next/')) {
      const isPortrait = src.includes('male.webp') || src.includes('adv-');
      assert.ok(statSync(file).size <= (isPortrait ? 10_000 : 100_000), src);
    }
  }
  assert.ok(bytes < 1_500_000);
});

test('hospital photos distinguish failed repair, ongoing works and a finished roof after reload', async () => {
  const base = await fresh();
  const card = ALTERNATE_EVENTS.find(card => card.id === 'alt_district')!;
  for (const [index, choice] of card.choices.entries()) {
    for (const success of [false, true]) {
      const state = { ...base, history: [{ year: 1978, title: card.title, choice: choice.text,
        headline: '', historianNote: '', success }] };
      const expected = !success ? HISTORICAL_OUTCOME_ART.districtDelayed
        : index === 0 ? HISTORICAL_OUTCOME_ART.districtRepairs : HISTORICAL_OUTCOME_ART.districtCompleted;
      assert.deepEqual(historicalResultArt(state, 'hospital'), expected);
      assert.deepEqual(historicalResultArt(JSON.parse(JSON.stringify(state)), 'hospital'), expected);
      for (const country of LEGACY_COUNTRIES) assert.equal(historicalResultArt({ ...state, country }, 'hospital'), null);
    }
  }
});

test('bridge photos wait for the completed delayed order and retain the chosen strategy on reload', async () => {
  const base = await fresh();
  const dossier = MANAGEMENT_DOSSIERS.find(dossier => dossier.id === 'bridges')!;
  const event = await classicApi.event(base);
  const current = startEvent(base, event);
  const report = resolveTurn(current, event.choices[0].id,
    await classicApi.consequence(current, event.choices[0].id)).lastTurn;
  assert.ok(report);
  const expected = [HISTORICAL_OUTCOME_ART.bridgeTemporary, HISTORICAL_OUTCOME_ART.bridgeRestored,
    HISTORICAL_OUTCOME_ART.bridgeToll];
  for (const [index, option] of dossier.options.entries()) {
    const pending = { id: `bridge-${index}`, due: 4, source: option.text, event: dossier.title, ...option.later };
    const state: GameState = { ...base, lastTurn: { ...report, matured: [], scheduled: [pending] }, pending: [pending] };
    assert.equal(historicalResultArt(state, 'bridge'), HISTORICAL_SCENE_ART.bridge);
    const completed: GameState = { ...state, lastTurn: { ...report, matured: [pending], scheduled: [] }, pending: [] };
    assert.deepEqual(historicalResultArt(completed, 'bridge'), expected[index]);
    assert.deepEqual(historicalResultArt(JSON.parse(JSON.stringify(completed)), 'bridge'), expected[index]);
    const unrelated: GameState = { ...completed, lastTurn: { ...report, matured: [{ ...pending, event: 'Другое дело' }] } };
    assert.equal(historicalResultArt(unrelated, 'bridge'), HISTORICAL_SCENE_ART.bridge);
  }
});

test('both ambassador and editor genders have art without assigning a predecessor portrait to a successor', async () => {
  const base = await fresh();
  for (const [id, name] of [['amb_eu', 'Антон Ладин'], ['journalist', 'Нина Ладин']]) {
    const figure = base.keyFigures.find(person => person.id === id)!;
    const state = { ...base, keyFigures: [{ ...figure, name }] };
    const art = HISTORICAL_ADDITIONAL_FIGURE_ART[id as keyof typeof HISTORICAL_ADDITIONAL_FIGURE_ART];
    assert.equal(historicalPortraitArt(state, name, { [id]: name }), art.src);
    assert.equal(historicalPortraitArt(JSON.parse(JSON.stringify(state)), name, { [id]: name }), art.src);
    assert.equal(historicalPortraitArt(state, name, { [id]: 'Предшественник' }), null);
  }
});

test('historical cards and exact bills resolve their own scenes while the animated opening stays intact', async () => {
  const base = await fresh();
  const event = await classicApi.event(base);
  for (const card of ALTERNATE_EVENTS) {
    const current = { ...event, card: card.id, title: card.title };
    const scene = historicalEventArt(ALTERNATE_COUNTRY, current, sceneOf(current));
    assert.ok(scene, card.id);
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
  const advisors = base.advisors.map(advisor => {
    const name = advisor.id === 'security' ? 'Михаил Силов' : `Анна ${advisor.id}`;
    roster[`advisor:${advisor.id}`] = name;
    return { ...advisor, name };
  });
  const state = { ...base, keyFigures, advisors };
  for (const figure of keyFigures) {
    assert.equal(historicalPortraitArt(state, figure.name, roster), HISTORICAL_FIGURE_ART[figure.id].src);
    const replacement = { ...figure, name: figure.id === 'amb_eu' ? 'Вера Ладин' : 'Павел Ладин' };
    const replaced = { ...state, keyFigures: keyFigures.map(person => person.id === figure.id ? replacement : person) };
    assert.equal(historicalPortraitArt(replaced, replacement.name, roster), null);
  }
  for (const advisor of advisors) {
    assert.equal(historicalPortraitArt(state, advisor.name, roster), HISTORICAL_ADVISOR_ART[advisor.id].src);
    const replacement = { ...advisor, name: advisor.id === 'security' ? 'Павел Новый' : 'Ольга Новая' };
    const replaced = { ...state, advisors: advisors.map(person => person.id === advisor.id ? replacement : person) };
    assert.equal(historicalPortraitArt(replaced, replacement.name, roster), null);
  }
  const wrongSex = { ...state, keyFigures: [{ ...keyFigures[0], name: 'Нина Ладин' }] };
  assert.equal(historicalPortraitArt(wrongSex, 'Нина Ладин'), null);
  assert.equal(historicalPortraitArt(state, state.leader.name), null);
  for (const country of LEGACY_COUNTRIES) assert.equal(historicalPortraitArt({ ...state, country }, keyFigures[0].name), null);
  assert.equal(historicalPortraitArt(state, 'Неизвестный собеседник'), null);
});

test('first crisis and election night resolve authorial outcome scenes', async () => {
  const base = await fresh();
  const wagesCard = ALTERNATE_EVENTS.find(c => c.id === 'alt_wages')!;
  const expectedOutcomes = [
    HISTORICAL_OUTCOME_ART.wagesAudit,
    HISTORICAL_OUTCOME_ART.wagesAdvance,
    HISTORICAL_OUTCOME_ART.wagesRetool,
  ];
  for (const [idx, choice] of wagesCard.choices.entries()) {
    const successState = { ...base, history: [{ year: 1978, title: wagesCard.title, choice: choice.text, headline: '', historianNote: '', success: true }] };
    assert.deepEqual(historicalResultArt(successState, 'archive'), expectedOutcomes[idx]);
    const failState = { ...base, history: [{ year: 1978, title: wagesCard.title, choice: choice.text, headline: '', historianNote: '', success: false }] };
    assert.deepEqual(historicalResultArt(failState, 'archive'), HISTORICAL_OUTCOME_ART.wagesGate);
  }
  const event = await classicApi.event(base);
  const current = startEvent(base, event);
  const report = resolveTurn(current, event.choices[0].id,
    await classicApi.consequence(current, event.choices[0].id)).lastTurn!;
  const wonState: GameState = { ...base, lastTurn: { ...report, election: {
    turn: 20, kind: 'president', leader: 62, top: { id: 'opp', name: 'Оппозиция', share: 14 }, outcome: 'won',
  } } };
  assert.equal(historicalResultArt(wonState, 'ballot'), HISTORICAL_SCENE_ART.electionNight);
  const lostState: GameState = { ...base, lastTurn: { ...report, election: {
    turn: 20, kind: 'president', leader: 14, top: { id: 'opp', name: 'Оппозиция', share: 62 }, outcome: 'lost',
  } } };
  assert.equal(historicalResultArt(lostState, 'ballot'), HISTORICAL_SCENE_ART.electionDefeat);
});
