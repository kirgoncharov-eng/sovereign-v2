import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classicApi } from '../game/classic.ts';
import { createInitialState, seededRandom } from '../game/engine.ts';
import { openLivingWorld, interveneWorld, stepLivingWorld } from '../game/living-world.ts';
import { presidentialMessages, presidentialReplyActions, projectLetterAuthor, readPresidentialMessages } from './presidential-inbox.ts';
import { personProfiles } from './people-text.ts';
import { ALTERNATE_COUNTRY } from '../game/alternate-world.ts';
import type { GameState } from '../game/types.ts';
import { newTerm, nextCase, signChoice, startFromSeed } from './chronicle.ts';
import { applyCabinetAction, cabinetCandidates } from '../game/cabinet.ts';
import { stepGovernment } from '../game/government.ts';
import { offerHousingNext, stepHousingNext } from '../game/housing-next.ts';
import { inboxRows } from './country-people.ts';
import { parseSave } from './save.ts';
import { RESOURCE_KEYS, SAVE_VERSION } from '../game/data.ts';

async function fresh(country = 'Украина') {
  const setup = await classicApi.setup(country, 'debut', 'pragmatist', 15);
  return openLivingWorld(createInitialState(country, 'debut', 'pragmatist', setup, seededRandom(15)));
}

test('каждое обращение о неназначенном исполнителе даёт свои ответы с настоящей ценой во всех странах', async () => {
  for (const country of ['Беларусь', 'Украина', 'Грузия', 'Молдова', 'Армения', 'Казахстан']) {
    const state = await fresh(country);
    for (const project of ['energy', 'health']) {
      const message = presidentialMessages(state).find(message => message.key === project)!;
      assert.equal(message.needsReply, true);
      const read = readPresidentialMessages(state, message.person);
      assert.equal(presidentialMessages(read).find(message => message.key === project)!.needsReply, true);
      const replies = presidentialReplyActions(read, message);
      assert.equal(replies.length, 3);
      assert.ok(replies.every(reply => reply.id.startsWith(project === 'energy' ? 'appoint:' : 'health:appoint:')));
      assert.ok(replies.every(reply => reply.cost.economy === -4 && reply.cost.politicalCapital === -2));
      assert.equal(message.deadline, project === 'energy' ? state.world!.project.deadline : state.world!.health!.deadline);
    }
  }
});

test('подписанный ответ убирает требование назначения и блокирует вторую подпись в том же квартале', async () => {
  const state = await fresh();
  const message = presidentialMessages(state).find(message => message.key === 'energy')!;
  const assigned = interveneWorld(state, presidentialReplyActions(state, message)[0].id);
  assert.equal(assigned.resources.economy, state.resources.economy - 4);
  assert.equal(assigned.turn, state.turn);
  const updated = presidentialMessages(assigned).find(message => message.key === 'energy')!;
  assert.equal(updated.needsReply, false);
  assert.deepEqual(presidentialReplyActions(assigned, message), []);
  const health = presidentialMessages(assigned).find(message => message.key === 'health')!;
  assert.ok(presidentialReplyActions(assigned, health).every(reply => reply.blocked));
  assert.throws(() => interveneWorld(assigned, 'health:appoint:doctor'), /уже использовано/);
});

test('после провала больниц ответы на продолжение истории имеют новый срок и не предлагают назначения', async () => {
  let state = await fresh();
  for (let index = 0; index < 5; index++) {
    const step = stepLivingWorld(state, state.turn + 1);
    state = { ...state, world: step.world, turn: state.turn + 1 };
  }
  const message = presidentialMessages(state).find(message => message.key === 'health')!;
  assert.equal(message.needsReply, true);
  assert.equal(message.deadline, state.world!.health!.aftermath!.deadline);
  assert.ok(presidentialReplyActions(state, message).every(reply => reply.id.startsWith('health:response:')));
  assert.ok(presidentialReplyActions(state, message).length > 0);
  assert.deepEqual(presidentialReplyActions({ ...state, ended: true }, message), []);
});

test('письмо об исполнении ответа по больницам в 1978 году подписывает исполнитель ответа — и в списке, и в шапке', async () => {
  const base = await fresh();
  const health = base.world!.health!;
  // Программой руководил главный врач, ответ на провал исполняет министр здравоохранения.
  const working = (country: string): GameState => ({ ...base, country, world: { ...base.world!, health: { ...health, executor: 'doctor',
    aftermath: { ...(health.aftermath ?? {}), phase: 'working', executor: 'healthMinister' } as NonNullable<typeof health.aftermath> } } });
  assert.equal(projectLetterAuthor(working(ALTERNATE_COUNTRY), 'health'), 'healthMinister');
  assert.equal(projectLetterAuthor(working('Украина'), 'health'), 'doctor');
  const state = working(ALTERNATE_COUNTRY);
  const minister = state.world!.people.find(person => person.id === 'healthMinister')!.name;
  const sender = presidentialMessages(state).find(message => message.key === 'health')!.person;
  assert.equal(personProfiles(state).find(person => person.id === sender)?.name, minister);
});

