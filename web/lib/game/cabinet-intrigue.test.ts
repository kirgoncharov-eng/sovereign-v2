import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cabinetArc, outsideCouncil } from './cabinet-intrigue.ts';
import { applyCabinetAction, cabinetCandidates } from './cabinet.ts';
import { ARCS, type Arc } from '../content/arcs.ts';
import { beatEvent, earlyArcHook, classicApi } from './classic.ts';
import { newTerm, signChoice, startFromSeed } from '../client/chronicle.ts';
import { parseSave } from '../client/save.ts';
import { RESOURCE_KEYS, SAVE_VERSION } from './data.ts';
import type { DifficultyId, GameState } from './types.ts';

const mole = ARCS.find(arc => arc.id === 'mole')!;
async function scenario(seed = 7, turn = 35, flags = ['later', 'watch', 'trap'], diff: DifficultyId = 'coalition'): Promise<GameState> {
  const state = await newTerm(startFromSeed(seed, diff));
  const target = state.advisors.find(person => person.id === 'security')!;
  return { ...state, turn, resources: Object.fromEntries(RESOURCE_KEYS.map(key => [key, 90])) as GameState['resources'],
    arc: { id: 'mole', target: target.name, targetRole: target.role, flags, done: [1, 3, 7, 12].filter(t => t < turn % 20 + 1), epilogue: null } };
}
function fireTarget(state: GameState) {
  const target = state.advisors.find(person => person.name === state.arc!.target)!;
  return applyCabinetAction(state, { kind: 'dismiss', seat: target.id, name: target.name });
}
function mechanics(arc: Arc) {
  return arc.beats.map(beat => ({ turn: beat.turn, variants: beat.variants.map(variant => ({
    requires: variant.requires, requiresAll: variant.requiresAll, after: variant.after, afterSuccess: variant.afterSuccess,
    choices: variant.choices.map(({ tags, flag, effect, policyEffect, costReasons, removes, camps }) =>
      ({ tags, flag, effect, policyEffect, costReasons, removes, camps })),
  })) }));
}

test('бывший советник получает другую сцену, но не новую механику или личность', async () => {
  const state = await scenario(), copy = structuredClone(mole), fired = fireTarget(state);
  const adapted = cabinetArc(fired, mole);
  assert.equal(outsideCouncil(fired), true);
  assert.deepEqual(mechanics(adapted), mechanics(mole));
  assert.equal(adapted.id, mole.id);
  assert.deepEqual(mole, copy, 'глобальный контент не изменяется');
  assert.deepEqual(fired.arc!.flags, state.arc!.flags);
  assert.equal(fired.arc!.target, state.arc!.target);
  assert.match(adapted.beats.at(-1)!.variants[0].description, /не входит в ваш нынешний совет/);
  assert.ok(adapted.beats.every(beat => beat.variants.every(variant => variant.choices.every(choice => !choice.text.includes('Распустить совет')))));
});

test('архив и Daily прежние; указ об ограничении доступа не обещает роспуск совета', async () => {
  const state = await scenario(), fired = fireTarget(state);
  for (const original of [{ ...fired, country: 'Украина' }, { ...fired, daily: '2026-11-11' }]) {
    assert.equal(cabinetArc(original, mole), mole);
  }
  for (const active of [state, { ...fired, cabinet: undefined }, { ...fired, advisors: state.advisors },
    { ...fired, arc: { ...fired.arc!, target: fired.keyFigures[0].name } }]) {
    const adapted = cabinetArc(active, mole);
    assert.deepEqual(mechanics(adapted), mechanics(mole));
    assert.doesNotMatch(JSON.stringify(adapted), /Распустить совет|Совет распущен/);
    assert.equal(adapted.hooks, mole.hooks);
  }
  assert.equal(cabinetArc(fired, ARCS[0]), ARCS[0]);
});

test('увольнение в открытом эпизоде сразу меняет сцену; подпись и reload сохраняют прежнего антагониста', async () => {
  let state = await scenario();
  state = { ...state, currentEvent: beatEvent(state) };
  assert.match(state.currentEvent!.description, /придёт на совещание/);
  const before = structuredClone(state), fired = fireTarget(state);
  assert.equal(fired.currentEvent!.title, 'Разоблачение старой сети');
  assert.doesNotMatch(fired.currentEvent!.description, /придёт на совещание/);
  assert.deepEqual(state, before);
  const candidate = cabinetCandidates(fired, 'security')[0];
  const hired = applyCabinetAction(fired, { kind: 'hire', candidate: candidate.id });
  assert.equal(hired.arc!.target, before.arc!.target);
  assert.ok(!hired.currentEvent!.description.includes(candidate.name));
  const signed = await signChoice(hired, 'c');
  assert.ok(signed.arc!.flags.includes('exiled'));
  assert.doesNotMatch(signed.lastTurn!.narrative, /не приходит на работу|приедет на совещание/);
  assert.ok(parseSave(JSON.stringify({ version: SAVE_VERSION, screen: 'chronicle', state: signed })));
});

test('все развилки и исходы после отставки читаются на разных зёрнах и сложностях 1978 года', async () => {
  for (const [seed, diff] of [[1, 'debut'], [3, 'coalition'], [7, 'crisis'], [19, 'ruins']] as const) {
    for (const turn of [20, 22, 26, 31, 35]) for (const flags of [['later'], ['later', 'watch', 'trap']]) {
      const state = await scenario(seed, turn, flags, diff);
      const fired = fireTarget(state), event = beatEvent(fired)!;
      assert.ok(event);
      const text = JSON.stringify(event);
      assert.doesNotMatch(text, /\{(?:target|capital)[^}]*\}|Распустить совет|придёт на совещание|не приходит на работу|флешк|роуминг|сервер|админ/);
      assert.equal(event.choices.length, 3);
      assert.ok(event.choices.every(choice => choice.arc?.ok && choice.arc?.fail));
      if (turn === 26 || turn === 35) assert.ok(text.includes(state.arc!.target));
    }
  }
});


test('ранняя нить после отставки учитывает выбор и провал; поздний предвестник включён в рассказ', async () => {
  for (const [turn, flag] of [[21, 'o_guard'], [23, 'watch'], [25, 'blame']] as const) {
    for (const success of [true, false]) {
      let state = fireTarget(await scenario(7, turn, ['later', flag]));
      const beat = turn === 21 ? 1 : 3;
      state = { ...state, arc: { ...state.arc!, done: [beat] }, history: Array.from({ length: turn }, () => ({
        year: 1983, title: 'Закрытые бумаги', choice: flag, headline: '', historianNote: '', tags: [], success,
      })) };
      const line = earlyArcHook(state)!;
      assert.ok(line);
      assert.doesNotMatch(line, /Советники|советник|В совете/);
      assert.match(line, success ? /Охрана|Контрразведка|Аппарат/ : /неудач/);
    }
  }
  const state = fireTarget(await scenario(7, 27));
  const event = { ...state, currentEvent: (await classicApi.event(state)) };
  const report = await classicApi.consequence(event, event.currentEvent!.choices[0].id);
  assert.ok(cabinetArc(event, mole).hooks.some(hook => report.narrative.includes(hook)));
});
