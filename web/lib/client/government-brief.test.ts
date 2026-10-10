import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classicApi } from '../game/classic.ts';
import { createInitialState, seededRandom } from '../game/engine.ts';
import { openLivingWorld, interveneWorld, stepLivingWorld } from '../game/living-world.ts';
import { SAVE_VERSION } from '../game/data.ts';
import { parseSave } from './save.ts';
import { governmentBrief, governmentBriefs } from './government-brief.ts';
import type { GameState } from '../game/types.ts';

async function fresh(country = 'Украина') {
  const setup = await classicApi.setup(country, 'debut', 'pragmatist', 15);
  return openLivingWorld(createInitialState(country, 'debut', 'pragmatist', setup, seededRandom(15)));
}
function tick(state: GameState): GameState {
  const result = stepLivingWorld(state, state.turn + 1);
  return { ...state, turn: state.turn + 1, world: result.world, lastTurn: null };
}
function restore(state: GameState) {
  return parseSave(JSON.stringify({ version: SAVE_VERSION, screen: 'game', state }))!.state;
}

test('six countries show real candidates, exact start prices and the two different deadline rules', async () => {
  for (const country of ['Беларусь', 'Украина', 'Грузия', 'Молдова', 'Армения', 'Казахстан']) {
    const state = await fresh(country);
    assert.equal(governmentBriefs(state).length, 5);
    for (const id of ['energy', 'health'] as const) {
      const brief = governmentBrief(state, id)!;
      assert.equal(brief.options.length, 3);
      assert.equal(brief.deadline, 4);
      assert.match(brief.timing, /не продлевает/);
      assert.match(brief.nextStep, /провалится/);
      assert.match(brief.price!, /экономика −4 · политкапитал −2/);
      for (const action of brief.options) {
        assert.ok(state.world!.people.some(person => action.title.includes(person.name)));
      }
    }
    const exports = governmentBrief(state, 'exports')!;
    assert.equal(exports.deadline, null);
    assert.match(exports.timing, /после подписи/);
    assert.ok(exports.executor!.includes(state.advisors.find(advisor => advisor.id === 'diplomat')!.name));
    assert.equal(exports.options[0].cost.economy, -5);
    assert.match(governmentBrief(state, 'housing')!.goal, /отдельного поручения/);
  }
});

test('signature, next turn and restored save distinguish paid budget from additional intervention', async () => {
  const state = await fresh();
  const signed = interveneWorld(state, 'government:start:exports');
  const snapshot = JSON.stringify(signed);
  const brief = governmentBrief(signed, 'exports')!;
  assert.equal(brief.paid, true);
  assert.equal(brief.deadline, signed.turn + 4);
  assert.ok(brief.options.every(action => !action.id.startsWith('government:start:')));
  assert.ok(brief.options.every(action => action.blocked));
  assert.match(brief.nextStep, /Новая подпись.*не нужна/);
  assert.equal(JSON.stringify(signed), snapshot);
  assert.deepEqual(governmentBrief(restore(signed), 'exports'), brief);
  const later = tick(signed);
  const next = governmentBrief(later, 'exports')!;
  assert.equal(next.paid, true);
  assert.equal(next.price, brief.price);
  assert.match(next.timing, /осталось 3 кв/);
  assert.ok(next.progress > 0);
  assert.ok(next.report);
});

test('terminal reports survive repeated reading and reload without new signatures or resource grants', async () => {
  for (const status of ['completed', 'partial', 'failed'] as const) {
    let state = interveneWorld(await fresh(), 'government:start:exports');
    for (let turn = 0; turn < 4; turn++) state = tick(state);
    const program = state.world!.government!.programs.find(program => program.id === 'exports')!;
    program.status = status;
    program.progress = status === 'completed' ? 100 : status === 'partial' ? 70 : 20;
    program.reviewed = true;
    state.world!.dispatches.push({ project: 'exports', id: '4:government:exports', turn: 4,
      kind: 'news', title: 'Итог', text: `Итог: ${status}. Результат уже учтён.` });
    const snapshot = JSON.stringify(state);
    const brief = governmentBrief(state, 'exports')!;
    assert.equal(brief.terminal, true);
    assert.equal(brief.options.length, 0);
    assert.equal(brief.paid, true);
    assert.match(brief.report!, new RegExp(status));
    assert.deepEqual(governmentBrief(restore(state), 'exports'), brief);
    assert.deepEqual(governmentBrief(state, 'exports'), brief);
    assert.equal(JSON.stringify(state), snapshot);
  }
});

test('ignored assignments do not claim their start budget was paid; deadline produces a visible failure report', async () => {
  let state = await fresh();
  for (let turn = 0; turn < 4; turn++) state = tick(state);
  for (const id of ['energy', 'health'] as const) {
    const brief = governmentBrief(state, id)!;
    assert.equal(brief.status, 'failed');
    assert.equal(brief.paid, false);
    assert.equal(brief.options.length, 0);
    assert.ok(brief.report);
    assert.equal(brief.executor, null);
  }
});

test('housing continuation uses its own coordinator, deadline, price and reports', async () => {
  let state = interveneWorld(await fresh(), 'government:start:housing');
  state = tick(state);
  state.world!.government!.programs.find(program => program.id === 'housing')!.progress = 95;
  state = tick(state);
  const proposal = governmentBrief(state, 'housing')!;
  assert.equal(proposal.options.length, 2);
  assert.equal(proposal.price, null);
  const signed = interveneWorld(state, 'government:start:expand');
  const brief = governmentBrief(signed, 'housing')!;
  assert.match(brief.price!, /экономика −6 · политкапитал −3/);
  assert.match(brief.goal, /первого.*отдельным делом/);
  assert.equal(brief.deadline, state.turn + 4);
  assert.equal(brief.paid, true);
  assert.deepEqual(governmentBrief(restore(signed), 'housing'), brief);
});


test('health continuation shows the new answer deadline separately from the expired program deadline', async () => {
  let state = await fresh();
  for (let turn = 0; turn < 5; turn++) state = tick(state);
  const open = governmentBrief(state, 'health')!;
  assert.equal(open.deadline, 4);
  assert.match(open.followup!, /Нужен ответ до конца квартала 7/);
  const signed = interveneWorld(state, 'health:response:pilot');
  const working = governmentBrief(signed, 'health')!;
  assert.equal(working.deadline, 4);
  assert.match(working.followup!, /Подписанный ответ исполняется.*квартале 7/);
  assert.deepEqual(governmentBrief(restore(signed), 'health'), working);
});
