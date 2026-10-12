import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ALTERNATE_COUNTRY, ALTERNATE_DAILY_FROM, LEGACY_COUNTRIES, campaignCopy, dailyBoardKey } from './alternate-world.ts';
import { classicApi, cardAvailable, lawEvent } from './classic.ts';
import { choiceEffects, createInitialState, resolveTurn, seededRandom, startEvent } from './engine.ts';
import { dailyCaseForDate } from './daily.ts';
import { turnDate } from './calendar.ts';
import { COUNTRIES, IDEOLOGIES, SAVE_VERSION } from './data.ts';
import { ARCS } from '../content/arcs.ts';
import { EVENT_CARDS } from '../content/events.ts';
import { ALTERNATE_EVENTS, ALTERNATE_LAWS } from '../content/alternate-history.ts';
import { visibleAchievements } from '../client/meta.ts';
import { parseSave } from '../client/save.ts';
import { shareCaption, shareQuery, parseShare, shareResultOf } from '../share.ts';
async function fresh(country = ALTERNATE_COUNTRY, seed = 21) {
    return createInitialState(country, 'debut', 'pragmatist', await classicApi.setup(country, 'debut', 'pragmatist', seed), seededRandom(seed));
}
test('historical campaign: separate profile, industrial first decision, intrigue follows it', async () => {
    let state = await fresh();
    assert.equal(COUNTRIES[state.country].startYear, 1978);
    assert.match((await classicApi.setup(ALTERNATE_COUNTRY, 'debut', 'pragmatist', 21)).situation, /Альтернативная история.*1918/);
    assert.ok(state.factions.some(faction => faction.bloc === 'regional'));
    assert.ok(state.keyFigures.every(figure => state.factions.some(faction => faction.id === figure.faction)));
    state = startEvent(state, await classicApi.event(state));
    assert.equal(state.currentEvent!.card, 'alt_wages');
    assert.equal(state.currentEvent!.beat, undefined);
    state = resolveTurn(state, 'b', await classicApi.consequence(state, 'b'));
    const loaded = parseSave(JSON.stringify({
        version: SAVE_VERSION,
        screen: 'game',
        state
    }))!;
    assert.equal(loaded.state.country, ALTERNATE_COUNTRY);
    assert.equal(loaded.state.year, 1978);
    assert.equal((await classicApi.event(loaded.state)).beat?.episode, 1);
});
test('export advance creates one future liability with an explicit cause, preserved on reload', async () => {
    const base = await fresh();
    const state = startEvent(base, await classicApi.event(base));
    for (let seed = 1; seed < 100; seed++) {
        const candidate = {
            ...state, seed
        };
        const result = resolveTurn(candidate, 'b', await classicApi.consequence(candidate, 'b'));
        if (!result.lastTurn!.success)
            continue;
        const liability = result.pending.find(entry => entry.label === 'Цена экспортного аванса');
        assert.ok(liability);
        assert.equal(liability.due, 5);
        assert.deepEqual(liability.res, {
            economy: -4,
            politicalCapital: -2
        });
        assert.match(liability.story ?? "", /цена поставки закреплена договором/);
        assert.equal(result.pending.filter(entry => entry.label === liability.label).length, 1);
        const loaded = parseSave(JSON.stringify({
            version: SAVE_VERSION,
            screen: 'game',
            state: result
        }))!;
        assert.deepEqual(loaded.state.pending, result.pending);
        return;
    }
    assert.fail('Successful execution was not exercised');
});
test('contemporary country plots are unavailable in 1978; historical content stays out of legacy campaigns', async () => {
    const state = await fresh();
    for (const card of EVENT_CARDS.filter(card => /^(by_|kz_)/.test(card.id) || card.id === 'eu_conditions')) {
        assert.equal(cardAvailable(card, state), false, card.id);
    }
    for (const card of ALTERNATE_EVENTS)
        assert.equal(cardAvailable(card, await fresh('Беларусь')), false, card.id);
    for (const law of ALTERNATE_LAWS)
        assert.deepEqual(law.countries, [ALTERNATE_COUNTRY]);
    for (let seed = 1; seed <= 60; seed++) {
        const event = lawEvent({
            ...await fresh(ALTERNATE_COUNTRY, seed),
            turn: 4,
            arc: null
        });
        if (event)
            assert.ok(!event.cardId.includes('foreign_agents') && !event.cardId.includes('constitution'));
    }
});
test('legacy dates and six campaign traces stay byte-identical to baseline 6ecc5c7', async () => {
    // Independent traces captured from the unmodified commit, not calculated by this implementation.
    const hashes: Record<string, string> = {
        'Беларусь': '4c30b2bc3b32a1c5607f3be2182558796b3f1769dc8685c8ed3c7ae37f153b53',
        'Украина': '29db16c55b5a29e8e2f8829ed716f2451b1838345454f22d674dc69d9983095b',
        'Грузия': '22d3f14311607a614f5af8ae9fe7065560902410ba376fb04c2125e7eca83b2b',
        'Молдова': '6aa60c7b5be1dbc660986bbd1de89919e0885005a25ae0cda9a1bc01501b646e',
        'Армения': 'd7022e1e6bd7fac1477f639cbaf67e9a0337b6d149ca2068890a674177377e60',
        'Казахстан': '42f4b68fa4e747c5b91c948aeaa1bbe3b0fbaaa62f01be9accadf1499c50d0ea'
    };
    for (const country of LEGACY_COUNTRIES) {
        let state = await fresh(country);
        while (!state.ended && state.turn < 10) {
            state = startEvent(state, await classicApi.event(state));
            const choice = state.currentEvent!.choices[state.turn % state.currentEvent!.choices.length];
            state = resolveTurn(state, choice.id, await classicApi.consequence(state, choice.id));
        }
        assert.equal(createHash('sha256').update(JSON.stringify(state)).digest('hex'), hashes[country], country);
    }
    assert.deepEqual(dailyCaseForDate('2026-10-12'), {
        date: '2026-10-12',
        seed: 226246098,
        country: 'Казахстан',
        diff: 'coalition',
        ideo: 'pragmatist'
    });
    assert.equal(dailyCaseForDate(ALTERNATE_DAILY_FROM).country, ALTERNATE_COUNTRY);
    assert.equal(dailyCaseForDate('2026-11-15').country, ALTERNATE_COUNTRY);
});
test('historical narratives contain no digital-era props across courses and first terms', async () => {
    const anachronism = /соцсет|интернет|смартфон|мессендж|скриншот|VPN|блогер|дрон|на сайте|телефон с фотограф|экран к вам/i;
    for (const ideology of IDEOLOGIES)
        for (const seed of [3, 11, 21, 29, 41, 57]) {
            let state = createInitialState(ALTERNATE_COUNTRY, 'debut', ideology.id, await classicApi.setup(ALTERNATE_COUNTRY, 'debut', ideology.id, seed), seededRandom(seed));
            while (!state.ended && state.turn < 24) {
                state = startEvent(state, await classicApi.event(state));
                const event = state.currentEvent!;
                const choice = event.choices.find(choice => choice.path === 'run') ?? event.choices[state.turn % event.choices.length];
                const narration = await classicApi.consequence(state, choice.id);
                const text = JSON.stringify({
                    event,
                    narration: {
                        ...narration,
                        heard: undefined
                    }
                });
                assert.ok(!anachronism.test(text), `${ideology.id}/${seed}/${state.turn + 1}: ${text.match(anachronism)?.[0]}`);
                assert.ok(!/\{(?:fig|fac|capital|target|country|leader)[}:]/.test(text), `${ideology.id}/${seed}/${state.turn + 1}: ${text}`);
                state = resolveTurn(state, choice.id, narration);
            }
        }
});
test('era copies preserve legacy text and mechanical IDs; result links preserve 1978', async () => {
    const source = {
        title: 'РЕСУРСЫ: посол ЕС',
        id: 'pro_russia',
        tags: ['pro_russia'],
        res: {
            economy: -4
        }
    };
    assert.equal(campaignCopy(source, 'Беларусь'), source);
    assert.deepEqual(campaignCopy(source, ALTERNATE_COUNTRY), {
        ...source,
        title: 'РЕСУРСЫ: посол Торгового союза'
    });
    assert.equal(source.title, 'РЕСУРСЫ: посол ЕС');
    const result = shareResultOf(await fresh(), 50, 0);
    assert.equal(parseShare(new URLSearchParams(shareQuery(result)))!.from, 1978);
    assert.match(shareCaption(result).description, /альтернативная история/);
});
test('industrial policies pay for modernization and do not buy military support through trade tags', async () => {
    const base = await fresh();
    const state = startEvent(base, await classicApi.event(base));
    assert.equal(state.arc!.id, 'alt_contracts');
    const modernization = state.currentEvent!.choices[2];
    assert.ok((choiceEffects(state, modernization).resources.economy ?? 0) < 0);
    assert.match(modernization.costReasons!.economy!, /переоборудование/);
    const advance = state.currentEvent!.choices[1];
    assert.equal(choiceEffects(state, advance).resources.military ?? 0, 0);
    assert.ok((choiceEffects(state, advance).factionRel.russia ?? 0) > 0);
});
test('the second term keeps historical laws and liabilities, changes intrigue and survives reload', async () => {
    let state = await fresh();
    state = {
        ...state,
        turn: 19,
        arc: null,
        path: {
            id: 'run',
            turn: 18
        },
        laws: [
            {
                id: 'alt_export_guarantee',
                since: 5
            }
        ],
        pending: [
            {
                id: 'contract',
                due: 23,
                from: 17,
                label: 'Договор',
                source: 'Решение',
                res: {
                    economy: -4
                },
                story: 'Срок платежа'
            }
        ],
        resources: {
            politicalCapital: 90,
            economy: 90,
            military: 90,
            externalReputation: 90,
            internalLegitimacy: 90,
            personalResource: 90
        },
        factions: state.factions.map(faction => ({
            ...faction,
            relation: 90
        }))
    };
    state = startEvent(state, await classicApi.event(state));
    state = resolveTurn(state, 'a', await classicApi.consequence(state, 'a'));
    assert.equal(state.turn, 20);
    assert.equal(state.ended, false);
    assert.equal(state.reign!.term, 1);
    assert.equal(state.country, ALTERNATE_COUNTRY);
    assert.ok(state.laws!.some(law => law.id === 'alt_export_guarantee'));
    assert.ok(state.pending.some(entry => entry.id === 'contract'));
    const loaded = parseSave(JSON.stringify({
        version: SAVE_VERSION,
        screen: 'game',
        state
    }))!;
    assert.ok(loaded);
    assert.equal(loaded.state.reign!.term, 1);
    assert.ok((await classicApi.event(loaded.state)).beat, 'new term opens with its intrigue instead of a second first-session factory');
});
test('every intrigue branch renders in the historical second term without future dates or modern devices', async () => {
    const base = await fresh();
    for (const arc of ARCS)
        for (const beat of arc.beats)
            for (const variant of beat.variants) {
                const prepared = {
                    ...base,
                    turn: 20 + beat.turn - 1,
                    arc: {
                        id: arc.id,
                        target: base.keyFigures.find(figure => figure.id === 'oligarch')!.name,
                        targetRole: 'Председатель промышленной палаты',
                        flags: [...(variant.requires ?? []), ...(variant.requiresAll ?? [])],
                        done: [],
                        epilogue: null
                    }
                };
                const event = await classicApi.event(prepared);
                const state = startEvent(prepared, event);
                const narration = await classicApi.consequence(state, event.choices[0].id);
                const text = JSON.stringify({
                    event,
                    narration: {
                        ...narration,
                        heard: undefined
                    }
                });
                assert.ok(!/2011|соцсет|интернет|смартфон|скриншот|VPN|на сайте|телефон с фотограф/i.test(text), arc.id + '/' + beat.turn + ': ' + text.match(/2011|соцсет|интернет|смартфон|скриншот|VPN|на сайте|телефон с фотограф/i)?.[0]);
            }
});
test('a new player is not promised closed-country unlocks; earned travel badges remain visible', () => {
    assert.ok(!visibleAchievements({
        achievements: []
    }).some(achievement => achievement.id === 'traveler'));
    assert.ok(visibleAchievements({
        achievements: ['traveler']
    }).some(achievement => achievement.id === 'traveler'));
});
test('harvest procurement follows the actual seasonal dateline rather than appearing in winter', async () => {
    const base = await fresh();
    const card = ALTERNATE_EVENTS.find(event => event.id === 'alt_harvest')!;
    for (let turn = 3; turn < 20; turn++) {
        const state = {
            ...base, turn
        };
        const season = turnDate(state.seed, 1978, turn).season;
        assert.equal(cardAvailable(card, state), season === 'summer' || season === 'autumn', 'turn ' + turn);
    }
});
test('historical daily tables separate releases and leave past legacy tables addressable', () => {
    assert.equal(dailyBoardKey('2026-10-12', '8.0'), 'daily:2026-10-12');
    assert.equal(dailyBoardKey('2026-10-13', '8.0'), 'daily:2026-10-13:v8.0');
    assert.notEqual(dailyBoardKey('2026-10-13', '8.0'), dailyBoardKey('2026-10-13', '8.1'));
});
test('historical casts are unique and the national course has its own electorate', async () => {
    for (let seed = 1; seed <= 64; seed++) {
        const state = await fresh(ALTERNATE_COUNTRY, seed);
        const names = [state.leader.name, ...state.keyFigures.map(figure => figure.name), ...state.advisors.map(advisor => advisor.name)];
        assert.equal(new Set(names).size, names.length, 'cast ' + seed);
    }
    const liberal = createInitialState(ALTERNATE_COUNTRY, 'debut', 'liberal', await classicApi.setup(ALTERNATE_COUNTRY, 'debut', 'liberal', 21), seededRandom(21));
    const national = createInitialState(ALTERNATE_COUNTRY, 'debut', 'nationalist', await classicApi.setup(ALTERNATE_COUNTRY, 'debut', 'nationalist', 21), seededRandom(21));
    assert.ok(national.factions.find(faction => faction.bloc === 'nationalist')!.relation
        > liberal.factions.find(faction => faction.bloc === 'nationalist')!.relation);
});


