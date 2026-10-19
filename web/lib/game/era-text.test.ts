import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { ALTERNATE_COUNTRY, LEGACY_COUNTRIES, campaignText, eraText } from './alternate-world.ts';

test('era vocabulary uses complete phrases and explicit cases instead of chopping Russian words', () => {
    const examples = new Map([
        ['Закрытая выставка разошлась по интернету', 'Закрытая выставка разошлась по редакциям'],
        ['Губернатор говорит по видеосвязи', 'Губернатор говорит по телефону'],
        ['Пригласить блогера; поговорить с блогером', 'Пригласить обозревателя; поговорить с обозревателем'],
        ['Блогер опубликовал договор', 'Обозреватель опубликовал договор'],
        ['пост вице-премьера', 'пост вице-премьера'],
        ['Пригласить послов ЕС', 'Пригласить послов Торгового союза'],
        ['Послы ЕС пришли', 'Послы Торгового союза пришли'],
        ['Ваш партнёр в ЕС', 'Ваш партнёр в Торговом союзе'],
        ['ЕС выступает гарантом', 'Торговый союз выступает гарантом'],
        ['блогер-миллионник', 'популярный обозреватель'],
    ]);
    for (const [source, expected] of examples) assert.equal(eraText(source), expected, source);
    // Unknown inflections/contexts are left for authored text, not guessed into a wrong case.
    for (const word of ['видеосвязи', 'кибервидео', 'дроновый', 'онлайн-касса', '20110', 'РЕСУРСЫ', 'решение ЕС']) {
        assert.equal(eraText(word), word);
    }
    assert.equal(eraText('«интернет», (блогера)!'), '«радио», (обозревателя)!');
});

test('all static content is adaptable without replacements inside corpus words', async () => {
    const texts = new Set<string>();
    const visited = new Set<object>();
    function collect(value: unknown) {
        if (typeof value === 'string') texts.add(value);
        else if (value && typeof value === 'object' && !visited.has(value)) {
            visited.add(value);
            for (const item of Object.values(value)) collect(item);
        }
    }
    const directory = new URL('../content/', import.meta.url);
    for (const file of readdirSync(directory).filter(file => file.endsWith('.ts') && !file.endsWith('.test.ts'))) {
        collect(await import(new URL(file, directory).href));
    }
    assert.ok(texts.size > 1000, 'cover the exported corpus, including archived templates as a superset');
    const tokens = new Set<string>();
    for (const text of texts) {
        const adapted = eraText(text);
        assert.doesNotMatch(adapted, /радиоу|обозревательа|киноплёнкасвяз|послов Торговый союз/iu, text);
        for (const match of text.matchAll(/[\p{L}\p{N}_-]+/gu)) tokens.add(match[0]);
        for (const country of LEGACY_COUNTRIES) assert.equal(campaignText(text, country), text);
    }
    for (const token of tokens) {
        const embedded = `Ъ${token}Ъ`;
        assert.equal(eraText(embedded), embedded, `never replace part of a word: ${token}`);
    }
    assert.equal(campaignText('по интернету', ALTERNATE_COUNTRY), 'по редакциям');
});
