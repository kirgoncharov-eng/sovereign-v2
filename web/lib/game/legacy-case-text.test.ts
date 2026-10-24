import test from 'node:test';
import assert from 'node:assert/strict';
import { ALTERNATE_EVENTS } from '../content/alternate-history.ts';
import { HISTORICAL_DELAYED_LABELS, HISTORICAL_ECHOES } from '../content/historical-echoes.ts';
import { TERM_MEMORY } from '../content/term-finale.ts';
import { parseSave } from '../client/save.ts';
import { classicApi } from './classic.ts';
import { ALTERNATE_COUNTRY } from './alternate-world.ts';
import { SAVE_VERSION } from './data.ts';
import { createInitialState, seededRandom, startEvent } from './engine.ts';
import { LEGACY_CHOICE_TEXT, migrateLegacyCaseText } from './legacy-case-text.ts';
import type { GameState } from './types.ts';

const choiceTexts = new Set(ALTERNATE_EVENTS.flatMap(card => card.choices.map(choice => choice.text)));

async function fresh(country = ALTERNATE_COUNTRY, seed = 3): Promise<GameState> {
  const intro = await classicApi.setup(country, 'debut', 'pragmatist', seed);
  return createInitialState(country, 'debut', 'pragmatist', intro, seededRandom(seed));
}

const reload = (state: GameState) => parseSave(JSON.stringify({ version: SAVE_VERSION, screen: 'game', state }))!.state;

test('прежние тексты вариантов исчезли из дел, новые — есть в делах', () => {
  for (const [old, current] of Object.entries(LEGACY_CHOICE_TEXT)) {
    assert.equal(choiceTexts.has(old), false, `прежний текст остался в деле: ${old}`);
    assert.equal(choiceTexts.has(current), true, `нового текста нет в делах: ${current}`);
  }
});

test('эхо и подписи последствий привязаны только к нынешним вариантам', () => {
  for (const card of ALTERNATE_EVENTS) {
    for (const text of Object.keys(HISTORICAL_ECHOES[card.id] ?? {})) {
      assert.ok(card.choices.some(choice => choice.text === text), `${card.id}: эхо для «${text}»`);
    }
  }
  for (const text of Object.keys(HISTORICAL_DELAYED_LABELS)) assert.ok(choiceTexts.has(text), `подпись для «${text}»`);
});

test('начатая партия 1978 года с прежними текстами загружается с нынешними', async () => {
  const district = ALTERNATE_EVENTS.find(card => card.id === 'alt_district')!;
  const rail = ALTERNATE_EVENTS.find(card => card.id === 'alt_rail')!;
  const standards = ALTERNATE_EVENTS.find(card => card.id === 'alt_standards')!;
  const base = await fresh();
  const event = await classicApi.event(base);
  const legacyEvent = { ...event, choices: event.choices.map((choice, index) => (index === 0
    ? { ...choice, text: 'Оплатить испытательную линию' } : choice)) };
  const saved: GameState = {
    ...startEvent(base, legacyEvent),
    history: [
      { year: 1980, title: rail.title, choice: 'Пропустить зерно, сдвинуть остальные составы', headline: '', historianNote: '', success: true },
      { year: 1981, title: district.title, choice: 'Передать деньги районному совету', headline: '', historianNote: '', success: false },
    ],
    pending: [{ id: 'p1', due: 9, label: 'Счета перевозчиков за простой', res: { economy: -2 },
      source: 'Пропустить зерно, сдвинуть остальные составы', event: rail.title }],
  };
  const loaded = reload(saved);
  assert.deepEqual(loaded.history.map(entry => entry.choice), [rail.choices[0].text, district.choices[2].text]);
  assert.equal(loaded.pending[0].source, rail.choices[0].text);
  assert.equal(loaded.currentEvent!.choices[0].text, standards.choices[0].text);
  // Память срока находит прежнюю подпись по новому тексту.
  assert.ok(TERM_MEMORY.alt_district[loaded.history[1].choice].failed);
  // Повторная загрузка ничего не меняет.
  assert.equal(JSON.stringify(reload(loaded)), JSON.stringify(loaded));
});

test('архивные страны и нынешние партии не меняются', async () => {
  const current = await fresh();
  assert.equal(migrateLegacyCaseText(current), current);
  const archive = await fresh('Беларусь', 5);
  const withOldText = { ...archive, history: [{ year: 2000, title: 'Указ', choice: 'Передать деньги районному совету',
    headline: '', historianNote: '' }] };
  assert.equal(migrateLegacyCaseText(withOldText), withOldText);
});
