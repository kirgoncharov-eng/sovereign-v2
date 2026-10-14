import test from 'node:test';
import assert from 'node:assert/strict';
import { ALTERNATE_COUNTRY, countryName, eraText } from './alternate-world.ts';
import { classicApi } from './classic.ts';
import { conveneCouncil, createInitialState, resolveTurn, seededRandom, startEvent } from './engine.ts';
import { hasPresidentialCouncil, presidentialConversation, presidentialCouncil } from './presidential-story.ts';
import { parseSave } from '../client/save.ts';
import { SAVE_VERSION } from './data.ts';

async function firstCase(seed = 21) {
    const intro = await classicApi.setup(ALTERNATE_COUNTRY, 'debut', 'pragmatist', seed);
    const state = createInitialState(ALTERNATE_COUNTRY, 'debut', 'pragmatist', intro, seededRandom(seed));
    return startEvent(state, await classicApi.event(state));
}

test('council retains exact policy, obligations and narration of every factory resolution', async () => {
    for (const seed of [1, 7, 21, 42, 91]) {
        const state = await firstCase(seed);
        const proposals = await classicApi.council(state);
        assert.deepEqual(proposals, state.currentEvent!.choices);
        const council = conveneCouncil(state, proposals);
        const loaded = parseSave(JSON.stringify({ version: SAVE_VERSION, screen: 'game', state: council }))!.state;
        assert.equal(loaded.councilCharges, state.councilCharges - 1);
        for (const choice of proposals) {
            const directNarration = await classicApi.consequence(state, choice.id);
            const councilNarration = await classicApi.consequence(loaded, choice.id);
            assert.deepEqual(councilNarration, directNarration);
            const direct = resolveTurn(state, choice.id, directNarration);
            const discussed = resolveTurn(loaded, choice.id, councilNarration);
            assert.deepEqual(discussed.resources, direct.resources);
            assert.deepEqual(discussed.pending, direct.pending);
            assert.deepEqual(discussed.factions, direct.factions);
        }
    }
});

test('conversation uses current advisors and refers to the selected proposal', async () => {
    const state = await firstCase();
    for (let index = 0; index < 3; index++) {
        const lines = presidentialConversation(state, index);
        assert.equal(lines.length, 3);
        assert.ok(lines.every(line => state.advisors.some(advisor => advisor.name === line.name)));
    }
    assert.match(presidentialConversation(state, 1).map(line => line.text).join(' '), /три года/);
    const generic = { ...state, currentEvent: { ...state.currentEvent!, card: 'another-case' } };
    assert.ok(presidentialConversation(generic, 0)[0].text.includes(state.currentEvent!.choices[0].text));
    assert.deepEqual(presidentialConversation(state, 20), []);
});

test('legacy councils are untouched and scripted special cases cannot be replaced', async () => {
    const state = await firstCase();
    assert.equal(presidentialCouncil({ ...state, country: 'Беларусь' }), null);
    assert.deepEqual(presidentialCouncil({ ...state, currentEvent: null }), []);
    assert.equal(countryName(ALTERNATE_COUNTRY), 'Неманская республика');
    assert.equal(countryName('Беларусь'), 'Беларусь');
    assert.equal(hasPresidentialCouncil(conveneCouncil(state, presidentialCouncil(state)!)), true);
    const oldCouncil = [{ ...state.currentEvent!.choices[0], id: 'x1' }];
    assert.equal(hasPresidentialCouncil(conveneCouncil(state, oldCouncil)), false);
    assert.equal(eraText('Командир ОМОНа'), 'Командир резерва полиции');
    assert.equal(eraText('Вторая инаугурация проходит тише первой'), 'Новая инаугурация проходит тише первой');
});
