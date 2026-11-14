import assert from 'node:assert/strict';
import { test } from 'node:test';
import { callEndings } from './call-price.ts';
import { firstStep, newTerm, nextCase, programOf, signCall, signOption, signPress, startFromSeed, takeOffice } from './chronicle.ts';
import { APPROACHES, CALL_ENDINGS } from '../content/calls.ts';
import { HISTORICAL_CALL_TOPICS } from '../content/historical-calls.ts';
import { RESOURCE_TITLE } from '../content/resource-names.ts';
import { approachWorks, callChoice } from '../game/classic.ts';
import { RESOURCE_KEYS } from '../game/data.ts';
import type { DifficultyId, GameState } from '../game/types.ts';

/** Обычные звонки первого срока: состояние с делом-звонком на столе. */
async function calls(seed: number, diff: DifficultyId): Promise<GameState[]> {
  const candidate = await newTerm(startFromSeed(seed, diff));
  let state = takeOffice(candidate, programOf(candidate).suggested);
  const found: GameState[] = [];
  while (!state.ended && state.turn < 20) {
    state = await nextCase(state);
    const step = firstStep(state);
    if (step.kind === 'call-approach') found.push(state);
    if (step.kind === 'press') state = await signPress(state, state.currentEvent!.press!.questions.map(() => 0));
    else if (step.kind === 'call-approach') state = await signCall(state, 'numbers', 'later');
    else state = await signOption(state, step.options[0].key);
  }
  return found;
}

// В первом сроке обычный звонок — один, на шестнадцатом квартале, и не в каждой партии: собираем три таких партии.
let found: Promise<GameState[]> | null = null;
const sample = () => found ??= (async () => {
  const states: GameState[] = [];
  for (const [seed, diff] of [[1, 'debut'], [3, 'debut'], [7, 'debut'], [11, 'debut'], [19, 'debut'], [21, 'debut'], [33, 'debut'], [40, 'debut']] as const) {
    states.push(...await calls(seed, diff));
    if (states.length >= 3) break;
  }
  return states;
})();

test('цена окончания разговора совпадает с тем, что спишет подпись, при любом тоне (#310, C09)', async () => {
  let checked = 0, subject = 0, worked = 0, failed = 0;
  for (const state of await sample()) {
    {
      const call = state.currentEvent!.call!;
      const figure = state.keyFigures.find(person => person.id === call.figure)!;
      const camp = state.factions.find(group => group.id === figure.faction)!;
      for (const approach of APPROACHES) {
        if (approachWorks(call.trait, approach.id)) worked++; else failed++;
        const endings = callEndings(state, approach.id);
        assert.deepEqual(endings.map(ending => ending.id), CALL_ENDINGS.map(ending => ending.id));
        for (const ending of endings) {
          checked++;
          const deal = callChoice(state, approach.id, ending.id).deal!;
          const said = ending.price.join(' · ');
          for (const key of RESOURCE_KEYS) {
            const value = Math.round(deal.res?.[key] ?? 0);
            const text = `${RESOURCE_TITLE[key]} ${value > 0 ? '+' : '−'}${Math.abs(value)}`;
            assert.equal(said.includes(text), value !== 0, `${approach.id}/${ending.id}: ${text} в «${said}»`);
          }
          assert.equal(said.includes(`${figure.name}: отношение`), !!deal.figureRel);
          assert.equal(said.includes(`«${camp.name}»`), !!deal.factionRel?.[camp.id]);
          assert.equal(ending.later !== null, ending.id === 'later');
          if (ending.later) assert.match(ending.later, /^Через 2 квартала обещание напомнит о себе: Влияние −2$/);
          assert.ok(ending.price.length > 0);
        }
        // Предметный разговор называет соглашение по существу; остальные подписи прежние.
        const topic = Object.values(HISTORICAL_CALL_TOPICS).find(entry => entry!.demand === call.demand);
        const deal = endings.find(ending => ending.id === 'deal')!;
        if (topic && state.turn === 16) { subject++; assert.equal(deal.text, `Согласовать ${topic.subject}`); }
        else assert.equal(deal.text, CALL_ENDINGS[0].text);
        assert.equal(endings[1].text, CALL_ENDINGS[1].text);
      }
    }
  }
  assert.ok(checked >= 36 && subject > 0 && worked > 0 && failed > 0, `проверено ${checked}, предметных ${subject}, удачных тонов ${worked}, неудачных ${failed}`);
});

test('без звонка на столе окончаний нет; просмотр цены не меняет состояние', async () => {
  const [state] = await sample();
  const before = JSON.stringify(state);
  callEndings(state, 'numbers');
  assert.equal(JSON.stringify(state), before);
  assert.deepEqual(callEndings({ ...state, currentEvent: null }, 'numbers'), []);
});
