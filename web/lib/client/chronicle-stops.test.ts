import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  actOnLetter, answerStory, firstStep, newTerm, nextCase, openLetter, programOf, signCall, signOption, signPress, startFromSeed,
  takeOffice, termOver,
} from './chronicle.ts';
import { DANGER, EMPTY_STOPS, EXTRA_STOPS, dueStops, openStops, rememberStop, stillWaiting, storyStops, type Stop, type StopMemory } from './chronicle-stops.ts';
import { presidentialMessages, presidentialReplyActions, type PresidentialMessage } from './presidential-inbox.ts';
import { prepareQuarterResolution, withoutQuarterDraft } from './quarter-inbox.ts';
import { classicApi } from '../game/classic.ts';
import { openDeskWhenDue } from '../game/desk-timing.ts';
import { resolveTurn, startEvent } from '../game/engine.ts';
import { initPromises } from '../game/promises.ts';
import { livingActions, interveneWorld } from '../game/living-world.ts';
import { secretaryActions } from '../game/secretary.ts';
import { replyToLetter } from '../game/stories.ts';
import type { DifficultyId, GameState } from '../game/types.ts';

// Ответ на обращение, как его дал бы игрок в папке `/game`: первое доступное действие этого письма.
function replyAction(state: GameState, message: PresidentialMessage): string | null {
  if (message.action === 'secretary') return secretaryActions(state).find(action => !action.blocked)?.id ?? null;
  const direct = presidentialReplyActions(state, message).find(action => !action.blocked);
  if (direct) return direct.id;
  return livingActions(state).find(action => action.id.startsWith(`${message.action}:`) && !action.blocked)?.id ?? null;
}

// Вариант дела, как в хронике: первый вариант, первые ответы пресс-конференции, звонок цифрами и сделкой.
async function signFirst(state: GameState) {
  const step = firstStep(state);
  if (step.kind === 'press') return signPress(state, state.currentEvent!.press!.questions.map(() => 0));
  if (step.kind === 'call-approach') return signCall(state, 'numbers', 'deal');
  return signOption(state, step.options[0].key);
}

/** Срок в хронике: на каждой остановке — первый ответ, письмо человека — первый вариант резолюции. */
async function chronicleTerm(seed: number, diff: DifficultyId, answer = true) {
  const candidate = await newTerm(startFromSeed(seed, diff));
  let state = takeOffice(candidate, programOf(candidate).suggested);
  let memory: StopMemory = EMPTY_STOPS;
  const log: { turn: number; stops: Stop[] }[] = [];
  const open: { turn: number; key: string; token: string }[] = [];
  while (!termOver(state)) {
    for (const stop of storyStops(state)) {
      memory = rememberStop(state, stop, memory);
      if (answer) state = answerStory(state, stop.letter!.story, stop.letter!.replies![0].id);
    }
    state = await nextCase(state);
    const shown: Stop[] = [];
    // Всё, что ждёт ответа: письма папки с `needsReply` и предложения правительства.
    for (const item of openStops(state)) open.push({ turn: state.turn, key: item.key, token: item.token });
    for (const message of presidentialMessages(state).filter(item => item.needsReply)) {
      assert.ok(openStops(state).some(item => item.key === message.key), `письмо «${message.key}» ждёт ответа, но не стало остановкой`);
    }
    for (let due = dueStops(state, openStops(state), memory); due.length; due = dueStops(state, openStops(state), memory)) {
      const stop = due[0];
      shown.push(stop);
      memory = rememberStop(state, stop, memory);
      if (stop.message) state = openLetter(state, stop.message.person, stop.message.key);
      const action = answer && stop.message && stop.kind === 'letter' ? replyAction(state, stop.message) : null;
      if (action) state = actOnLetter(state, action);
    }
    log.push({ turn: state.turn, stops: shown });
    state = await signFirst(state);
  }
  return { state, log, open, memory };
}

/** Тот же срок по конвейеру `/game`: вступление, папка, подготовленная резолюция, подпись, «Следующий ход». */
async function deskTerm(seed: number, diff: DifficultyId) {
  const candidate = await newTerm(startFromSeed(seed, diff));
  let state = openDeskWhenDue({ ...candidate, promises: initPromises(programOf(candidate).suggested, candidate.resources) });
  let memory: StopMemory = EMPTY_STOPS;
  while (!termOver(state)) {
    for (const letter of (state.lastTurn?.letters ?? []).filter(item => item.replies?.length && !state.storyReplies?.[item.story])) {
      state = replyToLetter(state, letter.story, letter.replies![0].id);
    }
    state = { ...state, lastTurn: null };
    state = startEvent(state, await classicApi.event(state));
    // Игрок открывает те же письма в том же порядке и отвечает так же; папка `/game` не ограничивает их число,
    // поэтому порядок берём у хроники — проверяется, что ответы через хронику меняют игру так же, как через стол.
    for (let due = dueStops(state, openStops(state), memory); due.length; due = dueStops(state, openStops(state), memory)) {
      const stop = due[0];
      memory = rememberStop(state, stop, memory);
      const message = presidentialMessages(state).find(item => item.key === stop.key)!;
      state = openLetter(state, message.person, message.key);
      const action = stop.kind === 'letter' ? replyAction(state, message) : null;
      if (action) state = interveneWorld(state, action);
    }
    const step = firstStep(state);
    const event = state.currentEvent!;
    if (step.kind !== 'choice' || event.budget) { state = await signFirst(state); continue; }
    const choiceId = step.options[0].key;
    const drafted = prepareQuarterResolution(state, choiceId);
    const consequence = await classicApi.consequence(drafted, choiceId);
    state = openDeskWhenDue(resolveTurn(withoutQuarterDraft(drafted), choiceId, consequence));
  }
  return state;
}

