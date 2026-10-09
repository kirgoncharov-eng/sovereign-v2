import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classicApi, beatEvent, callEvent, pressEvent } from './classic.ts';
import { createInitialState, seededRandom, startEvent, resolveTurn, planTurn } from './engine.ts';
import { openLivingWorld, livingActions, interveneWorld, stepLivingWorld } from './living-world.ts';
import { ensureEvidence } from './private-evidence.ts';
import { presidentialMessages, readPresidentialMessages } from '../client/presidential-inbox.ts';
import { personProfiles } from '../client/people-text.ts';
import { commitmentBriefs } from '../client/commitment-brief.ts';
import { parseSave } from '../client/save.ts';
import { SAVE_VERSION } from './data.ts';
import type { GameState } from './types.ts';
const save = (gs: GameState) => JSON.stringify({ version: SAVE_VERSION, screen: 'game', state: gs });
async function initial() {
    return openLivingWorld(createInitialState('Украина', 'debut', 'pragmatist', await classicApi.setup('Украина', 'debut', 'pragmatist', 11), seededRandom(11)));
}
// Unit fixtures isolate clocked world effects; full-game routing is exercised below.
function tick(gs: GameState) {
    const step = stepLivingWorld(gs, gs.turn + 1);
    return { ...gs, turn: gs.turn + 1, world: step.world, lastTurn: null };
}
test('reading an unverified source gives no proof, reward or clock; personal biography survives a replacement', async () => {
    const gs = await initial(), original = JSON.stringify(gs);
    assert.equal(gs.arc!.id, 'money');
    const message = presidentialMessages(gs).find(m => m.action === 'evidence')!;
    const read = readPresidentialMessages(gs, message.person);
    assert.deepEqual(read.resources, gs.resources);
    assert.equal(read.turn, gs.turn);
    assert.equal(read.world!.evidence!.phase, 'offered');
    assert.equal(read.world!.lastActionTurn, null);
    assert.equal(JSON.stringify(gs), original);
    assert.ok(parseSave(save(read)));
    const departed = { ...gs, keyFigures: gs.keyFigures.map(f => f.id === gs.world!.evidence!.figure ? { ...f, name: 'Новый руководитель' } : f) };
    const profiles = personProfiles(departed);
    assert.ok(profiles.find(p => p.name === gs.world!.evidence!.name)!.rows.some(r => r.value === gs.world!.evidence!.biography));
    assert.ok(!profiles.find(p => p.name === 'Новый руководитель')!.rows.some(r => r.label === 'До нынешней должности'));
    assert.equal(ensureEvidence(departed), departed);
    assert.equal(ensureEvidence({ ...gs, daily: '2026-10-09', world: { ...gs.world!, evidence: undefined } }).world!.evidence, undefined);
});
test('all routes verify the same pre-existing fact; trust buys access without a permanent power', async () => {
    const gs = await initial(), original = JSON.stringify(gs);
    const distant = { ...gs, keyFigures: gs.keyFigures.map(f => f.id === gs.world!.evidence!.figure ? { ...f, relation: 19 } : f) };
    assert.ok(!livingActions(distant).some(a => a.id === 'evidence:trusted'));
    assert.throws(() => interveneWorld(distant, 'evidence:trusted'), /недоступно/);
    const friendly = { ...gs, keyFigures: gs.keyFigures.map(f => f.id === gs.world!.evidence!.figure ? { ...f, relation: 20 } : f) };
    const trusted = tick(interveneWorld(friendly, 'evidence:trusted'));
    const service = tick(interveneWorld(gs, 'evidence:service'));
    const independent = tick(tick(interveneWorld(gs, 'evidence:independent')));
    assert.equal(tick(interveneWorld(gs, 'evidence:independent')).world!.evidence!.phase, 'checking');
    for (const result of [trusted, service, independent]) {
        assert.equal(result.world!.evidence!.phase, 'verified');
        assert.ok(result.world!.evidence!.text.includes('вашей личной осведомлённости и взяток оно не доказывает'));
        assert.ok(parseSave(save(result)));
    }
    assert.equal(trusted.world!.evidence!.text, service.world!.evidence!.text);
    assert.equal(service.world!.evidence!.text, independent.world!.evidence!.text);
    assert.equal(trusted.world!.evidence!.authority, 'none');
    assert.equal(independent.world!.evidence!.authority, 'none');
    assert.equal(JSON.stringify(gs), original);
});
test('power has a recurring price after delivery; withdrawal stops it without erasing evidence or refunding costs', async () => {
    const gs = await initial(), signed = interveneWorld(gs, 'evidence:service');
    assert.equal(signed.turn, gs.turn);
    assert.throws(() => interveneWorld(signed, 'appoint:minister'), /уже использовано/);
    const verified = tick(signed), snapshot = JSON.stringify(verified);
    assert.equal(stepLivingWorld(verified, verified.turn + 1).res.internalLegitimacy, -1);
    assert.ok(commitmentBriefs(verified).find(c => c.id === 'private-evidence')!.price.includes('каждый квартал'));
    const withdrawn = interveneWorld(verified, 'evidence:withdraw');
    assert.equal(withdrawn.world!.evidence!.authority, 'withdrawn');
    assert.equal(withdrawn.world!.evidence!.phase, 'verified');
    assert.equal(withdrawn.resources.politicalCapital, verified.resources.politicalCapital - 1);
    assert.equal(withdrawn.keyFigures.find(f => f.id === withdrawn.world!.evidence!.figure)!.relation, verified.keyFigures.find(f => f.id === verified.world!.evidence!.figure)!.relation - 15);
    assert.equal(stepLivingWorld(withdrawn, withdrawn.turn + 1).res.internalLegitimacy ?? 0, 0);
    assert.equal(stepLivingWorld(verified, verified.turn).effects.length, 0);
    assert.equal(JSON.stringify(verified), snapshot);
    assert.ok(parseSave(save(withdrawn)));
});
test('source departure closes the personal power, preserves pending legal verification and does not grant it to a successor', async () => {
    const signed = interveneWorld(await initial(), 'evidence:service');
    const replaced = { ...signed, keyFigures: signed.keyFigures.map(f => f.id === signed.world!.evidence!.figure ? { ...f, name: 'Преемник' } : f) };
    const result = tick(replaced);
    assert.equal(result.world!.evidence!.authority, 'departed');
    assert.equal(result.world!.evidence!.phase, 'verified');
    assert.ok(!livingActions(result).some(a => a.id === 'evidence:withdraw'));
    assert.ok(presidentialMessages(result).some(m => m.action === 'evidence'));
    assert.ok(parseSave(save(result)));
});
test('checked evidence changes two main decisions; referral has a real price and anger, while the source power persists', async () => {
    let gs = interveneWorld(await initial(), 'evidence:service');
    for (let quarter = 1; quarter <= 12; quarter++) {
        const current = startEvent(gs, await classicApi.event(gs));
        const isDemand = [3, 12].includes(quarter);
        const choice = isDemand ? 'd' : current.currentEvent!.choices[0].id;
        if (isDemand) {
            assert.equal(current.currentEvent!.beat!.turn, quarter);
            assert.ok(current.currentEvent!.choices.some(c => c.id === 'd'));
            const noProof = { ...gs, world: { ...gs.world!, evidence: { ...gs.world!.evidence!, phase: 'offered' as const } } };
            assert.ok(!beatEvent(noProof)!.choices.some(c => c.id === 'd'));
        }
        const before = JSON.stringify(current), planned = planTurn(current, choice);
        gs = resolveTurn(current, choice, await classicApi.consequence(current, choice));
        assert.equal(JSON.stringify(current), before);
        assert.deepEqual(gs.world, planned.world);
        assert.ok(parseSave(save(gs)), `quarter ${quarter}`);
        if (isDemand) {
            assert.equal(gs.world!.evidence!.authority, 'active');
            assert.equal(gs.arc!.flags.at(-1), quarter === 3 ? 'refuse' : 'sting');
            assert.ok(gs.lastTurn!.sources?.politicalCapital?.some(([label, delta]) => label === 'решение' && delta === -2));
        }
        if (gs.ended) assert.fail(`canonical party ended at ${quarter}`);
    }
    assert.equal(gs.world!.evidence!.referredAt, 3);
    assert.equal(gs.world!.evidence!.usedAt, 12);
});
test('legacy saves remain readable and contradictory evidence state is rejected', async () => {
    const gs = await initial(), legacy = structuredClone(gs);
    delete legacy.world!.evidence;
    assert.ok(parseSave(save(legacy)));
    const started = interveneWorld(gs, 'evidence:independent');
    const bad = structuredClone(started);
    bad.world!.evidence!.authority = 'active';
    assert.equal(parseSave(save(bad)), null);
    bad.world!.evidence!.authority = 'none';
    bad.world!.evidence!.due = -1;
    assert.equal(parseSave(save(bad)), null);
    assert.equal(livingActions({ ...gs, daily: '2026-10-09' }).filter(a => a.id.startsWith('evidence:')).length, 0);
});

