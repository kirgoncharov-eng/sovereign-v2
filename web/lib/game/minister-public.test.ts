import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classicApi } from './classic.ts';
import { createInitialState, seededRandom, startEvent, planTurn, resolveTurn } from './engine.ts';
import { openLivingWorld, interveneWorld, stepLivingWorld } from './living-world.ts';
import { mandatePublicEvent } from './minister-public.ts';
import { governmentProject } from './government.ts';
import { parseSave } from '../client/save.ts';
import { SAVE_VERSION } from './data.ts';
import type { GameState } from './types.ts';

const save = (gs: GameState) => JSON.stringify({ version: SAVE_VERSION, screen: 'game', state: gs });
function tick(gs: GameState): GameState {
    const step = stepLivingWorld(gs, gs.turn + 1);
    return { ...gs, world: step.world, turn: gs.turn + 1, lastTurn: null };
}
async function fixture(accept = true) {
    let gs = openLivingWorld(createInitialState('Украина', 'debut', 'pragmatist', await classicApi.setup('Украина', 'debut', 'pragmatist', 11), seededRandom(11)));
    gs = tick(interveneWorld(gs, 'appoint:minister'));
    gs = interveneWorld(gs, accept ? 'minister:accept' : 'minister:refuse');
    while (gs.turn < 5) gs = tick(gs);
    gs = tick(interveneWorld(gs, 'government:start:housing'));
    return { ...gs, arc: null, activeCrises: [], resources: Object.fromEntries(Object.keys(gs.resources).map(k => [k, 60])) as GameState['resources'] };
}
async function answer(gs: GameState, id: string) {
    const current = startEvent(gs, mandatePublicEvent(gs)!);
    const before = JSON.stringify(current), planned = planTurn(current, id);
    const result = resolveTurn(current, id, await classicApi.consequence(current, id));
    assert.equal(JSON.stringify(current), before);
    assert.deepEqual(result.world, planned.world);
    assert.ok(parseSave(save(result)));
    return result;
}
test('only actual exercise of signed housing authority creates public memory; routing preserves facts and saves', async () => {
    const gs = await fixture();
    assert.equal(gs.world!.mandate!.usedAt, 6);
    assert.equal((await classicApi.event(gs)).title, mandatePublicEvent(gs)!.title);
    assert.deepEqual(await classicApi.council(startEvent(gs, mandatePublicEvent(gs)!)), []);
    assert.ok(mandatePublicEvent(gs)!.description.includes('Хищение не установлено'));
    assert.equal(mandatePublicEvent(await fixture(false)), null);
    assert.equal(mandatePublicEvent({ ...gs, daily: '2026-10-09' }), null);
    assert.equal(mandatePublicEvent({ ...gs, activeCrises: [{ id: 'c', title: 'c', description: 'c', severity: 'critical', resourceDrain: {}, turnsActive: 1 }] }), null);
    const badChoice = startEvent(gs, mandatePublicEvent(gs)!);
    Object.assign(badChoice.currentEvent!.choices[0], { mandateResponse: 'invented' });
    assert.equal(parseSave(save(badChoice)), null);
    const broken = structuredClone(gs);
    broken.world!.mandate!.usedAt = 100;
    assert.equal(parseSave(save(broken)), null);
    delete broken.world!.mandate!.usedAt;
    assert.equal(parseSave(save(broken)), null);
    const legacy = structuredClone(gs);
    delete legacy.world!.mandate!.usedAt;
    delete legacy.world!.mandate!.publicPhase;
    assert.ok(parseSave(save(legacy)));
    assert.equal(mandatePublicEvent(legacy), null);
});
test('defence retains actual acceleration and costs; public withdrawal changes execution with one handover', async () => {
    const gs = await fixture(), defended = await answer(gs, 'b'), withdrawn = await answer(gs, 'c');
    assert.equal(defended.world!.mandate!.publicPhase, 'closed');
    assert.equal(withdrawn.world!.mandate!.phase, 'withdrawn');
    assert.equal(mandatePublicEvent(defended), null);
    assert.equal(mandatePublicEvent(withdrawn), null);
    assert.equal(governmentProject(defended.world!, 'housing').progress - governmentProject(withdrawn.world!, 'housing').progress, 10);
    assert.equal(withdrawn.resources.economy, defended.resources.economy + 1);
    assert.ok(governmentProject(withdrawn.world!, 'housing').lastFactors.some(f => f.includes('Передача')));
    assert.ok(!governmentProject(tick(withdrawn).world!, 'housing').lastFactors.some(f => f.includes('Передача')));
    assert.equal(withdrawn.world!.lastActionTurn, gs.world!.lastActionTurn);
});
test('request and publication are two actual turns; verification does not invent theft or finish the cabinet audit', async () => {
    const gs = await fixture(), checking = await answer(gs, 'a');
    assert.equal(checking.turn, gs.turn + 1);
    assert.equal(checking.world!.mandate!.publicPhase, 'checking');
    assert.equal(governmentProject(checking.world!, 'procurement').status, 'proposed');
    assert.ok(mandatePublicEvent(checking)!.description.includes('Доказательств личного присвоения денег'));
    const reloaded = parseSave(save(checking))!;
    assert.ok(reloaded);
    const published = await answer(checking, 'a');
    assert.equal(published.turn, gs.turn + 2);
    assert.equal(published.world!.mandate!.publicPhase, 'closed');
    assert.equal(mandatePublicEvent(published), null);
    assert.equal(governmentProject(published.world!, 'procurement').status, 'proposed');
});
test('withdrawal and departure preserve historical signature without granting power to a successor', async () => {
    const gs = await fixture(), withdrawn = interveneWorld(gs, 'minister:withdraw');
    const old = mandatePublicEvent(withdrawn)!;
    assert.equal(old.choices.length, 2);
    assert.ok(old.description.includes('Теперь мандат не действует'));
    assert.equal((await answer(withdrawn, 'a')).world!.mandate!.phase, 'withdrawn');
    const replacement = structuredClone(gs);
    replacement.world!.people.find(p => p.id === 'minister')!.name = 'Преемник';
    const departed = tick(replacement), relation = departed.world!.people.find(p => p.id === 'minister')!.relation;
    assert.equal(departed.world!.mandate!.phase, 'departed');
    assert.equal((await answer(departed, 'b')).world!.people.find(p => p.id === 'minister')!.relation, relation);
    assert.ok(mandatePublicEvent(departed)!.description.includes(gs.world!.mandate!.name));
});
