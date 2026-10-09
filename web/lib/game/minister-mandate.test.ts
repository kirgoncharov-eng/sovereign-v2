import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classicApi } from './classic.ts';
import { createInitialState, seededRandom } from './engine.ts';
import { openLivingWorld, interveneWorld, stepLivingWorld, livingActions } from './living-world.ts';
import { governmentProject } from './government.ts';
import { parseSave } from '../client/save.ts';
import { SAVE_VERSION } from './data.ts';
import { presidentialMessages, readPresidentialMessages, messageUnread } from '../client/presidential-inbox.ts';
import type { GameState } from './types.ts';
async function base() { return openLivingWorld(createInitialState('Украина', 'debut', 'pragmatist', await classicApi.setup('Украина', 'debut', 'pragmatist', 11), seededRandom(11))); }
function tick(gs: GameState): GameState { const r = stepLivingWorld(gs, gs.turn + 1), resources = { ...gs.resources }; for (const [k, v] of Object.entries(r.res))
    resources[k as keyof typeof resources] = Math.max(0, Math.min(100, resources[k as keyof typeof resources] + v!)); return { ...gs, world: r.world, resources, turn: gs.turn + 1, lastTurn: null }; }
const save = (gs: GameState) => JSON.stringify({ version: SAVE_VERSION, screen: 'game', state: gs });
async function offer() { return tick(interveneWorld(await base(), 'appoint:minister')); }
async function housing(accept: boolean) { let gs = interveneWorld(await offer(), accept ? 'minister:accept' : 'minister:refuse'); while (gs.turn < 5)
    gs = tick(gs); return interveneWorld(gs, 'government:start:housing'); }
