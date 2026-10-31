import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  actOnLetter, answerStory, convene, hire, signInitiative, newTerm, nextCase, openLetter, programOf, signBudget, signCall, signChoice, signPress, startFromSeed,
  takeOffice, termOver,
} from './chronicle.ts';
import { DANGER, EMPTY_STOPS, EXTRA_STOPS, dueStops, openStops, rememberStop, stillWaiting, storyStops, type Stop, type StopMemory } from './chronicle-stops.ts';
import { presidentialMessages, presidentialReplyActions, type PresidentialMessage } from './presidential-inbox.ts';
import { prepareQuarterResolution, withoutQuarterDraft } from './quarter-inbox.ts';
import { budgetChoice, callChoice, classicApi, pressChoice } from '../game/classic.ts';
import { openDeskWhenDue } from '../game/desk-timing.ts';
import { conveneCouncil, resolveTurn, startEvent } from '../game/engine.ts';
import { isPresidentialDiscussion } from '../game/presidential-story.ts';
import { initPromises } from '../game/promises.ts';
import { livingActions, interveneWorld } from '../game/living-world.ts';
import { secretaryActions } from '../game/secretary.ts';
import { candidatePool, hireAdvisor, staffingBlocked } from '../game/staffing.ts';
import { confirmInitiative, initiativeOptions, type InitiativeId } from '../game/initiatives.ts';
import { replyToLetter } from '../game/stories.ts';
import { CRISIS_THRESHOLD } from '../game/data.ts';
import type { Choice, DifficultyId, GameState } from '../game/types.ts';

// Мера, которую игрок подписал бы в окне первой опоры у порога: первая без запрета.
const measure = (state: GameState, stop: Stop) =>
  stop.resources!.flatMap(key => initiativeOptions(state, key)).find(option => !option.blocked)!.id;

// Кандидат из резерва, которого можно назначить сейчас: первый без запрета.
const hireable = (state: GameState) => candidatePool(state).find(candidate => !staffingBlocked(state, candidate))?.id ?? null;

// Ответ на обращение, как его дал бы игрок в папке `/game`: первое доступное действие этого письма.
function replyAction(state: GameState, message: PresidentialMessage): string | null {
  if (message.action === 'secretary') return secretaryActions(state).find(action => !action.blocked)?.id ?? null;
  const direct = presidentialReplyActions(state, message).find(action => !action.blocked);
  if (direct) return direct.id;
  return livingActions(state).find(action => action.id.startsWith(`${message.action}:`) && !action.blocked)?.id ?? null;
}

// Один и тот же игрок на обоих экранах: бюджет «больше на соцсферу, в долг», первые ответы пресс-конференции,
// звонок цифрами и сделкой, в разговоре и обычном деле — первый вариант; на чётных ходах — первое предложение совета.
const ALLOC = { army: 2, social: 4, economy: 2, apparatus: 1, culture: 1 };
const councilTurn = (state: GameState) => {
  const event = state.currentEvent!;
  return state.turn % 2 === 0 && !event.budget && !event.call && !event.press && !event.beat && !event.special
    && (state.councilCharges > 0 || isPresidentialDiscussion(state));
};

/** Подпись в хронике — как блок дела 2b: экраны бюджета, звонка и пресс-конференции, совет, вариант. */
async function chronicleSign(state: GameState) {
  const event = state.currentEvent!;
  if (event.budget) return signBudget(state, ALLOC, true);
  if (event.press) return signPress(state, event.press.questions.map(() => 0));
  if (event.call && !event.call.negotiation) return signCall(state, 'numbers', 'deal');
  if (councilTurn(state)) {
    const advised = convene(state, await classicApi.council(state));
    const proposal = advised.currentEvent!.council?.[0];
    if (proposal) return signChoice(advised, proposal.id);
    state = advised;
  }
  return signChoice(state, state.currentEvent!.choices[0].id);
}

