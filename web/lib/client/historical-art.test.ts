import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { HISTORICAL_SCENE_ART, HISTORICAL_FIGURE_ART, historicalEventArt, historicalResultArt,
  historicalPortraitArt, HISTORICAL_OUTCOME_ART, HISTORICAL_ADDITIONAL_FIGURE_ART, HISTORICAL_ADVISOR_ART,
  HISTORICAL_LEADER_ART, LEADER_PORTRAIT_IDS, historicalEndingArt, HISTORICAL_SECRETARY_ART,
  HISTORICAL_ADVISOR_REPLACEMENT_ART, HISTORICAL_WORLD_PEOPLE_ART, HISTORICAL_PRESS_ART,
  HISTORICAL_FIGURE_SUCCESSOR_ART } from './historical-art.ts';
import { PRESS_QUESTIONS } from '../content/press.ts';
import { candidatePool, hireAdvisor } from '../game/staffing.ts';
import { MANAGEMENT_DOSSIERS } from '../content/management.ts';
import { ALTERNATE_EVENTS } from '../content/alternate-history.ts';
import { sceneOf } from '../content/scene-map.ts';
import { ALTERNATE_COUNTRY, LEGACY_COUNTRIES } from '../game/alternate-world.ts';
import { classicApi, customizeLeader, freshLeaderName } from '../game/classic.ts';
import { createInitialState, isFemaleName, resolveTurn, seededRandom, startEvent } from '../game/engine.ts';
import { parseSave } from './save.ts';
import { SAVE_VERSION, START_RES, BIO_RES } from '../game/data.ts';
import type { GameState } from '../game/types.ts';

async function fresh() {
  return createInitialState(ALTERNATE_COUNTRY, 'debut', 'pragmatist',
    await classicApi.setup(ALTERNATE_COUNTRY, 'debut', 'pragmatist', 21), seededRandom(21));
}

