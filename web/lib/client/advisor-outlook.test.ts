import assert from 'node:assert/strict';
import { test } from 'node:test';
import { advisorOutlook, advisorSigningState, estimateDelta, optimisticCase, reviewAdvisorOutlook, sourceFor, resolutionOptions } from './advisor-outlook.ts';
import { choiceOutcomes } from './choice-outcomes.ts';
import { newTerm, nextCase, signChoice, startFromSeed } from './chronicle.ts';
import { LEGACY_COUNTRIES } from '../game/alternate-world.ts';
import { RESOURCE_KEYS, SAVE_VERSION } from '../game/data.ts';
import { planTurn } from '../game/engine.ts';
import { parseSave } from './save.ts';
import type { GameState } from '../game/types.ts';

const fixture = async () => nextCase(await newTerm(startFromSeed(7)));
const team = (state: GameState, skill: 1 | 2 | 3): GameState => ({ ...state, advisors: state.advisors.map(advisor => ({ ...advisor, skill })) });

test('Дебют: направление, сила, точные числа; личную цену знает любая команда', async () => {
  const base = await fixture();
  const choice = base.currentEvent!.choices[0];
  for (const skill of [1, 2, 3] as const) {
    const state = team({ ...base, diff: 'debut' }, skill), forecast = advisorOutlook(state, choice)!;
    const raw = choiceOutcomes(advisorSigningState(state), choice)!;
    for (const key of RESOURCE_KEYS) {
      const estimate = forecast.success.resources[key];
      if (key === 'personalResource' || skill === 3) assert.equal(estimate.value, raw.success.resources[key]);
      else if (estimate.value) assert.match(estimate.text, skill === 1 ? /^[▲▼]$/ : /^(▲{1,3}|▼{1,3})$/);
    }
    assert.equal(forecast.failureOmitted, skill === 1);
    assert.equal(forecast.risk.text.endsWith('%'), skill === 3);
    assert.ok(forecast.people.proponent && forecast.people.critic);
  }
});

test('границы силы 1–3 / 4–7 / 8+ и «?» без специалиста', async () => {
  const state = team({ ...await fixture(), diff: 'coalition' }, 2), source = sourceFor(state, 'economist');
  for (const [n, text] of [[1, '▲'], [3, '▲'], [4, '▲▲'], [7, '▲▲'], [8, '▲▲▲'], [-8, '▼▼▼']] as const)
    assert.equal(estimateDelta(state, source, n).text, text);
  assert.equal(estimateDelta(state, { ...source, skill: 0 }, -8).text, '?');
});

test('Кризис/Руины: один стабильный оптимистический доклад на дело, без смены знака и зависимости от лояльности', async () => {
  const base = await fixture();
  for (const diff of ['crisis', 'ruins'] as const) for (const skill of [1, 2, 3] as const) {
    let wrong = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const state = team({ ...base, diff, seed }, skill), source = sourceFor(state, 'economist');
      const before = structuredClone(state);
      const large = estimateDelta(state, source, -12), small = estimateDelta(state, source, -3);
      assert.equal(small.text, '−3');
      assert.ok(large.value < 0 && large.value >= -12);
      assert.equal(estimateDelta(state, source, 12).value, 12);
      assert.equal(estimateDelta(state, source, -12, true).value, -12);
      wrong += Number(large.value !== -12);
      const forecast = advisorOutlook(state, state.currentEvent!.choices[0]);
      assert.deepEqual(forecast, advisorOutlook(JSON.parse(JSON.stringify(state)), state.currentEvent!.choices[0]));
      const disloyal = { ...state, advisors: state.advisors.map(advisor => ({ ...advisor, loyalty: 0 })) };
      // Саботаж меняет настоящий шанс, но при одинаковой исходной величине прогноз не зависит от лояльности.
      assert.equal(optimisticCase(state, source), optimisticCase(disloyal, sourceFor(disloyal, 'economist')));
      assert.deepEqual(state, before);
    }
    assert.ok(skill === 3 ? wrong === 0 : skill === 1 ? wrong > 65 && wrong < 135 : wrong > 25 && wrong < 80, `${diff}/${skill}: ${wrong}`);
  }
});

test('договор и его срок точны; слабый не прячет будущую договорную цену', async () => {
  const state = team(await fixture(), 1), choice = state.currentEvent!.choices[1];
  const forecast = advisorOutlook(state, choice)!;
  assert.equal(forecast.later.at(-1)!.resources.economy!.value, choice.deal!.later!.res.economy);
  assert.match(forecast.later.at(-1)!.resources.economy!.text, /^[−+]\d+$/);
  assert.equal(forecast.later.at(-1)!.due, state.turn + 1 + choice.deal!.later!.turns);
});

