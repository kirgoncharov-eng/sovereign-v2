import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classicApi } from '../game/classic.ts';
import { createInitialState, seededRandom } from '../game/engine.ts';
import { openLivingWorld, interveneWorld } from '../game/living-world.ts';
import { ALTERNATE_COUNTRY, LEGACY_COUNTRIES } from '../game/alternate-world.ts';
import { correspondence, correspondenceStatus } from './correspondence.ts';
import {
  messageUnread, presidentialMessages, presidentialReplyActions, readPresidentialMessages,
} from './presidential-inbox.ts';

test('корреспонденция сохраняет реальные письма и чтение не снимает требование ответа во всех кампаниях', async () => {
  for (const country of [ALTERNATE_COUNTRY, ...LEGACY_COUNTRIES]) {
    const setup = await classicApi.setup(country, 'debut', 'pragmatist', 15);
    const state = openLivingWorld(createInitialState(country, 'debut', 'pragmatist', setup, seededRandom(15)));
    const before = JSON.stringify(state);
    const letters = correspondence(state);
    assert.deepEqual(letters.map(letter => letter.key).sort(), presidentialMessages(state).map(letter => letter.key).sort());
    assert.ok(letters.slice(0, letters.filter(letter => letter.needsReply).length).every(letter => letter.needsReply));
    for (const project of ['energy', 'health']) {
      const request = letters.find(letter => letter.key === project)!;
      const read = readPresidentialMessages(state, request.person, request.key);
      const updated = correspondence(read).find(letter => letter.key === project)!;
      assert.equal(messageUnread(read, updated), false);
      assert.equal(updated.needsReply, true);
      assert.equal(correspondenceStatus(read, updated), `Ответ до конца квартала ${request.deadline}`);
      for (const other of letters.filter(letter => letter.key !== request.key)) {
        assert.equal(messageUnread(read, other), messageUnread(state, other));
      }
      const action = presidentialReplyActions(read, updated)[0];
      const signed = interveneWorld(read, action.id);
      assert.equal(signed.turn, read.turn);
      assert.equal(signed.resources.economy, read.resources.economy + (action.cost.economy ?? 0));
      assert.equal(correspondence(signed).find(letter => letter.key === project)!.needsReply, false);
      assert.ok(presidentialReplyActions(signed, letters.find(letter => letter.key !== project
        && ['energy', 'health'].includes(letter.key))!).every(reply => reply.blocked));
    }
    assert.equal(JSON.stringify(state), before);
    const differentDeadlines = { ...state, world: { ...state.world!,
      project: { ...state.world!.project, deadline: 12 },
      health: { ...state.world!.health!, deadline: 2 },
    } };
    const ordered = correspondence(differentDeadlines);
    assert.ok(ordered.findIndex(letter => letter.key === 'health') < ordered.findIndex(letter => letter.key === 'energy'));
    assert.deepEqual(correspondence({ ...state, daily: '2026-10-14' }), []);
  }
});