test('all mapped WebP files exist within the image budgets', () => {
  const paths = [HISTORICAL_SCENE_ART, HISTORICAL_FIGURE_ART, HISTORICAL_OUTCOME_ART,
    HISTORICAL_ADDITIONAL_FIGURE_ART, HISTORICAL_ADVISOR_ART, HISTORICAL_LEADER_ART,
    HISTORICAL_SECRETARY_ART, HISTORICAL_ADVISOR_REPLACEMENT_ART, HISTORICAL_WORLD_PEOPLE_ART,
    HISTORICAL_PRESS_ART, HISTORICAL_FIGURE_SUCCESSOR_ART].flatMap(group => Object.values(group).map(art => art.src));
  assert.equal(paths.length, 87);
  assert.equal(new Set(paths).size, 85); // wages/wagesGate share wages-gate.webp, scene wagesAudit shares wages-audit.webp with outcome
  let bytes = 0;
  for (const src of paths) {
    const file = new URL(`../../public${src}`, import.meta.url);
    assert.ok(existsSync(file), src);
    bytes += statSync(file).size;
    if (src.includes('/gemini-next/')) {
      const isPortrait = src.includes('male.webp') || src.includes('adv-') || src.includes('leader-')
        || src.includes('secretary-portrait') || src.includes('world-') || src.includes('press-correspondent-');
      assert.ok(statSync(file).size <= (isPortrait ? 10_000 : 100_000), src);
    }
  }
  assert.ok(bytes < 3_000_000);
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
    const successorArt = historicalPortraitArt(state, name, { [id]: 'Предшественник' });
    assert.ok(successorArt);
    assert.notEqual(successorArt, art.src);
    assert.notEqual(successorArt, HISTORICAL_FIGURE_ART[id].src);
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
    const replacementArt = historicalPortraitArt(replaced, replacement.name, roster);
    const expectedSuccessor = figure.id === 'amb_eu'
      ? HISTORICAL_ADVISOR_REPLACEMENT_ART.female.src
      : figure.id === 'journalist'
        ? HISTORICAL_PRESS_ART.male.src
        : HISTORICAL_FIGURE_SUCCESSOR_ART.male.src;
    assert.equal(replacementArt, expectedSuccessor);
    assert.notEqual(replacementArt, HISTORICAL_FIGURE_ART[figure.id].src);
  }
  for (const advisor of advisors) {
    assert.equal(historicalPortraitArt(state, advisor.name, roster), HISTORICAL_ADVISOR_ART[advisor.id].src);
    const replacement = { ...advisor, name: advisor.id === 'security' ? 'Павел Новый' : 'Ольга Новая' };
    const replaced = { ...state, advisors: advisors.map(person => person.id === advisor.id ? replacement : person) };
    const replacementArt = historicalPortraitArt(replaced, replacement.name, roster);
    const expectedReplacement = advisor.id === 'security'
      ? HISTORICAL_ADVISOR_REPLACEMENT_ART.security.src
      : HISTORICAL_ADVISOR_REPLACEMENT_ART.female.src;
    assert.equal(replacementArt, expectedReplacement);
    assert.notEqual(replacementArt, HISTORICAL_ADVISOR_ART[advisor.id].src);
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
  const harvestCard = ALTERNATE_EVENTS.find(c => c.id === 'alt_harvest')!;
  const expectedHarvestSuccess = [
    HISTORICAL_OUTCOME_ART.harvestSubsidy,
    HISTORICAL_OUTCOME_ART.harvestDirect,
    HISTORICAL_OUTCOME_ART.harvestCredit,
  ];
  for (const [idx, choice] of harvestCard.choices.entries()) {
    const successState = { ...base, history: [{ year: 1978, title: harvestCard.title, choice: choice.text, headline: '', historianNote: '', success: true }] };
    assert.deepEqual(historicalResultArt(successState, 'field'), expectedHarvestSuccess[idx]);
    const failState = { ...base, history: [{ year: 1978, title: harvestCard.title, choice: choice.text, headline: '', historianNote: '', success: false }] };
    // Reviews on PR #323 (GPT/Codex & Claude): none of the 3 fail outcomes describe rotting grain or abandoned machinery,
    // so returning harvestRot creates false narrative drama. Neutral harvest scene is returned.
    assert.deepEqual(historicalResultArt(failState, 'field'), HISTORICAL_SCENE_ART.harvest);
    assert.notEqual(historicalResultArt(failState, 'field'), HISTORICAL_OUTCOME_ART.harvestRot);
    assert.ok(choice.fail && !choice.fail.includes('сгнил') && !choice.fail.includes('брошен'), `choice ${idx} fail text shouldn't claim rot: ${choice.fail}`);
  }
  const fuelCard = ALTERNATE_EVENTS.find(c => c.id === 'alt_fuel')!;
  const expectedFuelSuccess = [
    HISTORICAL_OUTCOME_ART.fuelTransitEast,
    HISTORICAL_OUTCOME_ART.fuelTransitWest,
    HISTORICAL_OUTCOME_ART.fuelInsulation,
  ];
  const expectedFuelFail = [
    HISTORICAL_SCENE_ART.fuel,
    HISTORICAL_SCENE_ART.fuel,
    HISTORICAL_OUTCOME_ART.fuelInsulation,
  ];
  for (const [idx, choice] of fuelCard.choices.entries()) {
    const successState = { ...base, history: [{ year: 1978, title: fuelCard.title, choice: choice.text, headline: '', historianNote: '', success: true }] };
    assert.deepEqual(historicalResultArt(successState, 'energy'), expectedFuelSuccess[idx]);
    const failState = { ...base, history: [{ year: 1978, title: fuelCard.title, choice: choice.text, headline: '', historianNote: '', success: false }] };
    assert.deepEqual(historicalResultArt(failState, 'energy'), expectedFuelFail[idx]);
  }
  const standardsCard = ALTERNATE_EVENTS.find(c => c.id === 'alt_standards')!;
  const expectedStandardsSuccess = [
    HISTORICAL_OUTCOME_ART.standardsTesting,
    HISTORICAL_OUTCOME_ART.standardsEastern,
    HISTORICAL_OUTCOME_ART.standardsContest,
  ];
  const expectedStandardsFail = [
    HISTORICAL_OUTCOME_ART.standardsDefect,
    HISTORICAL_SCENE_ART.standards,
    HISTORICAL_SCENE_ART.standards,
  ];
  for (const [idx, choice] of standardsCard.choices.entries()) {
    const successState = { ...base, history: [{ year: 1978, title: standardsCard.title, choice: choice.text, headline: '', historianNote: '', success: true }] };
    assert.deepEqual(historicalResultArt(successState, 'factory'), expectedStandardsSuccess[idx]);
    const failState = { ...base, history: [{ year: 1978, title: standardsCard.title, choice: choice.text, headline: '', historianNote: '', success: false }] };
    assert.deepEqual(historicalResultArt(failState, 'factory'), expectedStandardsFail[idx]);
  }
  const railCard = ALTERNATE_EVENTS.find(c => c.id === 'alt_rail')!;
  const expectedRailSuccess = [
    HISTORICAL_OUTCOME_ART.railGrain,
    HISTORICAL_OUTCOME_ART.railExport,
    HISTORICAL_OUTCOME_ART.railDispatch,
  ];
  const expectedRailFail = [
    HISTORICAL_OUTCOME_ART.railJam,
    HISTORICAL_SCENE_ART.rail,
    HISTORICAL_OUTCOME_ART.railJam,
  ];
  for (const [idx, choice] of railCard.choices.entries()) {
    const successState = { ...base, history: [{ year: 1978, title: railCard.title, choice: choice.text, headline: '', historianNote: '', success: true }] };
    assert.deepEqual(historicalResultArt(successState, 'border'), expectedRailSuccess[idx]);
    const failState = { ...base, history: [{ year: 1978, title: railCard.title, choice: choice.text, headline: '', historianNote: '', success: false }] };
    assert.deepEqual(historicalResultArt(failState, 'border'), expectedRailFail[idx]);
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

test('standards and rail variants show only outcomes confirmed by their own resolution, also after reload', async () => {
  const base = await fresh();
  const art = HISTORICAL_OUTCOME_ART;
  const standards = HISTORICAL_SCENE_ART.standards;
  const rail = HISTORICAL_SCENE_ART.rail;
  // Each row lists failure/success for each of the three choices. Neutral photos deliberately make no
  // claim about a completed order, technical defect or delivery when the scene only confirms negotiations.
  const outcomes = [
    { id: 'alt_standards', choices: [
      [art.standardsDefect, art.standardsTesting], [standards, art.standardsEastern], [standards, art.standardsContest],
    ] },
    { id: 'alt_standards_chamber', choices: [
      [standards, standards], [art.standardsDefect, standards], [standards, standards],
    ] },
    { id: 'alt_standards_patriots', choices: [
      [standards, standards], [standards, standards], [standards, standards],
    ] },
    { id: 'alt_rail', choices: [
      [art.railJam, art.railGrain], [rail, art.railExport], [art.railJam, art.railDispatch],
    ] },
    { id: 'alt_rail_blockade', choices: [
      [rail, art.railGrain], [rail, art.railExport], [rail, rail],
    ] },
    { id: 'alt_rail_chamber', choices: [
      [rail, art.railDispatch], [rail, rail], [rail, rail],
    ] },
  ];
  for (const outcome of outcomes) {
    const card = ALTERNATE_EVENTS.find(entry => entry.id === outcome.id)!;
    assert.equal(card.choices.length, outcome.choices.length, outcome.id);
    for (const [index, choice] of card.choices.entries()) {
      for (const success of [false, true]) {
        const state: GameState = { ...base, history: [{ year: 1978, title: card.title, choice: choice.text,
          headline: '', historianNote: '', success }] };
        const expected = outcome.choices[index][Number(success)];
        const context = `${outcome.id}/${index}/${success}: ${success ? choice.scene : choice.fail}`;
        assert.deepEqual(historicalResultArt(state, 'factory'), expected, context);
        assert.deepEqual(historicalResultArt(JSON.parse(JSON.stringify(state)), 'factory'), expected, `reload: ${context}`);
        for (const country of LEGACY_COUNTRIES) {
          assert.equal(historicalResultArt({ ...state, country }, 'factory'), null, `${country}: ${context}`);
        }
      }
    }
  }
});

test('ending dossier resolves dramatic pixel-art scene by outcome', async () => {
  const base = await fresh();
  assert.equal(historicalEndingArt({ ...base, endType: 'reelected' }), HISTORICAL_SCENE_ART.electionNight);
  assert.equal(historicalEndingArt({ ...base, endType: 'retired' }), HISTORICAL_SCENE_ART.electionNight);
  assert.equal(historicalEndingArt({ ...base, endType: 'mandate' }), HISTORICAL_SCENE_ART.electionDefeat);
  assert.equal(historicalEndingArt({ ...base, endType: 'coup' }), HISTORICAL_SCENE_ART.electionDefeat);
  assert.equal(historicalEndingArt({ ...base, endType: 'collapse' }), HISTORICAL_SCENE_ART.electionDefeat);
  assert.equal(historicalEndingArt({ ...base, endType: 'died' }), null);
  assert.deepEqual(historicalEndingArt({ ...base, endType: 'dictator' }), {
    src: HISTORICAL_SCENE_ART.electionNight.src,
    caption: 'Огни столицы за окном кабинета правителя',
  });
  assert.deepEqual(historicalEndingArt({ ...base, endType: 'revolution' }), {
    src: HISTORICAL_SCENE_ART.protest.src,
    caption: 'Народные волнения на улицах столицы',
  });
  for (const country of LEGACY_COUNTRIES) {
    assert.equal(historicalEndingArt({ ...base, country, endType: 'reelected' }), null);
  }
});

test('leader persona customization resolves portraits from bio, updates starting resources and survives save reload', async () => {
  const base = await fresh();
  assert.equal(historicalPortraitArt(base, base.leader.name), null);

  const bioMap: Record<string, (typeof LEADER_PORTRAIT_IDS)[number]> = {
    military: 'officer',
    economist: 'economist',
    lawyer: 'lawyer',
    diplomat: 'diplomat',
    mayor: 'mayor',
  };
  for (const [bioId, portraitId] of Object.entries(bioMap)) {
    const meta = HISTORICAL_LEADER_ART[portraitId];
    const customized = customizeLeader(base, { bio: bioId, ideo: 'liberal' });
    assert.equal(customized.leader.portrait, portraitId);
    assert.equal(isFemaleName(customized.leader.name), meta.female, `portrait ${portraitId} gender must match name ${customized.leader.name}`);
    assert.equal(historicalPortraitArt(customized, customized.leader.name), meta.src);
    const saved = parseSave(JSON.stringify({ version: SAVE_VERSION, screen: 'intro', state: customized }));
    assert.ok(saved, `save with portrait ${portraitId} must parse cleanly`);
    assert.equal(historicalPortraitArt(saved.state, saved.state.leader.name), meta.src);
  }

  const altName = freshLeaderName(base, true, 1);
  assert.equal(isFemaleName(altName), true);
  assert.ok(!base.keyFigures.some(f => f.name === altName));
  assert.ok(!base.advisors.some(a => a.name === altName));

  const lawyerFemale = customizeLeader(base, { bio: 'lawyer', ideo: 'leftist', name: altName });
  assert.equal(lawyerFemale.resources.internalLegitimacy, START_RES.debut.internalLegitimacy + BIO_RES);
  assert.match(lawyerFemale.leader.bio, /выигравшая/);

  const endedFemale = { ...lawyerFemale, ended: true, endType: 'reelected' as const, turn: 20, year: 1983 };
  const verdict = await classicApi.ending(endedFemale);
  assert.match(verdict.verdict, /правила страной/);
  assert.match(verdict.verdict, /приняла/);
});

test('secretary portrait resolves by current secretary name in Neman 1978 and stays null for other countries', async () => {
  const base = await fresh();
  const name = 'Елена Верес';
  const stateWithSecretary = { ...base, world: { ...base.world, secretary: { name } } } as unknown as GameState;
  assert.equal(historicalPortraitArt(stateWithSecretary, name), HISTORICAL_SECRETARY_ART.portrait.src);
  assert.equal(historicalPortraitArt(stateWithSecretary, 'Другое Имя'), null);
  for (const country of LEGACY_COUNTRIES) {
    assert.equal(historicalPortraitArt({ ...stateWithSecretary, country }, name), null);
  }
});

test('living world characters, press correspondents and staffing candidates all resolve canonical 1978 portraits', async () => {
  const { openLivingWorld } = await import('../game/living-world.ts');
  const base = await fresh();
  const fuelTitle = ALTERNATE_EVENTS.find(card => card.id === 'alt_fuel')!.title;
  const districtTitle = ALTERNATE_EVENTS.find(card => card.id === 'alt_district')!.title;
  const worldState = openLivingWorld({
    ...base,
    turn: 8,
    history: [
      { year: 1978, title: fuelTitle, choice: '', headline: '', historianNote: '' },
      { year: 1978, title: districtTitle, choice: '', headline: '', historianNote: '' },
    ],
  });
  assert.ok(worldState.world);
  const peopleIds = worldState.world.people.filter(person => !person.figure).map(person => person.id);
  assert.deepEqual(peopleIds, ['minister', 'engineer', 'healthMinister', 'doctor']);
  for (const person of worldState.world.people) {
    if (!person.figure) {
      assert.equal(historicalPortraitArt(worldState, person.name), HISTORICAL_WORLD_PEOPLE_ART[person.id].src);
      for (const country of LEGACY_COUNTRIES) {
        assert.equal(historicalPortraitArt({ ...worldState, country }, person.name), null);
      }
    }
  }
  const explicitFemalePress = [
    'Корреспондентка информационного агентства',
    'Ведущая утреннего шоу',
    'Корреспондентка независимого издания',
    'Корреспондентка регионального радио',
    'Корреспондентка общественного телевидения',
    'Корреспондентка социального канала',
    'Корреспондентка радио диаспоры',
    'Корреспондентка утренних новостей',
  ];
  for (const who of explicitFemalePress) {
    assert.equal(historicalPortraitArt(worldState, who), HISTORICAL_PRESS_ART.female.src, who);
  }
  const explicitMalePress = [
    'Корреспондент делового издания',
    'Корреспондент оппозиционного канала',
    'Журналист деловой газеты',
    'Корреспондент вечерних новостей',
    'Иностранный корреспондент',
    'Политический обозреватель',
    'Корреспондент парламентской газеты',
    'Журналист-расследователь',
    'Представитель союза журналистов',
    'Обозреватель правительственной газеты',
    'Корреспондент оппозиционной газеты',
    'Корреспондент иностранного агентства',
    'Ведущий вечернего ток-шоу',
    'Журналист экономического издания',
    'Главный редактор сатирического журнала',
    'Корреспондент культурного обозрения',
    'Финансовый обозреватель',
    'Литературный обозреватель',
  ];
  for (const who of explicitMalePress) {
    assert.equal(historicalPortraitArt(worldState, who), HISTORICAL_PRESS_ART.male.src, who);
  }
  for (const question of [
    ...PRESS_QUESTIONS,
    { who: 'Корреспондентка независимого издания' },
    { who: 'Корреспондент делового издания' },
  ]) {
    const art = historicalPortraitArt(worldState, question.who);
    const expected = explicitFemalePress.includes(question.who)
      ? HISTORICAL_PRESS_ART.female.src
      : HISTORICAL_PRESS_ART.male.src;
    assert.equal(art, expected, question.who);
    for (const country of LEGACY_COUNTRIES) {
      assert.equal(historicalPortraitArt({ ...worldState, country }, question.who), null);
    }
  }
  const roster = Object.fromEntries(worldState.advisors.map(advisor => [`advisor:${advisor.id}`, advisor.name]));
  const pool = candidatePool(worldState);
  assert.ok(pool.length > 0);
  for (const candidate of pool) {
    const beforeHire = historicalPortraitArt(worldState, candidate.name, roster);
    assert.ok(beforeHire, candidate.name);
    const hired = hireAdvisor({
      ...worldState,
      resources: {
        politicalCapital: 80, economy: 80, military: 80,
        externalReputation: 80, internalLegitimacy: 80, personalResource: 80,
      },
    }, candidate.id);
    const afterHire = historicalPortraitArt(hired, candidate.name, roster);
    assert.equal(afterHire, beforeHire);
    assert.notEqual(afterHire, HISTORICAL_ADVISOR_ART[candidate.seat].src);
  }
});

test('budget, terms, and factory strike resolve dedicated 1978 scenes while unmapped generic scenes return null', async () => {
  const base = await fresh();
  const event = await classicApi.event(base);

  const budgetEvent = { ...event, card: undefined, title: 'Предвыборный бюджет', budget: { total: 10 } };
  assert.deepEqual(historicalEventArt(ALTERNATE_COUNTRY, budgetEvent, 'cabinet'), HISTORICAL_SCENE_ART.budget);
  const budgetState = { ...base, history: [{ year: 1979, title: 'Предвыборный бюджет', choice: '', headline: '', historianNote: '' }] };
  assert.deepEqual(historicalResultArt(budgetState, 'cabinet'), HISTORICAL_SCENE_ART.budget);

  const termsEvent = { ...event, card: undefined, title: 'Вопрос о сроках' };
  assert.deepEqual(historicalEventArt(ALTERNATE_COUNTRY, termsEvent, 'stamp'), HISTORICAL_SCENE_ART.terms);
  const termsState = { ...base, history: [{ year: 1982, title: 'Вопрос о сроках', choice: '', headline: '', historianNote: '' }] };
  assert.deepEqual(historicalResultArt(termsState, 'stamp'), HISTORICAL_SCENE_ART.terms);

  const strikeEvent = { ...event, card: 'alt_region_factory_strike', title: 'Заводы бастуют, деревня молчит' };
  assert.deepEqual(historicalEventArt(ALTERNATE_COUNTRY, strikeEvent, 'protest'), HISTORICAL_SCENE_ART.factoryStrike);
  assert.notEqual(historicalEventArt(ALTERNATE_COUNTRY, strikeEvent, 'protest'), HISTORICAL_SCENE_ART.protest);
  const genericStrikeEvent = { ...event, card: undefined, title: 'Забастовка на крупнейшем заводе' };
  assert.deepEqual(historicalEventArt(ALTERNATE_COUNTRY, genericStrikeEvent, 'protest'), HISTORICAL_SCENE_ART.factoryStrike);

  const unmappedEvent = { ...event, card: undefined, title: 'Внеочередное совещание в министерстве' };
  for (const scene of ['cabinet', 'stamp', 'meeting'] as const) {
    assert.equal(historicalEventArt(ALTERNATE_COUNTRY, unmappedEvent, scene), null);
    const unmappedResult = { ...base, history: [{ year: 1983, title: unmappedEvent.title, choice: '', headline: '', historianNote: '' }] };
    assert.equal(historicalResultArt(unmappedResult, scene), null);
  }

  for (const country of LEGACY_COUNTRIES) {
    assert.equal(historicalEventArt(country, budgetEvent, 'cabinet'), null);
    assert.equal(historicalEventArt(country, termsEvent, 'stamp'), null);
    assert.equal(historicalEventArt(country, strikeEvent, 'protest'), null);
  }
});

test('alt_contracts beats resolve distinct contextual scenes across all 3 choices and 2 outcomes', async () => {
  const CHOICES = [
    'Оплатить зарплату в обмен на проверку договоров',
    'Получить аванс под трёхлетний российский заказ',
    'Перестроить производство и защитить увольняемых',
  ] as const;

  for (const choiceText of CHOICES) {
    for (const success of [true, false]) {
      const seed = 7;
      const intro = await classicApi.setup(ALTERNATE_COUNTRY, 'coalition', 'pragmatist', seed);
      let state = createInitialState(ALTERNATE_COUNTRY, 'coalition', 'pragmatist', intro, seededRandom(seed));
      state = startEvent(state, await classicApi.event(state));
      const choice = state.currentEvent!.choices.find(c => c.text === choiceText)!;
      assert.ok(choice, choiceText);
      state = resolveTurn(state, choice.id, await classicApi.consequence(state, choice.id));
      state = { ...state, history: state.history.map(h => ({ ...h, success })) };
      const eventTurn2 = await classicApi.event(state);

      assert.equal(eventTurn2.beat?.arcId, 'alt_contracts');
      const art = historicalEventArt(ALTERNATE_COUNTRY, eventTurn2, sceneOf(eventTurn2));

      if (choiceText.startsWith('Оплатить зарплату')) {
        assert.equal(eventTurn2.title, 'Опись из заводской бухгалтерии');
        assert.deepEqual(art, HISTORICAL_SCENE_ART.wagesAudit);
      } else if (choiceText.startsWith('Получить аванс')) {
        assert.equal(eventTurn2.title, success ? 'Дело выданного аванса' : 'Приложение к российскому заказу');
        assert.deepEqual(art, HISTORICAL_SCENE_ART.export);
      } else {
        assert.equal(eventTurn2.title, 'Три копии одного договора');
        assert.deepEqual(art, HISTORICAL_SCENE_ART.archive);
      }

      for (const country of LEGACY_COUNTRIES) {
        assert.equal(historicalEventArt(country, eventTurn2, sceneOf(eventTurn2)), null);
      }
    }
  }

  const base = await fresh();
  const event = await classicApi.event(base);
  const beat = { arcId: 'alt_contracts', arcTitle: 'Четвёртый экземпляр', turn: 1, episode: 1, total: 3 };
  const pageEvent = { ...event, beat: { ...beat, turn: 2, episode: 2 }, title: 'Цена отсутствующей страницы' };
  assert.deepEqual(historicalEventArt(ALTERNATE_COUNTRY, pageEvent, 'archive'), HISTORICAL_SCENE_ART.archive);
  const fourthEvent = { ...event, beat: { ...beat, turn: 15, episode: 3 }, title: 'Четвёртый экземпляр' };
  assert.deepEqual(historicalEventArt(ALTERNATE_COUNTRY, fourthEvent, 'archive'), HISTORICAL_SCENE_ART.archive);
});


