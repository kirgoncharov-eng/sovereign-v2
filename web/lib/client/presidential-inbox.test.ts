import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classicApi } from '../game/classic.ts';
import { createInitialState, seededRandom } from '../game/engine.ts';
import { openLivingWorld, interveneWorld, stepLivingWorld } from '../game/living-world.ts';
import { presidentialMessages, presidentialReplyActions, readPresidentialMessages } from './presidential-inbox.ts';

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
