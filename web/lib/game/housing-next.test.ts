import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classicApi } from './classic.ts';
import { createInitialState, seededRandom, startEvent, planTurn, resolveTurn } from './engine.ts';
import { openLivingWorld, interveneWorld, stepLivingWorld, livingActions } from './living-world.ts';
import { governmentLoad } from './government.ts';
import { parseSave } from '../client/save.ts';
import { SAVE_VERSION } from './data.ts';
import { presidentialMessages } from '../client/presidential-inbox.ts';
import type { GameState } from './types.ts';
const save = (gs: GameState) => JSON.stringify({ version: SAVE_VERSION, screen: 'game', state: gs });
function tick(gs: GameState): GameState { const r = stepLivingWorld(gs, gs.turn + 1); return { ...gs, world: r.world, turn: gs.turn + 1, lastTurn: null }; }
async function base(complete = true) {
    let gs = openLivingWorld(createInitialState('Украина', 'debut', 'pragmatist', await classicApi.setup('Украина', 'debut', 'pragmatist', 11), seededRandom(11)));
    gs = interveneWorld(gs, 'government:start:housing');
    if (complete) { gs = tick(gs); gs = interveneWorld(gs, 'government:support:housing'); }
    while (gs.turn < 4) gs = tick(gs);
    gs = { ...gs, arc: null, activeCrises: [], resources: Object.fromEntries(Object.keys(gs.resources).map(k => [k, 60])) as GameState['resources'] };
    return gs;
}
test('a published real housing result opens an optional next budget and a message; no duplicate first reward or inherited minister rights', async () => {
    const gs = await base();
    assert.equal(gs.world!.government!.housingNext!.status, 'proposed');
    assert.equal(gs.world!.government!.housingNext!.originProgress, 100);
    assert.ok(presidentialMessages(gs).some(m => m.key === 'housing-next' && !m.needsReply));
    const origin = structuredClone(gs.world!.government!.programs.find(p => p.id === 'housing'));
    const started = interveneWorld(gs, 'government:start:settle');
    assert.deepEqual(started.world!.government!.programs.find(p => p.id === 'housing'), origin);
    assert.equal(started.resources.economy, gs.resources.economy - 4);
    assert.equal(governmentLoad(started.world!), 1);
    assert.throws(() => interveneWorld(started, 'government:start:expand'));
    assert.ok(parseSave(save(started)));
    assert.equal(gs.world!.government!.housingNext!.status, 'proposed');
    assert.deepEqual(stepLivingWorld(started, started.turn).world, started.world);
});
test('partial construction offers completion, not fictitious expansion; real past work affects new execution', async () => {
    const complete = interveneWorld(await base(), 'government:start:settle');
    const partial = await base(false);
    assert.equal(partial.world!.government!.housingNext!.originProgress, 88);
    assert.ok(!livingActions(partial).some(a => a.id === 'government:start:expand'));
    const started = interveneWorld(partial, 'government:start:settle');
    assert.equal(tick(complete).world!.government!.housingNext!.progress - tick(started).world!.government!.housingNext!.progress, 4);
    assert.ok(tick(started).world!.government!.housingNext!.factors.some(f => f.includes('Остались')));
});
test('continuity, existing power and audited procurement change real progress; lost coordinator does not confer experience', async () => {
    const gs = interveneWorld(await base(), 'government:start:settle'), changed = structuredClone(gs);
    const next = changed.world!.government!.housingNext!;
    changed.advisors.find(a => a.id === next.coordinator)!.name = 'Новый советник';
    assert.equal(tick(changed).world!.government!.housingNext!.progress, 0);
    const audited = structuredClone(gs);
    const procurement = audited.world!.government!.programs.find(p => p.id === 'procurement')!;
    Object.assign(procurement, { status: 'completed', progress: 100, started: 0, due: 4, name: gs.advisors[0].name, coordinator: gs.advisors[0].id });
    assert.equal(tick(audited).world!.government!.housingNext!.progress, tick(gs).world!.government!.housingNext!.progress + 3);
    const legacyMandate = structuredClone(gs);
    legacyMandate.world!.mandate = { name: gs.world!.people.find(p => p.id === 'minister')!.name, phase: 'used', offered: 1, due: 3, changed: 4, usedAt: 4, publicPhase: 'closed', text: 'Предыдущее право', handover: false };
    const nextTick = stepLivingWorld(legacyMandate, legacyMandate.turn + 1);
    assert.equal(nextTick.world!.mandate!.phase, 'fulfilled');
    assert.equal(nextTick.effects.some(e => e.label.startsWith('закупочный мандат')), false);
    assert.equal(nextTick.world!.government!.housingNext!.progress, tick(gs).world!.government!.housingNext!.progress);
    const powered = structuredClone(gs);
    powered.world!.project.status = 'completed';
    assert.equal(tick(powered).world!.government!.housingNext!.progress, tick(gs).world!.government!.housingNext!.progress + 3);
    const crowded = interveneWorld(tick(gs), 'government:start:exports');
    assert.equal(governmentLoad(crowded.world!), 2);
    assert.ok(livingActions(crowded).find(a => a.id === 'government:start:procurement')!.blocked);
});
test('two distinct routes keep their original promise and finish once; final report is optional and reloads deterministically', async () => {
    for (const mode of ['settle', 'expand']) {
        let gs = interveneWorld(await base(), `government:start:${mode}`);
        while (gs.world!.government!.housingNext!.status === 'running') { gs = tick(gs); assert.ok(parseSave(save(gs))); }
        const message = presidentialMessages(gs).find(m => m.key === 'housing-next')!;
        assert.equal(message.needsReply, false);
        if (mode === 'expand') assert.ok(message.text.includes('не оплачены'));
        assert.equal(gs.world!.government!.housingNext!.reviewed, true);
        const event = await classicApi.event(gs);
        assert.notEqual(event.cardId, 'housing-next:review');
        const state = startEvent(gs, event), before = JSON.stringify(state), planned = planTurn(state, 'b');
        const result = resolveTurn(state, 'b', await classicApi.consequence(state, 'b'));
        assert.equal(JSON.stringify(state), before);
        assert.deepEqual(result.world, planned.world);
        assert.equal(result.world!.government!.housingNext!.reviewed, true);
        assert.equal(stepLivingWorld(result, result.turn + 1).effects.some(e => e.label.includes('района')), false);
        assert.ok(parseSave(save(result)));
    }
});
test('old saves load; corrupt next budgets and daily actions are rejected or disabled', async () => {
    const gs = await base();
    const old = structuredClone(gs); delete old.world!.government!.housingNext;
    assert.ok(parseSave(save(old)));
    const bad = structuredClone(gs); bad.world!.government!.housingNext!.originProgress = 99;
    assert.equal(parseSave(save(bad)), null);
    const running = interveneWorld(gs, 'government:start:settle');
    running.world!.government!.housingNext!.due!++;
    assert.equal(parseSave(save(running)), null);
    assert.deepEqual(stepLivingWorld({ ...gs, daily: '2026-10-09' }, gs.turn + 1).world, gs.world);
});
