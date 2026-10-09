import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classicApi, callEvent, callChoice, cardAvailable, pressEvent, specialAct } from './classic.ts';
import { createInitialState, planTurn, resolveTurn, seededRandom, startEvent } from './engine.ts';
import { openLivingWorld, stepLivingWorld } from './living-world.ts';
import { pensionCall } from './pension-call.ts';
import { stepLaws } from './laws.ts';
import { EVENT_CARDS } from '../content/events.ts';
import { parseSave } from '../client/save.ts';
import { SAVE_VERSION } from './data.ts';
import type { GameState } from './types.ts';
const save = (gs: GameState) => JSON.stringify({ version: SAVE_VERSION, screen: 'game', state: gs });
async function fixture(relation = 30): Promise<GameState> {
    let gs = openLivingWorld(createInitialState('Украина', 'debut', 'pragmatist', await classicApi.setup('Украина', 'debut', 'pragmatist', 11), seededRandom(11)));
    // Clocked world fixture isolates this call; the whole-party audit separately earns the law.
    while (gs.turn < 16) { const step = stepLivingWorld(gs, gs.turn + 1); gs = { ...gs, turn: gs.turn + 1, world: step.world }; }
    return { ...gs, arc: null, laws: [{ id: 'pension_reform', since: 13 }],
        keyFigures: gs.keyFigures.filter(f => f.id === 'mayor').map(f => ({ ...f, relation })),
        usedEvents: ['call:11:nat_leader'], history: [], resources: { ...gs.resources, economy: 60, politicalCapital: 60, personalResource: 60 } };
}
async function answer(gs: GameState, id: string) {
    const current = startEvent(gs, callEvent(gs)!), before = JSON.stringify(current);
    const plan = planTurn(current, id);
    const result = resolveTurn(current, id, await classicApi.consequence(current, id));
    assert.equal(JSON.stringify(current), before);
    assert.deepEqual(result.laws, plan.laws);
    assert.ok(parseSave(save(result)));
    assert.ok(!/не взял трубку|не берёт трубку|не брать трубку/i.test(result.lastTurn!.narrative + result.lastTurn!.reactions.join(' ')));
    return result;
}
test('the concrete calendar call requires an actual unamended law and available opponent; ordinary and daily calls stay compatible', async () => {
    const gs = await fixture(), call = callEvent(gs)!;
    assert.equal(call.call!.negotiation, 'pension');
    assert.equal(call.call!.lawSince, 13);
    assert.ok(call.cardId.startsWith('call:17:'));
    assert.equal(pensionCall({ ...gs, laws: [] }, 17, new Set()), null);
    assert.equal(pensionCall({ ...gs, daily: '2026-10-09' }, 17, new Set()), null);
    assert.equal(pensionCall(gs, 17, new Set(['mayor'])), null);
    const current = startEvent(gs, call);
    assert.throws(() => callChoice(current, 'principle', 'deal'), /конкретное/);
    assert.equal(specialAct(current, call.choices[0]), null);
    assert.equal(callEvent(current), null);
    assert.ok(parseSave(save(current)));
});
test('repeal actually removes the recurring law; keep preserves it; compensation creates a persistent, cheaper amendment', async () => {
    const gs = await fixture(), repeal = await answer(gs, 'a'), amendment = await answer(gs, 'b'), keep = await answer(gs, 'c');
    assert.equal(repeal.laws!.length, 0);
    assert.equal(keep.laws![0].transition, undefined);
    assert.deepEqual(amendment.laws![0].transition, { figure: 'mayor', name: gs.keyFigures[0].name, since: 17 });
    assert.equal(amendment.laws![0].since, 13);
    assert.equal(amendment.lastTurn!.law!.act, 'amend');
    assert.equal(repeal.history.at(-1)!.law!.act, 'repeal');
    assert.deepEqual(stepLaws(repeal.laws, undefined, true, 18, gs.factions).res, {});
    assert.deepEqual(stepLaws(amendment.laws, undefined, true, 18, gs.factions).res, { economy: 1 });
    assert.deepEqual(stepLaws(keep.laws, undefined, true, 18, gs.factions).res, { economy: 2, internalLegitimacy: -1 });
    const repeat = stepLaws(amendment.laws, undefined, true, 18, gs.factions, { figure: 'other', name: 'Другой' });
    assert.equal(repeat.news, null);
    assert.deepEqual(repeat.laws, amendment.laws);
    const gone = stepLaws(amendment.laws, { id: 'pension_reform', act: 'repeal' }, true, 18, gs.factions);
    const reenacted = stepLaws(gone.laws, { id: 'pension_reform', act: 'enact' }, true, 19, gs.factions);
    assert.equal(reenacted.laws[0].transition, undefined);
});
test('a hostile person may reject the political compromise while the actual relief still applies', async () => {
    const friendly = await fixture(30), hostile = await fixture(-30);
    const yes = callEvent(friendly)!.choices[1], no = callEvent(hostile)!.choices[1];
    assert.ok(yes.hint.includes('готов поддержать'));
    assert.ok(no.hint.includes('продолжит требовать'));
    assert.ok(yes.deal!.figureRel! > 0 && no.deal!.figureRel! < 0);
    assert.equal((await answer(hostile, 'b')).laws![0].transition!.since, 17);
});
test('political terms still break incompatible pacts instead of hiding behind a pure administrative deal', async () => {
    const gs = await fixture();
    const withPact: GameState = { ...gs, pacts: [{ faction: 'oligarchs', figure: null, since: 14, until: 21, ban: ['social'], against: null }] };
    const repealed = await answer(withPact, 'a');
    assert.ok(!repealed.pacts!.some(p => p.faction === 'oligarchs'));
    const kept = await answer(withPact, 'c');
    assert.ok(kept.pacts!.some(p => p.faction === 'oligarchs'));
});
test('future scenes and press remember the amendment or repeal; corrupt or transplanted amendment saves fail', async () => {
    const gs = await fixture(), amended = await answer(gs, 'b'), repealed = await answer(gs, 'a');
    const card = EVENT_CARDS.find(c => c.id === 'law_pension_reform')!;
    assert.equal(cardAvailable(card, { ...amended, turn: 19 }), false);
    assert.equal(cardAvailable(card, { ...repealed, turn: 19 }), false);
    let found = false;
    for (let seed = 1; seed <= 100; seed++) {
        const amendQ = pressEvent({ ...amended, seed, turn: 18 })?.press?.questions.find(q => q.id === 'pension');
        if (!amendQ) continue;
        const repealQ = pressEvent({ ...repealed, seed, turn: 18 })!.press!.questions.find(q => q.id === 'pension')!;
        assert.ok(amendQ.text.includes('льготный выход'));
        assert.ok(repealQ.text.includes('отменили'));
        found = true; break;
    }
    assert.ok(found);
    const bad = structuredClone(amended); bad.laws![0].transition!.since = 100;
    assert.equal(parseSave(save(bad)), null);
    bad.laws![0].transition!.since = 17; bad.laws![0].id = 'progressive_tax';
    assert.equal(parseSave(save(bad)), null);
});