test('minister initiates a real bargain only after delegation; reading is free and preserves the answer deadline', async () => {
    const baseState = await base();
    assert.equal(tick(baseState).world!.mandate, undefined);
    const gs = await offer(), before = JSON.stringify(gs);
    assert.equal(gs.world!.mandate!.phase, 'offered');
    assert.equal(gs.world!.mandate!.due, 3);
    const message = presidentialMessages(gs).find(m => m.action === 'minister')!;
    assert.ok(message.needsReply);
    assert.ok(messageUnread(gs, message));
    const read = readPresidentialMessages(gs, message.person);
    assert.deepEqual(read.resources, gs.resources);
    assert.equal(read.turn, 1);
    assert.equal(read.world!.lastActionTurn, 0);
    assert.equal(read.world!.mandate!.phase, 'offered');
    assert.ok(!messageUnread(read, message));
    assert.equal(JSON.stringify(gs), before);
    assert.ok(parseSave(save(read)));
    assert.equal(tick(tick(gs)).world!.mandate!.phase, 'expired');
});
test('accepted authority survives energy, accelerates work, and later chooses housing suppliers autonomously with a real recurring price', async () => {
    const gs = await offer(), accepted = interveneWorld(gs, 'minister:accept'), refused = interveneWorld(gs, 'minister:refuse');
    assert.equal(tick(accepted).world!.project.progress, tick(refused).world!.project.progress + 4);
    assert.equal(gs.world!.mandate!.phase, 'offered');
    assert.throws(() => interveneWorld(accepted, 'government:start:housing'), /уже использовано/);
    const a = await housing(true), b = await housing(false);
    assert.equal(a.world!.mandate!.phase, 'accepted');
    assert.notEqual(a.world!.project.status, 'running');
    const active = tick(a), ordinary = tick(b);
    assert.equal(active.world!.mandate!.phase, 'used');
    assert.equal(governmentProject(active.world!, 'housing').progress, governmentProject(ordinary.world!, 'housing').progress + 5);
    assert.equal(active.resources.economy, ordinary.resources.economy - 1);
    assert.ok(presidentialMessages(active).find(m => m.action === 'minister')!.text.includes('без новой просьбы'));
    assert.ok(parseSave(save(active)));
    let end = active;
    while (governmentProject(end.world!, 'housing').status === 'running')
        end = tick(end);
    const after = tick(end);
    assert.equal(after.world!.mandate!.phase, 'fulfilled');
    assert.equal(after.resources.economy, end.resources.economy);
    assert.deepEqual(stepLivingWorld(after, after.turn).world, after.world);
});
test('refusal and silence do not invent rights or sabotage ordinary housing', async () => {
    const gs = await offer(), refused = interveneWorld(gs, 'minister:refuse');
    assert.equal(refused.world!.people.find(p => p.id === 'minister')!.relation, gs.world!.people.find(p => p.id === 'minister')!.relation - 3);
    let silent = tick(tick(gs));
    while (silent.turn < 5)
        silent = tick(silent);
    const ignored = tick(interveneWorld(silent, 'government:start:housing')), normal = tick(await housing(false));
    assert.equal(governmentProject(ignored.world!, 'housing').progress, governmentProject(normal.world!, 'housing').progress);
    assert.equal(ignored.resources.economy, normal.resources.economy);
});
test('withdrawing used authority stops future charges and gives exactly one handover delay; unused authority causes no handover', async () => {
    const active = tick(await housing(true)), withdrawn = interveneWorld(active, 'minister:withdraw');
    assert.equal(withdrawn.resources.politicalCapital, active.resources.politicalCapital - 3);
    assert.equal(withdrawn.resources.personalResource, active.resources.personalResource - 1);
    assert.equal(withdrawn.world!.mandate!.handover, true);
    const next = tick(withdrawn), retained = tick(active);
    assert.equal(governmentProject(retained.world!, 'housing').progress - governmentProject(next.world!, 'housing').progress, 10);
    assert.equal(next.resources.economy, retained.resources.economy + 1);
    assert.ok(governmentProject(next.world!, 'housing').lastFactors.some(f => f.includes('Передача')));
    assert.ok(!governmentProject(tick(next).world!, 'housing').lastFactors.some(f => f.includes('Передача')));
    let unused = interveneWorld(tick(interveneWorld(await offer(), 'minister:accept')), 'minister:withdraw');
    assert.equal(unused.world!.mandate!.handover, false);
    while (unused.turn < 5)
        unused = tick(unused);
    const started = tick(interveneWorld(unused, 'government:start:housing'));
    assert.equal(governmentProject(started.world!, 'housing').progress, governmentProject(tick(await housing(false)).world!, 'housing').progress);
});
test('procurement inspectors lose access under a used mandate; direct support protects the check while retaining construction and its price', async () => {
    const active = tick(await housing(true)), checking = tick(interveneWorld(active, 'government:start:procurement'));
    const supported = interveneWorld(checking, 'government:support:procurement'), next = tick(supported), unsupported = tick(checking);
    assert.ok(governmentProject(next.world!, 'procurement').progress >= governmentProject(unsupported.world!, 'procurement').progress + 5);
    assert.ok(governmentProject(unsupported.world!, 'procurement').lastFactors.some(f => f.includes('документ')));
    assert.equal(next.world!.mandate!.phase, 'used');
    assert.equal(next.resources.economy, unsupported.resources.economy);
});
test('a successor does not inherit a personal agreement; old saves remain valid and corrupted mandates are rejected', async () => {
    const gs = await housing(true), replacement = structuredClone(gs);
    replacement.world!.people.find(p => p.id === 'minister')!.name = 'Новый министр';
    const next = tick(replacement);
    assert.equal(next.world!.mandate!.phase, 'departed');
    assert.equal(governmentProject(next.world!, 'housing').progress, governmentProject(tick(await housing(false)).world!, 'housing').progress);
    const old = { ...gs, world: { ...gs.world!, mandate: undefined } };
    assert.ok(parseSave(save(old)));
    for (const key of ['phase', 'due', 'handover']) {
        const broken = structuredClone(gs);
        Object.assign(broken.world!.mandate!, { [key]: key === 'phase' ? 'invented' : key === 'due' ? -1 : 'yes' });
        assert.equal(parseSave(save(broken)), null);
    }
    const daily = { ...gs, daily: '2026-10-09' };
    assert.deepEqual(presidentialMessages(daily), []);
    assert.deepEqual(stepLivingWorld(daily, 6).world, daily.world);
    assert.ok(!livingActions(daily).some(a => a.id.startsWith('minister:') && !a.blocked));
});