test('failed attempts do not create evidence; complete evidence is required by later scenes', async () => {
    const base = await fresh();
    const target = base.arc!.target;
    let sawSuccess = false, sawFailure = false;
    for (let seed = 1; seed <= 100 && (!sawSuccess || !sawFailure); seed++) {
        let state = { ...base, seed, turn: 1 };
        state = startEvent(state, await classicApi.event(state));
        const result = resolveTurn(state, 'a', await classicApi.consequence(state, 'a'));
        assert.ok(result.arc!.flags.includes('audit'));
        assert.equal(result.arc!.flags.includes('ok:audit'), result.lastTurn!.success);
        assert.equal(result.arc!.flags.at(-1), 'audit', 'intent remains last for early follow-up letters');
        sawSuccess ||= result.lastTurn!.success;
        sawFailure ||= !result.lastTurn!.success;
    }
    assert.ok(sawSuccess && sawFailure);
    for (const flags of [['audit', 'witness'], ['ok:audit', 'witness'], ['audit', 'ok:witness']]) {
        const state = { ...base, turn: 11, arc: { id: 'alt_contracts', target, targetRole: 'Директор', flags, done: [1, 3, 7], epilogue: null } };
        assert.equal((await classicApi.event(state)).title, 'Счёт по старому договору');
    }
    const proven = { ...base, turn: 11, arc: { ...base.arc!, flags: ['ok:audit', 'ok:witness'], done: [1, 3, 7] } };
    assert.equal((await classicApi.event(proven)).title, 'Подпись под гарантией');
});