const SEEDS: [number, DifficultyId][] = [[21, 'debut'], [5, 'crisis'], [9, 'coalition'], [33, 'debut'], [14, 'ruins']];

test('логика та же: срок через хронику и через стол `/game` с теми же ответами дают одно состояние', async () => {
  for (const [seed, diff] of SEEDS) {
    const chronicle = (await chronicleTerm(seed, diff)).state;
    const desk = await deskTerm(seed, diff);
    assert.deepEqual(chronicle, desk, `зерно ${seed}, ${diff}`);
  }
});

test('в хронике живёт страна: стол открывается, обещания взяты, письма и предложения доходят до остановок', async () => {
  const { state, log } = await chronicleTerm(21, 'debut');
  assert.ok(state.world, 'живой мир открыт');
  assert.equal(state.promises?.length, 3, 'три обещания программы');
  const kinds = new Set(log.flatMap(quarter => quarter.stops.map(stop => stop.kind)));
  assert.ok(kinds.has('letter') && kinds.has('proposal'), [...kinds].join(','));
  assert.ok(log.slice(0, 2).every(quarter => !quarter.stops.length), 'первые два хода — только дело (desk-timing)');
});

test('ничего не теряется: каждое обращение, ждущее ответа, хотя бы раз останавливает ленту, пока оно открыто', async () => {
  for (const [seed, diff] of SEEDS) {
    const { log, open } = await chronicleTerm(seed, diff, false);
    for (const item of open) {
      const shown = log.some(quarter => quarter.stops.some(stop => stop.key === item.key && stop.token === item.token));
      assert.ok(shown, `зерно ${seed}: ${item.key} (${item.token}) ждал ответа с хода ${item.turn}, но не остановил ленту`);
    }
  }
});

test('предел: кроме дела — не больше двух остановок в квартал, если ничего не истекает', async () => {
  for (const [seed, diff] of SEEDS) {
    const { log } = await chronicleTerm(seed, diff, false);
    for (const quarter of log) {
      const calm = quarter.stops.filter(stop => stop.deadline === undefined || stop.deadline - quarter.turn > 1);
      assert.ok(calm.length <= EXTRA_STOPS, `зерно ${seed}, ход ${quarter.turn}: ${quarter.stops.map(stop => stop.key)}`);
    }
  }
});

test('отложенное возвращается: в последний квартал срока и при опоре у порога; без этого — не повторяется', () => {
  const state = { turn: 6, resources: { politicalCapital: 50, economy: 50, military: 50, externalReputation: 50, internalLegitimacy: 50,
    personalResource: 50 } } as GameState;
  const letter: Stop = { key: 'minister-mandate', token: 'a', kind: 'letter', title: '', person: 'minister', deadline: 9 };
  const proposal: Stop = { key: 'government-proposals', token: 'exports,housing', kind: 'proposal', title: '', person: 'economist' };
  let memory = rememberStop(state, proposal, rememberStop(state, letter, EMPTY_STOPS));
  assert.deepEqual(dueStops({ ...state, turn: 7 }, [letter, proposal], memory), [], 'показанное не повторяется');
  assert.deepEqual(dueStops({ ...state, turn: 8 }, [letter, proposal], memory).map(stop => stop.key), ['minister-mandate'], 'последний квартал');
  memory = rememberStop({ ...state, turn: 8 }, letter, memory);
  assert.deepEqual(dueStops({ ...state, turn: 8 }, [letter], memory), [], 'напоминание одно');
  const low = { ...state, turn: 9, resources: { ...state.resources, economy: DANGER } };
  assert.deepEqual(dueStops(low, [proposal], memory).map(stop => stop.key), ['government-proposals'], 'опора у порога');
  assert.deepEqual(dueStops({ ...state, turn: 9 }, [{ ...letter, token: 'b' }], memory).map(stop => stop.token), ['b'], 'новая фаза');
});

test('письмо человека: остановка до следующего дела, ответ проходит, после дела письма уже нет', async () => {
  for (const [seed, diff] of SEEDS) {
    const candidate = await newTerm(startFromSeed(seed, diff));
    let state = takeOffice(candidate, programOf(candidate).suggested);
    while (!termOver(state) && !storyStops(state).length) state = await signFirst(await nextCase(state));
    if (termOver(state)) continue;
    const [stop] = storyStops(state);
    assert.ok(stillWaiting(state, stop));
    const answered = answerStory(state, stop.letter!.story, stop.letter!.replies![0].id);
    assert.ok(!stillWaiting(answered, stop));
    assert.deepEqual(storyStops(await nextCase(state)), [], 'со следующим делом ответить уже нельзя');
    return;
  }
  assert.fail('ни на одном зерне не пришло письмо с ответом');
});