/** Подпись в `/game`: собранный экраном вариант встаёт первым, резолюция готовится в папке и подписывается. */
async function deskSign(state: GameState) {
  const event = state.currentEvent!;
  const built = (final: Choice) => ({ ...state, currentEvent: { ...event, choices: [final, event.choices[1]] } });
  let ready = state, choice: Choice = event.choices[0];
  if (event.budget) { choice = budgetChoice(state, ALLOC, true); ready = built(choice); }
  else if (event.press) { choice = pressChoice(state, event.press.questions.map(() => 0)); ready = built(choice); }
  else if (event.call && !event.call.negotiation) { choice = callChoice(state, 'numbers', 'deal'); ready = built(choice); }
  else if (councilTurn(state)) {
    ready = conveneCouncil(state, await classicApi.council(state));
    choice = ready.currentEvent!.council?.[0] ?? ready.currentEvent!.choices[0];
  }
  const drafted = prepareQuarterResolution(ready, choice.id);
  const consequence = await classicApi.consequence(drafted, choice.id);
  return openDeskWhenDue(resolveTurn(withoutQuarterDraft(drafted), choice.id, consequence));
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
      if (stop.kind === 'staff' && answer) { const id = hireable(state); if (id) state = hire(state, id); }
      if (stop.kind === 'initiative' && answer) state = signInitiative(state, measure(state, stop));
      if (stop.message) state = openLetter(state, stop.message.person, stop.message.key);
      const action = answer && stop.message && stop.kind === 'letter' ? replyAction(state, stop.message) : null;
      if (action) state = actOnLetter(state, action);
    }
    log.push({ turn: state.turn, stops: shown });
    state = await chronicleSign(state);
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
      // Резерв кадров в `/game` — раздел «Люди»: тот же кандидат назначается тем же `hireAdvisor`.
      if (stop.kind === 'staff') { const id = hireable(state); if (id) state = hireAdvisor(state, id); continue; }
      // Мера при опоре у порога в `/game` — окно опоры в шапке: та же инициатива тем же `confirmInitiative`.
      if (stop.kind === 'initiative') { state = confirmInitiative(state, measure(state, stop) as InitiativeId); continue; }
      const message = presidentialMessages(state).find(item => item.key === stop.key)!;
      state = openLetter(state, message.person, message.key);
      const action = stop.kind === 'letter' ? replyAction(state, message) : null;
      if (action) state = interveneWorld(state, action);
    }
    state = await deskSign(state);
  }
  return state;
}

const SEEDS: [number, DifficultyId][] = [[21, 'debut'], [5, 'crisis'], [9, 'coalition'], [33, 'debut'], [14, 'ruins']];

test('логика та же: срок через хронику и через стол `/game` с теми же ответами, экранами дела и советом дают одно состояние', async () => {
  for (const [seed, diff] of SEEDS) {
    const chronicle = (await chronicleTerm(seed, diff)).state;
    const desk = await deskTerm(seed, diff);
    assert.deepEqual(chronicle, desk, `зерно ${seed}, ${diff}`);
  }
});

test('в хронике живёт страна: стол открывается, обещания взяты, письма, предложения и резерв кадров доходят до остановок', async () => {
  const { state, log } = await chronicleTerm(21, 'debut');
  assert.ok(state.world, 'живой мир открыт');
  assert.equal(state.promises?.length, 3, 'три обещания программы');
  const kinds = new Set(log.flatMap(quarter => quarter.stops.map(stop => stop.kind)));
  assert.ok(kinds.has('letter') && kinds.has('proposal') && kinds.has('staff'), [...kinds].join(','));
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
    while (!termOver(state) && !storyStops(state).length) state = await chronicleSign(await nextCase(state));
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

test('опора у порога: остановка с мерой, ответ в квартал, повтор — только при новой опоре или через год', async () => {
  let checked = 0;
  for (const [seed, diff] of SEEDS) {
    const candidate = await newTerm(startFromSeed(seed, diff));
    let state = takeOffice(candidate, programOf(candidate).suggested);
    while (!termOver(state)) {
      state = await nextCase(state);
      const [stop] = openStops(state).filter(item => item.kind === 'initiative');
      if (stop) {
        checked++;
        // Только опоры ниже порога кризиса, и для каждой есть мера без запрета.
        for (const key of stop.resources!) {
          assert.ok(state.resources[key] < CRISIS_THRESHOLD, `${key} = ${state.resources[key]}`);
          assert.ok(initiativeOptions(state, key).some(option => !option.blocked), key);
        }
        // Впереди спокойных остановок квартала, даже если ждут письма.
        assert.equal(dueStops(state, openStops(state), EMPTY_STOPS)[0].kind, 'initiative');
        const memory = rememberStop(state, stop, EMPTY_STOPS);
        assert.ok(!dueStops(state, openStops(state), memory).some(item => item.kind === 'initiative'), 'показанное не повторяется');
        const signed = signInitiative(state, measure(state, stop));
        assert.ok(!stillWaiting(signed, stop), 'после подписи — «Дальше»');
        // Новая опора у порога в тот же год — снова; та же опора через год — снова; опора вернулась выше — не держит.
        const extra: Stop = { ...stop, resources: [...stop.resources!, 'personalResource'], token: `${stop.token},personalResource` };
        const nextYear: Stop = { ...stop, token: `${Number(stop.token.split('|')[0]) + 1}|${stop.resources!.join(',')}` };
        assert.ok(dueStops(state, [extra], memory).length === 1, 'новая опора');
        assert.ok(dueStops({ ...state, turn: state.turn + 4 }, [nextYear], memory).length === 1, 'через год');
        const fewer: Stop = { ...stop, resources: stop.resources!.slice(1), token: `${stop.token.split('|')[0]}|${stop.resources!.slice(1).join(',')}` };
        if (fewer.resources!.length) assert.equal(dueStops(state, [fewer], memory).length, 0, 'опора вернулась выше');
        break;
      }
      state = await chronicleSign(state);
    }
  }
  assert.ok(checked >= 2, `остановка «Опоры у порога» должна встречаться в живых партиях, найдено ${checked}`);
});
