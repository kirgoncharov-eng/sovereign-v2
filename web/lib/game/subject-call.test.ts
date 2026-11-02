import test from 'node:test';
import assert from 'node:assert/strict';
import { callChoice, callEvent, classicApi } from './classic.ts';
import { createInitialState, planTurn, resolveTurn, seededRandom, startEvent } from './engine.ts';
import { ALTERNATE_COUNTRY, LEGACY_COUNTRIES } from './alternate-world.ts';
import { traitOf, type TraitId } from './people.ts';
import { priceText } from './subject-call.ts';
import { HISTORICAL_CALL_TOPICS } from '../content/historical-calls.ts';
import { LATER_COST, SUBJECT_CALLS } from '../content/subject-calls.ts';
import { parseSave } from '../client/save.ts';
import { SAVE_VERSION } from './data.ts';
import type { Bloc, Choice, GameState } from './types.ts';

const BLOCS: Bloc[] = ['business', 'regional', 'liberal'];
const PAIR: Bloc[] = ['business', 'liberal'];
const save = (state: GameState) => JSON.stringify({ version: SAVE_VERSION, screen: 'game', state });

async function fixture(bloc: Bloc, seed = 1, country = ALTERNATE_COUNTRY): Promise<GameState> {
  const intro = await classicApi.setup(country, 'debut', 'pragmatist', seed);
  const base = createInitialState(country, 'debut', 'pragmatist', intro, seededRandom(seed));
  const faction = base.factions.find(group => group.bloc === bloc)!;
  const caller = base.keyFigures.find(figure => figure.faction === faction.id)!;
  return { ...base, turn: 16, arc: null, keyFigures: [caller],
    resources: { ...base.resources, economy: 60, politicalCapital: 60, personalResource: 60 } };
}

function mechanics(choice: Choice) {
  const { scene, sceneFail, headline, headlineFail, hint, ...rest } = choice;
  void scene; void sceneFail; void headline; void headlineFail; void hint;
  return rest;
}

async function sign(state: GameState, id: string) {
  const current = startEvent(state, callEvent(state)!);
  const loaded = parseSave(save(current));
  assert.ok(loaded, 'звонок переживает перезагрузку до подписи');
  assert.deepEqual(loaded.state.currentEvent, current.currentEvent);
  const plan = planTurn(loaded.state, id);
  const result = resolveTurn(loaded.state, id, await classicApi.consequence(loaded.state, id));
  assert.deepEqual(result.resources, plan.resources);
  assert.equal(result.lastTurn!.success, true, 'цена варианта не зависит от скрытого броска');
  const after = parseSave(save(result));
  assert.ok(after, 'решение переживает перезагрузку');
  assert.deepEqual(after.state.pending, result.pending);
  return after.state;
}

async function nextQuarter(state: GameState) {
  const next = startEvent(state, await classicApi.event(state));
  const id = next.currentEvent!.choices[0].id;
  return resolveTurn(next, id, await classicApi.consequence(next, id));
}

test('собеседники одного характера с разными требованиями решаются разными действиями', async () => {
  let pair: GameState[] = [];
  for (let seed = 1; seed <= 40 && !pair.length; seed++) {
    const states = await Promise.all(PAIR.map(bloc => fixture(bloc, seed)));
    const traits = states.map((state, i) => traitOf(state.seed, state.keyFigures[0], PAIR[i]));
    if (traits[0] === traits[1]) pair = states;
  }
  assert.equal(pair.length, 2, 'нашлась партия, где оба собеседника одного характера');
  const [business, liberal] = pair;
  assert.equal(callEvent(business)!.call!.trait, callEvent(liberal)!.call!.trait);
  const [a, b] = [business, liberal].map(state => callEvent(state)!);
  for (const event of [a, b]) {
    assert.equal(event.call!.negotiation, 'subject');
    assert.equal(event.choices.length, 5);
  }
  const texts = (event: typeof a) => new Set(event.choices.slice(0, 4).map(choice => choice.text));
  for (const text of texts(a)) assert.ok(!texts(b).has(text), `«${text}» не повторяется в другой теме`);
  assert.notDeepEqual(a.choices.map(choice => choice.deal!.res), b.choices.map(choice => choice.deal!.res));
  assert.throws(() => callChoice(startEvent(business, a), 'principle', 'deal'), /конкретное/);
});

test('характер даёт голос, но не меняет варианты и цены; кнопки не подсказывают характер', async () => {
  for (const bloc of BLOCS) {
    const events = await Promise.all(Array.from({ length: 16 }, (_, i) => i + 1).map(async seed => callEvent(await fixture(bloc, seed))!));
    const traits = new Set(events.map(event => event.call!.trait));
    assert.ok(traits.size >= 3, `${bloc}: проверено несколько характеров`);
    for (const event of events) {
      assert.deepEqual(event.choices.map(choice => [choice.id, choice.text, choice.hint.replace(/^.*?Отношение: [^.]*\.\s*/, '')]),
        events[0].choices.map(choice => [choice.id, choice.text, choice.hint.replace(/^.*?Отношение: [^.]*\.\s*/, '')]));
      assert.deepEqual(event.choices.map(choice => ({ ...mechanics(choice), deal: { ...choice.deal!, figure: '', later: { ...choice.deal!.later!, story: '' } } })),
        events[0].choices.map(choice => ({ ...mechanics(choice), deal: { ...choice.deal!, figure: '', later: { ...choice.deal!.later!, story: '' } } })));
      assert.ok(event.call!.context!.includes(SUBJECT_CALLS[bloc]!.voice[event.call!.trait as TraitId]));
      for (const choice of event.choices) {
        assert.doesNotMatch(`${choice.text} ${choice.hint}`, /идеалист|прагматик|карьерист|аппаратчик|ястреб|популист|принцип|давлен/i);
      }
    }
  }
});

