import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eraText } from '../game/alternate-world.ts';
import type { Bloc, ResourceKey } from '../game/types.ts';
import type { EventCard } from './events.ts';
import { PILOT_ODDITIES, PILOT_SWANS, PILOT_TAILS } from './black-swans.ts';

const RESOURCES: ResourceKey[] = ['politicalCapital', 'economy', 'military', 'externalReputation', 'internalLegitimacy', 'personalResource'];
const BLOCS: Bloc[] = ['security', 'business', 'church', 'liberal', 'west', 'russia', 'nationalist', 'regional', 'ruling'];
// Хвосты, текст которых живёт в задаче внешнего курса #216, а не в пилоте.
const LADDER_TAILS = new Set(['swan_jet_ladder', 'swan_sinkhole_export']);

const cards = (): EventCard[] => [
    ...PILOT_SWANS.map(swan => swan.card),
    ...PILOT_TAILS.map(tail => tail.card),
    ...PILOT_ODDITIES.flatMap(oddity => (oddity.returns ? [oddity.returns.card] : [])),
];

function assertEffect(effect: Partial<Record<string, number>>, where: string, keys: readonly string[]) {
    for (const [key, value] of Object.entries(effect)) {
        assert.ok(keys.includes(key), `${where}: неизвестный ключ ${key}`);
        assert.ok(Number.isInteger(value) && Math.abs(value!) <= 10, `${where}: ${key}=${value} вне шкалы ±10`);
    }
}

test('пилот: два лебедя — самолёт и улица (решение Кирилла 7.11)', () => {
    assert.deepEqual(PILOT_SWANS.map(swan => swan.id), ['swan_jet', 'swan_sinkhole']);
});

test('у лебедя три донесения разных источников, две правды и разоблачение на каждый вариант', () => {
    for (const swan of PILOT_SWANS) {
        assert.equal(swan.card.id, swan.id);
        assert.deepEqual(swan.dispatches.map(dispatch => dispatch.kind).sort(), ['local', 'office', 'press']);
        assert.equal(swan.truths.length, 2);
        assert.equal(swan.card.choices.length, 3);
        assert.equal(swan.reveal.length, swan.card.choices.length);
        swan.reveal.forEach((pair, index) => {
            assert.equal(pair.length, 2, `${swan.id}: вариант ${index + 1}`);
            assert.notEqual(pair[0].text, pair[1].text, `${swan.id}: правда А и Б выглядят одинаково`);
            pair.forEach((reveal, truth) => {
                assertEffect(reveal.res, `${swan.id}/${index}/${truth}`, RESOURCES);
                assertEffect(reveal.stance ?? {}, `${swan.id}/${index}/${truth}`, BLOCS);
            });
        });
    }
});

test('цена правды различает решения: у каждой правды есть и лучший, и худший вариант', () => {
    const total = (res: Partial<Record<ResourceKey, number>>) => Object.values(res).reduce((sum, value) => sum + (value ?? 0), 0);
    for (const swan of PILOT_SWANS) {
        for (const truth of [0, 1]) {
            const sums = swan.reveal.map(pair => total(pair[truth].res));
            assert.ok(Math.max(...sums) > Math.min(...sums), `${swan.id}: при правде ${truth ? 'Б' : 'А'} все решения стоят одинаково`);
        }
        // Нет варианта, лучшего при обеих правдах сразу: иначе туман ничего не решает.
        const best = [0, 1].map(truth => {
            const sums = swan.reveal.map(pair => total(pair[truth].res));
            return sums.indexOf(Math.max(...sums));
        });
        assert.notEqual(best[0], best[1], `${swan.id}: вариант ${best[0] + 1} лучший при любой правде`);
    }
});

test('каждый хвост ведёт к делу пилота или к ступени внешнего курса #216', () => {
    const tails = new Set(PILOT_TAILS.map(tail => tail.flag));
    const raised = PILOT_SWANS.flatMap(swan => swan.reveal.flat().flatMap(reveal => (reveal.tail ? [reveal.tail] : [])));
    for (const flag of raised) assert.ok(tails.has(flag) || LADDER_TAILS.has(flag), flag);
    for (const tail of PILOT_TAILS) {
        assert.ok(raised.includes(tail.flag), `${tail.flag}: хвост ни из какого исхода`);
        assert.equal(tail.card.id, tail.flag);
    }
    // У каждого лебедя хотя бы один исход меняет дальнейшую партию, а не только опоры.
    for (const swan of PILOT_SWANS) assert.ok(swan.reveal.flat().some(reveal => reveal.tail), swan.id);
});

test('карточки полные: подсказка, сцена, провал, два заголовка, цена в пределах шкалы', () => {
    for (const card of cards()) {
        assert.ok(card.title && card.source && card.description.length > 120, card.id);
        assert.equal(card.choices.length, 3, card.id);
        for (const choice of card.choices) {
            assert.ok(choice.text && choice.hint && choice.scene && choice.fail, `${card.id}: ${choice.text}`);
            assert.equal(choice.head?.length, 2, `${card.id}: ${choice.text}`);
            assertEffect(choice.policyEffect ?? {}, `${card.id}: ${choice.text}`, RESOURCES);
            assertEffect(choice.stance ?? {}, `${card.id}: ${choice.text}`, BLOCS);
            for (const key of Object.keys(choice.costReasons ?? {})) {
                assert.ok((choice.policyEffect?.[key as ResourceKey] ?? 0) < 0, `${card.id}: причина цены «${key}» без цены`);
            }
        }
        assert.equal(new Set(card.choices.map(choice => choice.text)).size, 3, card.id);
    }
});

test('странности: шесть пилотных, возвращается делом каждая третья', () => {
    assert.deepEqual(PILOT_ODDITIES.map(oddity => oddity.id),
        ['odd_double', 'odd_numbers', 'odd_decree', 'odd_wolves', 'odd_bull', 'odd_bolide']);
    const returning = PILOT_ODDITIES.filter(oddity => oddity.returns).length / PILOT_ODDITIES.length;
    assert.ok(returning >= 0.25 && returning <= 0.4, `возвращается ${returning}`);
    for (const oddity of PILOT_ODDITIES) {
        assert.ok(!(oddity.returns && oddity.answer), `${oddity.id}: и дело, и разгадка`);
        const delay = oddity.returns?.afterTurns ?? oddity.answer?.afterTurns;
        if (delay) assert.ok(delay[0] >= 2 && delay[1] <= 5 && delay[0] <= delay[1], oddity.id);
    }
});

test('весь текст пилота — язык 1978 года, без слотов и с заглавной', () => {
    const texts = [
        ...PILOT_SWANS.flatMap(swan => [...swan.dispatches.flatMap(dispatch => [dispatch.from, dispatch.text]),
            ...swan.reveal.flat().map(reveal => reveal.text)]),
        ...cards().flatMap(card => [card.title, card.description,
            ...card.choices.flatMap(choice => [choice.text, choice.hint, choice.scene!, choice.fail!, ...choice.head!])]),
        ...PILOT_ODDITIES.flatMap(oddity => [oddity.text, ...(oddity.answer ? [oddity.answer.text] : [])]),
    ];
    for (const text of texts) {
        // Словарь эпохи ничего не меняет: значит, анахронизмов, которые он знает, в тексте нет.
        assert.equal(eraText(text), text, text);
        assert.doesNotMatch(text, /\{/, text);
        assert.doesNotMatch(text, /\s{2,}/, text);
    }
    for (const card of cards()) for (const choice of card.choices) assert.match(choice.text, /^[А-ЯЁ]/, choice.text);
});
