import assert from 'node:assert/strict';
import { test } from 'node:test';
import { advisorDialogue, fillAdvisorSpeech } from './advisor-dialogue.ts';
import { advisorOutlook } from './advisor-outlook.ts';
import { newTerm, nextCase, startFromSeed } from './chronicle.ts';
import type { AdvisorDialogue } from '../content/advisor-dialogue.ts';

test('без вычитанного текста нет шаблонных речей; неизвестный слот не попадает к игроку', async () => {
  const state = await nextCase(await newTerm(startFromSeed(7)));
  assert.deepEqual(advisorDialogue(state, state.currentEvent!.choices[0]), []);
  assert.equal(fillAdvisorSpeech('Казна заплатит {unknown}.', {}), null);
  assert.equal(fillAdvisorSpeech('Заплатим {economy}.', { economy: '−7' }), 'Заплатим −7.');
});

test('авторская речь выбирается по делу, варианту, человеку и тону; число из того же доклада', async () => {
  const original = await nextCase(await newTerm(startFromSeed(7)));
  const data: AdvisorDialogue = { [original.currentEvent!.card!]: { 0: {
    economist: { weak: 'Банк разберётся.', strong: '{target}: резерв заплатит {success.economy}.',
      lobby: { business: 'Палата ждёт этот заказ.' } },
    strategist: { strong: 'Нужен отдельный счёт.', challenge: { after: 'economist', text: 'А банк?' } },
  } } };
  for (const skill of [1, 3] as const) {
    const state = { ...original, advisors: original.advisors.map(advisor => ({ ...advisor, skill: advisor.id === 'economist' ? skill : 3, loyalty: 80 })) };
    const choice = state.currentEvent!.choices[0], lines = advisorDialogue(state, choice, data);
    assert.equal(lines[0].text, skill === 1 ? 'Банк разберётся.' : `${state.arc!.target}: резерв заплатит ${advisorOutlook(state, choice)!.success.resources.economy.text}.`);
    assert.equal(lines[1].correction, skill === 1 ? 'А банк?' : undefined);
    assert.deepEqual(advisorDialogue(state, state.currentEvent!.choices[1], data), []);
    const disloyal = { ...state, advisors: state.advisors.map(advisor => ({ ...advisor, loyalty: 0 })) };
    assert.equal(advisorDialogue(disloyal, choice, data)[0].text, 'Палата ждёт этот заказ.');
  }
});
