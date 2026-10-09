import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classicApi } from './classic.ts';
import { createInitialState, seededRandom, planTurn, startEvent, resolveTurn } from './engine.ts';
import { openLivingWorld, interveneWorld, livingActions, stepLivingWorld, validLivingWorld } from './living-world.ts';
import { parseSave } from '../client/save.ts';
import { SAVE_VERSION } from './data.ts';
import type { GameState } from './types.ts';

const event = { title: 'Заседание', source: 'Кабинет', description: 'Рабочее заседание.', isCritical: false, affectedFactions: [], choices: [{ id: 'a', text: 'Завершить', hint: '', tags: [], resolvesCrisis: null, deal: { pure: true }, scene: 'Заседание завершено.' }], randomEvent: null };
async function base() {
  const gs = createInitialState('Украина', 'debut', 'pragmatist', await classicApi.setup('Украина', 'debut', 'pragmatist', 11), seededRandom(11));
  return openLivingWorld(gs);
}
function tick(gs: GameState): GameState {
  const result = stepLivingWorld(gs, gs.turn + 1);
  return { ...gs, world: result.world, turn: gs.turn + 1, lastTurn: null };
}
const save = (gs: GameState) => JSON.stringify({ version: SAVE_VERSION, screen: 'game', state: gs });

test('contact belongs to the existing antagonist, opens without moving time, and excludes daily/other arcs', async () => {
  const gs = await base();
  assert.equal(gs.arc!.id, 'money'); assert.equal(gs.world!.sponsor!.name, gs.arc!.target);
  assert.equal(openLivingWorld(gs), gs); assert.equal(gs.turn, 0);
  const legacy = { ...gs, world: { ...gs.world!, sponsor: undefined } };
  assert.ok(parseSave(save(legacy))); assert.equal(openLivingWorld(legacy).world!.sponsor!.openedTurn, 0);
  assert.equal(openLivingWorld({ ...legacy, daily: '2026-10-09' }).world!.sponsor, undefined);
  assert.equal(openLivingWorld({ ...legacy, arc: { ...gs.arc!, id: 'coup' } }).world!.sponsor, undefined);
});
test('actor intervenes without opening any panel; lost suppliers remove his actual leverage', async () => {
  const gs = tick(interveneWorld(await base(), 'appoint:minister'));
  const before = JSON.stringify(gs), pressured = tick(gs);
  assert.equal(JSON.stringify(gs), before);
  assert.equal(pressured.world!.sponsor!.phase, 'pressuring');
  assert.ok(pressured.world!.project.lastFactors.some(f => f.includes('Спонсор отправил')));
  assert.ok(livingActions(pressured).some(a => a.id === 'sponsor:independent' && !a.blocked));
  const independent = interveneWorld(gs, 'sponsor:independent'), free = tick(independent);
  assert.equal(free.world!.sponsor!.phase, 'independent'); assert.equal(free.world!.project.procurementFixed, true);
  assert.ok(free.world!.project.progress > pressured.world!.project.progress);
  assert.ok(!free.world!.project.lastFactors.some(f => f.includes('Спонсор отправил')));
  assert.ok(!livingActions(free).some(a => a.id === 'sponsor:accept'));
  assert.deepEqual(stepLivingWorld(independent, 2), stepLivingWorld(independent, 2));
});
test('real assistance opens a later demand; confirmation and rupture change available actions and cost once', async () => {
  const gs = tick(interveneWorld(await base(), 'appoint:minister'));
  const accepted = interveneWorld(gs, 'sponsor:accept');
  assert.equal(accepted.turn, gs.turn); assert.equal(accepted.world!.project.progress, gs.world!.project.progress);
  assert.equal(accepted.resources.politicalCapital, gs.resources.politicalCapital - 1);
  assert.ok(!livingActions(accepted).some(a => a.id === 'retender' || a.id === 'negotiate'));
  const next = tick(accepted), demand = tick(next);
  assert.equal(demand.world!.sponsor!.phase, 'demanding');
  assert.ok(next.world!.project.progress > tick(gs).world!.project.progress);
  const confirmed = interveneWorld(demand, 'sponsor:confirm');
  assert.equal(confirmed.resources.politicalCapital, demand.resources.politicalCapital - 2);
  assert.equal(confirmed.world!.sponsor!.phase, 'confirmed');
  assert.throws(() => interveneWorld(confirmed, 'sponsor:confirm'));
  assert.ok(livingActions(tick(confirmed)).some(a => a.id === 'sponsor:independent' && !a.blocked));
  const ruptured = interveneWorld(demand, 'sponsor:independent');
  assert.equal(ruptured.world!.project.procurementFixed, true); assert.equal(ruptured.world!.sponsor!.phase, 'independent');
  assert.equal(ruptured.resources.economy, demand.resources.economy - 3);
  assert.ok(ruptured.keyFigures.find(f => f.id === demand.world!.sponsor!.figure)!.relation < demand.keyFigures.find(f => f.id === demand.world!.sponsor!.figure)!.relation);
});
test('health shares the attention quota; the existing intrigue and ordinary government continue', async () => {
  let gs = await base();
  gs = interveneWorld(gs, 'health:appoint:doctor');
  assert.throws(() => interveneWorld(gs, 'sponsor:accept'), /уже использовано/);
  gs = tick(gs); const healthBefore = gs.world!.health!.progress;
  gs = interveneWorld(gs, 'sponsor:refuse'); gs = tick(gs);
  assert.ok(gs.world!.health!.progress > healthBefore);
  assert.equal(gs.arc!.id, 'money'); assert.equal(gs.ended, false);
  gs = startEvent(gs, event);
  const before = JSON.stringify(gs), plan = planTurn(gs, 'a');
  const result = resolveTurn(gs, 'a', await classicApi.consequence(gs, 'a'));
  assert.equal(JSON.stringify(gs), before); assert.deepEqual(result.world, plan.world);
  assert.equal(result.world!.lastTick, result.turn);
});
test('every contact state survives saves; corrupted states are rejected; successor never inherits personal contract', async () => {
  let gs = tick(interveneWorld(await base(), 'appoint:minister'));
  gs = interveneWorld(gs, 'sponsor:accept');
  for (let i = 0; i < 7; i++) {
    assert.ok(validLivingWorld(gs.world)); assert.deepEqual(parseSave(save(gs))!.state.world, gs.world);
    assert.deepEqual(stepLivingWorld(gs, gs.turn).world, gs.world);
    gs = tick(gs);
  }
  const bad = JSON.parse(save(gs)); bad.state.world.sponsor.phase = 'ghost'; assert.equal(parseSave(JSON.stringify(bad)), null);
  let changed = await base(); const id = changed.world!.sponsor!.figure;
  changed = { ...changed, keyFigures: changed.keyFigures.map(f => f.id === id ? { ...f, name: 'Новый человек' } : f) };
  assert.equal(tick(changed).world!.sponsor!.phase, 'departed');
  assert.ok(!livingActions(changed).some(a => a.id.startsWith('sponsor:')));
});
test('ordinary supplier change and separate local agreement also remove the actor leverage', async () => {
  const gs = tick(interveneWorld(await base(), 'appoint:minister'));
  for (const action of ['retender', 'negotiate']) {
    const changed = tick(interveneWorld(gs, action));
    assert.equal(changed.world!.sponsor!.phase, 'independent');
    assert.ok(!changed.world!.project.lastFactors.some(f => f.includes('Спонсор отправил')));
  }
});