test('early dismissal removes the active director; failure at the ending has its own historical verdict', async () => {
    const base = await fresh();
    const original = base.arc!.target;
    let dismissed = false, failedEnding = false;
    for (let seed = 1; seed <= 200 && (!dismissed || !failedEnding); seed++) {
        const prepared = { ...base, seed, turn: 11, arc: { ...base.arc!, flags: ['ok:audit', 'ok:witness'], done: [1, 3, 7] } };
        const state = startEvent(prepared, await classicApi.event(prepared));
        const replaced = resolveTurn(state, 'b', await classicApi.consequence(state, 'b'));
        if (replaced.lastTurn!.success) {
            assert.ok(!replaced.keyFigures.some(figure => figure.name === original));
            assert.ok(replaced.former!.includes(original));
            const ending = await classicApi.event({ ...replaced, turn: 15 });
            assert.equal(ending.title, 'Последний расчёт');
            assert.ok(ending.choices.every(choice => !choice.deal?.replace));
            dismissed = true;
        }
        const endingBase = { ...base, seed, turn: 15, arc: { ...base.arc!, flags: ['ok:case'], done: [1, 3, 7, 12] } };
        const ending = startEvent(endingBase, await classicApi.event(endingBase));
        const resolved = resolveTurn(ending, 'a', await classicApi.consequence(ending, 'a'));
        if (!resolved.lastTurn!.success) {
            assert.match(resolved.arc!.epilogue!, /суд не успел/);
            assert.ok(resolved.keyFigures.some(figure => figure.name === original));
            failedEnding = true;
        }
    }
    assert.ok(dismissed && failedEnding);
});
