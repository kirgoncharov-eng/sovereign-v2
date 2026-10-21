import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classicApi, callChoice, callEvent, pressChoice, pressEvent, budgetChoice, budgetEvent } from '../game/classic.ts';
import { createInitialState, seededRandom, startEvent, resolveTurn } from '../game/engine.ts';
import { ALTERNATE_COUNTRY, LEGACY_COUNTRIES } from '../game/alternate-world.ts';
import { openLivingWorld, interveneWorld, livingActions } from '../game/living-world.ts';
import { SAVE_VERSION } from '../game/data.ts';
import { parseSave } from './save.ts';
import { prepareQuarterResolution, quarterInboxEnabled, quarterResolution, withoutQuarterDraft } from './quarter-inbox.ts';
import type { GameState, DailyMove } from '../game/types.ts';

async function initial(seed = 3, diff: 'debut' | 'coalition' | 'crisis' = 'debut', country = ALTERNATE_COUNTRY) {
  return createInitialState(country, diff, 'pragmatist', await classicApi.setup(country, diff, 'pragmatist', seed), seededRandom(seed));
}
const reload = (state: GameState) => parseSave(JSON.stringify({ version:SAVE_VERSION, screen:'game', state }))!.state;

test('quarter folder: preparing and reloading does not spend, tick deadlines, draw outcomes or create news', async () => {
  for (const [seed, diff] of [[2, 'debut'], [3, 'coalition'], [7, 'crisis']] as const) {
    let state = await initial(seed, diff);
    state = startEvent(state, await classicApi.event(state));
    const before = structuredClone(state);
    const choice = state.currentEvent!.choices[0];
    const prepared = prepareQuarterResolution(state, choice.id);
    assert.deepEqual(state, before, 'preparing is pure');
    assert.deepEqual(withoutQuarterDraft(prepared), before);
    assert.deepEqual(reload(prepared), prepared);
    assert.equal(quarterResolution(reload(prepared))?.id, choice.id);
    const narration = await classicApi.consequence(state, choice.id);
    assert.deepEqual(resolveTurn(withoutQuarterDraft(reload(prepared)), choice.id, narration), resolveTurn(state, choice.id, narration));
  }
});

test('quarter folder: programme intervention preserves the draft and resolver uses the current resources exactly once', async () => {
  let state = await initial();
  for (let turn = 0; turn < 8 && !state.world; turn++) {
    state = startEvent(state, await classicApi.event(state));
    const choice = state.currentEvent!.choices[0].id;
    state = openLivingWorld(resolveTurn(state, choice, await classicApi.consequence(state, choice)));
  }
  assert.ok(state.world, 'programme opens after the actual fuel case');
  state = { ...state, lastTurn:null };
  state = startEvent(state, await classicApi.event(state));
  const prepared = prepareQuarterResolution(state, state.currentEvent!.choices[0].id);
  const action = livingActions(prepared).find(action => action.id.startsWith('appoint:') && !action.blocked)!;
  assert.ok(action);
  const signed = interveneWorld(prepared, action.id);
  assert.equal(signed.turn, prepared.turn);
  assert.ok(quarterResolution(signed));
  assert.notDeepEqual(signed.resources, state.resources);
  const current = withoutQuarterDraft(reload(signed));
  const choice = quarterResolution(signed)!;
  const result = resolveTurn(current, choice.id, await classicApi.consequence(current, choice.id));
  assert.equal(result.turn, state.turn + 1);
  assert.equal(result.quarterDraft, undefined);
  assert.equal(quarterResolution(result), null);
  assert.throws(() => resolveTurn(result, choice.id, result.lastTurn!), /Нет активного события/);
});

test('quarter folder: corrupted or stale optional draft is discarded without losing a campaign', async () => {
  let state = await initial();
  state = startEvent(state, await classicApi.event(state));
  const prepared = prepareQuarterResolution(state, state.currentEvent!.choices[0].id);
  for (const draft of [null, { ...prepared.quarterDraft, turn:99 }, { ...prepared.quarterDraft, event:'unrelated' },
    { ...prepared.quarterDraft, move:{ id:'missing' } }, { ...prepared.quarterDraft, move:{ id:'a', press:[7] } }]) {
    const loaded = reload({ ...state, quarterDraft:draft } as GameState);
    assert.equal(loaded.quarterDraft, undefined);
    assert.deepEqual(loaded, state);
  }
  assert.throws(() => prepareQuarterResolution(state, 'missing'));
});

test('quarter folder: archive and Daily keep the original path; old saves require no migration', async () => {
  for (const country of LEGACY_COUNTRIES) {
    const state = await initial(3, 'debut', country);
    assert.equal(quarterInboxEnabled(state), false);
    assert.deepEqual(reload(state), state);
  }
  assert.equal(quarterInboxEnabled({ ...await initial(), daily:'2026-10-22' }), false);
});

test('quarter folder: generated phone, press and budget choices survive save with their actual parameters', async () => {
  const base = await initial();
  const fixtures: [GameState, Omit<DailyMove, 'id'>][] = [];
  for (const kind of ['call', 'press', 'budget'] as const) {
    const state = { ...base, turn:kind === 'call' ? 16 : kind === 'press' ? 8 : 7, arc:null };
    const event = kind === 'call' ? callEvent(state) : kind === 'press' ? pressEvent(state) : budgetEvent(state);
    assert.ok(event, kind);
    let current = startEvent(state, event);
    const details: Omit<DailyMove, 'id'> = kind === 'call' ? event.call?.negotiation ? {} : { call:{ approach:'offer', ending:'deal' } }
      : kind === 'press' ? { press:[0, 1, 2] }
      : { budget:{ alloc:{ military:3, economy:3, social:3, security:3 }, debt:false } };
    if (kind === 'budget') {
      // Use the actual item IDs and total from the generated budget.
      const { BUDGET_ITEMS } = await import('../content/budget.ts');
      const { budgetLimit } = await import('../game/classic.ts');
      details.budget = { alloc:Object.fromEntries(BUDGET_ITEMS.map(item => [item.id, budgetLimit(false) / BUDGET_ITEMS.length])), debt:false };
    }
    const choice = kind === 'call' ? event.call?.negotiation ? event.choices[0] : callChoice(current, 'offer', 'deal')
      : kind === 'press' ? pressChoice(current, details.press!) : budgetChoice(current, details.budget!.alloc, false);
    current = { ...current, currentEvent:{ ...current.currentEvent!, choices:[choice, current.currentEvent!.choices[1]] } };
    fixtures.push([current, details]);
  }
  for (const [state, details] of fixtures) {
    const prepared = prepareQuarterResolution(state, state.currentEvent!.choices[0].id, details);
    assert.deepEqual(reload(prepared).quarterDraft?.move, { ...details, id:state.currentEvent!.choices[0].id });
  }
});