test('continued access yields a deeper fact and changes the ending even if the president previously complied; early revocation stops further collection', async () => {
    const signed = interveneWorld(await initial(), 'evidence:service');
    let continuing = tick(signed);
    let revoked = interveneWorld(continuing, 'evidence:withdraw');
    while (continuing.turn < 15) { continuing = tick(continuing); revoked = tick(revoked); }
    assert.equal(continuing.world!.evidence!.networkVerifiedAt, 4);
    assert.equal(revoked.world!.evidence!.networkVerifiedAt, undefined);
    const atFinal = (gs: GameState): GameState => ({ ...gs, arc: { ...gs.arc!, flags: ['comply', 'cover', 'yield'], done: [1, 3, 7, 12] } });
    const withProof = beatEvent(atFinal(continuing))!, without = beatEvent(atFinal(revoked))!;
    assert.equal(withProof.title, 'Сеть раскрыта');
    assert.ok(withProof.choices.some(c => c.arc?.flag === 'trial'));
    assert.ok(withProof.description.includes('Записей передачи наличных у вас нет'));
    assert.equal(without.title, 'Счёт выставлен');
    assert.deepEqual(atFinal(continuing).arc!.flags, ['comply', 'cover', 'yield']);
    assert.ok(parseSave(save(continuing)));
});

