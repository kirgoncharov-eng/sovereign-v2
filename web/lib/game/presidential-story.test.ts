import test from 'node:test';
import assert from 'node:assert/strict';
import { ALTERNATE_COUNTRY, countryName, eraText } from './alternate-world.ts';
import { classicApi } from './classic.ts';
import { choiceEffects, conveneCouncil, createInitialState, resolveTurn, seededRandom, startEvent } from './engine.ts';
import { HISTORICAL_DEBATES, hasAuthoredDebate, hasPresidentialCouncil, presidentialConversation, presidentialCouncil } from './presidential-story.ts';
import { ALTERNATE_EVENTS } from '../content/alternate-history.ts';
import { parseSave } from '../client/save.ts';
import { SAVE_VERSION } from './data.ts';
import { advisorNews, debate, forecastReview } from './forecasts.ts';
import { loyaltyOf } from './engine.ts';
import { historicalPortraitArt } from '../client/historical-art.ts';
import type { GameState } from './types.ts';

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
        assert.equal(loaded.councilCharges, state.councilCharges);
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

test('conversation uses current advisors and refers to the selected proposal across all historical cases', async () => {
    const state = await firstCase();
    for (const card of ALTERNATE_EVENTS) {
        assert.ok(HISTORICAL_DEBATES[card.id], `missing authored debate for ${card.id}`);
        const cardState = historicalCase(state, card);
        for (let index = 0; index < 3; index++) {
            const lines = presidentialConversation(cardState, index);
            assert.equal(hasAuthoredDebate(cardState, index), true);
            assert.equal(lines.length, 3, `${card.id} choice ${index} should have 3 lines`);
            assert.ok(lines.every(line => state.advisors.some(advisor => advisor.name === line.name)));
            assert.ok(lines.every(line => ['economist', 'strategist', 'security', 'diplomat'].includes(line.id)));
            assert.notEqual(lines[0].name, lines[1].name, `${card.id} choice ${index} objection must come from another advisor`);
        }
    }
    assert.match(presidentialConversation(state, 1).map(line => line.text).join(' '), /три года/);
    const generic = { ...state, currentEvent: { ...state.currentEvent!, card: 'another-case' } };
    assert.ok(presidentialConversation(generic, 0)[0].text.includes(state.currentEvent!.choices[0].text));
    assert.deepEqual(presidentialConversation(state, 20), []);
    assert.equal(hasAuthoredDebate({ ...state, daily: '2026-10-14' }, 0), false);
    assert.equal(hasAuthoredDebate({ ...state, country: 'Беларусь' }, 0), false);
    assert.equal(hasAuthoredDebate(generic, 0), false);
    assert.equal(hasAuthoredDebate(state, 20), false);
});

test('advisor portraits verify gender: initial team gets portraits, replacement of different gender does not', async () => {
    const state = await firstCase();
    for (const advisor of state.advisors) {
        const art = historicalPortraitArt(state, advisor.name);
        assert.ok(art, `Starting advisor ${advisor.id} (${advisor.name}) must have a portrait`);
    }
    const maleEconomist = { ...state.advisors.find(a => a.id === 'economist')!, name: 'Виктор Ковалёв' };
    const replacedState: GameState = {
        ...state,
        advisors: state.advisors.map(a => a.id === 'economist' ? maleEconomist : a),
    };
    assert.equal(historicalPortraitArt(replacedState, 'Виктор Ковалёв'), null);
});

function historicalCase(state: Awaited<ReturnType<typeof firstCase>>, card: typeof ALTERNATE_EVENTS[number]) {
    return startEvent({ ...state, turn: 8 }, {
        ...state.currentEvent!, cardId: card.id, title: card.title, source: card.source, description: card.description,
        choices: card.choices.map((choice, index) => ({
            ...choice, id: ['a', 'b', 'c'][index], sceneFail: choice.fail,
            headline: choice.head?.[0], headlineFail: choice.head?.[1], resolvesCrisis: null,
        })),
    });
}