async function cabinetReportState() {
  let state = await newTerm(startFromSeed(7, 'coalition'));
  state.resources = Object.fromEntries(RESOURCE_KEYS.map(key => [key, 90])) as GameState['resources'];
  for (let turn = 0; turn < 5; turn++) state = await signChoice(await nextCase(state), 'a');
  return state;
}
function fire(state: GameState, seat: string) {
  const advisor = state.advisors.find(advisor => advisor.id === seat)!;
  return applyCabinetAction(state, { kind: 'dismiss', seat, name: advisor.name });
}
function replace(state: GameState, seat: string) {
  return applyCabinetAction(state, { kind: 'hire', candidate: cabinetCandidates(state, seat)[0].id });
}
function saved(state: GameState) {
  const result = parseSave(JSON.stringify({ version: SAVE_VERSION, screen: 'chronicle', state }));
  assert.ok(result);
  return result.state;
}
function sender(state: GameState, key: string) {
  const message = presidentialMessages(state).find(message => message.key === key)!;
  assert.ok(message, key);
  assert.ok(inboxRows(state).some(row => row.id === message.person), 'письмо доступно из списка');
  return personProfiles(state).find(person => person.id === message.person)!.name;
}

test('кадровый указ сохраняет автора и прочтение старого доклада, новый пишет преемник', async () => {
  let state = await cabinetReportState();
  const old = state.advisors.find(advisor => advisor.id === 'diplomat')!;
  Object.assign(state.world!.government!.programs.find(program => program.id === 'exports')!, {
    status: 'running', progress: 20, coordinator: old.id, name: old.name, started: 4, due: 8,
  });
  stepGovernment(state, state.world!, state.turn);
  const message = presidentialMessages(state).find(message => message.key === 'program:exports')!;
  state = readPresidentialMessages(state, message.person, message.key);
  const original = structuredClone(state), fired = saved(fire(state, old.id));
  assert.equal(sender(fired, message.key), old.name);
  const hired = saved(replace(fired, old.id));
  assert.equal(sender(hired, message.key), old.name);
  const historical = presidentialMessages(hired).find(item => item.key === message.key)!;
  assert.equal(historical.text, message.text);
  assert.equal(historical.token, message.token);
  assert.equal(hired.world!.inboxRead![message.key], message.token);
  assert.deepEqual(state, original, 'исходное сохранение не меняется');
  const world = structuredClone(hired.world!);
  stepGovernment(hired, world, hired.turn + 1);
  assert.equal(sender({ ...hired, world }, message.key), hired.advisors.find(advisor => advisor.id === old.id)!.name);
});

test('вакантная программа пишет через канцелярию; назначение не присваивает её доклад', async () => {
  let state = await cabinetReportState();
  const old = state.advisors.find(advisor => advisor.id === 'diplomat')!;
  Object.assign(state.world!.government!.programs.find(program => program.id === 'exports')!, {
    status: 'running', progress: 20, coordinator: old.id, name: old.name, started: 4, due: 8,
  });
  state = fire(state, old.id);
  stepGovernment(state, state.world!, state.turn);
  state = saved(state);
  assert.equal(sender(state, 'program:exports'), 'Канцелярия');
  const read = readPresidentialMessages(state, 'chancery', 'program:exports');
  const hired = saved(replace(read, old.id));
  assert.equal(sender(hired, 'program:exports'), 'Канцелярия');
  assert.deepEqual(hired.world!.inboxRead, read.world!.inboxRead);
  const corrupt = structuredClone(hired);
  corrupt.world!.dispatches.at(-1)!.author = 42 as unknown as string;
  assert.equal(parseSave(JSON.stringify({ version: SAVE_VERSION, screen: 'chronicle', state: corrupt })), null);
});

test('жилищные доклады помнят уволенного антагониста, новые предложения приходят от канцелярии', async () => {
  let state = await cabinetReportState();
  const old = state.advisors.find(advisor => advisor.id === 'economist')!;
  Object.assign(state.world!.government!.programs.find(program => program.id === 'housing')!, {
    status: 'completed', progress: 100, coordinator: old.id, name: old.name, started: 0, due: 4, reviewed: true,
  });
  state.world!.government!.housingNext = { mode: 'settle', status: 'running', originProgress: 100,
    previousName: old.name, progress: 20, started: 4, due: 8, coordinator: old.id, name: old.name, reviewed: false, factors: [] };
  state.arc = { id: 'mole', target: old.name, targetRole: old.role, flags: [], done: [], epilogue: null };
  stepHousingNext(state, state.world!, state.turn);
  state = replace(fire(state, old.id), old.id);
  assert.equal(sender(state, 'housing-next'), old.name);
  const world = structuredClone(state.world!);
  stepHousingNext(state, world, state.turn + 1);
  assert.equal(sender({ ...state, world }, 'housing-next'), state.advisors.find(advisor => advisor.id === old.id)!.name);
  const proposalWorld = structuredClone(state.world!);
  delete proposalWorld.government!.housingNext;
  offerHousingNext(proposalWorld, state.turn, true, state.advisors.map(advisor => advisor.name));
  const proposed = { ...state, world: proposalWorld };
  assert.equal(sender(proposed, 'housing-next'), 'Канцелярия');
  assert.doesNotMatch(proposalWorld.dispatches.at(-1)!.text, new RegExp(old.name));
  assert.equal(proposalWorld.government!.housingNext!.previousName, old.name, 'опыт прежней стройки не присвоен новому советнику');
});
