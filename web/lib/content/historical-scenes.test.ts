import test from 'node:test';
import assert from 'node:assert/strict';
import { HISTORICAL_SCENES, historicalSceneText } from './historical-scenes.ts';
import { EVENT_EXT } from './events-ext.ts';
import { INTERCUTS } from './roles.ts';
import { CALL_DEMANDS } from './calls.ts';
import { PRESS_QUESTIONS } from './press.ts';
import { ARCS } from './arcs.ts';
import { ALTERNATE_COUNTRY, LEGACY_COUNTRIES, campaignCopy } from '../game/alternate-world.ts';
import { classicApi, fill, pressChoice } from '../game/classic.ts';
import { createInitialState, seededRandom, startEvent } from '../game/engine.ts';

const sources = [
  ...Object.values(EVENT_EXT),
  ...Object.values(INTERCUTS).flatMap(group => [...group.warm, ...group.cold]),
  ...Object.values(CALL_DEMANDS).flatMap(demands => demands.flatMap(demand =>
    typeof demand === 'string' ? [demand] : [demand.text, demand.otherwise])),
  ...PRESS_QUESTIONS.flatMap(question => [question.text, ...question.answers.map(answer => answer.text)]),
  ...ARCS.flatMap(arc => arc.beats.flatMap(beat => beat.variants.flatMap(variant => [variant.title, variant.description,
    ...variant.choices.flatMap(choice => [choice.ok, choice.fail ?? ''])]))),
];
const slots = (text: string) => [...text.matchAll(/\{[^{}]+\}/g)].map(match => match[0]).sort();
async function fresh(country = ALTERNATE_COUNTRY) {
  return createInitialState(country, 'debut', 'pragmatist',
    await classicApi.setup(country, 'debut', 'pragmatist', 21), seededRandom(21));
}

test('scene keys match canonical content and preserve slots and surrounding chapters', () => {
  assert.equal(HISTORICAL_SCENES.length, 17);
  assert.equal(new Set(HISTORICAL_SCENES.map(scene => scene.source)).size, HISTORICAL_SCENES.length);
  for (const scene of HISTORICAL_SCENES) {
    assert.equal(sources.filter(source => source.includes(scene.source)).length, 1, scene.id);
    assert.deepEqual(slots(scene.replacement), slots(scene.source), scene.id);
    assert.equal(historicalSceneText(`Дежурный кабинет\n\n${scene.source}\n\nСледующий доклад.`),
      `Дежурный кабинет\n\n${scene.replacement}\n\nСледующий доклад.`);
    assert.equal(historicalSceneText(scene.replacement), scene.replacement, scene.id);
  }
  const unrelated = 'Телефон звонит. На фотографии генерал. «Газету закрыли». Вечером будет прямой эфир.';
  assert.equal(historicalSceneText(unrelated), unrelated);
});

test('historical fill stages intercuts before substituting the current speaker', async () => {
  const state = await fresh();
  const scene = HISTORICAL_SCENES.find(scene => scene.id === 'intercut:cold')!;
  const result = fill(`За дверью кабинета ${scene.source}`, state, { name: 'Нина Ладин', role: 'редактор' });
  assert.match(result, /^За дверью кабинета Нина Ладин, редактор, отправляет редакциям заявление/);
  assert.doesNotMatch(result, /\{|эфир из машины/);
  assert.equal(campaignCopy(result, state.country), result);
});

test('six legacy countries preserve original scenes through fill and recursive adaptation', async () => {
  for (const country of LEGACY_COUNTRIES) {
    const state = await fresh(country);
    for (const scene of HISTORICAL_SCENES) {
      assert.equal(campaignCopy(scene.source, country), scene.source, `${country}: ${scene.id}`);
      const expected = scene.source.replaceAll('{name}', 'Антон Ладин').replaceAll('{role}', 'редактор');
      assert.equal(fill(scene.source, state, { name: 'Антон Ладин', role: 'редактор' }), expected);
    }
  }
});

test('historical media question and replies stay consistent while saved heard reports remain intact', () => {
  const media = PRESS_QUESTIONS.find(question => question.id === 'media')!;
  const original = structuredClone(media);
  const adapted = campaignCopy(media, ALTERNATE_COUNTRY);
  assert.match(adapted.text, /проверкой типографии/);
  assert.match(adapted.answers[0].text, /За критику не закрывать/);
  assert.match(adapted.answers[1].text, /Найдут нарушения/);
  assert.match(adapted.answers[2].text, /Основания проверки/);
  assert.ok(adapted.answers.every(answer => answer.text.length <= 70), 'press quotes remain newspaper headlines');
  assert.deepEqual(adapted.answers.map(({ tone, res, rel }) => ({ tone, res, rel })),
    media.answers.map(({ tone, res, rel }) => ({ tone, res, rel })));
  assert.deepEqual(media, original);
  assert.deepEqual(campaignCopy(adapted, ALTERNATE_COUNTRY), adapted);
  const saved = { heard: [media.text], nested: { text: media.text }, economy: 12 };
  const copy = campaignCopy(saved, ALTERNATE_COUNTRY);
  assert.deepEqual(copy.heard, saved.heard);
  assert.equal(copy.nested.text, adapted.text);
  assert.equal(copy.economy, saved.economy);
});

test('all press tones keep their mechanical price after restaging', async () => {
  const base = await fresh();
  const state = startEvent(base, await classicApi.event(base));
  const question = PRESS_QUESTIONS.find(question => question.id === 'media')!;
  for (const tone of [0, 1, 2]) {
    const original = { ...state, currentEvent: { ...state.currentEvent!, press: { outlet: '', questions: [question] } } };
    const adapted = { ...original, currentEvent: { ...original.currentEvent,
      press: campaignCopy(original.currentEvent.press, ALTERNATE_COUNTRY) } };
    const before = pressChoice(original, [tone]);
    const after = pressChoice(adapted, [tone]);
    assert.deepEqual(after.deal, before.deal);
    assert.deepEqual(after.tags, before.tags);
    assert.equal(after.resolvesCrisis, before.resolvesCrisis);
    assert.notEqual(after.scene, before.scene);
  }
});