test('a caller requests repeal only of an adopted foreign-agent law', async () => {
    const gs = await initial();
    const atCall: GameState = { ...gs, turn: 16, arc: null, keyFigures: gs.keyFigures.filter(f => f.id === 'mayor') };
    const without = callEvent(atCall)!;
    assert.ok(without.call!.demand.includes('опасаемся'));
    assert.ok(!without.call!.demand.includes('Отзовите'));
    const enacted = callEvent({ ...atCall, laws: [{ id: 'foreign_agents', since: 5 }] })!;
    assert.ok(enacted.call!.demand.includes('Отзовите'));
});
test('press asks about the consequences of an already adopted pension reform, rather than a future decision', async () => {
    const gs = await initial();
    let found = false;
    for (let seed = 1; seed <= 100; seed++) {
        const state: GameState = { ...gs, seed, turn: 18, arc: null, laws: [{ id: 'pension_reform', since: 13 }] };
        const question = pressEvent(state)?.press?.questions.find(q => q.id === 'pension');
        if (!question) continue;
        assert.ok(question.text.includes('уже приняли'));
        assert.ok(question.answers.some(a => a.text.includes('Я подписал')));
        assert.ok(question.answers.every(a => !a.text.includes('Нет — пока я президент')));
        found = true; break;
    }
    assert.ok(found);
});
