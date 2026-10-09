import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classicApi } from '../game/classic.ts';
import { createInitialState, seededRandom } from '../game/engine.ts';
import { openLivingWorld, interveneWorld, stepLivingWorld } from '../game/living-world.ts';
import { commitmentBriefs } from './commitment-brief.ts';
import { parseSave } from './save.ts';
import { SAVE_VERSION } from '../game/data.ts';
import type { GameState } from '../game/types.ts';
async function base() { return openLivingWorld(createInitialState('Украина', 'debut', 'pragmatist', await classicApi.setup('Украина', 'debut', 'pragmatist', 11), seededRandom(11))); }
function tick(gs: GameState): GameState { const r = stepLivingWorld(gs, gs.turn + 1); return { ...gs, world: r.world, turn: gs.turn + 1, lastTurn: null }; }
test('opening a brief grants nothing, never ticks, survives a save, and excludes unaccepted offers and daily play', async () => {
    const gs = await base(), before = JSON.stringify(gs);
    assert.deepEqual(commitmentBriefs(gs), []);
    assert.equal(JSON.stringify(gs), before);
    const offer = tick(interveneWorld(gs, 'appoint:minister'));
    assert.deepEqual(commitmentBriefs(offer), []);
    const accepted = interveneWorld(offer, 'minister:accept'), snapshot = JSON.stringify(accepted);
    const briefs = commitmentBriefs(accepted);
    assert.equal(briefs[0].active, true);
    assert.ok(briefs[0].price.includes('Сейчас квартальных списаний'));
    assert.ok(briefs[0].next.includes('уже подписано'));
    assert.equal(JSON.stringify(accepted), snapshot);
    const restored = parseSave(JSON.stringify({ version: SAVE_VERSION, screen: 'game', state: accepted }))!;
    assert.deepEqual(commitmentBriefs(restored.state), briefs);
    assert.deepEqual(commitmentBriefs({ ...accepted, daily: '2026-10-09' }), []);
});
test('minister authority persists after energy but actual help, housing charges and one-quarter handover follow real work', async () => {
    let gs = interveneWorld(tick(interveneWorld(await base(), 'appoint:minister')), 'minister:accept');
    while (gs.turn < 5)
        gs = tick(gs);
    let brief = commitmentBriefs(gs).find(c => c.id === 'minister')!;
    assert.ok(!brief.received.includes('получает +4'));
    assert.equal(brief.active, true);
    assert.ok(brief.promised.includes('после завершения'));
    gs = tick(interveneWorld(gs, 'government:start:housing'));
    brief = commitmentBriefs(gs).find(c => c.id === 'minister')!;
    assert.ok(brief.price.includes('Экономика −1 за квартал исполнения'));
    const lost = { ...gs, advisors: gs.advisors.filter(a => a.id !== 'economist') };
    assert.ok(!commitmentBriefs(lost).find(c => c.id === 'minister')!.price.includes('Экономика −1 за квартал исполнения'));
    const withdrawn = interveneWorld(gs, 'minister:withdraw');
    assert.equal(commitmentBriefs(withdrawn).find(c => c.id === 'minister')!.active, false);
    assert.ok(commitmentBriefs(withdrawn).find(c => c.id === 'minister')!.price.includes('потеряет 5'));
    assert.ok(!commitmentBriefs(tick(withdrawn)).find(c => c.id === 'minister')!.price.includes('потеряет 5'));
    while (gs.turn < 9)
        gs = tick(gs);
    assert.equal(commitmentBriefs(gs).find(c => c.id === 'minister')!.active, false);
    assert.ok(commitmentBriefs(gs).find(c => c.id === 'minister')!.promised.includes('исполнен'));
    assert.ok(!commitmentBriefs(gs).find(c => c.id === 'minister')!.price.includes('Экономика −1 за квартал исполнения'));
});
test('sponsor help, demand date, lost leverage and overdue pressure are not confused with recurring budget charges', async () => {
    const gs = await base();
    let accepted = interveneWorld(gs, 'sponsor:accept');
    assert.ok(commitmentBriefs(accepted).find(c => c.id === 'sponsor')!.price.includes('квартале 2'));
    accepted = tick(accepted);
    accepted = interveneWorld(accepted, 'appoint:minister');
    const demanding = tick(accepted), brief = commitmentBriefs(demanding).find(c => c.id === 'sponsor')!;
    assert.ok(brief.received.includes('+5'));
    assert.ok(brief.price.includes('квартала 4'));
    const independent = interveneWorld(demanding, 'sponsor:independent');
    assert.equal(commitmentBriefs(independent).find(c => c.id === 'sponsor')!.active, false);
    assert.ok(!commitmentBriefs(independent).find(c => c.id === 'sponsor')!.received.includes('+5'));
    const pressure = tick(tick(interveneWorld(await base(), 'appoint:minister')));
    assert.equal(pressure.world!.sponsor!.phase, 'pressuring');
    assert.ok(commitmentBriefs(pressure).find(c => c.id === 'sponsor')!.received.includes('−8'));
    assert.ok(commitmentBriefs(pressure).find(c => c.id === 'sponsor')!.price.includes('задержка работы'));
    const departed = { ...demanding, keyFigures: demanding.keyFigures.filter(f => f.id !== demanding.world!.sponsor!.figure) };
    assert.equal(commitmentBriefs(departed).find(c => c.id === 'sponsor')!.active, false);
    assert.ok(!commitmentBriefs(departed).find(c => c.id === 'sponsor')!.price.includes('ответ до'));
});
test('personal priority shows the actual project, budget threshold and public responsibility', async () => {
    let gs = tick(interveneWorld(await base(), 'government:start:exports'));
    gs = interveneWorld(gs, 'government:priority:exports');
    const brief = commitmentBriefs(gs).find(c => c.id === 'priority')!;
    assert.deepEqual(brief.target, { kind: 'government', id: 'exports' });
    assert.ok(brief.price.includes('легитимность +3'));
    assert.ok(brief.next.includes('квартал 4'));
    const tired = { ...gs, resources: { ...gs.resources, personalResource: 4 } };
    assert.ok(commitmentBriefs(tired).find(c => c.id === 'priority')!.price.includes('приостановлено'));
    assert.ok(!commitmentBriefs(tired).find(c => c.id === 'priority')!.received.includes('даёт +5'));
    assert.ok(!commitmentBriefs(interveneWorld(tick(gs), 'government:release')).some(c => c.id === 'priority'));
});
test('health appointments retain their exact deferred price until the real review clears it', async () => {
    const gs = await base();
    gs.world!.health!.aftermath = { branch: 'rotation', phase: 'working', due: 8, deadline: 10, cause: 'test', response: 'mediate', executor: 'healthMinister', outcome: null, factors: [], bargain: { phase: 'answered', choice: 'minister', ministerCondition: 'test', doctorCondition: 'test', reviewDue: 10 } };
    let brief = commitmentBriefs(gs).find(c => c.id === 'health')!;
    assert.equal(brief.active, true);
    assert.ok(brief.price.includes('Политкапитал −2'));
    assert.ok(brief.next.includes('квартал 10'));
    gs.world!.health!.aftermath.phase = 'settled';
    gs.world!.health!.aftermath.bargain!.reviewDue = null;
    brief = commitmentBriefs(gs).find(c => c.id === 'health')!;
    assert.equal(brief.active, false);
    assert.ok(!brief.price.includes('Политкапитал −2'));
});