test('цена и отношения видны до подписи и совпадают с движком; варианты действительно разные по цене', async () => {
  for (const bloc of BLOCS) {
    const state = await fixture(bloc);
    const event = callEvent(state)!;
    const caller = state.keyFigures[0];
    assert.equal(event.call!.demand, HISTORICAL_CALL_TOPICS[bloc]!.demand);
    for (const choice of event.choices) {
      assert.ok(choice.hint.startsWith(priceText(choice.deal!.res!)), `${bloc}/${choice.id}: цена в подсказке`);
      const rel = choice.deal!.figureRel!;
      assert.ok(choice.hint.includes(`${caller.name} ${rel > 0 ? '+' : '−'}${Math.abs(rel)}`), `${bloc}/${choice.id}: отношение в подсказке`);
      assert.doesNotMatch(`${choice.hint} ${choice.scene} ${choice.headline} ${choice.deal!.later!.story}`, /\{[a-z]+\}/);
      assert.notEqual(choice.headline, choice.text);
    }
    const spend = (choice: Choice) => -Object.values(choice.deal!.res!).reduce((sum, value) => sum + (value ?? 0), 0);
    const [full, partial, check, refuse, later] = event.choices;
    assert.ok(spend(full) > spend(partial), 'полная уступка дороже частичной');
    assert.ok(full.deal!.figureRel! > partial.deal!.figureRel! && partial.deal!.figureRel! > check.deal!.figureRel!);
    assert.ok(refuse.deal!.figureRel! < later.deal!.figureRel! && later.deal!.figureRel! < check.deal!.figureRel!);
    assert.equal(later.deal!.later!.turns, 2);
    assert.deepEqual(later.deal!.later!.res, LATER_COST);
    // Цена отсрочки безусловна: текст не обещает избежать её поручением, которого движок не проверяет.
    assert.ok(later.hint.includes(`политкапитал −${-LATER_COST.politicalCapital}`), 'отложенная цена названа до подписи');
    assert.doesNotMatch(`${later.hint} ${later.deal!.later!.story}`, /если поручени|до сих пор нет/);
  }
});

test('каждый вариант исполняется, переживает перезагрузку и возвращается докладом следующего квартала', async () => {
  for (const bloc of BLOCS) {
    const state = await fixture(bloc);
    const event = callEvent(state)!;
    const stories = new Set<string>();
    for (const choice of event.choices) {
      const signed = await sign(state, choice.id);
      assert.equal(signed.lastTurn!.headline, choice.headline);
      const pending = signed.pending.find(entry => entry.event === event.title && entry.label === choice.deal!.later!.label)!;
      assert.ok(pending, `${bloc}/${choice.id}: доклад запланирован`);
      assert.equal(pending.due, choice.id === 'e' ? 19 : 18);
      assert.equal(pending.source, choice.text, 'доклад помнит принятый вариант');
      stories.add(pending.story!);
      let result = await nextQuarter(signed);
      if (choice.id === 'e') result = await nextQuarter(result);
      assert.ok(result.lastTurn!.matured.some(entry => entry.id === pending.id), `${bloc}/${choice.id}: доклад созрел`);
      assert.ok(result.lastTurn!.narrative.includes(pending.story!), `${bloc}/${choice.id}: доклад виден в газете`);
    }
    assert.equal(stories.size, 5, 'у каждого варианта свой доклад');
  }
});

test('старый звонок, архив, «Дело дня», второй срок и другие темы сохраняют прежние правила', async () => {
  for (const bloc of BLOCS) {
    const state = await fixture(bloc);
    const event = callEvent(state)!;
    const legacy = startEvent(state, { ...event, choices: event.choices.slice(3, 5),
      call: { figure: event.call!.figure, trait: event.call!.trait, demand: event.call!.demand } });
    const loaded = parseSave(save(legacy));
    assert.ok(loaded, 'сохранение со старым звонком загружается');
    const old = callChoice(loaded.state, 'numbers', 'deal');
    assert.ok(old.headline!.includes(HISTORICAL_CALL_TOPICS[bloc]!.subject), 'старый звонок доигрывается по старой схеме');
    for (const other of [{ ...state, daily: '2026-10-26' }, { ...state, turn: 36 }]) {
      assert.equal(callEvent(other)?.call?.negotiation, undefined);
    }
    for (const country of LEGACY_COUNTRIES) {
      const archive = await fixture(bloc, 1, country).catch(() => null);
      if (archive?.keyFigures[0]) assert.equal(callEvent(archive)?.call?.negotiation, undefined);
    }
  }
  const security = await fixture('security');
  assert.equal(callEvent(security)!.call!.negotiation, undefined, 'темы без SUBJECT_CALLS не меняются');
});

test('поддельный предметный звонок без реплики собеседника не загружается', async () => {
  const current = startEvent(await fixture('business'), callEvent(await fixture('business'))!);
  const raw = JSON.parse(save(current));
  delete raw.state.currentEvent.call.context;
  assert.equal(parseSave(JSON.stringify(raw)), null);
});