test('экран и подпись рассчитывают одну ветвь; ведомость проверяет резолюцию отдельно от фона и переживает reload', async () => {
  const base = team({ ...await fixture(), diff: 'crisis' }, 3), ready = advisorSigningState(base);
  const choice = ready.currentEvent!.choices[0], plan = planTurn(ready, choice.id);
  const expected = advisorOutlook(base, choice)!;
  assert.equal(expected.risk.value, Math.round((1 - plan.chance) * 100));
  const report = reviewAdvisorOutlook(ready, choice, plan.success)!;
  assert.ok(report.lines.length > 1);
  assert.ok(report.lines.slice(1).every(line => line.endsWith('— точно.')));
  const after = await signChoice(base, choice.id);
  assert.deepEqual(after.lastTurn!.forecasts, report.lines);
  for (const news of report.news) {
    const old = base.advisors.find(advisor => advisor.id === news.id)!;
    const person = after.advisors.find(advisor => advisor.id === news.id)!;
    assert.equal(person.record!.right, (old.record?.right ?? 0) + news.right);
  }
  const restored = parseSave(JSON.stringify({version:SAVE_VERSION, screen:'game', state:after}))!;
  assert.deepEqual(restored.state.lastTurn!.forecasts, report.lines);
  assert.deepEqual(restored.state.advisors, after.advisors);
});

test('ошибку слабого видно в ведомости; исполнение не выдаёт ошибочный вердикт о вероятности', async () => {
  let base = team({ ...await fixture(), diff: 'crisis' }, 1);
  while (!optimisticCase(base, sourceFor(base, 'economist'))) base = { ...base, seed: base.seed + 1 };
  const choice = { ...base.currentEvent!.choices[0], policyEffect: { economy: -12 } };
  const state = { ...base, currentEvent: { ...base.currentEvent!, choices: [choice, ...base.currentEvent!.choices.slice(1)] } };
  const review = reviewAdvisorOutlook(state, choice, true)!;
  assert.ok(review.lines.some(line => /Экономика/.test(line) && /промах/.test(line)));
  assert.ok(review.news.some(item => item.id === 'economist' && item.wrong > 0));
  assert.ok(review.lines.every(line => !/Риск/.test(line)));
});

test('архив/Daily без новой оценки и аудита; отдельное предложение старого совета доступно', async () => {
  const state = await fixture(), choice = state.currentEvent!.choices[0];
  for (const country of LEGACY_COUNTRIES) {
    const archive = { ...state, country };
    assert.equal(advisorOutlook(archive, choice), null);
    assert.equal(reviewAdvisorOutlook(archive, choice, true), null);
    assert.equal(advisorSigningState(archive), archive);
  }
  const daily = { ...state, daily: { id: 'test' } } as unknown as GameState;
  assert.equal(advisorOutlook(daily, choice), null);
  assert.equal(advisorSigningState(daily), daily);
  const proposal = { ...choice, id: 'saved-advisor', advisor: state.advisors[0] };
  const old = { ...state, currentEvent: { ...state.currentEvent!, council: [proposal] } };
  assert.equal(resolutionOptions(old).at(-1)!.id, proposal.id);
  assert.equal(advisorSigningState(old), old);
});

test('сильный автор риска называет действующего саботажника, досье убирает именно эту причину', async () => {
  const base = team(await fixture(), 3);
  const state = { ...base, advisors: base.advisors.map(advisor => ({ ...advisor, loyalty: advisor.id === 'economist' ? 0 : 90 })) };
  const choice = state.currentEvent!.choices[1];
  const forecast = advisorOutlook(state, choice)!;
  assert.ok(forecast.risk.reason!.includes(state.advisors.find(advisor => advisor.id === 'economist')!.name));
  assert.match(forecast.risk.reason!, /п\. п\. — .* тянет с бумагами/);
  const protectedState = { ...state, advisors: state.advisors.map(advisor => ({ ...advisor, dossier: { fact: 'Счёт', turn: 0 } })) };
  assert.ok(!advisorOutlook(protectedState, choice)!.risk.reason!.includes('тянет с бумагами'));
  assert.ok(forecast.risk.value > advisorOutlook(protectedState, choice)!.risk.value);
});