test('all historical conversations retain exact resolutions and their outcomes after council and reload', async () => {
    for (const seed of [1, 7, 21]) {
        const base = await firstCase(seed);
        for (const card of ALTERNATE_EVENTS) {
            const state = historicalCase(base, card);
            const proposals = await classicApi.council(state);
            assert.deepEqual(proposals, state.currentEvent!.choices);
            const loaded = parseSave(JSON.stringify({
                version: SAVE_VERSION, screen: 'game', state: conveneCouncil(state, proposals),
            }))!.state;
            for (const choice of proposals) {
                const directReport = await classicApi.consequence(state, choice.id);
                const councilReport = await classicApi.consequence(loaded, choice.id);
                assert.deepEqual(councilReport, directReport);
                const index = state.currentEvent!.choices.findIndex(candidate => candidate.id === choice.id);
                assertAuthoredFeedback(state, index);
                const direct = resolveTurn(state, choice.id, directReport);
                assert.deepEqual(directReport.forecasts ?? [], []);
                const lines = presidentialConversation(state, index);
                for (const advisor of direct.advisors) {
                    const before = state.advisors.find(previous => previous.id === advisor.id)!;
                    const expected = advisor.name === lines[0].name ? 3 : advisor.name === lines[1].name ? -5 : 0;
                    assert.equal(loyaltyOf(advisor) - loyaltyOf(before), expected);
                    assert.deepEqual(advisor.record, before.record);
                }
                const discussed = resolveTurn(loaded, choice.id, councilReport);
                assert.deepEqual(discussed.resources, direct.resources);
                assert.deepEqual(discussed.factions, direct.factions);
                assert.deepEqual(discussed.pending, direct.pending);
            }
        }
    }
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

function assertAuthoredFeedback(state: GameState, index: number) {
    const lines = presidentialConversation(state, index);
    const choice = state.currentEvent!.choices[index];
    for (const failed of [false, true]) {
        const updates = advisorNews(state, choice.id, failed);
        assert.deepEqual(forecastReview(state, choice.id, failed), []);
        assert.equal(updates.length, 2);
        for (const update of updates) {
            const advisor = state.advisors.find(person => person.id === update.id)!;
            assert.equal(update.loyalty, advisor.name === lines[0].name ? 3 : -5);
            assert.equal(update.reason, advisor.name === lines[0].name ? 'followed' : 'overruled');
            assert.equal(update.right + update.wrong, 0);
        }
    }
}

test('first factory proposal rewards its actual economist and respects loyalty bounds and absent advisors', async () => {
    for (const seed of [1, 21, 42]) {
        const state = await firstCase(seed);
        for (let index = 0; index < state.currentEvent!.choices.length; index++) assertAuthoredFeedback(state, index);
        const choice = state.currentEvent!.choices[0];
        const bounded = { ...state, advisors: state.advisors.map(advisor => ({
            ...advisor, loyalty: advisor.id === 'economist' ? 99 : advisor.id === 'strategist' ? 2 : 60,
        })) };
        const updates = advisorNews(bounded, choice.id, false);
        assert.equal(updates.find(update => update.id === 'economist')!.loyalty, 1);
        assert.equal(updates.find(update => update.id === 'strategist')!.loyalty, -2);
        const absent = { ...state, advisors: state.advisors.filter(advisor => advisor.id !== 'economist') };
        assert.deepEqual(advisorNews(absent, choice.id, false).map(update => update.id), ['strategist']);
        assert.deepEqual(advisorNews(state, 'unknown-choice', false), []);
        const fallback = { ...state, currentEvent: { ...state.currentEvent!, card: 'generic-resolution' } };
        assert.deepEqual(advisorNews(fallback, choice.id, false), [], 'neutral fallback has no endorsed policy');
        assert.deepEqual(forecastReview(fallback, choice.id, false), []);
        const daily = { ...state, daily: '2026-10-19' };
        assert.ok(debate(daily), 'daily retains its generic debate');
        for (const country of ['Беларусь', 'Украина', 'Грузия', 'Армения', 'Казахстан', 'Молдова']) {
            assert.ok(debate({ ...state, country }), country);
        }
    }
});

// #219: спор советников о мазуте говорит о цене так, как её считает игра — с тегами, а не только по policyEffect.
test('спор о двух поставщиках мазута совпадает с настоящей ценой вариантов', async () => {
    const state = await firstCase();
    const card = ALTERNATE_EVENTS.find(event => event.id === 'alt_fuel_west')!;
    const [western, russian, split] = card.choices.map((choice, index) => choiceEffects(state, { ...choice, id: String(index) } as never).resources);
    const lines = HISTORICAL_DEBATES.alt_fuel_west[2].map(([, line]) => line).join(' ');
    assert.match(lines, /не дороже/);
    assert.ok((split.economy ?? 0) >= (western.economy ?? 0) && (split.economy ?? 0) >= (russian.economy ?? 0), 'деньгами раздел не дороже');
    assert.ok((split.politicalCapital ?? 0) < 0 && (split.personalResource ?? 0) < 0, 'зато стоит влияния и личных сил');
});
