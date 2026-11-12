import assert from 'node:assert/strict';
import { test } from 'node:test';
import { promiseWarning } from './promise-warning.ts';
import { firstStep, newTerm, nextCase, programOf, signCall, signOption, signPress, startFromSeed, takeOffice } from './chronicle.ts';
import { resolutionOptions } from './advisor-outlook.ts';
import { ALTERNATE_COUNTRY } from '../game/alternate-world.ts';
import type { Choice, GameState } from '../game/types.ts';

const choice = (tags: string[], extra: Partial<Choice> = {}) => ({ id: 'a', text: 'Вариант', tags, ...extra }) as unknown as Choice;
const game = (promises: GameState['promises']) => ({ country: ALTERNATE_COUNTRY, promises });

test('вариант с запретным тегом нарушает обещание «никогда», нужный тег делает шаг', () => {
  const state = game([
    { id: 'no_batons', progress: 0, status: 'open' }, { id: 'thieves', progress: 1, status: 'open' }, { id: 'free_press', progress: 0, status: 'broken' },
  ]);
  assert.deepEqual(promiseWarning(state, choice(['repress'])), { breaks: ['Никаких дубинок'], advances: [] });
  assert.deepEqual(promiseWarning(state, choice(['anticorruption'])), { breaks: [], advances: [{ title: 'Посадить воров', progress: 2, count: 3 }] });
  // Закрытое обещание и посторонний тег подсказки не дают; чистая сделка обязательств не несёт.
  assert.deepEqual(promiseWarning(state, choice(['propaganda', 'social'])), { breaks: [], advances: [] });
  assert.deepEqual(promiseWarning(state, choice(['repress'], { deal: { pure: true } } as Partial<Choice>)), { breaks: [], advances: [] });
  assert.deepEqual(promiseWarning({ country: ALTERNATE_COUNTRY, promises: undefined }, choice(['repress'])), { breaks: [], advances: [] });
});

test('название обещания — словами кампании 1978 года', () => {
  const warning = promiseWarning(game([{ id: 'no_deals', progress: 0, status: 'open' }]), choice(['elite_deal']));
  assert.deepEqual(warning.breaks, ['Никаких сделок с директорами концернов']);
});

test('предупреждение совпадает с тем, что делает движок: нарушенное до срока обещание было названо до подписи', async () => {
  let checked = 0;
  for (const [seed, pick] of [[7, 0], [21, 1], [3, 2]] as const) {
    const candidate = await newTerm(startFromSeed(seed, 'debut'));
    let state = takeOffice(candidate, programOf(candidate).suggested);
    while (!state.ended && state.turn < 19) {
      state = await nextCase(state);
      const before = state, step = firstStep(state);
      if (step.kind === 'press') { state = await signPress(state, state.currentEvent!.press!.questions.map(() => 0)); continue; }
      if (step.kind === 'call-approach') { state = await signCall(state, 'numbers', 'deal'); continue; }
      const option = step.options[Math.min(pick, step.options.length - 1)];
      const signed = (resolutionOptions(before) ?? before.currentEvent!.choices).find(entry => entry.id === option.key);
      state = await signOption(state, option.key);
      if (!signed || before.currentEvent!.budget) continue;
      const warned = promiseWarning(before, signed).breaks.length;
      const broken = (state.promises ?? []).filter(promise => promise.status === 'broken'
        && before.promises?.find(old => old.id === promise.id)?.status === 'open').length;
      assert.equal(broken, warned, `зерно ${seed}, ход ${state.turn}: «${signed.text}»`);
      checked += warned;
    }
  }
  assert.ok(checked > 0, 'в замере есть хотя бы одно нарушенное подписью обещание');
});
